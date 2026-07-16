import Ajv from "ajv";
import { createHash } from "crypto";
import schema from "../../knowledge/rulesets/ruleset-scope.schema.json";
import scope from "../../knowledge/rulesets/m1-ruleset-scope.json";

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
  const 来源引用 = [
    ...清单.editions.map(({ sourceId }) => sourceId),
    清单.specialRoles.fabled.sourceId,
    清单.specialRoles.loric.sourceId,
  ];

  if (new Set(全部ID).size !== 全部ID.length) 错误.push("角色 ID 必须全局唯一");
  if (来源引用.some((sourceId) => !来源ID.has(sourceId))) {
    错误.push("来源引用必须存在");
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
    expect(引用.every((sourceId) => 来源.has(sourceId))).toBe(true);
    expect(
      scope.sources.every(
        ({ revision, url, contentHash }) =>
          url.includes(`oldid=${revision}`) &&
          /^sha256:[a-f0-9]{64}$/.test(contentHash),
      ),
    ).toBe(true);
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

    expect(获取语义错误(重复ID清单)).toContain("角色 ID 必须全局唯一");
    expect(获取语义错误(损坏来源清单)).toContain("来源引用必须存在");
    expect(编译校验器()(非法结构清单)).toBe(false);
  });
});
