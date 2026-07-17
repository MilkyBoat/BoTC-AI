import {
  SECTS_AND_VIOLETS_ROLE_BY_ID,
  SECTS_AND_VIOLETS_ROLE_IDS,
  countMathematicianAbnormalities,
  getNoDashiiPoisonedTownsfolk,
  isSectsAndVioletsRoleEffective,
  resolveBarberSwap,
  resolveBooleanInformation,
  resolveClockmakerDistance,
  resolveDreamerInformation,
  resolveEvilTwinOutcome,
  resolveFangGuAttack,
  resolveJugglerGuesses,
  resolveKlutzChoice,
  resolveMadnessAdjudication,
  resolveOracleCount,
  resolvePithagChange,
  resolveSageInformation,
  resolveSeamstressChoice,
  resolveSnakeCharmerChoice,
  resolveVigormortisKill,
  resolveVortoxNoExecution,
  resolveWitchNomination,
} from "@/domain/rulesets/sects-and-violets";

const 状态 = (
  roleIds,
  { deadSeatIds = [], conditions = [], markers = [], phase = "night" } = {},
) => {
  const seats = roleIds.map((roleId, index) => {
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId);
    return {
      seatId: `seat-${index + 1}`,
      order: index + 1,
      characterType: role.characterType,
      actualRoleId: roleId,
      perceivedRoleId: roleId,
      alignment: role.alignment,
      roleInstanceId: `role-${index + 1}`,
      alive: !deadSeatIds.includes(`seat-${index + 1}`),
      deadVoteAvailable: deadSeatIds.includes(`seat-${index + 1}`),
    };
  });
  return {
    lifecycle: "running",
    phase,
    dayNumber: 2,
    nightNumber: 2,
    seats,
    abilityInstances: seats.map((seat) => ({
      instanceId: `ability-${seat.roleInstanceId}`,
      definitionId: `snv.${seat.actualRoleId}.ability`,
      ownerSeatId: seat.seatId,
      sourceRoleId: `snv.${seat.actualRoleId}`,
      sourceRoleInstanceId: seat.roleInstanceId,
      status: "active",
      usesConsumed: 0,
    })),
    abilityConditions: conditions,
    sectsAndViolets: {
      markers,
      information: [],
      abilityAbnormalities: [],
      fangGuJumpUsed: false,
      setup: { evilTwinSeatId: null, goodTwinSeatId: null },
    },
  };
};

const 中毒 = (seatId) => ({
  conditionId: `poison-${seatId}`,
  seatId,
  conditionType: "poisoned",
  sourceId: "test",
  status: "active",
});

describe("M1-R9 25 角色通用有效性矩阵", () => {
  test.each(SECTS_AND_VIOLETS_ROLE_IDS)(
    "%s 覆盖正常、失效、死亡和角色变化",
    (roleId) => {
      const normal = 状态([roleId, "fanggu", "clockmaker", "mutant", "witch"]);
      expect(isSectsAndVioletsRoleEffective(normal, "seat-1", roleId)).toBe(
        true,
      );
      expect(
        isSectsAndVioletsRoleEffective(
          状态([roleId, "fanggu", "clockmaker", "mutant", "witch"], {
            conditions: [中毒("seat-1")],
          }),
          "seat-1",
          roleId,
        ),
      ).toBe(false);
      expect(
        isSectsAndVioletsRoleEffective(
          状态([roleId, "fanggu", "clockmaker", "mutant", "witch"], {
            deadSeatIds: ["seat-1"],
          }),
          "seat-1",
          roleId,
        ),
      ).toBe(false);
      const changed = 状态([roleId, "fanggu", "clockmaker", "mutant", "witch"]);
      changed.seats[0] = {
        ...changed.seats[0],
        actualRoleId: "clockmaker",
        roleInstanceId: "changed-role",
      };
      expect(isSectsAndVioletsRoleEffective(changed, "seat-1", roleId)).toBe(
        false,
      );
    },
  );
});

describe("M1-R9 信息、角色变化、疯狂和特殊胜负", () => {
  test("钟表匠计算所有恶魔—爪牙组合的最短环形距离", () => {
    const state = 状态(["fanggu", "clockmaker", "dreamer", "witch", "mutant"]);
    expect(resolveClockmakerDistance(state)).toBe(2);
  });

  test("筑梦师正常恰有一个真角色，涡流时两个角色都必须错误", () => {
    const state = 状态(["dreamer", "fanggu", "witch", "clockmaker", "mutant"]);
    expect(
      resolveDreamerInformation(state, "seat-1", "seat-2", [
        "fanggu",
        "artist",
      ]),
    ).toMatchObject({ truthful: true });
    expect(() =>
      resolveDreamerInformation(
        state,
        "seat-1",
        "seat-2",
        ["fanggu", "artist"],
        {
          vortoxActive: true,
        },
      ),
    ).toThrow("涡流");
    expect(
      resolveDreamerInformation(
        state,
        "seat-1",
        "seat-2",
        ["artist", "witch"],
        {
          vortoxActive: true,
        },
      ),
    ).toMatchObject({ truthful: false, vortoxConstrained: true });
  });

  test("舞蛇人选中恶魔交换角色与阵营且原恶魔中毒", () => {
    const state = 状态([
      "snakecharmer",
      "fanggu",
      "witch",
      "clockmaker",
      "mutant",
    ]);
    expect(resolveSnakeCharmerChoice(state, "seat-1", "seat-2")).toEqual({
      swapped: true,
      newDemonSeatId: "seat-1",
      newSnakeCharmerSeatId: "seat-2",
      poisonedSeatId: "seat-2",
    });
  });

  test("数学家按受影响玩家去重，涡流不把数学家自身重复计入", () => {
    expect(
      countMathematicianAbnormalities(
        [
          { seatId: "seat-2", causedByOtherCharacter: true },
          { seatId: "seat-2", causedByOtherCharacter: true },
          { seatId: "seat-3", causedByOtherCharacter: false },
          { seatId: "seat-1", causedByOtherCharacter: true },
        ],
        "seat-1",
      ),
    ).toBe(1);
  });

  test("布尔信息在涡流下必须严格错误，醉酒时只保持格式", () => {
    expect(
      resolveBooleanInformation({
        truth: true,
        delivered: false,
        vortoxActive: true,
      }),
    ).toMatchObject({ delivered: false, truthful: false });
    expect(() =>
      resolveBooleanInformation({
        truth: true,
        delivered: true,
        vortoxActive: true,
      }),
    ).toThrow("必须错误");
    expect(
      resolveBooleanInformation({
        truth: true,
        delivered: true,
        intoxicated: true,
      }),
    ).toMatchObject({ delivered: true });
  });

  test("神谕者、女裁缝、杂耍艺人和贤者按真实事实计算合法答案", () => {
    const state = 状态(["oracle", "fanggu", "witch", "seamstress", "sage"], {
      deadSeatIds: ["seat-2", "seat-3", "seat-5"],
    });
    expect(resolveOracleCount(state)).toBe(2);
    expect(
      resolveSeamstressChoice(state, "seat-4", ["seat-1", "seat-5"])
        .sameAlignment,
    ).toBe(true);
    expect(
      resolveJugglerGuesses(state, [
        { seatId: "seat-2", roleId: "fanggu" },
        { seatId: "seat-3", roleId: "cerenovus" },
      ]).correct,
    ).toBe(1);
    expect(
      resolveSageInformation(state, "seat-5", "seat-2", ["seat-2", "seat-3"]),
    ).toMatchObject({ valid: true });
  });

  test("疯狂只接受说书人的结构化裁定，内核不推断内心", () => {
    expect(
      resolveMadnessAdjudication({
        sourceRoleId: "cerenovus",
        targetSeatId: "seat-2",
        ruling: "not-complied",
        execute: true,
        evidenceSummary: "公开否认被要求声称的角色",
      }),
    ).toMatchObject({ executionRequested: true, inferredIntent: false });
    expect(() =>
      resolveMadnessAdjudication({
        sourceRoleId: "cerenovus",
        targetSeatId: "seat-2",
        ruling: "mind-read",
        execute: true,
      }),
    ).toThrow("结构化裁定");
  });

  test("理发师交换不改阵营，麻脸巫婆只创建不在场角色", () => {
    const state = 状态(["barber", "fanggu", "witch", "clockmaker", "mutant"]);
    expect(resolveBarberSwap(state, ["seat-3", "seat-4"])).toMatchObject({
      valid: true,
      preservesAlignments: true,
    });
    expect(() => resolveBarberSwap(state, ["seat-2", "seat-4"])).toThrow(
      "恶魔",
    );
    expect(resolvePithagChange(state, "seat-4", "artist")).toMatchObject({
      changed: true,
    });
    expect(resolvePithagChange(state, "seat-4", "witch")).toMatchObject({
      changed: false,
    });
  });

  test("方古首次成功杀死外来者才跳转，亡骨魔杀爪牙保留能力", () => {
    const state = 状态(["fanggu", "mutant", "witch", "clockmaker", "dreamer"]);
    expect(resolveFangGuAttack(state, "seat-1", "seat-2")).toMatchObject({
      jumps: true,
      oldDemonDies: true,
      targetDies: false,
      newAlignment: "evil",
    });
    state.sectsAndViolets.fangGuJumpUsed = true;
    expect(resolveFangGuAttack(state, "seat-1", "seat-2")).toMatchObject({
      jumps: false,
      targetDies: true,
    });
    expect(resolveVigormortisKill(state, "seat-3")).toMatchObject({
      retainsAbilityAfterDeath: true,
    });
  });

  test("诺-达鲺寻找两侧最近镇民并跳过其他角色类型", () => {
    const state = 状态([
      "nodashii",
      "mutant",
      "clockmaker",
      "witch",
      "dreamer",
    ]);
    expect(getNoDashiiPoisonedTownsfolk(state, "seat-1")).toEqual([
      "seat-3",
      "seat-5",
    ]);
  });

  test("镜像双子阻止善良胜利并在善良双子被处决死亡时邪恶胜", () => {
    expect(
      resolveEvilTwinOutcome({
        evilTwinAlive: true,
        goodTwinAlive: true,
        proposedWinner: "good",
      }),
    ).toMatchObject({ preventGoodWin: true });
    expect(
      resolveEvilTwinOutcome({
        evilTwinAlive: true,
        goodTwinAlive: false,
        goodTwinExecuted: true,
      }),
    ).toMatchObject({ winner: "evil" });
  });

  test("女巫只在四名以上存活时让被诅咒者提名后死亡", () => {
    expect(
      resolveWitchNomination({
        cursedSeatId: "seat-2",
        nominatorSeatId: "seat-2",
        livingCount: 4,
        witchEffective: true,
      }),
    ).toMatchObject({ dies: true, nominationStillOccurs: true });
    expect(
      resolveWitchNomination({
        cursedSeatId: "seat-2",
        nominatorSeatId: "seat-2",
        livingCount: 3,
        witchEffective: true,
      }).dies,
    ).toBe(false);
  });

  test("呆瓜选择邪恶玩家与涡流无人处决均产生邪恶胜利", () => {
    const state = 状态(["klutz", "fanggu", "witch", "clockmaker", "mutant"], {
      deadSeatIds: ["seat-1"],
    });
    expect(resolveKlutzChoice(state, "seat-1", "seat-2")).toMatchObject({
      winner: "evil",
    });
    expect(
      resolveVortoxNoExecution({
        vortoxEffective: true,
        executionOccurred: false,
      }),
    ).toMatchObject({ winner: "evil" });
    expect(
      resolveVortoxNoExecution({
        vortoxEffective: true,
        executionOccurred: true,
      }).winner,
    ).toBeNull();
  });
});
