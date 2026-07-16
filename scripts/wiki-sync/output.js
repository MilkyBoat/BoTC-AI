const fs = require("fs");
const path = require("path");
const { WikiSyncError } = require("./errors");

const MARKER = ".botc-wiki-sync-output";

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const assertOwnedDestination = (outputDir) => {
  if (!fs.existsSync(outputDir)) return;
  if (!fs.statSync(outputDir).isDirectory()) {
    throw new WikiSyncError("unsafe-output", `输出路径不是目录：${outputDir}`);
  }
  if (!fs.existsSync(path.join(outputDir, MARKER))) {
    throw new WikiSyncError(
      "unsafe-output",
      `输出目录不属于 Wiki 同步器，拒绝覆盖：${outputDir}`,
    );
  }
};

const formatReportMarkdown = (report) => {
  const lines = [
    "# Wiki 同步报告",
    "",
    `- 同步配置：${report.syncId}`,
    `- 来源清单版本：${report.sourceManifestVersion}`,
    `- 开始时间：${report.startedAt}`,
    `- 完成时间：${report.completedAt}`,
    `- 成功：${report.summary.succeeded}`,
    `- 失败：${report.summary.failed}`,
    `- 待核对页面：${report.summary.candidateLinks}`,
    `- 被拒绝链接：${report.summary.rejectedLinks}`,
    `- 重复内容组：${report.summary.duplicateGroups}`,
    "",
  ];
  if (report.failures.length) {
    lines.push("## 失败", "");
    for (const failure of report.failures) {
      lines.push(
        `- \`${failure.sourceId}\`：${failure.code} — ${failure.message}`,
      );
    }
    lines.push("");
  }
  if (report.candidateLinks.length) {
    lines.push("## 待核对页面", "");
    for (const candidate of report.candidateLinks) {
      lines.push(
        `- ${candidate.title}：${
          candidate.href
        }（发现于 ${candidate.discoveredFrom.join("、")}）`,
      );
    }
    lines.push("");
  }
  if (report.duplicates.length) {
    lines.push("## 重复内容", "");
    for (const duplicate of report.duplicates) {
      lines.push(`- ${duplicate.hash}：${duplicate.sourceIds.join("、")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
};

const writeStagingOutput = ({ stagingDir, pages, manifest, report }) => {
  fs.writeFileSync(
    path.join(stagingDir, MARKER),
    `${JSON.stringify({ formatVersion: 1, syncId: report.syncId })}\n`,
    "utf8",
  );
  for (const page of pages) {
    const markdownPath = path.join(
      stagingDir,
      "official",
      page.metadata.language,
      `${page.metadata.sourceId}.md`,
    );
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, page.markdown, "utf8");
    writeJson(
      path.join(stagingDir, "sources", `${page.metadata.sourceId}.json`),
      page.metadata,
    );
  }
  writeJson(path.join(stagingDir, "sources", "manifest.json"), manifest);
  writeJson(path.join(stagingDir, "reports", "wiki-sync.json"), report);
  const markdownReportPath = path.join(stagingDir, "reports", "wiki-sync.md");
  fs.mkdirSync(path.dirname(markdownReportPath), { recursive: true });
  fs.writeFileSync(markdownReportPath, formatReportMarkdown(report), "utf8");
};

const publishOutput = ({ outputDir, pages, manifest, report }) => {
  const absoluteOutputDir = path.resolve(outputDir);
  assertOwnedDestination(absoluteOutputDir);
  const parentDir = path.dirname(absoluteOutputDir);
  fs.mkdirSync(parentDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(
    path.join(parentDir, `.${path.basename(absoluteOutputDir)}-staging-`),
  );
  const backupDir = `${absoluteOutputDir}.backup-${process.pid}-${Date.now()}`;
  try {
    writeStagingOutput({ stagingDir, pages, manifest, report });
    if (fs.existsSync(absoluteOutputDir)) {
      fs.renameSync(absoluteOutputDir, backupDir);
    }
    try {
      fs.renameSync(stagingDir, absoluteOutputDir);
    } catch (error) {
      if (fs.existsSync(backupDir)) fs.renameSync(backupDir, absoluteOutputDir);
      throw error;
    }
    fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
};

module.exports = {
  MARKER,
  assertOwnedDestination,
  formatReportMarkdown,
  publishOutput,
};
