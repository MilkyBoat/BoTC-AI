import {
  TROUBLE_BREWING_ROLE_BY_ID,
  TROUBLE_BREWING_ROLE_IDS,
  canImpHarmSeat,
  canMonkProtect,
  checkButlerVoteViolation,
  countChefEvilPairs,
  countEmpathEvilNeighbors,
  createPoisonTransition,
  createSpyGrimoire,
  deriveTroubleBrewingCounts,
  isTroubleBrewingRoleEffective,
  mayorWinsAtDayEnd,
  resolveFortuneTellerAnswer,
  resolveSlayerShot,
  resolveTroubleBrewingDeath,
  resolveTroubleBrewingRegistration,
  validatePairInformation,
  validateRoleReveal,
  virginExecutesNominator,
} from "@/domain/rulesets/trouble-brewing";

const 建立状态 = (
  roleIds,
  {
    deadSeatIds = [],
    conditions = [],
    ongoingAbilityEffects = [],
    markers = [],
    redHerringSeatId = null,
    executionToday = null,
  } = {},
) => {
  const seats = roleIds.map((roleId, index) => {
    const role = TROUBLE_BREWING_ROLE_BY_ID.get(roleId);
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
    phase: "night",
    dayNumber: 1,
    nightNumber: 2,
    seats,
    executionToday,
    abilityInstances: seats.map((seat) => ({
      instanceId: `ability-${seat.roleInstanceId}`,
      definitionId: `tb.${seat.actualRoleId}.ability`,
      ownerSeatId: seat.seatId,
      sourceRoleId: `tb.${seat.actualRoleId}`,
      sourceRoleInstanceId: seat.roleInstanceId,
      status: "active",
      usesConsumed: 0,
    })),
    abilityConditions: conditions,
    ongoingAbilityEffects,
    troubleBrewing: {
      setup: { redHerringSeatId, demonBluffs: [], evilTeamSeatIds: [] },
      markers,
    },
  };
};

const 中毒条件 = (seatId) => ({
  conditionId: `poison-${seatId}`,
  seatId,
  conditionType: "poisoned",
  sourceId: "tb.poisoner",
  status: "active",
});

describe("M1-R7 22 角色通用失效与角色变化矩阵", () => {
  test.each(TROUBLE_BREWING_ROLE_IDS)(
    "%s：正常、醉酒/中毒、死亡和角色变化",
    (roleId) => {
      const normal = 建立状态([roleId, "imp", "chef", "empath", "monk"]);
      const normalExpected = roleId !== "drunk";
      expect(isTroubleBrewingRoleEffective(normal, "seat-1", roleId)).toBe(
        normalExpected,
      );

      const intoxicated = 建立状态([roleId, "imp", "chef", "empath", "monk"], {
        conditions: [中毒条件("seat-1")],
      });
      expect(isTroubleBrewingRoleEffective(intoxicated, "seat-1", roleId)).toBe(
        false,
      );

      const dead = 建立状态([roleId, "imp", "chef", "empath", "monk"], {
        deadSeatIds: ["seat-1"],
      });
      expect(isTroubleBrewingRoleEffective(dead, "seat-1", roleId)).toBe(false);
      expect(
        isTroubleBrewingRoleEffective(dead, "seat-1", roleId, {
          allowDead: ["ravenkeeper", "recluse", "spy"].includes(roleId),
        }),
      ).toBe(["ravenkeeper", "recluse", "spy"].includes(roleId));

      const changed = 建立状态([roleId, "imp", "chef", "empath", "monk"]);
      changed.seats[0] = {
        ...changed.seats[0],
        actualRoleId: roleId === "chef" ? "empath" : "chef",
        roleInstanceId: "role-changed",
      };
      expect(isTroubleBrewingRoleEffective(changed, "seat-1", roleId)).toBe(
        false,
      );
    },
  );

  test("酒鬼无论感知为何种镇民都没有该能力", () => {
    const state = 建立状态(["drunk", "imp", "chef", "empath", "monk"], {
      conditions: [
        {
          conditionId: "drunk-role-1",
          seatId: "seat-1",
          conditionType: "drunk",
          sourceId: "tb.drunk",
          status: "active",
        },
      ],
    });
    state.seats[0] = { ...state.seats[0], perceivedRoleId: "fortuneteller" };
    expect(isTroubleBrewingRoleEffective(state, "seat-1", "drunk")).toBe(false);
    expect(
      isTroubleBrewingRoleEffective(state, "seat-1", "fortuneteller"),
    ).toBe(false);
  });
});

describe("M1-R7 每个角色的正常效果与适用相克", () => {
  test("洗衣妇：两人中恰一人可登记为展示镇民，间谍可干扰", () => {
    const state = 建立状态(["washerwoman", "chef", "spy", "imp", "monk"]);
    expect(
      validatePairInformation(state, {
        roleId: "washerwoman",
        shownRoleId: "chef",
        seatIds: ["seat-2", "seat-3"],
      }),
    ).toBe(true);
    expect(
      validatePairInformation(state, {
        roleId: "washerwoman",
        shownRoleId: "chef",
        seatIds: ["seat-2", "seat-3"],
        registrations: { "seat-3": "chef" },
      }),
    ).toBe(false);
  });

  test("图书管理员：可得知外来者两人信息或没有外来者", () => {
    const state = 建立状态(["librarian", "butler", "chef", "imp", "poisoner"]);
    expect(
      validatePairInformation(state, {
        roleId: "librarian",
        shownRoleId: "butler",
        seatIds: ["seat-2", "seat-3"],
      }),
    ).toBe(true);
    const noOutsider = 建立状态([
      "librarian",
      "chef",
      "empath",
      "imp",
      "poisoner",
    ]);
    expect(
      validatePairInformation(noOutsider, {
        roleId: "librarian",
        shownRoleId: null,
        seatIds: [],
      }),
    ).toBe(true);
  });

  test("调查员：可得知爪牙两人信息，陌客可登记爪牙", () => {
    const state = 建立状态([
      "investigator",
      "poisoner",
      "recluse",
      "imp",
      "chef",
    ]);
    expect(
      validatePairInformation(state, {
        roleId: "investigator",
        shownRoleId: "poisoner",
        seatIds: ["seat-2", "seat-3"],
      }),
    ).toBe(true);
    expect(
      validatePairInformation(state, {
        roleId: "investigator",
        shownRoleId: "poisoner",
        seatIds: ["seat-2", "seat-3"],
        registrations: { "seat-3": "poisoner" },
      }),
    ).toBe(false);
  });

  test("厨师：环形座次只计算相邻邪恶配对", () => {
    const state = 建立状态(["chef", "imp", "poisoner", "empath", "monk"]);
    expect(countChefEvilPairs(state)).toBe(1);
  });

  test("共情者：跳过死亡玩家读取两侧最近存活邻座", () => {
    const state = 建立状态(["imp", "chef", "empath", "poisoner", "monk"], {
      deadSeatIds: ["seat-2"],
    });
    expect(countEmpathEvilNeighbors(state, "seat-3")).toBe(2);
  });

  test("占卜师：恶魔、已死恶魔和固定善良干扰项均返回是", () => {
    const state = 建立状态(["fortuneteller", "imp", "chef", "empath", "monk"], {
      deadSeatIds: ["seat-2"],
      redHerringSeatId: "seat-3",
    });
    expect(resolveFortuneTellerAnswer(state, ["seat-2", "seat-4"])).toBe(true);
    expect(resolveFortuneTellerAnswer(state, ["seat-3", "seat-4"])).toBe(true);
    expect(resolveFortuneTellerAnswer(state, ["seat-4", "seat-5"])).toBe(false);
  });

  test("送葬者：只展示被处决且死亡玩家的真实或许可登记角色", () => {
    const state = 建立状态(["undertaker", "recluse", "imp", "chef", "monk"]);
    expect(
      validateRoleReveal(state, {
        targetSeatId: "seat-2",
        shownRoleId: "recluse",
      }),
    ).toBe(true);
    expect(
      validateRoleReveal(state, {
        targetSeatId: "seat-2",
        shownRoleId: "imp",
        registrations: { "seat-2": "imp" },
      }),
    ).toBe(true);
  });

  test("僧侣：不能选择自己，保护可阻止小恶魔伤害", () => {
    const state = 建立状态(["monk", "chef", "imp", "empath", "poisoner"]);
    expect(canMonkProtect(state, "seat-1", "seat-1")).toBe(false);
    expect(canMonkProtect(state, "seat-1", "seat-2")).toBe(true);
    state.ongoingAbilityEffects = [
      {
        effectId: "effect-monk",
        abilityInstanceId: "ability-role-1",
        effectType: "tb.monk-protection",
        targetIds: ["seat-2"],
        status: "active",
      },
    ];
    expect(canImpHarmSeat(state, "seat-2")).toBe(false);
  });

  test("守鸦人：夜间死亡后仍可读取目标登记角色", () => {
    const state = 建立状态(["ravenkeeper", "spy", "imp", "chef", "monk"], {
      deadSeatIds: ["seat-1"],
    });
    expect(
      isTroubleBrewingRoleEffective(state, "seat-1", "ravenkeeper", {
        allowDead: true,
      }),
    ).toBe(true);
    expect(
      validateRoleReveal(state, {
        targetSeatId: "seat-2",
        shownRoleId: "chef",
        registrations: { "seat-2": "chef" },
      }),
    ).toBe(true);
  });

  test("贞洁者：首次被登记为镇民的玩家提名时处决提名者", () => {
    const state = 建立状态(["virgin", "chef", "spy", "imp", "monk"]);
    expect(
      virginExecutesNominator(state, {
        virginSeatId: "seat-1",
        nominatorSeatId: "seat-2",
      }),
    ).toBe(true);
    expect(
      virginExecutesNominator(state, {
        virginSeatId: "seat-1",
        nominatorSeatId: "seat-3",
        nominatorRegisteredAs: "townsfolk",
      }),
    ).toBe(true);
  });

  test("猎手：射杀恶魔；陌客可被射杀但不因此判善良胜利", () => {
    const demonState = 建立状态(["slayer", "imp", "chef", "empath", "monk"]);
    expect(
      resolveSlayerShot(demonState, {
        slayerSeatId: "seat-1",
        targetSeatId: "seat-2",
      }),
    ).toMatchObject({ died: true, winner: { alignment: "good" } });
    const recluseState = 建立状态([
      "slayer",
      "recluse",
      "imp",
      "empath",
      "monk",
    ]);
    expect(
      resolveSlayerShot(recluseState, {
        slayerSeatId: "seat-1",
        targetSeatId: "seat-2",
        registeredAs: "demon",
      }),
    ).toMatchObject({ died: true, winner: null });
  });

  test("士兵：仅免疫有效恶魔能力，醉酒后不再免疫", () => {
    const state = 建立状态(["soldier", "imp", "chef", "empath", "monk"]);
    expect(canImpHarmSeat(state, "seat-1")).toBe(false);
    state.abilityConditions = [中毒条件("seat-1")];
    expect(canImpHarmSeat(state, "seat-1")).toBe(true);
  });

  test("镇长：恰有三名存活且无人处决时获胜，夜死可转移", () => {
    const state = 建立状态(["mayor", "imp", "chef", "empath", "monk"], {
      deadSeatIds: ["seat-4", "seat-5"],
    });
    expect(mayorWinsAtDayEnd(state)).toBe(true);
    expect(
      resolveTroubleBrewingDeath(state, {
        targetSeatId: "seat-1",
        sourceRoleId: "imp",
        sourceSeatId: "seat-2",
        causeId: "tb.imp",
        redirectSeatId: "seat-3",
      }),
    ).toMatchObject({
      died: true,
      targetSeatId: "seat-3",
      redirectedFromSeatId: "seat-1",
    });
  });

  test("管家：主人未投票时违规票仍保留，只增加审计", () => {
    const state = 建立状态(["butler", "chef", "imp", "empath", "monk"], {
      markers: [
        {
          markerId: "butler-master-role-1",
          markerType: "butler-master",
          ownerSeatId: "seat-1",
          targetSeatId: "seat-2",
          active: true,
        },
      ],
    });
    expect(
      checkButlerVoteViolation(state, {
        nominationId: "nomination-1",
        voterSeatIds: ["seat-1", "seat-3"],
      }),
    ).toEqual([
      {
        butlerSeatId: "seat-1",
        masterSeatId: "seat-2",
        nominationId: "nomination-1",
      },
    ]);
  });

  test("酒鬼：真实为外来者且能力始终失效", () => {
    const state = 建立状态(["drunk", "imp", "chef", "empath", "monk"], {
      conditions: [
        {
          conditionId: "drunk-role-1",
          seatId: "seat-1",
          conditionType: "drunk",
          sourceId: "tb.drunk",
          status: "active",
        },
      ],
    });
    expect(state.seats[0]).toMatchObject({
      characterType: "outsider",
      alignment: "good",
    });
    expect(isTroubleBrewingRoleEffective(state, "seat-1", "drunk")).toBe(false);
  });

  test("陌客：死亡后仍可登记邪恶/爪牙/恶魔但不获得能力", () => {
    expect(
      resolveTroubleBrewingRegistration({
        actualRoleId: "recluse",
        actualAlignment: "good",
        actualCharacterType: "outsider",
        dead: true,
        registeredAs: "demon",
      }),
    ).toMatchObject({ allowed: true, grantsAbility: false });
  });

  test("圣徒：仅有效且确因处决死亡时令己方失败", () => {
    const state = 建立状态(["saint", "imp", "chef", "empath", "monk"]);
    expect(
      resolveTroubleBrewingDeath(state, {
        targetSeatId: "seat-1",
        causeId: "execution",
        byExecution: true,
      }),
    ).toMatchObject({
      died: true,
      winner: { alignment: "evil", reason: "saint-executed" },
    });
    expect(
      resolveTroubleBrewingDeath(state, {
        targetSeatId: "seat-1",
        causeId: "tb.imp",
      }).winner,
    ).toBeNull();
  });

  test("投毒者：新目标替换旧目标并持续到下一黄昏", () => {
    const state = 建立状态(["poisoner", "chef", "imp", "empath", "monk"], {
      conditions: [
        {
          ...中毒条件("seat-4"),
          conditionId: "old-poison",
          sourceAbilityInstanceId: "ability-role-1",
        },
      ],
    });
    expect(
      createPoisonTransition(state, {
        poisonerSeatId: "seat-1",
        abilityInstanceId: "ability-role-1",
        targetSeatId: "seat-2",
      }),
    ).toEqual({
      endedConditionIds: ["old-poison"],
      newCondition: expect.objectContaining({
        seatId: "seat-2",
        conditionType: "poisoned",
      }),
    });
  });

  test("间谍：看到真相魔典且死亡后仍可登记善良/镇民/外来者", () => {
    const state = 建立状态(["spy", "imp", "chef", "empath", "monk"], {
      redHerringSeatId: "seat-3",
    });
    const grimoire = createSpyGrimoire(state);
    expect(grimoire.redHerringSeatId).toBe("seat-3");
    expect(grimoire.seats[0]).toMatchObject({ actualRoleId: "spy" });
    expect(
      resolveTroubleBrewingRegistration({
        actualRoleId: "spy",
        actualAlignment: "evil",
        actualCharacterType: "minion",
        dead: true,
        registeredAs: "townsfolk",
      }).allowed,
    ).toBe(true);
  });

  test("红唇女郎：恶魔死亡前至少五人存活时强制成为同种恶魔", () => {
    const state = 建立状态(["imp", "scarletwoman", "chef", "empath", "monk"]);
    expect(
      resolveTroubleBrewingDeath(state, {
        targetSeatId: "seat-1",
        causeId: "tb.slayer",
        sourceRoleId: "slayer",
      }),
    ).toMatchObject({
      died: true,
      roleChange: {
        seatId: "seat-2",
        fromRoleId: "scarletwoman",
        toRoleId: "imp",
      },
      winner: null,
    });
  });

  test("男爵：开局固定增加两个外来者且死亡后不回滚", () => {
    expect(deriveTroubleBrewingCounts(10, { hasBaron: true })).toEqual({
      townsfolk: 5,
      outsider: 2,
      minion: 2,
      demon: 1,
    });
  });

  test("小恶魔：自杀时将存活爪牙变成小恶魔且新恶魔当夜不再行动", () => {
    const state = 建立状态(["imp", "poisoner", "chef", "empath", "monk"]);
    expect(
      resolveTroubleBrewingDeath(state, {
        targetSeatId: "seat-1",
        sourceRoleId: "imp",
        sourceSeatId: "seat-1",
        causeId: "tb.imp",
      }),
    ).toMatchObject({
      died: true,
      roleChange: {
        seatId: "seat-2",
        fromRoleId: "poisoner",
        toRoleId: "imp",
      },
      winner: null,
    });
  });
});
