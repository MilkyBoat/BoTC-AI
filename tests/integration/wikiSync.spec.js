const { createHash } = require("crypto");
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const pageSchema = require("../../knowledge/sources/wiki-page.schema.json");
const manifestSchema = require("../../knowledge/sources/wiki-sync-manifest.schema.json");
const reportSchema = require("../../knowledge/sources/wiki-sync-report.schema.json");
const { synchronizeWiki } = require("../../scripts/wiki-sync/sync");

const ajv = new Ajv({ allErrors: true });
const validatePage = ajv.compile(pageSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateReport = ajv.compile(reportSchema);

const fixtureHtml = fs.readFileSync(
  path.resolve(__dirname, "../fixtures/wiki/page.html"),
  "utf8",
);
const wikitext = "== 规则 ==\n这是一段固定规则正文。";
const wikitextHash = `sha256:${createHash("sha256")
  .update(wikitext)
  .digest("hex")}`;

const source = {
  id: "source-one",
  title: "示例页面",
  language: "zh-CN",
  authority: "official-zh",
  url: "https://clocktower-wiki.gstonegames.com/index.php?title=示例页面&oldid=42",
  revision: 42,
  revisedAt: "2026-01-02T03:04:05Z",
  contentHash: wikitextHash,
  contentHashScope: "mediawiki-wikitext",
};

const config = {
  formatVersion: 1,
  id: "test-wiki",
  baseUrl: "https://clocktower-wiki.gstonegames.com/",
  allowedOrigins: ["https://clocktower-wiki.gstonegames.com"],
  sourceManifest: "unused-in-injected-test.json",
  request: {
    userAgent: "ClocktowerKnowledgeSync/Test",
    minIntervalMs: 0,
    timeoutMs: 5000,
    retries: 0,
    maxResponseBytes: 1048576,
  },
};

const apiBody = ({ content = wikitext, revision = 42 } = {}) =>
  JSON.stringify({
    query: {
      pages: [
        {
          pageid: 7,
          title: "示例页面",
          revisions: [
            {
              revid: revision,
              parentid: 41,
              timestamp: "2026-01-02T03:04:05Z",
              sha1: "mediawiki-sha1",
              slots: {
                main: { contentmodel: "wikitext", content },
              },
            },
          ],
        },
      ],
    },
  });

const createHttp = (overrides = {}) => ({
  getText: jest.fn(async (url) => {
    if (url.includes("/api.php")) {
      return {
        status: 200,
        finalUrl: url,
        body: overrides.apiBody || apiBody(),
        headers: {},
      };
    }
    return {
      status: overrides.htmlStatus || 200,
      finalUrl: overrides.finalUrl || url,
      body: overrides.html || fixtureHtml,
      headers: {},
    };
  }),
});

describe("Wiki 同步集成", () => {
  const workRoot = path.resolve(".work/m2-r2-wiki-sync/tests");
  let outputDir;

  beforeEach(() => {
    fs.mkdirSync(workRoot, { recursive: true });
    outputDir = fs.mkdtempSync(path.join(workRoot, "run-"));
    fs.rmSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  test("校验固定修订后原子发布 Markdown、元数据和双格式报告", async () => {
    const result = await synchronizeWiki({
      config,
      sourceManifest: {
        canonicalLanguage: "zh-CN",
        sourceManifestVersion: "0.2.0",
        sources: [source],
      },
      selectedSources: [source],
      httpClient: createHttp(),
      outputDir,
      now: () => new Date("2026-07-17T01:02:03Z"),
    });

    expect(result.ok).toBe(true);
    expect(result.report.summary).toMatchObject({ succeeded: 1, failed: 0 });
    expect(
      fs.readFileSync(
        path.join(outputDir, "official/zh-CN/source-one.md"),
        "utf8",
      ),
    ).toContain("# 示例页面");
    const pageMetadata = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sources/source-one.json"), "utf8"),
    );
    expect(pageMetadata).toMatchObject({
      formatVersion: 1,
      sourceId: "source-one",
      revision: 42,
      retrievedAt: "2026-07-17T01:02:03.000Z",
      trust: "untrusted-external-content",
      hashes: { wikitext: wikitextHash },
    });
    expect(validatePage(pageMetadata)).toBe(true);
    const generatedManifest = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sources/manifest.json"), "utf8"),
    );
    expect(generatedManifest.pages).toEqual([
      expect.objectContaining({ sourceId: "source-one", revision: 42 }),
    ]);
    expect(validateManifest(generatedManifest)).toBe(true);
    const generatedReport = JSON.parse(
      fs.readFileSync(path.join(outputDir, "reports/wiki-sync.json"), "utf8"),
    );
    expect(validateReport(generatedReport)).toBe(true);
    expect(
      fs.readFileSync(path.join(outputDir, "reports/wiki-sync.md"), "utf8"),
    ).toContain("成功：1");
    expect(fs.existsSync(path.join(outputDir, ".botc-wiki-sync-output"))).toBe(
      true,
    );
  });

  test("单页哈希失败时继续生成诊断，但不把失败页放入成功清单", async () => {
    const badSource = {
      ...source,
      id: "source-bad",
      contentHash: `sha256:${"0".repeat(64)}`,
    };
    const result = await synchronizeWiki({
      config,
      sourceManifest: {
        canonicalLanguage: "zh-CN",
        sourceManifestVersion: "0.2.0",
        sources: [source, badSource],
      },
      selectedSources: [source, badSource],
      httpClient: createHttp(),
      outputDir,
      now: () => new Date("2026-07-17T01:02:03Z"),
    });

    expect(result.ok).toBe(false);
    expect(result.report.summary).toMatchObject({ succeeded: 1, failed: 1 });
    expect(result.report.failures[0]).toMatchObject({
      sourceId: "source-bad",
      code: "wikitext-hash-mismatch",
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(outputDir, "sources/manifest.json"), "utf8"),
      ).pages,
    ).toHaveLength(1);
    expect(
      fs.existsSync(path.join(outputDir, "official/zh-CN/source-bad.md")),
    ).toBe(false);
  });

  test("拒绝覆盖不属于同步器的已有目录", async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "keep.txt"), "do not delete");

    await expect(
      synchronizeWiki({
        config,
        sourceManifest: {
          canonicalLanguage: "zh-CN",
          sourceManifestVersion: "0.2.0",
          sources: [source],
        },
        selectedSources: [source],
        httpClient: createHttp(),
        outputDir,
      }),
    ).rejects.toThrow(/不属于 Wiki 同步器/);
    expect(fs.readFileSync(path.join(outputDir, "keep.txt"), "utf8")).toBe(
      "do not delete",
    );
  });

  test("失败重跑把诊断发布到旁路目录并保留上一版成功输出", async () => {
    const manifest = {
      canonicalLanguage: "zh-CN",
      sourceManifestVersion: "0.2.0",
      sources: [source],
    };
    await synchronizeWiki({
      config,
      sourceManifest: manifest,
      selectedSources: [source],
      httpClient: createHttp(),
      outputDir,
      now: () => new Date("2026-07-17T01:02:03Z"),
    });

    const failedSource = {
      ...source,
      contentHash: `sha256:${"0".repeat(64)}`,
    };
    const result = await synchronizeWiki({
      config,
      sourceManifest: { ...manifest, sources: [failedSource] },
      selectedSources: [failedSource],
      httpClient: createHttp(),
      outputDir,
      now: () => new Date("2026-07-17T02:03:04Z"),
    });

    expect(result.ok).toBe(false);
    expect(result.outputDir).toBe(`${outputDir}.failed`);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(outputDir, "reports/wiki-sync.json"), "utf8"),
      ).summary,
    ).toMatchObject({ succeeded: 1, failed: 0 });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(`${outputDir}.failed`, "reports/wiki-sync.json"),
          "utf8",
        ),
      ).summary,
    ).toMatchObject({ succeeded: 0, failed: 1 });
  });
});
