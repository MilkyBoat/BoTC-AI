import Ajv from "ajv";
import { createHash } from "crypto";
import schema from "../../knowledge/rulesets/ruleset-scope.schema.json";
import scope from "../../knowledge/rulesets/m1-ruleset-scope.json";

const 术语目录 = [
  ["day", "白天"],
  ["not-in-play", "不在场"],
  ["town-square", "城镇广场"],
  ["setup-sheet", "初始设置表"],
  ["execution", "处决"],
  ["fabled-character", "传奇角色"],
  ["alive", "存活"],
  ["incorrect-information", "错误信息"],
  ["register-as", "当作"],
  ["demon", "恶魔"],
  ["demon-player", "恶魔玩家"],
  ["demon-information", "恶魔信息"],
  ["madness", "疯狂"],
  ["resurrection", "复活"],
  ["public", "公开"],
  ["rules-explanation", "规则解释"],
  ["wake", "唤醒"],
  ["dusk", "黄昏"],
  ["win", "获胜"],
  ["about-to-be-executed", "即将被处决"],
  ["healthy", "健康"],
  ["character", "角色"],
  ["character-token", "角色标记"],
  ["character-type", "角色类型"],
  ["character-sheet", "角色列表"],
  ["script", "剧本"],
  ["script-tool", "剧本工具"],
  ["edition", "剧本套装"],
  ["may", "可能"],
  ["dawn", "黎明"],
  ["exile", "流放"],
  ["traveler", "旅行者"],
  ["traveler-sheet", "旅行者列表"],
  ["lose", "落败"],
  ["each-night", "每个夜晚"],
  ["each-night-except-first", "每个夜晚*"],
  ["once-per-game", "每局游戏限一次"],
  ["ally", "盟友"],
  ["tomorrow", "明天"],
  ["grimoire", "魔典"],
  ["ability", "能力"],
  ["sober", "清醒"],
  ["blood-on-the-clocktower", "染"],
  ["good", "善良"],
  ["good-character", "善良角色"],
  ["life-token", "生命标记"],
  ["first-night", "首个夜晚"],
  ["storyteller", "说书人"],
  ["private", "私下"],
  ["nomination", "提名"],
  ["reminder-token", "提示标记"],
  ["vote", "投票"],
  ["vote-token", "投票标记"],
  ["outsider", "外来者"],
  ["player", "玩家"],
  ["shroud", "帷幕标记"],
  ["evil", "邪恶"],
  ["evil-character", "邪恶角色"],
  ["information", "信息"],
  ["information-token", "信息标记"],
  ["announce", "宣布"],
  ["choose", "选择"],
  ["leaf", "叶子"],
  ["night", "夜晚"],
  ["night-token", "夜晚标记"],
  ["night-order", "夜晚顺序表"],
  ["dead", "死亡"],
  ["thinks", "以为"],
  ["nearest-alive-neighbors", "与之邻近的存活玩家"],
  ["nearest-neighbors", "与之邻近的玩家"],
  ["in-play", "在场"],
  ["learn-first-night", "在你的首个夜晚得知"],
  ["minion", "爪牙"],
  ["minion-information", "爪牙信息"],
  ["alignment", "阵营"],
  ["townsfolk", "镇民"],
  ["correct-information", "正确信息"],
  ["poisoned", "中毒"],
  ["state", "状态"],
  ["drunk", "醉酒"],
];

const 能力类别目录 = [
  ["visit-storyteller", "拜访说书人"],
  ["protection", "保护"],
  ["role-exposure", "暴露角色"],
  ["continuous-detection", "持续检测型能力"],
  ["execution", "处决"],
  ["extra-death", "额外死亡"],
  ["madness", "疯狂"],
  ["resurrection", "复活"],
  ["selection-retargeting", "更换选择目标"],
  ["public-triggered-ability", "公开触发能力"],
  ["ability-gain", "获得能力"],
  ["information-gain", "获取信息"],
  ["interaction-interference", "互动干扰"],
  ["retrospective-ability", "回溯型能力"],
  ["entry-ability", "进场能力"],
  ["character-change", "角色变化"],
  ["adjacency", "邻近"],
  ["death-immunity", "免死"],
  ["ability-effect-interference", "能力效果干扰"],
  ["perception-override", "认知覆盖"],
  ["setup-adjustment", "设置调整"],
  ["post-death-ability-retention", "死后能力保留"],
  ["death-triggered-ability", "死亡触发能力"],
  ["special-win-loss-condition", "特殊胜利失败条件"],
  ["nomination", "提名"],
  ["vote", "投票"],
  ["limited-use-ability", "限次能力"],
  ["influence", "影响"],
  ["alignment-change", "阵营转变"],
  ["poisoned", "中毒"],
  ["drunk", "醉酒"],
];

const 重要规则主题目录 = [
  ["rules-exceptions", "规则特例"],
  ["ability", "能力"],
  ["state", "状态"],
  ["alive-and-dead", "存活与死亡"],
  ["alignment-and-character", "阵营与角色"],
  ["drunk-and-poisoned", "醉酒与中毒"],
  ["madness", "疯狂"],
];

const 概念来源修订 = {
  "zh-wiki-glossary": 6017,
  "zh-wiki-ability-categories": 3997,
  "zh-wiki-important-details": 4183,
  "zh-wiki-ability-visit-storyteller": 5047,
  "zh-wiki-ability-protection": 4763,
  "zh-wiki-ability-role-exposure": 6319,
  "zh-wiki-ability-continuous-detection": 6329,
  "zh-wiki-ability-execution": 6312,
  "zh-wiki-ability-extra-death": 6317,
  "zh-wiki-ability-madness": 5883,
  "zh-wiki-ability-resurrection": 5754,
  "zh-wiki-ability-selection-retargeting": 5509,
  "zh-wiki-ability-public-triggered-ability": 6385,
  "zh-wiki-ability-ability-gain": 6010,
  "zh-wiki-ability-information-gain": 6386,
  "zh-wiki-ability-interaction-interference": 6296,
  "zh-wiki-ability-retrospective-ability": 6408,
  "zh-wiki-ability-entry-ability": 5962,
  "zh-wiki-ability-character-change": 5755,
  "zh-wiki-ability-adjacency": 6380,
  "zh-wiki-ability-death-immunity": 5964,
  "zh-wiki-ability-ability-effect-interference": 5915,
  "zh-wiki-ability-perception-override": 6233,
  "zh-wiki-ability-setup-adjustment": 6377,
  "zh-wiki-ability-post-death-ability-retention": 6318,
  "zh-wiki-ability-death-triggered-ability": 6308,
  "zh-wiki-ability-special-win-loss-condition": 5406,
  "zh-wiki-ability-nomination": 5887,
  "zh-wiki-ability-vote": 5936,
  "zh-wiki-ability-limited-use-ability": 6297,
  "zh-wiki-ability-influence": 4760,
  "zh-wiki-ability-alignment-change": 4797,
  "zh-wiki-ability-poisoned": 6294,
  "zh-wiki-ability-drunk": 5720,
};

const 编译校验器 = () => new Ajv({ allErrors: true }).compile(schema);

const 获取全部角色 = (清单 = scope) => [
  ...清单.editions.flatMap((剧本) =>
    Object.values(剧本.roles).flatMap((角色列表) => 角色列表),
  ),
  ...清单.specialRoles.fabled.roles,
  ...清单.specialRoles.loric.roles,
];

const 获取语义错误 = (清单) => {
  const 错误 = [];
  const 全部ID = 获取全部角色(清单).map(({ id }) => id);
  const 来源ID = new Set(清单.sources.map(({ id }) => id));
  const 概念 = 清单.concepts ?? [];
  const 概念ID = 概念.map(({ id }) => id);
  const 概念ID集合 = new Set(概念ID);
  const 概念映射 = new Map(概念.map((记录) => [记录.id, 记录]));
  const 能力类别ID = new Set(
    概念
      .filter(({ kinds }) => kinds.includes("ability-category"))
      .map(({ id }) => id),
  );
  const 来源引用 = [
    ...清单.editions.map(({ sourceId }) => sourceId),
    清单.specialRoles.fabled.sourceId,
    清单.specialRoles.loric.sourceId,
    ...概念.flatMap(({ sourceRefs }) =>
      sourceRefs.map(({ sourceId }) => sourceId),
    ),
  ];

  if (new Set(全部ID).size !== 全部ID.length) 错误.push("角色 ID 必须全局唯一");
  if (概念ID集合.size !== 概念ID.length) 错误.push("概念 ID 必须全局唯一");
  if (来源引用.some((sourceId) => !来源ID.has(sourceId))) {
    错误.push("来源引用必须存在");
  }
  if (
    概念.some(({ relatedConceptIds }) =>
      relatedConceptIds.some((id) => !概念ID集合.has(id)),
    )
  ) {
    错误.push("关联概念引用必须存在");
  }
  if (
    Object.values(清单.conceptIndexes ?? {}).some((索引) =>
      索引.some((id) => !概念ID集合.has(id)),
    )
  ) {
    错误.push("概念目录引用必须存在");
  }
  const 目录类别 = {
    glossary: "glossary-term",
    abilityCategories: "ability-category",
    importantTopics: "important-topic",
  };
  if (
    Object.entries(清单.conceptIndexes ?? {}).some(([目录, 索引]) =>
      索引.some((id) => !概念映射.get(id)?.kinds.includes(目录类别[目录])),
    )
  ) {
    错误.push("概念目录分类必须一致");
  }
  if (
    (清单.roleAbilityCategories ?? []).some(
      ({ roleId, categoryIds }) =>
        !全部ID.includes(roleId) ||
        categoryIds.some((id) => !能力类别ID.has(id)),
    )
  ) {
    错误.push("角色能力类别引用必须存在");
  }
  return 错误;
};

const 规范化JSON = (值) => {
  if (Array.isArray(值)) return `[${值.map(规范化JSON).join(",")}]`;
  if (值 && typeof 值 === "object") {
    return `{${Object.keys(值)
      .sort()
      .map((键) => `${JSON.stringify(键)}:${规范化JSON(值[键])}`)
      .join(",")}}`;
  }
  return JSON.stringify(值);
};

describe("M1 规则范围清单", () => {
  test("符合严格 JSON Schema", () => {
    const 校验 = 编译校验器();

    expect(校验(scope)).toBe(true);
    expect(校验.errors).toBeNull();
  });

  test("冻结三个基础剧本及官方中文名称", () => {
    expect(
      scope.editions.map(({ id, displayName }) => [id, displayName]),
    ).toEqual([
      ["tb", "暗流涌动"],
      ["bmr", "黯月初升"],
      ["snv", "梦殒春宵"],
    ]);

    const 角色数 = scope.editions.map(({ id, roles }) => [
      id,
      Object.fromEntries(
        Object.entries(roles).map(([阵营, 角色列表]) => [
          阵营,
          角色列表.length,
        ]),
      ),
    ]);

    expect(角色数).toEqual([
      ["tb", { townsfolk: 13, outsider: 4, minion: 4, demon: 1, traveler: 5 }],
      ["bmr", { townsfolk: 13, outsider: 4, minion: 4, demon: 4, traveler: 5 }],
      ["snv", { townsfolk: 13, outsider: 4, minion: 4, demon: 4, traveler: 5 }],
    ]);
  });

  test("冻结精确角色 ID 与官方页面顺序", () => {
    const 角色ID = (剧本ID, 阵营) =>
      scope.editions
        .find(({ id }) => id === 剧本ID)
        .roles[阵营].map(({ id }) => id);

    expect(角色ID("tb", "townsfolk")).toEqual([
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "fortuneteller",
      "undertaker",
      "monk",
      "ravenkeeper",
      "virgin",
      "slayer",
      "soldier",
      "mayor",
    ]);
    expect(角色ID("tb", "outsider")).toEqual([
      "butler",
      "drunk",
      "recluse",
      "saint",
    ]);
    expect(角色ID("tb", "minion")).toEqual([
      "poisoner",
      "spy",
      "scarletwoman",
      "baron",
    ]);
    expect(角色ID("tb", "demon")).toEqual(["imp"]);
    expect(角色ID("tb", "traveler")).toEqual([
      "bureaucrat",
      "beggar",
      "gunslinger",
      "thief",
      "scapegoat",
    ]);

    expect(角色ID("bmr", "townsfolk")).toEqual([
      "grandmother",
      "sailor",
      "chambermaid",
      "exorcist",
      "innkeeper",
      "gambler",
      "gossip",
      "courtier",
      "professor",
      "minstrel",
      "tealady",
      "pacifist",
      "fool",
    ]);
    expect(角色ID("bmr", "outsider")).toEqual([
      "tinker",
      "moonchild",
      "goon",
      "lunatic",
    ]);
    expect(角色ID("bmr", "minion")).toEqual([
      "godfather",
      "devilsadvocate",
      "assassin",
      "mastermind",
    ]);
    expect(角色ID("bmr", "demon")).toEqual([
      "zombuul",
      "pukka",
      "shabaloth",
      "po",
    ]);
    expect(角色ID("bmr", "traveler")).toEqual([
      "judge",
      "matron",
      "voudon",
      "apprentice",
      "bishop",
    ]);

    expect(角色ID("snv", "townsfolk")).toEqual([
      "clockmaker",
      "dreamer",
      "snakecharmer",
      "mathematician",
      "flowergirl",
      "towncrier",
      "oracle",
      "savant",
      "seamstress",
      "philosopher",
      "artist",
      "juggler",
      "sage",
    ]);
    expect(角色ID("snv", "outsider")).toEqual([
      "mutant",
      "sweetheart",
      "barber",
      "klutz",
    ]);
    expect(角色ID("snv", "minion")).toEqual([
      "eviltwin",
      "witch",
      "cerenovus",
      "pithag",
    ]);
    expect(角色ID("snv", "demon")).toEqual([
      "fanggu",
      "vigormortis",
      "nodashii",
      "vortox",
    ]);
    expect(角色ID("snv", "traveler")).toEqual([
      "deviant",
      "bonecollector",
      "barista",
      "harlot",
      "butcher",
    ]);
  });

  test("冻结传奇角色与奇遇角色范围并纠正暴风捕手分类", () => {
    expect(scope.specialRoles.fabled.roles.map(({ id }) => id)).toEqual([
      "doomsayer",
      "toymaker",
      "angel",
      "buddhist",
      "revolutionary",
      "hellslibrarian",
      "fiddler",
      "fibbin",
      "duchess",
      "sentinel",
      "spiritofivory",
      "djinn",
    ]);
    expect(scope.specialRoles.loric.roles.map(({ id }) => id)).toEqual([
      "stormcatcher",
      "ventriloquist",
      "knaves",
      "pope",
      "godofug",
      "bigwig",
      "bootlegger",
      "hindu",
      "zenomancer",
      "tor",
      "gardener",
    ]);
  });

  test("角色 ID 全局唯一、为 ASCII，且显示名称使用中文", () => {
    const 全部角色 = 获取全部角色();
    const 全部ID = 全部角色.map(({ id }) => id);

    expect(全部角色).toHaveLength(110);
    expect(new Set(全部ID).size).toBe(110);
    expect(全部ID.every((id) => /^[a-z][a-z0-9]*$/.test(id))).toBe(true);
    expect(
      全部角色.every(({ displayName }) => /[\u3400-\u9fff]/u.test(displayName)),
    ).toBe(true);
  });

  test("冻结 110 个中文官方显示名称与清单顺序", () => {
    expect(获取全部角色().map(({ displayName }) => displayName)).toEqual([
      "洗衣妇",
      "图书管理员",
      "调查员",
      "厨师",
      "共情者",
      "占卜师",
      "送葬者",
      "僧侣",
      "守鸦人",
      "贞洁者",
      "猎手",
      "士兵",
      "镇长",
      "管家",
      "酒鬼",
      "陌客",
      "圣徒",
      "投毒者",
      "间谍",
      "红唇女郎",
      "男爵",
      "小恶魔",
      "官员",
      "乞丐",
      "枪手",
      "窃贼",
      "替罪羊",
      "祖母",
      "水手",
      "侍女",
      "驱魔人",
      "旅店老板",
      "赌徒",
      "造谣者",
      "侍臣",
      "教授",
      "吟游诗人",
      "茶艺师",
      "和平主义者",
      "弄臣",
      "修补匠",
      "月之子",
      "莽夫",
      "疯子",
      "教父",
      "魔鬼代言人",
      "刺客",
      "主谋",
      "僵怖",
      "普卡",
      "沙巴洛斯",
      "珀",
      "法官",
      "女舍监",
      "巫毒师",
      "学徒",
      "主教",
      "钟表匠",
      "筑梦师",
      "舞蛇人",
      "数学家",
      "卖花女孩",
      "城镇公告员",
      "神谕者",
      "博学者",
      "女裁缝",
      "哲学家",
      "艺术家",
      "杂耍艺人",
      "贤者",
      "畸形秀演员",
      "心上人",
      "理发师",
      "呆瓜",
      "镜像双子",
      "女巫",
      "洗脑师",
      "麻脸巫婆",
      "方古",
      "亡骨魔",
      "诺-达鲺",
      "涡流",
      "怪咖",
      "集骨者",
      "咖啡师",
      "流莺",
      "屠夫",
      "末日预言者",
      "玩具匠",
      "天使",
      "佛教徒",
      "革命者",
      "地狱藏书员",
      "小提琴手",
      "骗人精",
      "公爵夫人",
      "哨兵",
      "圣洁之魂",
      "灯神",
      "暴风捕手",
      "腹语师",
      "诡诈杰克",
      "教皇",
      "讷神",
      "首席律师",
      "私货商人",
      "印度教教徒",
      "异术士",
      "遗忘之门",
      "园丁",
    ]);
  });

  test("席位和语言策略与确认结论一致", () => {
    expect(scope.playerCount).toEqual({
      nonTravelers: { min: 5, max: 15 },
      travelers: { min: 0, max: 5 },
      total: { min: 5, max: 20 },
    });
    expect(scope.canonicalLanguage).toBe("zh-CN");
    expect(scope.sourcePolicy).toEqual({
      primary: "official-zh",
      englishFallback: "missing-only",
      conflictResolution: "official-zh-wins",
    });
  });

  test("升级为 0.2.0 并冻结 80 个术语、31 个能力类别和 7 个重要规则主题", () => {
    const 概念 = new Map(scope.concepts.map((记录) => [记录.id, 记录]));
    const 读取目录 = (目录) =>
      scope.conceptIndexes[目录].map((id) => [id, 概念.get(id).displayName]);

    expect(scope.version).toBe("0.2.0");
    expect(scope.sourceManifestVersion).toBe("0.2.0");
    expect(scope.concepts).toHaveLength(108);
    expect(读取目录("glossary")).toEqual(术语目录);
    expect(读取目录("abilityCategories")).toEqual(能力类别目录);
    expect(读取目录("importantTopics")).toEqual(重要规则主题目录);
  });

  test("概念使用稳定 ID、中文名称和唯一实现责任，并合并跨页重名定义", () => {
    const 全部概念ID = scope.concepts.map(({ id }) => id);
    const 说书人裁量ID = scope.concepts
      .filter(
        ({ responsibility }) => responsibility === "storyteller-adjudication",
      )
      .map(({ id }) => id);
    const 参考概念ID = scope.concepts
      .filter(({ responsibility }) => responsibility === "reference")
      .map(({ id }) => id);
    const 重叠ID = scope.concepts
      .filter(
        ({ kinds }) =>
          kinds.includes("glossary-term") && kinds.includes("ability-category"),
      )
      .map(({ id }) => id);

    expect(new Set(全部概念ID).size).toBe(108);
    expect(
      scope.concepts.every(
        ({ id, displayName }) =>
          /^[a-z][a-z0-9-]*$/.test(id) && /[\u3400-\u9fff]/u.test(displayName),
      ),
    ).toBe(true);
    expect(说书人裁量ID).toEqual([
      "incorrect-information",
      "register-as",
      "madness",
      "may",
      "rules-exceptions",
    ]);
    expect(参考概念ID).toEqual([
      "town-square",
      "setup-sheet",
      "rules-explanation",
      "character-token",
      "character-sheet",
      "script-tool",
      "edition",
      "traveler-sheet",
      "grimoire",
      "blood-on-the-clocktower",
      "life-token",
      "reminder-token",
      "shroud",
      "information-token",
      "leaf",
      "night-token",
      "night-order",
    ]);
    expect(
      scope.concepts.every(({ responsibility }) =>
        ["rules-kernel", "storyteller-adjudication", "reference"].includes(
          responsibility,
        ),
      ),
    ).toBe(true);
    expect(重叠ID).toEqual([
      "execution",
      "madness",
      "resurrection",
      "nomination",
      "vote",
      "poisoned",
      "drunk",
    ]);
    expect(
      scope.concepts.find(({ id }) => id === "resurrection").aliases,
    ).toEqual(["起死回生", "被反刍", "重生", "破坟"]);
    expect(scope.concepts.find(({ id }) => id === "ability").aliases).toEqual([
      "角色能力",
    ]);
    expect(
      scope.concepts.find(({ id }) => id === "alive-and-dead"),
    ).toMatchObject({
      relatedConceptIds: ["alive", "dead"],
    });
    expect(
      scope.concepts.find(({ id }) => id === "drunk-and-poisoned"),
    ).toMatchObject({
      relatedConceptIds: ["drunk", "poisoned", "sober", "healthy"],
    });
  });

  test("冻结当前 110 个角色的中文官方能力类别关联", () => {
    const 全部角色ID = 获取全部角色().map(({ id }) => id);
    const 映射哈希 = createHash("sha256")
      .update(规范化JSON(scope.roleAbilityCategories))
      .digest("hex");

    expect(scope.roleAbilityCategories).toHaveLength(110);
    expect(scope.roleAbilityCategories.map(({ roleId }) => roleId)).toEqual(
      全部角色ID,
    );
    expect(映射哈希).toBe(
      "71ad2fcf1106633649cb75627cff8088220ea5f0a5b9ecf41758d62c8d8a8db6",
    );
    expect(获取语义错误(scope)).not.toContain("角色能力类别引用必须存在");
  });

  test("来源引用完整且固定到中文官方页面修订", () => {
    const 来源 = new Map(scope.sources.map((记录) => [记录.id, 记录]));
    const 引用 = [
      ...scope.editions.map(({ sourceId }) => sourceId),
      scope.specialRoles.fabled.sourceId,
      scope.specialRoles.loric.sourceId,
    ];

    expect(new Set(scope.sources.map(({ id }) => id)).size).toBe(
      scope.sources.length,
    );
    expect(scope.sources).toHaveLength(39);
    expect(引用.every((sourceId) => 来源.has(sourceId))).toBe(true);
    expect(
      scope.sources.every(
        ({ revision, url, contentHash }) =>
          url.includes(`oldid=${revision}`) &&
          /^sha256:[a-f0-9]{64}$/.test(contentHash),
      ),
    ).toBe(true);
    expect(
      Object.fromEntries(
        scope.sources
          .filter(({ id }) => id in 概念来源修订)
          .map(({ id, revision }) => [id, revision]),
      ),
    ).toEqual(概念来源修订);
    expect(获取语义错误(scope)).toEqual([]);
  });

  test("清单完整性哈希覆盖除自身以外的全部内容", () => {
    const 待校验内容 = JSON.parse(JSON.stringify(scope));
    delete 待校验内容.integrity;
    const 实际哈希 = createHash("sha256")
      .update(规范化JSON(待校验内容))
      .digest("hex");

    expect(scope.integrity).toEqual({
      algorithm: "sha256",
      canonicalization: "sorted-json-v1",
      scope: "manifest-without-integrity",
      value: `sha256:${实际哈希}`,
    });
    expect(scope.integrity.value).toBe(
      "sha256:aa2daef3eb6d5c29f944fa431837823eb1faea472aed71146f1a4d8a71e5dd2d",
    );
  });

  test("明确排除实验性和自定义范围", () => {
    expect(scope.excluded).toEqual({
      experimentalRegularRoles: true,
      experimentalTravelers: true,
      experimentalFabled: true,
      customScripts: true,
      laissezUnFaire: true,
      otherOfficialScripts: true,
    });
  });

  test("拒绝重复角色 ID、损坏来源引用和非法结构", () => {
    const 重复ID清单 = JSON.parse(JSON.stringify(scope));
    重复ID清单.editions[1].roles.townsfolk[0].id = "washerwoman";
    const 损坏来源清单 = JSON.parse(JSON.stringify(scope));
    损坏来源清单.editions[0].sourceId = "missing-source";
    const 非法结构清单 = JSON.parse(JSON.stringify(scope));
    非法结构清单.editions[0].roles.townsfolk[0].id = "洗衣妇";
    const 损坏概念引用清单 = JSON.parse(JSON.stringify(scope));
    损坏概念引用清单.concepts[0].relatedConceptIds = ["missing-concept"];
    const 重复概念ID清单 = JSON.parse(JSON.stringify(scope));
    重复概念ID清单.concepts[1].id = 重复概念ID清单.concepts[0].id;
    const 损坏类别引用清单 = JSON.parse(JSON.stringify(scope));
    损坏类别引用清单.roleAbilityCategories[0].categoryIds = [
      "missing-category",
    ];

    expect(获取语义错误(重复ID清单)).toContain("角色 ID 必须全局唯一");
    expect(获取语义错误(损坏来源清单)).toContain("来源引用必须存在");
    expect(获取语义错误(损坏概念引用清单)).toContain("关联概念引用必须存在");
    expect(获取语义错误(重复概念ID清单)).toContain("概念 ID 必须全局唯一");
    expect(获取语义错误(损坏类别引用清单)).toContain(
      "角色能力类别引用必须存在",
    );
    expect(编译校验器()(非法结构清单)).toBe(false);
  });
});
