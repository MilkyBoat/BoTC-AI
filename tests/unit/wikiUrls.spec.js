const {
  buildRevisionApiUrl,
  normalizeWikiLink,
} = require("../../scripts/wiki-sync/mediawiki");

const context = {
  baseUrl: "https://clocktower-wiki.gstonegames.com/",
  allowedOrigins: new Set(["https://clocktower-wiki.gstonegames.com"]),
  selectedSourcesByTitle: new Map([
    ["目标页面", { id: "target-page", title: "目标页面", revision: 88 }],
  ]),
  knownSourcesByTitle: new Map([
    [
      "已知但未选择",
      {
        id: "known-page",
        title: "已知但未选择",
        revision: 77,
        url: "https://clocktower-wiki.gstonegames.com/index.php?title=已知但未选择&oldid=77",
      },
    ],
  ]),
};

describe("MediaWiki URL 规范化", () => {
  test("把两种 Wiki 路径和 Unicode 标题规范化为唯一页面", () => {
    const fromIndex = normalizeWikiLink(
      "/index.php?title=%E7%9B%AE%E6%A0%87%E9%A1%B5%E9%9D%A2#%E7%BB%86%E8%8A%82",
      context,
    );
    const fromWiki = normalizeWikiLink("/wiki/目标页面#细节", context);

    expect(fromIndex).toMatchObject({
      kind: "selected",
      title: "目标页面",
      sourceId: "target-page",
      href: "./target-page.md#细节",
    });
    expect(fromWiki).toEqual(fromIndex);
  });

  test("未选择的正文页成为规范候选，外链保持安全绝对地址", () => {
    expect(normalizeWikiLink("/wiki/待核对_页面", context)).toMatchObject({
      kind: "candidate",
      title: "待核对 页面",
      href: "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%BE%85%E6%A0%B8%E5%AF%B9+%E9%A1%B5%E9%9D%A2",
    });
    expect(
      normalizeWikiLink("https://rules.example.test/reference", context),
    ).toEqual({
      kind: "external",
      href: "https://rules.example.test/reference",
    });
  });

  test("清单内但本次未生成的页面保留固定在线链接，不产生断裂本地引用", () => {
    expect(normalizeWikiLink("/wiki/已知但未选择#规则", context)).toEqual({
      kind: "known",
      title: "已知但未选择",
      sourceId: "known-page",
      revision: 77,
      href: "https://clocktower-wiki.gstonegames.com/index.php?title=已知但未选择&oldid=77#规则",
    });
  });

  test.each([
    ["javascript:alert(1)", "dangerous-protocol"],
    ["data:text/html,boom", "dangerous-protocol"],
    ["http://rules.example.test/page", "insecure-protocol"],
    ["/wiki/%E0%A4%A", "not-wiki-page"],
    ["/index.php?title=特殊:用户登录", "blocked-namespace"],
    ["/index.php?title=普通页面&action=edit", "non-view-action"],
    ["/index.php?title=普通页面&redlink=1", "red-link"],
  ])("拒绝非正文链接 %s", (href, reason) => {
    expect(normalizeWikiLink(href, context)).toEqual({
      kind: "rejected",
      href,
      reason,
    });
  });

  test("为固定修订构造只返回原始 Wikitext 的 API URL", () => {
    const url = new URL(
      buildRevisionApiUrl(
        "https://clocktower-wiki.gstonegames.com/index.php?title=页面&oldid=42",
        42,
      ),
    );

    expect(url.pathname).toBe("/api.php");
    expect(url.searchParams.get("revids")).toBe("42");
    expect(url.searchParams.get("rvprop")).toContain("content");
    expect(url.searchParams.get("rvslots")).toBe("main");
    expect(url.searchParams.get("formatversion")).toBe("2");
  });
});
