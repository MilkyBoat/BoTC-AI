const fs = require("fs");
const path = require("path");
const { cleanWikiPage } = require("../../scripts/wiki-sync/cleaner");

const html = fs.readFileSync(
  path.resolve(__dirname, "../fixtures/wiki/page.html"),
  "utf8",
);

describe("Wiki DOM 清洗与 Markdown 转换", () => {
  const result = cleanWikiPage({
    html,
    sourceUrl:
      "https://clocktower-wiki.gstonegames.com/index.php?title=示例页面&oldid=42",
    allowedOrigins: ["https://clocktower-wiki.gstonegames.com"],
    selectedSources: [{ id: "target-page", title: "目标页面", revision: 88 }],
  });

  test("从 DOM 提取固定修订和正文，不保留站点展示或危险节点", () => {
    expect(result.page).toMatchObject({
      title: "示例页面",
      revision: 42,
      redirected: false,
    });
    expect(result.markdown).toMatch(/^# 示例页面\n/);
    expect(result.markdown).not.toMatch(
      /目录|globalThis|display: block|vector payload|evil\.example|onclick|onerror|Saved in parser cache/,
    );
    expect(result.stats.removedNodes).toBeGreaterThanOrEqual(5);
    expect(result.stats.rejectedLinks).toBeGreaterThanOrEqual(1);
    expect(result.stats.rejectedImages).toBe(1);
  });

  test("保留列表、定义、表格、引用、代码和安全图片结构", () => {
    expect(result.markdown).toContain("**重要：**");
    expect(result.markdown).toMatch(/- 第一项\n\s+1\. 嵌套项/);
    expect(result.markdown).toContain("**醉酒**");
    expect(result.markdown).toContain("失去能力但不会得知。");
    expect(result.markdown).toMatch(/\| 玩家 \| 镇民 \|/);
    expect(result.markdown).toMatch(/\| --- \| --- \|/);
    expect(result.markdown).toContain("> 规则引用不应被压平成普通段落。");
    expect(result.markdown).toContain(
      "![规则示意图](https://clocktower-wiki.gstonegames.com/images/rule.png)",
    );
    expect(result.markdown).toContain("```\nif (alive)");
  });

  test("重写已选择链接并把未知正文页放入去重候选报告", () => {
    expect(result.markdown).toContain("[已选择页面](./target-page.md#细节)");
    expect(result.links.selected).toEqual([
      expect.objectContaining({ sourceId: "target-page", title: "目标页面" }),
    ]);
    expect(result.links.candidates).toEqual([
      expect.objectContaining({ title: "待核对页面" }),
    ]);
    expect(result.links.rejected).toEqual([
      expect.objectContaining({ reason: "dangerous-protocol" }),
    ]);
  });
});
