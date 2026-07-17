const 测试矩阵 = Object.freeze([
  "normal",
  "intoxicated",
  "dead-or-disabled",
  "character-change",
  "interaction",
]);

const 角色 = (id, name, characterType, alignment, options = {}) =>
  Object.freeze({
    id,
    name,
    aliases: Object.freeze(options.aliases ?? []),
    characterType,
    alignment,
    sourceId: `zh-wiki-role-${id}`,
    testMatrix: 测试矩阵,
  });

export const TROUBLE_BREWING_ROLE_CATALOG = Object.freeze([
  角色("washerwoman", "洗衣妇", "townsfolk", "good"),
  角色("librarian", "图书管理员", "townsfolk", "good"),
  角色("investigator", "调查员", "townsfolk", "good"),
  角色("chef", "厨师", "townsfolk", "good"),
  角色("empath", "共情者", "townsfolk", "good"),
  角色("fortuneteller", "占卜师", "townsfolk", "good"),
  角色("undertaker", "送葬者", "townsfolk", "good"),
  角色("monk", "僧侣", "townsfolk", "good"),
  角色("ravenkeeper", "守鸦人", "townsfolk", "good"),
  角色("virgin", "贞洁者", "townsfolk", "good"),
  角色("slayer", "猎手", "townsfolk", "good"),
  角色("soldier", "士兵", "townsfolk", "good"),
  角色("mayor", "镇长", "townsfolk", "good", { aliases: ["市长"] }),
  角色("butler", "管家", "outsider", "good"),
  角色("drunk", "酒鬼", "outsider", "good"),
  角色("recluse", "陌客", "outsider", "good", { aliases: ["隐士"] }),
  角色("saint", "圣徒", "outsider", "good"),
  角色("poisoner", "投毒者", "minion", "evil"),
  角色("spy", "间谍", "minion", "evil"),
  角色("scarletwoman", "红唇女郎", "minion", "evil", {
    aliases: ["猩红女郎"],
  }),
  角色("baron", "男爵", "minion", "evil"),
  角色("imp", "小恶魔", "demon", "evil"),
]);

export const TROUBLE_BREWING_ROLE_IDS = Object.freeze(
  TROUBLE_BREWING_ROLE_CATALOG.map(({ id }) => id),
);

export const TROUBLE_BREWING_ROLE_BY_ID = new Map(
  TROUBLE_BREWING_ROLE_CATALOG.map((role) => [role.id, role]),
);

export const TROUBLE_BREWING_FIRST_NIGHT_ORDER = Object.freeze([
  "evil-recognition",
  "poisoner",
  "spy",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortuneteller",
  "butler",
]);

export const TROUBLE_BREWING_OTHER_NIGHT_ORDER = Object.freeze([
  "poisoner",
  "monk",
  "spy",
  "scarletwoman",
  "imp",
  "ravenkeeper",
  "undertaker",
  "empath",
  "fortuneteller",
  "butler",
]);

export const TROUBLE_BREWING_PACKAGE_ID = "botc-ai.trouble-brewing";
export const TROUBLE_BREWING_PACKAGE_VERSION = "0.1.0";
