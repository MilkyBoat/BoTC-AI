import sources from "../../knowledge/rulesets/bad-moon-rising-sources.json";
import {
  BAD_MOON_RISING_FIRST_NIGHT_ORDER,
  BAD_MOON_RISING_OTHER_NIGHT_ORDER,
  BAD_MOON_RISING_ROLE_CATALOG,
  BAD_MOON_RISING_ROLE_IDS,
  BAD_MOON_RISING_ROLE_PACKAGE,
  createBadMoonRisingAbilityInstances,
  deriveBadMoonRisingCounts,
  generateBadMoonRisingSetup,
  validateBadMoonRisingSetup,
} from "@/domain/rulesets/bad-moon-rising";

const 正式角色 = [
  ["grandmother", "祖母", "townsfolk", "good"],
  ["sailor", "水手", "townsfolk", "good"],
  ["chambermaid", "侍女", "townsfolk", "good"],
  ["exorcist", "驱魔人", "townsfolk", "good"],
  ["innkeeper", "旅店老板", "townsfolk", "good"],
  ["gambler", "赌徒", "townsfolk", "good"],
  ["gossip", "造谣者", "townsfolk", "good"],
  ["courtier", "侍臣", "townsfolk", "good"],
  ["professor", "教授", "townsfolk", "good"],
  ["minstrel", "吟游诗人", "townsfolk", "good"],
  ["tealady", "茶艺师", "townsfolk", "good"],
  ["pacifist", "和平主义者", "townsfolk", "good"],
  ["fool", "弄臣", "townsfolk", "good"],
  ["tinker", "修补匠", "outsider", "good"],
  ["moonchild", "月之子", "outsider", "good"],
  ["goon", "莽夫", "outsider", "good"],
  ["lunatic", "疯子", "outsider", "good"],
  ["godfather", "教父", "minion", "evil"],
  ["devilsadvocate", "魔鬼代言人", "minion", "evil"],
  ["assassin", "刺客", "minion", "evil"],
  ["mastermind", "主谋", "minion", "evil"],
  ["zombuul", "僵怖", "demon", "evil"],
  ["pukka", "普卡", "demon", "evil"],
  ["shabaloth", "沙巴洛斯", "demon", "evil"],
  ["po", "珀", "demon", "evil"],
];

const 标准人数 = {
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
};

const 分配 = (roleIds) =>
  roleIds.map((actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));

describe("M1-R8《黯月初升》角色目录、来源与规则包", () => {
  test("固定 25 个规范角色且不纳入误称或范围外暴乱", () => {
    expect(BAD_MOON_RISING_ROLE_IDS).toEqual(正式角色.map(([id]) => id));
    expect(
      BAD_MOON_RISING_ROLE_CATALOG.map(
        ({ id, name, characterType, alignment }) => [
          id,
          name,
          characterType,
          alignment,
        ],
      ),
    ).toEqual(正式角色);
    expect(BAD_MOON_RISING_ROLE_IDS).not.toContain("riot");
    expect(BAD_MOON_RISING_ROLE_CATALOG.map(({ name }) => name)).not.toContain(
      "珀卡",
    );
  });

  test("25 个固定中文角色页均有 revision、时间与 Wikitext SHA-256", () => {
    expect(sources.sources).toHaveLength(25);
    expect(new Set(sources.sources.map(({ id }) => id)).size).toBe(25);
    BAD_MOON_RISING_ROLE_CATALOG.forEach(({ sourceId, testMatrix }) => {
      expect(sources.sources).toContainEqual(
        expect.objectContaining({
          id: sourceId,
          authority: "official-zh",
          revision: expect.any(Number),
          contentHashScope: "mediawiki-wikitext",
          contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      );
      expect(testMatrix).toEqual([
        "normal",
        "intoxicated",
        "dead-or-disabled",
        "character-change",
        "interaction",
      ]);
    });
  });

  test("规则包逐角色声明唯一能力、处理器和固定来源", () => {
    expect(BAD_MOON_RISING_ROLE_PACKAGE.identity).toMatchObject({
      id: "botc-ai.bad-moon-rising",
      version: "0.1.0",
    });
    expect(BAD_MOON_RISING_ROLE_PACKAGE.manifest.sources).toEqual(
      sources.sources,
    );
    expect(
      BAD_MOON_RISING_ROLE_PACKAGE.manifest.abilities.map(({ roleId }) =>
        roleId.replace("bmr.", ""),
      ),
    ).toEqual(BAD_MOON_RISING_ROLE_IDS.slice().sort());
    expect(
      new Set(
        BAD_MOON_RISING_ROLE_PACKAGE.manifest.abilities.map(
          ({ handlerId }) => handlerId,
        ),
      ).size,
    ).toBe(25);
  });
});

describe("M1-R8《黯月初升》开局与夜序", () => {
  test.each(Object.entries(标准人数))(
    "%s 人标准数量为 %j",
    (count, expected) => {
      expect(deriveBadMoonRisingCounts(Number(count))).toEqual({
        townsfolk: expected[0],
        outsider: expected[1],
        minion: expected[2],
        demon: expected[3],
      });
    },
  );

  test("教父只能在场时选择 -1 或 +1 外来者并保持总人数", () => {
    expect(
      deriveBadMoonRisingCounts(10, {
        hasGodfather: true,
        godfatherDelta: 1,
      }),
    ).toEqual({ townsfolk: 6, outsider: 1, minion: 2, demon: 1 });
    expect(
      deriveBadMoonRisingCounts(11, {
        hasGodfather: true,
        godfatherDelta: -1,
      }),
    ).toEqual({ townsfolk: 8, outsider: 0, minion: 2, demon: 1 });
    expect(() =>
      deriveBadMoonRisingCounts(10, {
        hasGodfather: false,
        godfatherDelta: 1,
      }),
    ).toThrow("教父");
  });

  test("疯子必须感知为恶魔，真恶魔与祖母设置均引用合法席位", () => {
    const assignments = 分配([
      "pukka",
      "godfather",
      "lunatic",
      "moonchild",
      "grandmother",
      "sailor",
      "chambermaid",
      "gambler",
    ]).map((assignment) =>
      assignment.actualRoleId === "lunatic"
        ? { ...assignment, perceivedRoleId: "shabaloth" }
        : assignment,
    );
    expect(
      validateBadMoonRisingSetup({
        assignments,
        godfatherDelta: 1,
        grandchildSeatId: "seat-6",
        demonBluffs: ["innkeeper", "professor", "tinker"],
        lunaticMinionSeatIds: ["seat-4"],
        lunaticBluffs: ["tealady", "pacifist", "moonchild"],
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  test("疯子实例运行专属模拟能力而不获得感知恶魔的真实能力", () => {
    const assignments = 分配([
      "pukka",
      "godfather",
      "lunatic",
      "grandmother",
      "sailor",
      "chambermaid",
      "gambler",
      "fool",
    ]).map((assignment) =>
      assignment.actualRoleId === "lunatic"
        ? { ...assignment, perceivedRoleId: "po" }
        : assignment,
    );
    const { instances } = createBadMoonRisingAbilityInstances(assignments);
    expect(
      instances.find(({ ownerSeatId }) => ownerSeatId === "seat-3"),
    ).toMatchObject({
      definitionId: "bmr.lunatic.ability",
      sourceRoleId: "bmr.lunatic",
    });
  });

  test("固定首夜与其他夜顺序", () => {
    expect(BAD_MOON_RISING_FIRST_NIGHT_ORDER).toEqual([
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
    expect(BAD_MOON_RISING_OTHER_NIGHT_ORDER).toEqual([
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
  });

  test("固定种子生成可复现合法开局", () => {
    const first = generateBadMoonRisingSetup({
      playerCount: 10,
      seed: "bmr-fixed-seed",
    });
    expect(
      generateBadMoonRisingSetup({
        playerCount: 10,
        seed: "bmr-fixed-seed",
      }),
    ).toEqual(first);
    expect(validateBadMoonRisingSetup(first)).toEqual({
      valid: true,
      errors: [],
    });
    expect(Object.isFrozen(first.assignments)).toBe(true);
  });
});
