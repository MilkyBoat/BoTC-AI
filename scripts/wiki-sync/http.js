const { WikiSyncError } = require("./errors");

const abortableSleep = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error("操作已取消"));
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("操作已取消"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const retryDelayMs = (response, attempt) => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date))
      return Math.max(0, Math.min(date - Date.now(), 60000));
  }
  return Math.min(1000 * 2 ** attempt, 30000);
};

const createHttpClient = ({
  request,
  allowedOrigins = [],
  fetchImpl = global.fetch,
  sleep = abortableSleep,
  now = () => Date.now(),
}) => {
  if (typeof fetchImpl !== "function") {
    throw new WikiSyncError("missing-fetch", "当前 Node.js 环境不支持 fetch");
  }
  const allowedOriginSet = new Set(
    allowedOrigins.map((value) => new URL(value).origin),
  );
  let lastRequestStartedAt = 0;

  const getText = async (url, { signal } = {}) => {
    for (let attempt = 0; attempt <= request.retries; attempt += 1) {
      const waitForInterval = Math.max(
        0,
        lastRequestStartedAt + request.minIntervalMs - now(),
      );
      if (waitForInterval > 0) await sleep(waitForInterval, signal);
      lastRequestStartedAt = now();

      const controller = new AbortController();
      const onAbort = () => controller.abort(signal.reason);
      if (signal?.aborted) controller.abort(signal.reason);
      else signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(
        () => controller.abort(new Error("请求超时")),
        request.timeoutMs,
      );

      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/json;q=0.9,text/plain;q=0.8",
            "User-Agent": request.userAgent,
          },
        });
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) throw signal.reason || error;
        if (attempt < request.retries) {
          await sleep(Math.min(1000 * 2 ** attempt, 30000), signal);
          continue;
        }
        throw new WikiSyncError("network-error", `请求失败：${error.message}`, {
          url,
        });
      }

      const finalUrl = response.url || url;
      const finalOrigin = new URL(finalUrl).origin;
      if (allowedOriginSet.size && !allowedOriginSet.has(finalOrigin)) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        throw new WikiSyncError(
          "cross-origin-redirect",
          `拒绝跨域重定向：${new URL(url).origin} -> ${finalOrigin}`,
          { url, finalUrl },
        );
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (response.status < 200 || response.status >= 300) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (retryable && attempt < request.retries) {
          await sleep(retryDelayMs(response, attempt), signal);
          continue;
        }
        throw new WikiSyncError(
          `http-${response.status}`,
          `HTTP 请求失败：${response.status}`,
          { url, finalUrl, status: response.status },
        );
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > request.maxResponseBytes
      ) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        throw new WikiSyncError(
          "response-too-large",
          `响应体超过上限：${declaredLength} > ${request.maxResponseBytes}`,
          { url, finalUrl },
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (buffer.byteLength > request.maxResponseBytes) {
        throw new WikiSyncError(
          "response-too-large",
          `响应体超过上限：${buffer.byteLength} > ${request.maxResponseBytes}`,
          { url, finalUrl },
        );
      }
      return {
        status: response.status,
        finalUrl,
        headers: Object.fromEntries(response.headers.entries()),
        body: buffer.toString("utf8"),
      };
    }
    throw new WikiSyncError("retry-exhausted", "请求重试次数已耗尽", { url });
  };

  return { getText };
};

module.exports = { abortableSleep, createHttpClient };
