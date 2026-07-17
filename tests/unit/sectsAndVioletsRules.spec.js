import sources from "../../knowledge/rulesets/sects-and-violets-sources.json";
import {
  SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER,
  SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER,
  SECTS_AND_VIOLETS_ROLE_CATALOG,
  SECTS_AND_VIOLETS_ROLE_IDS,
  SECTS_AND_VIOLETS_ROLE_PACKAGE,
  createSectsAndVioletsAbilityInstances,
  deriveSectsAndVioletsCounts,
  generateSectsAndVioletsSetup,
  validateSectsAndVioletsSetup,
} from "@/domain/rulesets/sects-and-violets";

const 正式角色 = [
  ["clockmaker", "钟表匠", "townsfolk", "good"],
  ["dreamer", "筑梦师", "townsfolk", "good"],
  ["snakecharmer", "舞蛇人", "townsfolk", "good"],
  ["mathematician", "数学家", "townsfolk", "good"],
  ["flowergirl", "卖花女孩", "townsfolk", "good"],
  ["towncrier", "城镇公告员", "townsfolk", "good"],
  ["oracle", "神谕者", "townsfolk", "good"],
  ["savant", "博学者", "townsfolk", "good"],
  ["seamstress", "女裁缝", "townsfolk", "good"],
  ["philosopher", "哲学家", "townsfolk", "good"],
  ["artist", "艺术家", "townsfolk", "good"],
  ["juggler", "杂耍艺人", "townsfolk", "good"],
  ["sage", "贤者", "townsfolk", "good"],
  ["mutant", "畸形秀演员", "outsider", "good"],
  ["sweetheart", "心上人", "outsider", "good"],
  ["barber", "理发师", "outsider", "good"],
  ["klutz", "呆瓜", "outsider", "good"],
  ["eviltwin", "镜像双子", "minion", "evil"],
  ["witch", "女巫", "minion", "evil"],
  ["cerenovus", "洗脑师", "minion", "evil"],
  ["pithag", "麻脸巫婆", "minion", "evil"],
  ["fanggu", "方古", "demon", "evil"],
  ["vigormortis", "亡骨魔", "demon", "evil"],
  ["nodashii", "诺-达鲺", "demon", "evil"],
  ["vortox", "涡流", "demon", "evil"],
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

describe("M1-R9《梦殒春宵》角色目录、来源与规则包", () => {
  test("固定 25 个规范角色并归一女裁缝与镜像双子名称", () => {
    expect(SECTS_AND_VIOLETS_ROLE_IDS).toEqual(正式角色.map(([id]) => id));
    expect(
      SECTS_AND_VIOLETS_ROLE_CATALOG.map(
        ({ id, name, characterType, alignment }) => [
          id,
          name,
          characterType,
          alignment,
        ],
      ),
    ).toEqual(正式角色);
    expect(SECTS_AND_VIOLETS_ROLE_CATALOG.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(["裁缝", "邪恶双子"]),
    );
  });

  test("25 个固定中文角色页均有 revision、时间与 Wikitext SHA-256", () => {
    expect(sources.sources).toHaveLength(25);
    expect(new Set(sources.sources.map(({ id }) => id)).size).toBe(25);
    SECTS_AND_VIOLETS_ROLE_CATALOG.forEach(({ sourceId, testMatrix }) => {
      expect(sources.sources).toContainEqual(
        expect.objectContaining({
          id: sourceId,
          authority: "official-zh",
          revision: expect.any(Number),
          revisedAt: expect.stringMatching(/Z$/),
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

  test("规则包逐角色声明唯一非空处理器、触发、来源与允许事件", () => {
    expect(SECTS_AND_VIOLETS_ROLE_PACKAGE.identity).toMatchObject({
      id: "botc-ai.sects-and-violets",
      version: "0.1.0",
    });
    expect(SECTS_AND_VIOLETS_ROLE_PACKAGE.manifest.sources).toEqual(
      sources.sources,
    );
    const abilities = SECTS_AND_VIOLETS_ROLE_PACKAGE.manifest.abilities;
    expect(abilities).toHaveLength(25);
    expect(new Set(abilities.map(({ handlerId }) => handlerId)).size).toBe(25);
    abilities.forEach((ability) => {
      expect(ability.sourceRefs).toHaveLength(1);
      expect(ability.triggers.length).toBeGreaterThan(0);
      expect(ability.allowedEventTypes.length).toBeGreaterThan(0);
    });
  });
});

describe("M1-R9《梦殒春宵》开局与夜序", () => {
  test.each(Object.entries(标准人数))(
    "%s 人标准数量为 %j",
    (count, expected) => {
      expect(deriveSectsAndVioletsCounts(Number(count))).toEqual({
        townsfolk: expected[0],
        outsider: expected[1],
        minion: expected[2],
        demon: expected[3],
      });
    },
  );

  test("方古 +1、亡骨魔 -1 外来者，二者同时在场净变化为零", () => {
    expect(
      deriveSectsAndVioletsCounts(10, {
        hasFangGu: true,
        hasVigormortis: false,
      }),
    ).toEqual({ townsfolk: 6, outsider: 1, minion: 2, demon: 1 });
    expect(
      deriveSectsAndVioletsCounts(11, {
        hasFangGu: false,
        hasVigormortis: true,
      }),
    ).toEqual({ townsfolk: 8, outsider: 0, minion: 2, demon: 1 });
    expect(
      deriveSectsAndVioletsCounts(10, {
        hasFangGu: true,
        hasVigormortis: true,
      }),
    ).toEqual({ townsfolk: 7, outsider: 0, minion: 2, demon: 1 });
  });

  test("镜像双子必须绑定另一名相反阵营玩家，恶魔伪装必须不在场", () => {
    const assignments = 分配([
      "fanggu",
      "eviltwin",
      "mutant",
      "clockmaker",
      "dreamer",
      "artist",
      "oracle",
      "sweetheart",
    ]);
    expect(
      validateSectsAndVioletsSetup({
        assignments,
        evilTwinSeatId: "seat-2",
        goodTwinSeatId: "seat-4",
        demonBluffs: ["seamstress", "barber", "juggler"],
      }),
    ).toEqual({ valid: true, errors: [] });
    expect(
      validateSectsAndVioletsSetup({
        assignments,
        evilTwinSeatId: "seat-2",
        goodTwinSeatId: "seat-1",
        demonBluffs: ["seamstress", "barber", "juggler"],
      }).valid,
    ).toBe(false);
  });

  test("固定首夜与其他夜顺序", () => {
    expect(SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER).toEqual([
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
    expect(SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER).toEqual([
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
  });

  test("固定种子生成可复现合法开局与非空能力实例", () => {
    const first = generateSectsAndVioletsSetup({
      playerCount: 10,
      seed: "snv-fixed-seed",
    });
    expect(
      generateSectsAndVioletsSetup({
        playerCount: 10,
        seed: "snv-fixed-seed",
      }),
    ).toEqual(first);
    expect(validateSectsAndVioletsSetup(first)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      createSectsAndVioletsAbilityInstances(first.assignments).instances,
    ).toHaveLength(10);
  });
});
