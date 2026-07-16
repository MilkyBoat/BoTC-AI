const Ajv = require("ajv");
const configSchema = require("../../knowledge/sources/wiki-sync.config.schema.json");
const committedConfig = require("../../knowledge/sources/wiki-sync.config.json");
const {
  selectManifestSources,
  validateSyncConfig,
  validateSourceManifest,
} = require("../../scripts/wiki-sync/config");

const config = {
  formatVersion: 1,
  id: "test-wiki",
  baseUrl: "https://clocktower-wiki.gstonegames.com/",
  allowedOrigins: ["https://clocktower-wiki.gstonegames.com"],
  sourceManifest: "../rulesets/m1-ruleset-scope.json",
  request: {
    userAgent: "ClocktowerKnowledgeSync/0.1 (test@example.invalid)",
    minIntervalMs: 1000,
    timeoutMs: 15000,
    retries: 2,
    maxResponseBytes: 2097152,
  },
};

const manifest = {
  canonicalLanguage: "zh-CN",
  sourceManifestVersion: "0.2.0",
  sources: [
    {
      id: "source-one",
      title: "页面一",
      language: "zh-CN",
      authority: "official-zh",
      url: "https://clocktower-wiki.gstonegames.com/index.php?title=页面一&oldid=42",
      revision: 42,
      revisedAt: "2026-01-02T03:04:05Z",
      contentHash: `sha256:${"a".repeat(64)}`,
      contentHashScope: "mediawiki-wikitext",
    },
  ],
};

describe("Wiki 同步配置", () => {
  test("仓库内默认配置同时通过 JSON Schema 与运行时校验", () => {
    const validate = new Ajv({ allErrors: true }).compile(configSchema);

    expect(validate(committedConfig)).toBe(true);
    expect(validateSyncConfig(committedConfig)).toEqual(committedConfig);
  });

  test("接受固定修订、受控域名和 Wikitext 哈希来源", () => {
    expect(validateSyncConfig(config)).toEqual(config);
    expect(validateSourceManifest(manifest, config)).toEqual(manifest);
    expect(selectManifestSources(manifest, ["source-one"])).toEqual(
      manifest.sources,
    );
  });

  test.each([
    [
      "非 HTTPS 来源",
      { url: "http://clocktower-wiki.gstonegames.com/?oldid=42" },
    ],
    ["跨域来源", { url: "https://evil.example/?title=页面一&oldid=42" }],
    [
      "缺少 URL 固定修订",
      { url: "https://clocktower-wiki.gstonegames.com/?title=页面一" },
    ],
    ["修订不一致", { revision: 43 }],
    [
      "URL 标题不一致",
      {
        url: "https://clocktower-wiki.gstonegames.com/?title=其他页面&oldid=42",
      },
    ],
    ["非 Wikitext 哈希", { contentHashScope: "cleaned-markdown" }],
    ["无效哈希", { contentHash: "sha256:1234" }],
  ])("拒绝%s", (_name, patch) => {
    const invalid = {
      ...manifest,
      sources: [{ ...manifest.sources[0], ...patch }],
    };

    expect(() => validateSourceManifest(invalid, config)).toThrow();
  });

  test("拒绝重复来源 ID、标题和 URL，并报告不存在的 --only", () => {
    const duplicate = {
      ...manifest,
      sources: [...manifest.sources, { ...manifest.sources[0] }],
    };

    expect(() => validateSourceManifest(duplicate, config)).toThrow(/重复/);
    expect(() => selectManifestSources(manifest, ["missing"])).toThrow(
      /missing/,
    );
  });
});
