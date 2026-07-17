import sources from "../../knowledge/rulesets/trouble-brewing-sources.json";
import {
  TROUBLE_BREWING_FIRST_NIGHT_ORDER,
  TROUBLE_BREWING_OTHER_NIGHT_ORDER,
  TROUBLE_BREWING_ROLE_CATALOG,
  TROUBLE_BREWING_ROLE_IDS,
  TROUBLE_BREWING_ROLE_PACKAGE,
  createTroubleBrewingAbilityInstances,
  deriveTroubleBrewingCounts,
  generateTroubleBrewingSetup,
  resolveTroubleBrewingRegistration,
  validateTroubleBrewingSetup,
} from "@/domain/rulesets/trouble-brewing";

const 正式角色 = [
  ["washerwoman", "洗衣妇", "townsfolk", "good"],
  ["librarian", "图书管理员", "townsfolk", "good"],
  ["investigator", "调查员", "townsfolk", "good"],
  ["chef", "厨师", "townsfolk", "good"],
  ["empath", "共情者", "townsfolk", "good"],
  ["fortuneteller", "占卜师", "townsfolk", "good"],
  ["undertaker", "送葬者", "townsfolk", "good"],
  ["monk", "僧侣", "townsfolk", "good"],
  ["ravenkeeper", "守鸦人", "townsfolk", "good"],
  ["virgin", "贞洁者", "townsfolk", "good"],
  ["slayer", "猎手", "townsfolk", "good"],
  ["soldier", "士兵", "townsfolk", "good"],
  ["mayor", "镇长", "townsfolk", "good"],
  ["butler", "管家", "outsider", "good"],
  ["drunk", "酒鬼", "outsider", "good"],
  ["recluse", "陌客", "outsider", "good"],
  ["saint", "圣徒", "outsider", "good"],
  ["poisoner", "投毒者", "minion", "evil"],
  ["spy", "间谍", "minion", "evil"],
  ["scarletwoman", "红唇女郎", "minion", "evil"],
  ["baron", "男爵", "minion", "evil"],
  ["imp", "小恶魔", "demon", "evil"],
];

const 标准人数 = Object.freeze({
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
});

const 生成分配 = (角色列表) =>
  角色列表.map((actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));

describe("M1-R7《暗流涌动》角色目录与来源", () => {
  test("固定 22 个稳定角色 ID、正式中文名、类型、阵营与角色页来源", () => {
    expect(TROUBLE_BREWING_ROLE_IDS).toEqual(正式角色.map(([id]) => id));
    expect(
      TROUBLE_BREWING_ROLE_CATALOG.map(
        ({ id, name, characterType, alignment }) => [
          id,
          name,
          characterType,
          alignment,
        ],
      ),
    ).toEqual(正式角色);

    const 来源Ids = new Set(sources.sources.map(({ id }) => id));
    expect(来源Ids.size).toBe(22);
    TROUBLE_BREWING_ROLE_CATALOG.forEach((角色) => {
      expect(来源Ids.has(角色.sourceId)).toBe(true);
      expect(角色.testMatrix).toEqual([
        "normal",
        "intoxicated",
        "dead-or-disabled",
        "character-change",
        "interaction",
      ]);
    });
    expect(
      TROUBLE_BREWING_ROLE_CATALOG.find(({ id }) => id === "mayor"),
    ).toMatchObject({ aliases: ["市长"] });
    expect(
      TROUBLE_BREWING_ROLE_CATALOG.find(({ id }) => id === "recluse"),
    ).toMatchObject({ aliases: ["隐士"] });
    expect(
      TROUBLE_BREWING_ROLE_CATALOG.find(({ id }) => id === "scarletwoman"),
    ).toMatchObject({ aliases: ["猩红女郎"] });
  });

  test("规则包为 22 个角色逐一声明能力、固定来源和唯一处理器", () => {
    expect(TROUBLE_BREWING_ROLE_PACKAGE.identity).toMatchObject({
      id: "botc-ai.trouble-brewing",
      version: "0.1.0",
    });
    expect(TROUBLE_BREWING_ROLE_PACKAGE.manifest.sources).toEqual(
      sources.sources,
    );
    expect(
      TROUBLE_BREWING_ROLE_PACKAGE.manifest.abilities.map(({ roleId }) =>
        roleId.replace("tb.", ""),
      ),
    ).toEqual(TROUBLE_BREWING_ROLE_IDS.slice().sort());
    expect(
      new Set(
        TROUBLE_BREWING_ROLE_PACKAGE.manifest.abilities.map(
          ({ handlerId }) => handlerId,
        ),
      ).size,
    ).toBe(22);
  });
});

describe("M1-R7《暗流涌动》开局", () => {
  test.each(Object.entries(标准人数))(
    "%s 人标准角色数量为镇民/外来者/爪牙/恶魔 %j",
    (人数, expected) => {
      expect(deriveTroubleBrewingCounts(Number(人数))).toEqual({
        townsfolk: expected[0],
        outsider: expected[1],
        minion: expected[2],
        demon: expected[3],
      });
    },
  );

  test("只接受 5 至 15 人，男爵恰好以两个外来者替换两个镇民", () => {
    expect(() => deriveTroubleBrewingCounts(4)).toThrow("5 至 15");
    expect(() => deriveTroubleBrewingCounts(16)).toThrow("5 至 15");
    expect(deriveTroubleBrewingCounts(10, { hasBaron: true })).toEqual({
      townsfolk: 5,
      outsider: 2,
      minion: 2,
      demon: 1,
    });
  });

  test("验证角色唯一、数量、酒鬼伪装、占卜师干扰项和邪恶方信息", () => {
    const assignments = 生成分配([
      "imp",
      "poisoner",
      "drunk",
      "fortuneteller",
      "chef",
      "empath",
      "washerwoman",
      "slayer",
    ]).map((assignment) =>
      assignment.actualRoleId === "drunk"
        ? { ...assignment, perceivedRoleId: "librarian" }
        : assignment,
    );
    expect(
      validateTroubleBrewingSetup({
        assignments,
        redHerringSeatId: "seat-5",
        demonBluffs: ["investigator", "monk", "saint"],
      }),
    ).toEqual({ valid: true, errors: [] });

    const invalid = validateTroubleBrewingSetup({
      assignments: assignments.map((assignment, index) =>
        index === 7
          ? { ...assignment, actualRoleId: "chef", perceivedRoleId: "chef" }
          : assignment,
      ),
      redHerringSeatId: "seat-2",
      demonBluffs: ["imp", "chef", "chef"],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_ROLE" }),
        expect.objectContaining({ code: "INVALID_RED_HERRING" }),
        expect.objectContaining({ code: "INVALID_DEMON_BLUFFS" }),
      ]),
    );
  });

  test("5/6 人没有邪恶互认和伪装角色，7 人起必须提供三个不在场善良角色", () => {
    const five = 生成分配(["imp", "poisoner", "washerwoman", "chef", "empath"]);
    expect(
      validateTroubleBrewingSetup({
        assignments: five,
        redHerringSeatId: null,
        demonBluffs: [],
      }),
    ).toEqual({ valid: true, errors: [] });
    expect(
      validateTroubleBrewingSetup({
        assignments: five,
        redHerringSeatId: null,
        demonBluffs: ["librarian", "monk", "saint"],
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: "INVALID_DEMON_BLUFFS" }));
  });

  test("酒鬼席位只实例化伪装镇民能力并以初始醉酒条件保持失效", () => {
    const assignments = 生成分配([
      "imp",
      "poisoner",
      "drunk",
      "fortuneteller",
      "chef",
      "empath",
      "washerwoman",
    ]).map((assignment) =>
      assignment.actualRoleId === "drunk"
        ? { ...assignment, perceivedRoleId: "librarian" }
        : assignment,
    );
    const result = createTroubleBrewingAbilityInstances(assignments);
    expect(
      result.instances.find(({ ownerSeatId }) => ownerSeatId === "seat-3"),
    ).toMatchObject({
      definitionId: "tb.librarian.ability",
      sourceRoleId: "tb.librarian",
      sourceRoleInstanceId: "role-3",
    });
    expect(result.initialConditions).toContainEqual(
      expect.objectContaining({
        seatId: "seat-3",
        conditionType: "drunk",
        sourceId: "tb.drunk",
      }),
    );
  });

  test("固定种子可复现生成同一合法开局且不同种子改变角色或座次", () => {
    const first = generateTroubleBrewingSetup({
      playerCount: 10,
      seed: "seed-trouble-brewing-a",
    });
    const repeated = generateTroubleBrewingSetup({
      playerCount: 10,
      seed: "seed-trouble-brewing-a",
    });
    const different = generateTroubleBrewingSetup({
      playerCount: 10,
      seed: "seed-trouble-brewing-b",
    });

    expect(repeated).toEqual(first);
    expect(different.assignments).not.toEqual(first.assignments);
    expect(validateTroubleBrewingSetup(first)).toEqual({
      valid: true,
      errors: [],
    });
    expect(Object.isFrozen(first.assignments)).toBe(true);
    expect(Object.isFrozen(first.demonBluffs)).toBe(true);
  });
});

describe("M1-R7《暗流涌动》顺序与登记", () => {
  test("冻结首夜和其他夜晚顺序", () => {
    expect(TROUBLE_BREWING_FIRST_NIGHT_ORDER).toEqual([
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
    expect(TROUBLE_BREWING_OTHER_NIGHT_ORDER).toEqual([
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
  });

  test.each([
    ["recluse", false, "evil", true],
    ["recluse", false, "minion", true],
    ["recluse", false, "demon", true],
    ["recluse", true, "demon", true],
    ["spy", false, "good", true],
    ["spy", false, "townsfolk", true],
    ["spy", false, "outsider", true],
    ["spy", true, "good", true],
    ["chef", false, "evil", false],
  ])(
    "%s（死亡=%s）登记为 %s 的合法性是 %s",
    (actualRoleId, dead, registeredAs, expected) => {
      expect(
        resolveTroubleBrewingRegistration({
          actualRoleId,
          actualAlignment: actualRoleId === "spy" ? "evil" : "good",
          actualCharacterType: actualRoleId === "spy" ? "minion" : "townsfolk",
          dead,
          registeredAs,
        }).allowed,
      ).toBe(expected);
    },
  );

  test("登记不改真相阵营、角色类型，也不授予被登记角色能力", () => {
    const result = resolveTroubleBrewingRegistration({
      actualRoleId: "recluse",
      actualAlignment: "good",
      actualCharacterType: "outsider",
      dead: true,
      registeredAs: "demon",
    });
    expect(result).toEqual({
      allowed: true,
      actualRoleId: "recluse",
      actualAlignment: "good",
      actualCharacterType: "outsider",
      registeredAs: "demon",
      grantsAbility: false,
    });
  });
});
