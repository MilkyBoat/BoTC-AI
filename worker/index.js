/**
 * Sites 的 Cloudflare Worker 入口。
 * 静态资源直接交给 ASSETS；无扩展名的未知路径回退到单页应用入口。
 */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const methodAllowsFallback =
      request.method === "GET" || request.method === "HEAD";

    if (response.status !== 404 || !methodAllowsFallback) {
      return response;
    }

    const url = new URL(request.url);
    if (url.pathname.includes(".")) {
      return response;
    }

    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  },
};

export default worker;
