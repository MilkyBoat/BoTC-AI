const cheerio = require("cheerio/slim");
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");
const { WikiSyncError } = require("./errors");
const { normalizeWikiLink } = require("./mediawiki");

const REMOVE_SELECTORS = [
  "script",
  "style",
  "base",
  "link",
  "meta",
  "noscript",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "canvas",
  "svg",
  "template",
  "audio",
  "video",
  "source",
  "track",
  "#toc",
  ".toc",
  ".mw-editsection",
  ".mw-jump-link",
  ".navbox",
  ".metadata",
  ".noprint",
  ".nomobile",
  ".printfooter",
];

const dedupe = (items, keyOf) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parsePageIdentity = ($, sourceUrl) => {
  const title = $("h1.title, #firstHeading")
    .first()
    .text()
    .trim()
    .normalize("NFC");
  const permalink = $(
    '.printfooter a[href*="oldid="], #t-permalink a[href*="oldid="], link[rel="canonical"][href*="oldid="]',
  )
    .first()
    .attr("href");
  let revision = null;
  if (permalink) {
    try {
      revision = Number(
        new URL(permalink, sourceUrl).searchParams.get("oldid"),
      );
    } catch {
      revision = null;
    }
  }
  if (!title || !Number.isInteger(revision) || revision <= 0) {
    throw new WikiSyncError(
      "missing-html-identity",
      "HTML 中缺少页面标题或固定修订链接",
    );
  }
  return {
    title,
    revision,
    redirected: $(".redirectMsg, .redirectText").length > 0,
  };
};

const createTurndown = () => {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.use(gfm);
  turndown.addRule("definition-term", {
    filter: "dt",
    replacement: (content) => `\n\n**${content.trim()}**\n`,
  });
  turndown.addRule("definition-description", {
    filter: "dd",
    replacement: (content) => `: ${content.trim()}\n`,
  });
  turndown.addRule("table-caption", {
    filter: "caption",
    replacement: (content) => `\n\n**${content.trim()}**\n\n`,
  });
  return turndown;
};

const cleanWikiPage = ({
  html,
  sourceUrl,
  allowedOrigins,
  selectedSources = [],
  knownSources = selectedSources,
}) => {
  const $ = cheerio.load(html);
  const page = parsePageIdentity($, sourceUrl);
  const content = $(
    "#mw-content-text .mw-parser-output, .mw-parser-output",
  ).first();
  if (!content.length) {
    throw new WikiSyncError(
      "missing-content-container",
      "HTML 中找不到 .mw-parser-output 正文容器",
    );
  }

  const root = content.clone();
  let removedNodes = 0;
  for (const selector of REMOVE_SELECTORS) {
    const matches = root.find(selector);
    removedNodes += matches.length;
    matches.remove();
  }
  const comments = root
    .find("*")
    .addBack()
    .contents()
    .filter((_, node) => node.type === "comment");
  removedNodes += comments.length;
  comments.remove();

  const allowedOriginSet = new Set(
    allowedOrigins.map((value) => new URL(value).origin),
  );
  const selectedSourcesByTitle = new Map(
    selectedSources.map((source) => [source.title.normalize("NFC"), source]),
  );
  const knownSourcesByTitle = new Map(
    knownSources
      .filter(
        (source) => !selectedSourcesByTitle.has(source.title.normalize("NFC")),
      )
      .map((source) => [source.title.normalize("NFC"), source]),
  );
  const linkContext = {
    baseUrl: sourceUrl,
    allowedOrigins: allowedOriginSet,
    selectedSourcesByTitle,
    knownSourcesByTitle,
  };
  const links = {
    selected: [],
    known: [],
    candidates: [],
    external: [],
    rejected: [],
  };

  root.find("a").each((_, element) => {
    const anchor = $(element);
    const rawHref = anchor.attr("href") || "";
    const normalized = normalizeWikiLink(rawHref, linkContext);
    if (normalized.kind === "rejected") {
      links.rejected.push({ ...normalized, text: anchor.text().trim() });
      anchor.replaceWith(anchor.text());
      return;
    }
    anchor.attr("href", normalized.href);
    if (normalized.kind === "selected") links.selected.push(normalized);
    if (normalized.kind === "known") links.known.push(normalized);
    if (normalized.kind === "candidate") links.candidates.push(normalized);
    if (normalized.kind === "external") links.external.push(normalized);
  });

  let rejectedImages = 0;
  root.find("img").each((_, element) => {
    const image = $(element);
    const rawSource = image.attr("src") || "";
    let url;
    try {
      url = new URL(rawSource, sourceUrl);
    } catch {
      url = null;
    }
    if (
      !url ||
      !/^https:$/.test(url.protocol) ||
      !allowedOriginSet.has(url.origin) ||
      url.username ||
      url.password
    ) {
      rejectedImages += 1;
      image.replaceWith(image.attr("alt") || "");
      return;
    }
    const alt = image.attr("alt") || "";
    const title = image.attr("title");
    for (const attribute of [
      ...(element.attribs ? Object.keys(element.attribs) : []),
    ]) {
      image.removeAttr(attribute);
    }
    image.attr("src", url.href).attr("alt", alt);
    if (title) image.attr("title", title);
  });

  let removedAttributes = 0;
  root.find("*").each((_, element) => {
    for (const attribute of Object.keys(element.attribs || {})) {
      const safeTableAttribute =
        ["td", "th"].includes(element.tagName) &&
        ["colspan", "rowspan"].includes(attribute);
      const safeLinkAttribute = element.tagName === "a" && attribute === "href";
      const safeImageAttribute =
        element.tagName === "img" &&
        ["src", "alt", "title"].includes(attribute);
      if (!safeTableAttribute && !safeLinkAttribute && !safeImageAttribute) {
        $(element).removeAttr(attribute);
        removedAttributes += 1;
      }
    }
  });

  const bodyMarkdown = createTurndown().turndown(root.html() || "");
  const normalizedBody = bodyMarkdown
    .replace(/\r\n?/g, "\n")
    .replace(/^(\s*)([-*+]|\d+\.)\s{2,}/gm, "$1$2 ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalizedBody) {
    throw new WikiSyncError("empty-cleaned-content", "正文清洗后为空");
  }
  const markdown = `# ${page.title}\n\n${normalizedBody}\n`;

  links.selected = dedupe(
    links.selected,
    ({ sourceId, href }) => `${sourceId}|${href}`,
  );
  links.known = dedupe(
    links.known,
    ({ sourceId, href }) => `${sourceId}|${href}`,
  );
  links.candidates = dedupe(links.candidates, ({ title }) => title);
  links.external = dedupe(links.external, ({ href }) => href);
  links.rejected = dedupe(
    links.rejected,
    ({ href, reason }) => `${href}|${reason}`,
  );
  return {
    page,
    markdown,
    links,
    stats: {
      removedNodes,
      removedAttributes,
      rejectedLinks: links.rejected.length,
      rejectedImages,
      candidateLinks: links.candidates.length,
      selectedLinks: links.selected.length,
      knownLinks: links.known.length,
      sourceHtmlBytes: Buffer.byteLength(html),
      markdownBytes: Buffer.byteLength(markdown),
    },
  };
};

module.exports = { cleanWikiPage };
