const fs = require("fs");
const path = require("path");
const { WikiSyncError } = require("./errors");

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const fail = (code, message, details) => {
  throw new WikiSyncError(code, message, details);
};

const parseHttpsUrl = (value, label) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("invalid-config", `${label} 不是有效 URL：${value}`);
  }
  if (url.protocol !== "https:") {
    fail("invalid-config", `${label} 必须使用 HTTPS：${value}`);
  }
  return url;
};

const validateSyncConfig = (config) => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    fail("invalid-config", "Wiki 同步配置必须是对象");
  }
  if (config.formatVersion !== 1) {
    fail("invalid-config", "只支持 formatVersion=1 的 Wiki 同步配置");
  }
  const allowedConfigKeys = new Set([
    "$schema",
    "formatVersion",
    "id",
    "baseUrl",
    "allowedOrigins",
    "sourceManifest",
    "request",
  ]);
  const unknownConfigKeys = Object.keys(config).filter(
    (key) => !allowedConfigKeys.has(key),
  );
  if (unknownConfigKeys.length) {
    fail(
      "invalid-config",
      `同步配置包含未知字段：${unknownConfigKeys.join(", ")}`,
    );
  }
  if (!config.id || typeof config.id !== "string") {
    fail("invalid-config", "同步配置缺少稳定 id");
  }
  parseHttpsUrl(config.baseUrl, "baseUrl");
  if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length) {
    fail("invalid-config", "allowedOrigins 至少包含一个来源站点");
  }
  const origins = new Set();
  for (const value of config.allowedOrigins) {
    const url = parseHttpsUrl(value, "allowedOrigins");
    if (url.href !== `${url.origin}/` && url.href !== url.origin) {
      fail("invalid-config", `allowedOrigins 只能填写 origin：${value}`);
    }
    origins.add(url.origin);
  }
  if (!origins.has(new URL(config.baseUrl).origin)) {
    fail("invalid-config", "baseUrl 不在 allowedOrigins 中");
  }
  if (!config.sourceManifest || typeof config.sourceManifest !== "string") {
    fail("invalid-config", "配置缺少 sourceManifest 路径");
  }

  const request = config.request;
  if (!request || typeof request !== "object") {
    fail("invalid-config", "配置缺少 request 策略");
  }
  const allowedRequestKeys = new Set([
    "userAgent",
    "minIntervalMs",
    "timeoutMs",
    "retries",
    "maxResponseBytes",
  ]);
  const unknownRequestKeys = Object.keys(request).filter(
    (key) => !allowedRequestKeys.has(key),
  );
  if (unknownRequestKeys.length) {
    fail(
      "invalid-config",
      `request 包含未知字段：${unknownRequestKeys.join(", ")}`,
    );
  }
  if (
    !request.userAgent ||
    !/ClocktowerKnowledgeSync/.test(request.userAgent)
  ) {
    fail(
      "invalid-config",
      "request.userAgent 必须明确标识 ClocktowerKnowledgeSync",
    );
  }
  const integerFields = [
    ["minIntervalMs", 0, 60000],
    ["timeoutMs", 1, 120000],
    ["retries", 0, 5],
    ["maxResponseBytes", 1, 20 * 1024 * 1024],
  ];
  for (const [field, minimum, maximum] of integerFields) {
    const value = request[field];
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      fail(
        "invalid-config",
        `request.${field} 必须是 ${minimum}..${maximum} 的整数`,
      );
    }
  }
  return config;
};

const validateSourceManifest = (manifest, config) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("invalid-manifest", "来源清单必须是对象");
  }
  if (!manifest.canonicalLanguage || !manifest.sourceManifestVersion) {
    fail("invalid-manifest", "来源清单缺少语言或版本");
  }
  if (!Array.isArray(manifest.sources) || !manifest.sources.length) {
    fail("invalid-manifest", "来源清单中没有 sources");
  }

  const allowedOrigins = new Set(
    config.allowedOrigins.map((value) => new URL(value).origin),
  );
  const ids = new Set();
  const titles = new Set();
  const urls = new Set();
  for (const source of manifest.sources) {
    if (!SOURCE_ID_PATTERN.test(source.id || "")) {
      fail(
        "invalid-source",
        `来源 ID 必须是稳定 ASCII 短横线标识：${source.id}`,
      );
    }
    if (!source.title || !source.language || !source.authority) {
      fail("invalid-source", `来源 ${source.id} 缺少标题、语言或权威级别`);
    }
    if (!Number.isInteger(source.revision) || source.revision <= 0) {
      fail("invalid-source", `来源 ${source.id} 缺少有效固定修订`);
    }
    const url = parseHttpsUrl(source.url, `来源 ${source.id}`);
    if (!allowedOrigins.has(url.origin)) {
      fail("invalid-source", `来源 ${source.id} 不在允许域名中`);
    }
    if (Number(url.searchParams.get("oldid")) !== source.revision) {
      fail("invalid-source", `来源 ${source.id} 的 URL 与固定修订不一致`);
    }
    if (!url.searchParams.get("title")) {
      fail("invalid-source", `来源 ${source.id} 的 URL 缺少页面标题`);
    }
    const urlTitle = url.searchParams
      .get("title")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .normalize("NFC");
    if (urlTitle !== source.title.normalize("NFC")) {
      fail("invalid-source", `来源 ${source.id} 的 URL 标题与来源标题不一致`);
    }
    if (source.contentHashScope !== "mediawiki-wikitext") {
      fail("invalid-source", `来源 ${source.id} 必须使用原始 Wikitext 哈希`);
    }
    if (!HASH_PATTERN.test(source.contentHash || "")) {
      fail("invalid-source", `来源 ${source.id} 的 SHA-256 无效`);
    }
    if (Number.isNaN(Date.parse(source.revisedAt))) {
      fail("invalid-source", `来源 ${source.id} 的 revisedAt 无效`);
    }

    const normalizedTitle = source.title.normalize("NFC");
    const normalizedUrl = url.href;
    if (
      ids.has(source.id) ||
      titles.has(normalizedTitle) ||
      urls.has(normalizedUrl)
    ) {
      fail("duplicate-source", `来源清单存在重复 ID、标题或 URL：${source.id}`);
    }
    ids.add(source.id);
    titles.add(normalizedTitle);
    urls.add(normalizedUrl);
  }
  return manifest;
};

const selectManifestSources = (manifest, only = []) => {
  if (!only || only.length === 0) return manifest.sources;
  const requested = new Set(only);
  const selected = manifest.sources.filter(({ id }) => requested.has(id));
  const found = new Set(selected.map(({ id }) => id));
  const missing = [...requested].filter((id) => !found.has(id));
  if (missing.length) {
    fail("unknown-source", `--only 指定了不存在的来源：${missing.join(", ")}`);
  }
  return selected;
};

const readJson = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail("invalid-json", `无法读取${label} ${filePath}：${error.message}`);
  }
};

const loadSyncInputs = (configPath) => {
  const absoluteConfigPath = path.resolve(configPath);
  const config = validateSyncConfig(readJson(absoluteConfigPath, "同步配置"));
  const manifestPath = path.resolve(
    path.dirname(absoluteConfigPath),
    config.sourceManifest,
  );
  const sourceManifest = validateSourceManifest(
    readJson(manifestPath, "来源清单"),
    config,
  );
  return {
    config,
    sourceManifest,
    configPath: absoluteConfigPath,
    manifestPath,
  };
};

module.exports = {
  loadSyncInputs,
  selectManifestSources,
  validateSourceManifest,
  validateSyncConfig,
};
