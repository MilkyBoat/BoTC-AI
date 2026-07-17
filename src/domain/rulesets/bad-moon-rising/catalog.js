const 测试矩阵 = Object.freeze([
  "normal",
  "intoxicated",
  "dead-or-disabled",
  "character-change",
  "interaction",
]);

const 角色 = (id, name, characterType, alignment) =>
  Object.freeze({
    id,
    name,
    characterType,
    alignment,
    sourceId: `zh-wiki-role-${id}`,
    testMatrix: 测试矩阵,
  });

export const BAD_MOON_RISING_ROLE_CATALOG = Object.freeze([
  角色("grandmother", "祖母", "townsfolk", "good"),
  角色("sailor", "水手", "townsfolk", "good"),
  角色("chambermaid", "侍女", "townsfolk", "good"),
  角色("exorcist", "驱魔人", "townsfolk", "good"),
  角色("innkeeper", "旅店老板", "townsfolk", "good"),
  角色("gambler", "赌徒", "townsfolk", "good"),
  角色("gossip", "造谣者", "townsfolk", "good"),
  角色("courtier", "侍臣", "townsfolk", "good"),
  角色("professor", "教授", "townsfolk", "good"),
  角色("minstrel", "吟游诗人", "townsfolk", "good"),
  角色("tealady", "茶艺师", "townsfolk", "good"),
  角色("pacifist", "和平主义者", "townsfolk", "good"),
  角色("fool", "弄臣", "townsfolk", "good"),
  角色("tinker", "修补匠", "outsider", "good"),
  角色("moonchild", "月之子", "outsider", "good"),
  角色("goon", "莽夫", "outsider", "good"),
  角色("lunatic", "疯子", "outsider", "good"),
  角色("godfather", "教父", "minion", "evil"),
  角色("devilsadvocate", "魔鬼代言人", "minion", "evil"),
  角色("assassin", "刺客", "minion", "evil"),
  角色("mastermind", "主谋", "minion", "evil"),
  角色("zombuul", "僵怖", "demon", "evil"),
  角色("pukka", "普卡", "demon", "evil"),
  角色("shabaloth", "沙巴洛斯", "demon", "evil"),
  角色("po", "珀", "demon", "evil"),
]);

export const BAD_MOON_RISING_ROLE_IDS = Object.freeze(
  BAD_MOON_RISING_ROLE_CATALOG.map(({ id }) => id),
);

export const BAD_MOON_RISING_ROLE_BY_ID = new Map(
  BAD_MOON_RISING_ROLE_CATALOG.map((role) => [role.id, role]),
);

export const BAD_MOON_RISING_FIRST_NIGHT_ORDER = Object.freeze([
  "minion-info",
  "lunatic-info",
  "demon-info",
  "sailor",
  "courtier",
  "godfather",
  "devilsadvocate",
  "pukka",
  "grandmother",
  "chambermaid",
]);

export const BAD_MOON_RISING_OTHER_NIGHT_ORDER = Object.freeze([
  "sailor",
  "innkeeper",
  "courtier",
  "gambler",
  "devilsadvocate",
  "lunatic",
  "exorcist",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "assassin",
  "godfather",
  "professor",
  "gossip",
  "tinker",
  "moonchild",
  "grandmother",
  "chambermaid",
]);

export const BAD_MOON_RISING_PACKAGE_ID = "botc-ai.bad-moon-rising";
export const BAD_MOON_RISING_PACKAGE_VERSION = "0.1.0";
