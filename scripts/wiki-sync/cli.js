#!/usr/bin/env node

const path = require("path");
const { loadSyncInputs, selectManifestSources } = require("./config");
const { asWikiSyncError, WikiSyncError } = require("./errors");
const { createHttpClient } = require("./http");
const { synchronizeWiki } = require("./sync");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CONFIG = path.join(
  PROJECT_ROOT,
  "knowledge/sources/wiki-sync.config.json",
);
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, ".work/m2-r2-wiki-sync/output");

const usage = `用法：npm run knowledge:sync -- [选项]

选项：
  --config <path>   同步配置，默认 knowledge/sources/wiki-sync.config.json
  --output <path>   输出目录，默认 .work/m2-r2-wiki-sync/output
  --only <id>       只同步指定来源，可重复
  --help            显示帮助
`;

const parseArguments = (argv) => {
  const options = { config: DEFAULT_CONFIG, output: DEFAULT_OUTPUT, only: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { ...options, help: true };
    if (["--config", "--output", "--only"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new WikiSyncError("invalid-arguments", `${argument} 缺少参数`);
      }
      index += 1;
      if (argument === "--only") options.only.push(value);
      if (argument === "--config") options.config = path.resolve(value);
      if (argument === "--output") options.output = path.resolve(value);
      continue;
    }
    throw new WikiSyncError("invalid-arguments", `未知参数：${argument}`);
  }
  return options;
};

const assertOutputInsideProject = (output) => {
  const relative = path.relative(PROJECT_ROOT, path.resolve(output));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WikiSyncError(
      "unsafe-output",
      "Wiki 同步输出必须位于 BotC-AI 仓库的专用目录中",
    );
  }
};

const run = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  assertOutputInsideProject(options.output);
  const { config, sourceManifest } = loadSyncInputs(options.config);
  const selectedSources = selectManifestSources(sourceManifest, options.only);
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error("用户取消了 Wiki 同步"));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const result = await synchronizeWiki({
      config,
      sourceManifest,
      selectedSources,
      httpClient: createHttpClient({
        request: config.request,
        allowedOrigins: config.allowedOrigins,
      }),
      outputDir: options.output,
      signal: controller.signal,
      onProgress: ({ sourceId, stage, failure }) => {
        if (stage === "start") process.stdout.write(`开始：${sourceId}\n`);
        if (stage === "success") process.stdout.write(`完成：${sourceId}\n`);
        if (stage === "failure") {
          process.stderr.write(
            `失败：${sourceId} [${failure.code}] ${failure.message}\n`,
          );
        }
      },
    });
    process.stdout.write(
      `同步报告：成功 ${result.report.summary.succeeded}，失败 ${result.report.summary.failed}，待核对 ${result.report.summary.candidateLinks}\n`,
    );
    process.stdout.write(`输出目录：${result.outputDir}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
};

if (require.main === module) {
  run().catch((error) => {
    const normalized = asWikiSyncError(error);
    process.stderr.write(`[${normalized.code}] ${normalized.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { assertOutputInsideProject, parseArguments, run };
