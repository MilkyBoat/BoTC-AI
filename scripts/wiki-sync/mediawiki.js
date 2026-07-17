const { WikiSyncError } = require("./errors");

const BLOCKED_NAMESPACES =
  /^(?:特殊|special|文件|file|分类|category|用户|user|用户讨论|user talk|讨论|talk|模板|template|帮助|help|mediawiki):/i;

const normalizeTitle = (value) => {
  let decoded;
  try {
    decoded = decodeURIComponent(value || "");
  } catch {
    return "";
  }
  return decoded
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
};

const rejected = (href, reason) => ({ kind: "rejected", href, reason });

const getTitleFromWikiUrl = (url) => {
  if (/\/index\.php$/i.test(url.pathname)) {
    return normalizeTitle(url.searchParams.get("title"));
  }
  const marker = "/wiki/";
  const index = url.pathname.toLowerCase().indexOf(marker);
  if (index >= 0)
    return normalizeTitle(url.pathname.slice(index + marker.length));
  return "";
};

const normalizeFragment = (hash) => {
  if (!hash) return "";
  try {
    return `#${decodeURIComponent(hash.slice(1)).normalize("NFC")}`;
  } catch {
    return hash;
  }
};

const normalizeWikiLink = (rawHref, context) => {
  const href = String(rawHref || "").trim();
  if (!href) return rejected(href, "empty-link");
  if (href.startsWith("#")) {
    return { kind: "fragment", href: normalizeFragment(href) };
  }

  let url;
  try {
    url = new URL(href, context.baseUrl);
  } catch {
    return rejected(href, "invalid-url");
  }
  if (!/^https?:$/.test(url.protocol))
    return rejected(href, "dangerous-protocol");
  if (url.protocol !== "https:") return rejected(href, "insecure-protocol");
  if (url.username || url.password)
    return rejected(href, "embedded-credentials");

  const allowedOrigins =
    context.allowedOrigins instanceof Set
      ? context.allowedOrigins
      : new Set(context.allowedOrigins || []);
  if (!allowedOrigins.has(url.origin)) {
    return { kind: "external", href: url.href };
  }

  const action = url.searchParams.get("action");
  if (action && action !== "view") return rejected(href, "non-view-action");
  if (url.searchParams.get("redlink") === "1")
    return rejected(href, "red-link");
  const title = getTitleFromWikiUrl(url);
  if (!title) return rejected(href, "not-wiki-page");
  if (BLOCKED_NAMESPACES.test(title))
    return rejected(href, "blocked-namespace");

  const fragment = normalizeFragment(url.hash);
  const selected = context.selectedSourcesByTitle?.get(title);
  if (selected) {
    return {
      kind: "selected",
      title,
      sourceId: selected.id,
      revision: selected.revision,
      href: `./${selected.id}.md${fragment}`,
    };
  }
  const known = context.knownSourcesByTitle?.get(title);
  if (known) {
    return {
      kind: "known",
      title,
      sourceId: known.id,
      revision: known.revision,
      href: `${known.url}${fragment}`,
    };
  }

  const canonical = new URL("/index.php", url.origin);
  canonical.searchParams.set("title", title);
  canonical.hash = fragment;
  return { kind: "candidate", title, href: canonical.href };
};

const buildRevisionApiUrl = (sourceUrl, revision) => {
  const source = new URL(sourceUrl);
  const api = new URL("/api.php", source.origin);
  api.searchParams.set("action", "query");
  api.searchParams.set("prop", "revisions");
  api.searchParams.set("revids", String(revision));
  api.searchParams.set("rvprop", "ids|timestamp|sha1|content");
  api.searchParams.set("rvslots", "main");
  api.searchParams.set("format", "json");
  api.searchParams.set("formatversion", "2");
  return api.href;
};

const parseRevisionApiResponse = (body) => {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new WikiSyncError(
      "invalid-api-json",
      "MediaWiki API 返回了无效 JSON",
    );
  }
  if (payload.error) {
    throw new WikiSyncError(
      "mediawiki-api-error",
      `MediaWiki API 错误：${payload.error.code || "unknown"}`,
    );
  }
  const page = payload.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const slot = revision?.slots?.main;
  const content = slot?.content ?? slot?.["*"];
  if (!page || !revision || typeof content !== "string") {
    throw new WikiSyncError(
      "missing-revision-content",
      "MediaWiki API 未返回固定修订 Wikitext",
    );
  }
  if (slot.contentmodel && slot.contentmodel !== "wikitext") {
    throw new WikiSyncError(
      "unsupported-content-model",
      `不支持的 MediaWiki 内容模型：${slot.contentmodel}`,
    );
  }
  return {
    pageId: page.pageid,
    title: normalizeTitle(page.title),
    revision: revision.revid,
    parentRevision: revision.parentid,
    revisedAt: revision.timestamp,
    mediawikiSha1: revision.sha1,
    content,
  };
};

module.exports = {
  buildRevisionApiUrl,
  normalizeTitle,
  normalizeWikiLink,
  parseRevisionApiResponse,
};
