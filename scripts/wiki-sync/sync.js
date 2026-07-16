const { createHash } = require("crypto");
const fs = require("fs");
const path = require("path");
const { cleanWikiPage } = require("./cleaner");
const { asWikiSyncError, WikiSyncError } = require("./errors");
const {
  buildRevisionApiUrl,
  parseRevisionApiResponse,
} = require("./mediawiki");
const { assertOwnedDestination, publishOutput } = require("./output");

const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const assertEqual = (actual, expected, code, message) => {
  if (actual !== expected) {
    throw new WikiSyncError(code, message, { expected, actual });
  }
};

const sameUrl = (left, right) => new URL(left).href === new URL(right).href;

const syncPage = async ({
  source,
  selectedSources,
  knownSources,
  config,
  httpClient,
  retrievedAt,
  signal,
}) => {
  const htmlResponse = await httpClient.getText(source.url, { signal });
  const apiUrl = buildRevisionApiUrl(source.url, source.revision);
  const apiResponse = await httpClient.getText(apiUrl, { signal });
  const revision = parseRevisionApiResponse(apiResponse.body);

  assertEqual(
    revision.revision,
    source.revision,
    "api-revision-mismatch",
    `API 修订与来源清单不一致：${source.id}`,
  );
  assertEqual(
    revision.title,
    source.title.normalize("NFC"),
    "api-title-mismatch",
    `API 标题与来源清单不一致：${source.id}`,
  );
  assertEqual(
    revision.revisedAt,
    source.revisedAt,
    "api-timestamp-mismatch",
    `API 页面时间与来源清单不一致：${source.id}`,
  );
  const actualWikitextHash = sha256(revision.content);
  assertEqual(
    actualWikitextHash,
    source.contentHash,
    "wikitext-hash-mismatch",
    `原始 Wikitext 哈希与来源清单不一致：${source.id}`,
  );

  const cleaned = cleanWikiPage({
    html: htmlResponse.body,
    sourceUrl: source.url,
    allowedOrigins: config.allowedOrigins,
    selectedSources,
    knownSources,
  });
  assertEqual(
    cleaned.page.revision,
    source.revision,
    "html-revision-mismatch",
    `HTML 修订与来源清单不一致：${source.id}`,
  );
  assertEqual(
    cleaned.page.title,
    source.title.normalize("NFC"),
    "html-title-mismatch",
    `HTML 标题与来源清单不一致：${source.id}`,
  );

  const hashes = {
    wikitext: actualWikitextHash,
    html: sha256(htmlResponse.body),
    markdown: sha256(cleaned.markdown),
  };
  const metadata = {
    formatVersion: 1,
    sourceId: source.id,
    title: source.title,
    language: source.language,
    authority: source.authority,
    trust: "untrusted-external-content",
    requestedUrl: source.url,
    finalUrl: htmlResponse.finalUrl,
    revision: source.revision,
    parentRevision: revision.parentRevision,
    pageId: revision.pageId,
    revisedAt: revision.revisedAt,
    retrievedAt,
    redirected:
      cleaned.page.redirected || !sameUrl(htmlResponse.finalUrl, source.url),
    mediawikiSha1: revision.mediawikiSha1,
    hashes,
    links: {
      selected: cleaned.links.selected.length,
      known: cleaned.links.known.length,
      candidates: cleaned.links.candidates.length,
      external: cleaned.links.external.length,
      rejected: cleaned.links.rejected.length,
    },
    cleaning: cleaned.stats,
  };
  return { source, markdown: cleaned.markdown, metadata, links: cleaned.links };
};

const aggregateCandidates = (pages) => {
  const candidates = new Map();
  for (const page of pages) {
    for (const link of page.links.candidates) {
      const current = candidates.get(link.title) || {
        title: link.title,
        href: link.href,
        discoveredFrom: [],
      };
      current.discoveredFrom.push(page.source.id);
      current.discoveredFrom = [...new Set(current.discoveredFrom)].sort();
      candidates.set(link.title, current);
    }
  }
  return [...candidates.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "zh-CN"),
  );
};

const aggregateRejectedLinks = (pages) => {
  const rejected = new Map();
  for (const page of pages) {
    for (const link of page.links.rejected) {
      const key = `${link.href}|${link.reason}`;
      const current = rejected.get(key) || {
        href: link.href,
        reason: link.reason,
        discoveredFrom: [],
      };
      current.discoveredFrom.push(page.source.id);
      current.discoveredFrom = [...new Set(current.discoveredFrom)].sort();
      rejected.set(key, current);
    }
  }
  return [...rejected.values()].sort((a, b) =>
    `${a.reason}|${a.href}`.localeCompare(`${b.reason}|${b.href}`),
  );
};

const findDuplicates = (pages) => {
  const byHash = new Map();
  for (const page of pages) {
    const hash = page.metadata.hashes.wikitext;
    const sourceIds = byHash.get(hash) || [];
    sourceIds.push(page.source.id);
    byHash.set(hash, sourceIds);
  }
  return [...byHash.entries()]
    .filter(([, sourceIds]) => sourceIds.length > 1)
    .map(([hash, sourceIds]) => ({ hash, sourceIds: sourceIds.sort() }))
    .sort((a, b) => a.hash.localeCompare(b.hash));
};

const serializeFailure = (source, error) => {
  const normalized = asWikiSyncError(error);
  return {
    sourceId: source.id,
    code: normalized.code,
    message: normalized.message,
    details: normalized.details,
  };
};

const synchronizeWiki = async ({
  config,
  sourceManifest,
  selectedSources,
  httpClient,
  outputDir,
  now = () => new Date(),
  signal,
  onProgress = () => {},
}) => {
  assertOwnedDestination(outputDir);
  const absoluteOutputDir = path.resolve(outputDir);
  const hadPreviousOutput = fs.existsSync(absoluteOutputDir);
  const failedOutputDir = `${absoluteOutputDir}.failed`;
  if (hadPreviousOutput) assertOwnedDestination(failedOutputDir);
  const startedAt = now().toISOString();
  const pages = [];
  const failures = [];
  for (const source of selectedSources) {
    if (signal?.aborted) throw signal.reason || new Error("同步已取消");
    onProgress({ sourceId: source.id, stage: "start" });
    try {
      const page = await syncPage({
        source,
        selectedSources,
        knownSources: sourceManifest.sources,
        config,
        httpClient,
        retrievedAt: startedAt,
        signal,
      });
      pages.push(page);
      onProgress({ sourceId: source.id, stage: "success" });
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error;
      const failure = serializeFailure(source, error);
      failures.push(failure);
      onProgress({ sourceId: source.id, stage: "failure", failure });
    }
  }

  const candidateLinks = aggregateCandidates(pages);
  const rejectedLinks = aggregateRejectedLinks(pages);
  const duplicates = findDuplicates(pages);
  const completedAt = now().toISOString();
  const report = {
    formatVersion: 1,
    syncId: config.id,
    sourceManifestVersion: sourceManifest.sourceManifestVersion,
    startedAt,
    completedAt,
    summary: {
      selected: selectedSources.length,
      succeeded: pages.length,
      failed: failures.length,
      candidateLinks: candidateLinks.length,
      rejectedLinks: rejectedLinks.length,
      duplicateGroups: duplicates.length,
    },
    pages: pages.map(({ metadata }) => ({
      sourceId: metadata.sourceId,
      revision: metadata.revision,
      redirected: metadata.redirected,
      hashes: metadata.hashes,
      cleaning: metadata.cleaning,
    })),
    failures,
    candidateLinks,
    rejectedLinks,
    duplicates,
  };
  const manifest = {
    formatVersion: 1,
    syncId: config.id,
    sourceManifestVersion: sourceManifest.sourceManifestVersion,
    canonicalLanguage: sourceManifest.canonicalLanguage,
    generatedAt: completedAt,
    pages: pages.map(({ metadata }) => ({
      sourceId: metadata.sourceId,
      title: metadata.title,
      language: metadata.language,
      revision: metadata.revision,
      markdownPath: `official/${metadata.language}/${metadata.sourceId}.md`,
      metadataPath: `sources/${metadata.sourceId}.json`,
      hashes: metadata.hashes,
    })),
  };
  const publishedOutputDir =
    failures.length > 0 && hadPreviousOutput
      ? failedOutputDir
      : absoluteOutputDir;
  publishOutput({
    outputDir: publishedOutputDir,
    pages,
    manifest,
    report,
  });
  return {
    ok: failures.length === 0,
    outputDir: publishedOutputDir,
    pages,
    manifest,
    report,
  };
};

module.exports = { sha256, synchronizeWiki };
