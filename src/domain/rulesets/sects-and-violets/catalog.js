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

export const SECTS_AND_VIOLETS_ROLE_CATALOG = Object.freeze([
  角色("clockmaker", "钟表匠", "townsfolk", "good"),
  角色("dreamer", "筑梦师", "townsfolk", "good"),
  角色("snakecharmer", "舞蛇人", "townsfolk", "good"),
  角色("mathematician", "数学家", "townsfolk", "good"),
  角色("flowergirl", "卖花女孩", "townsfolk", "good"),
  角色("towncrier", "城镇公告员", "townsfolk", "good"),
  角色("oracle", "神谕者", "townsfolk", "good"),
  角色("savant", "博学者", "townsfolk", "good"),
  角色("seamstress", "女裁缝", "townsfolk", "good"),
  角色("philosopher", "哲学家", "townsfolk", "good"),
  角色("artist", "艺术家", "townsfolk", "good"),
  角色("juggler", "杂耍艺人", "townsfolk", "good"),
  角色("sage", "贤者", "townsfolk", "good"),
  角色("mutant", "畸形秀演员", "outsider", "good"),
  角色("sweetheart", "心上人", "outsider", "good"),
  角色("barber", "理发师", "outsider", "good"),
  角色("klutz", "呆瓜", "outsider", "good"),
  角色("eviltwin", "镜像双子", "minion", "evil"),
  角色("witch", "女巫", "minion", "evil"),
  角色("cerenovus", "洗脑师", "minion", "evil"),
  角色("pithag", "麻脸巫婆", "minion", "evil"),
  角色("fanggu", "方古", "demon", "evil"),
  角色("vigormortis", "亡骨魔", "demon", "evil"),
  角色("nodashii", "诺-达鲺", "demon", "evil"),
  角色("vortox", "涡流", "demon", "evil"),
]);

export const SECTS_AND_VIOLETS_ROLE_IDS = Object.freeze(
  SECTS_AND_VIOLETS_ROLE_CATALOG.map(({ id }) => id),
);

export const SECTS_AND_VIOLETS_ROLE_BY_ID = new Map(
  SECTS_AND_VIOLETS_ROLE_CATALOG.map((role) => [role.id, role]),
);

export const SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER = Object.freeze([
  "minion-info",
  "demon-info",
  "philosopher",
  "snakecharmer",
  "eviltwin",
  "witch",
  "cerenovus",
  "clockmaker",
  "dreamer",
  "seamstress",
  "mathematician",
]);

export const SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER = Object.freeze([
  "philosopher",
  "snakecharmer",
  "witch",
  "cerenovus",
  "pithag",
  "fanggu",
  "vigormortis",
  "nodashii",
  "vortox",
  "barber",
  "sweetheart",
  "sage",
  "dreamer",
  "flowergirl",
  "towncrier",
  "oracle",
  "seamstress",
  "juggler",
  "mathematician",
]);

export const SECTS_AND_VIOLETS_PACKAGE_ID = "botc-ai.sects-and-violets";
export const SECTS_AND_VIOLETS_PACKAGE_VERSION = "0.1.0";
