import {
  BAD_MOON_RISING_ROLE_BY_ID,
  BAD_MOON_RISING_ROLE_IDS,
  countChambermaidWakeups,
  getBadMoonRisingLivingNeighbors,
  isBadMoonRisingRoleEffective,
  resolveBadMoonRisingDeath,
  resolveCourtierChoice,
  resolveExorcistChoice,
  resolveFoolProtection,
  resolveGamblerGuess,
  resolveGodfatherTrigger,
  resolveGoonSelection,
  resolveGossipStatement,
  resolveGrandmotherTrigger,
  resolveInnkeeperChoice,
  resolveLunaticAction,
  resolveMastermindContinuation,
  resolveMinstrelTrigger,
  resolveMoonchildChoice,
  resolvePacifistProtection,
  resolvePoNight,
  resolveProfessorChoice,
  resolvePukkaNight,
  resolveSailorChoice,
  resolveShabalothNight,
  resolveTeaLadyProtection,
  resolveTinkerDeath,
} from "@/domain/rulesets/bad-moon-rising";

const 状态 = (
  roleIds,
  { deadSeatIds = [], conditions = [], markers = [], phase = "night" } = {},
) => {
  const seats = roleIds.map((roleId, index) => {
    const role = BAD_MOON_RISING_ROLE_BY_ID.get(roleId);
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
      definitionId: `bmr.${seat.actualRoleId}.ability`,
      ownerSeatId: seat.seatId,
      sourceRoleId: `bmr.${seat.actualRoleId}`,
      sourceRoleInstanceId: seat.roleInstanceId,
      status: "active",
      usesConsumed: 0,
    })),
    abilityConditions: conditions,
    ongoingAbilityEffects: [],
    badMoonRising: { markers, deathHistory: [], resurrectionHistory: [] },
  };
};

const 中毒 = (seatId) => ({
  conditionId: `poison-${seatId}`,
  seatId,
  conditionType: "poisoned",
  sourceId: "test",
  status: "active",
});

describe("M1-R8 25 角色通用有效性矩阵", () => {
  test.each(BAD_MOON_RISING_ROLE_IDS)(
    "%s 覆盖正常、失效、死亡和角色变化",
    (roleId) => {
      const normal = 状态([roleId, "pukka", "sailor", "gambler", "assassin"]);
      expect(isBadMoonRisingRoleEffective(normal, "seat-1", roleId)).toBe(true);

      const intoxicated = 状态(
        [roleId, "pukka", "sailor", "gambler", "assassin"],
        { conditions: [中毒("seat-1")] },
      );
      expect(isBadMoonRisingRoleEffective(intoxicated, "seat-1", roleId)).toBe(
        false,
      );

      const dead = 状态([roleId, "pukka", "sailor", "gambler", "assassin"], {
        deadSeatIds: ["seat-1"],
      });
      expect(isBadMoonRisingRoleEffective(dead, "seat-1", roleId)).toBe(false);

      const changed = 状态([roleId, "pukka", "sailor", "gambler", "assassin"]);
      changed.seats[0] = {
        ...changed.seats[0],
        actualRoleId: "sailor",
        roleInstanceId: "changed-role",
      };
      expect(isBadMoonRisingRoleEffective(changed, "seat-1", roleId)).toBe(
        false,
      );
    },
  );
});

describe("M1-R8 镇民与保护/信息语义", () => {
  test("祖母只在孙子被恶魔实际杀死时连死", () => {
    const state = 状态([
      "grandmother",
      "sailor",
      "pukka",
      "gambler",
      "assassin",
    ]);
    expect(
      resolveGrandmotherTrigger(state, {
        grandmotherSeatId: "seat-1",
        grandchildSeatId: "seat-2",
        killedSeatId: "seat-2",
        sourceRoleId: "pukka",
      }),
    ).toMatchObject({ dies: true });
    expect(
      resolveGrandmotherTrigger(state, {
        grandmotherSeatId: "seat-1",
        grandchildSeatId: "seat-2",
        killedSeatId: "seat-2",
        sourceRoleId: "assassin",
      }).dies,
    ).toBe(false);
  });

  test("水手选择存活目标并由合法二选一裁量醉酒", () => {
    const state = 状态(["sailor", "gambler", "pukka", "fool", "assassin"]);
    expect(
      resolveSailorChoice(state, "seat-1", "seat-2", "seat-2"),
    ).toMatchObject({ drunkSeatId: "seat-2", sailorCannotDie: true });
    expect(() =>
      resolveSailorChoice(state, "seat-1", "seat-2", "seat-3"),
    ).toThrow("醉酒目标");
  });

  test("侍女只统计因自身能力被唤醒，醉酒者仍计数", () => {
    expect(
      countChambermaidWakeups(
        [
          { seatId: "seat-2", reason: "own-ability", intoxicated: true },
          { seatId: "seat-3", reason: "demon-information" },
        ],
        ["seat-2", "seat-3"],
      ),
    ).toBe(1);
  });

  test("驱魔人阻止恶魔主动行动但不取消既有延迟效果", () => {
    const state = 状态(["exorcist", "pukka", "sailor", "gambler", "assassin"]);
    expect(
      resolveExorcistChoice(state, "seat-1", "seat-2", null),
    ).toMatchObject({
      demonSeatId: "seat-2",
      preventsWake: true,
      preservesDelayedEffects: true,
    });
    expect(() =>
      resolveExorcistChoice(state, "seat-1", "seat-2", "seat-2"),
    ).toThrow("连续");
  });

  test("旅店老板保护两人且其中一人醉酒；自己醉酒则保护失效", () => {
    const state = 状态(["innkeeper", "gambler", "sailor", "pukka", "assassin"]);
    expect(
      resolveInnkeeperChoice(state, "seat-1", ["seat-1", "seat-2"], "seat-1"),
    ).toMatchObject({ protectedSeatIds: [], drunkSeatId: "seat-1" });
    expect(
      resolveInnkeeperChoice(state, "seat-1", ["seat-2", "seat-3"], "seat-2"),
    ).toMatchObject({ protectedSeatIds: ["seat-2", "seat-3"] });
  });

  test("赌徒按真实角色判断猜测，错误时尝试死亡", () => {
    const state = 状态(["gambler", "lunatic", "pukka", "sailor", "assassin"]);
    state.seats[1] = { ...state.seats[1], perceivedRoleId: "shabaloth" };
    expect(
      resolveGamblerGuess(state, "seat-1", "seat-2", "lunatic"),
    ).toMatchObject({
      correct: true,
      gamblerDies: false,
    });
    expect(
      resolveGamblerGuess(state, "seat-1", "seat-2", "shabaloth"),
    ).toMatchObject({
      correct: false,
      gamblerDies: true,
    });
  });

  test("造谣在夜间结算点判断有效性并只接受明确真假", () => {
    const state = 状态(["gossip", "sailor", "pukka", "fool", "assassin"]);
    expect(
      resolveGossipStatement(state, "seat-1", {
        statementId: "gossip-1",
        truth: true,
        targetSeatId: "seat-2",
      }),
    ).toMatchObject({ causesDeath: true, targetSeatId: "seat-2" });
  });

  test("侍臣限次醉酒按角色命中并固定三天三夜", () => {
    const state = 状态(["courtier", "pukka", "sailor", "gambler", "assassin"]);
    expect(resolveCourtierChoice(state, "seat-1", "pukka")).toMatchObject({
      targetSeatId: "seat-2",
      duration: { days: 3, nights: 3 },
      consumeUse: true,
    });
  });

  test("教授只复活真实镇民并重置为新角色实例", () => {
    const state = 状态(["professor", "gambler", "pukka", "fool", "assassin"], {
      deadSeatIds: ["seat-2", "seat-5"],
    });
    expect(resolveProfessorChoice(state, "seat-1", "seat-2")).toMatchObject({
      revived: true,
      resetAbilityInstance: true,
    });
    expect(resolveProfessorChoice(state, "seat-1", "seat-5")).toMatchObject({
      revived: false,
      consumeUse: true,
    });
  });

  test("吟游诗人仅响应爪牙因处决实际死亡", () => {
    const state = 状态(["minstrel", "assassin", "pukka", "sailor", "gambler"]);
    expect(
      resolveMinstrelTrigger(state, {
        seatId: "seat-2",
        byExecution: true,
        actuallyDied: true,
      }).drunkSeatIds,
    ).toEqual(["seat-2", "seat-3", "seat-4", "seat-5"]);
    expect(
      resolveMinstrelTrigger(state, {
        seatId: "seat-2",
        byExecution: true,
        actuallyDied: false,
      }).drunkSeatIds,
    ).toEqual([]);
  });

  test("茶艺师按最近存活邻座且两者都善良时保护", () => {
    const state = 状态(["tealady", "sailor", "assassin", "gambler", "pukka"], {
      deadSeatIds: ["seat-2", "seat-5"],
    });
    expect(getBadMoonRisingLivingNeighbors(state, "seat-1")).toEqual([
      "seat-4",
      "seat-3",
    ]);
    expect(resolveTeaLadyProtection(state, "seat-1")).toEqual([]);
    state.seats[2] = { ...state.seats[2], alignment: "good" };
    expect(resolveTeaLadyProtection(state, "seat-1")).toEqual([
      "seat-4",
      "seat-3",
    ]);
  });

  test("和平主义者只可保护被处决的善良玩家，弄臣首次才免死", () => {
    const state = 状态(["pacifist", "fool", "pukka", "sailor", "assassin"]);
    expect(resolvePacifistProtection(state, "seat-2", true)).toBe(true);
    expect(resolvePacifistProtection(state, "seat-3", true)).toBe(false);
    expect(resolveFoolProtection(state, "seat-2", { alreadyUsed: false })).toBe(
      true,
    );
    expect(resolveFoolProtection(state, "seat-2", { alreadyUsed: true })).toBe(
      false,
    );
  });
});

describe("M1-R8 外来者、爪牙与恶魔核心相互作用", () => {
  test("修补匠死亡裁量服从有效保护", () => {
    const state = 状态(["tinker", "tealady", "sailor", "pukka", "assassin"]);
    expect(resolveTinkerDeath(state, "seat-1", { protectedSeatIds: [] })).toBe(
      true,
    );
    expect(
      resolveTinkerDeath(state, "seat-1", { protectedSeatIds: ["seat-1"] }),
    ).toBe(false);
  });

  test("月之子按选择时阵营快照决定夜间死亡", () => {
    const state = 状态(["moonchild", "goon", "pukka", "sailor", "assassin"]);
    expect(resolveMoonchildChoice(state, "seat-1", "seat-2")).toMatchObject({
      targetAlignmentAtChoice: "good",
      causesDeathTonight: true,
    });
  });

  test("莽夫每夜首次主动被选使选择者醉酒并改变阵营，刺客仍能杀死", () => {
    const state = 状态(["goon", "assassin", "pukka", "sailor", "gambler"]);
    expect(
      resolveGoonSelection(state, {
        goonSeatId: "seat-1",
        selectingSeatId: "seat-2",
        alreadyTriggeredTonight: false,
        activeSelection: true,
      }),
    ).toMatchObject({
      goonAlignment: "evil",
      drunkSeatId: "seat-2",
      selectedEffectSuppressed: false,
    });
  });

  test("疯子选择只记录并投递给真实恶魔，不产生死亡", () => {
    const state = 状态(["lunatic", "pukka", "sailor", "gambler", "assassin"]);
    expect(resolveLunaticAction(state, "seat-1", ["seat-3"], "seat-2")).toEqual(
      {
        lunaticSeatId: "seat-1",
        demonSeatId: "seat-2",
        targetSeatIds: ["seat-3"],
        causesDeath: false,
      },
    );
  });

  test("教父只在白天外来者实际死亡时夜间行动且每夜一次", () => {
    const state = 状态([
      "godfather",
      "moonchild",
      "pukka",
      "sailor",
      "assassin",
    ]);
    expect(
      resolveGodfatherTrigger(state, [
        { seatId: "seat-2", phase: "day", actuallyDied: true },
        { seatId: "seat-2", phase: "day", actuallyDied: true },
      ]),
    ).toEqual({ wakesTonight: true, maxKills: 1 });
  });

  test("主谋只在最后恶魔因处决真死时追加一天并按被处决阵营结算", () => {
    expect(
      resolveMastermindContinuation({
        demonActuallyDied: true,
        byExecution: true,
        mastermindEffective: true,
      }),
    ).toEqual({ active: true, extraNight: 1, extraDay: 1 });
    expect(
      resolveMastermindContinuation({
        active: true,
        executedAlignment: "good",
      }),
    ).toMatchObject({ winner: "evil" });
  });

  test("普卡先建立新毒，再处理上一名成功中毒者并恢复健康", () => {
    const state = 状态(["pukka", "sailor", "gambler", "fool", "assassin"]);
    expect(
      resolvePukkaNight(state, {
        demonSeatId: "seat-1",
        targetSeatId: "seat-2",
        previousPoisonedSeatId: "seat-3",
        demonEffective: true,
      }),
    ).toMatchObject({
      poisonedSeatId: "seat-2",
      deathAttemptSeatId: "seat-3",
      healthySeatId: "seat-3",
    });
  });

  test("沙巴洛斯按序攻击两目标并只从上一夜死亡目标中反刍", () => {
    const state = 状态(["shabaloth", "sailor", "gambler", "fool", "assassin"], {
      deadSeatIds: ["seat-2"],
    });
    expect(
      resolveShabalothNight(state, {
        targetSeatIds: ["seat-3", "seat-4"],
        previousTargetSeatIds: ["seat-2", "seat-5"],
        regurgitateSeatId: "seat-2",
      }),
    ).toEqual({
      reviveSeatId: "seat-2",
      deathAttemptSeatIds: ["seat-3", "seat-4"],
    });
  });

  test("珀不选建立三杀，下一次必须三目标且随后清除", () => {
    const state = 状态(["po", "sailor", "gambler", "fool", "assassin"]);
    expect(
      resolvePoNight(state, { charged: false, targetSeatIds: [] }),
    ).toEqual({
      charged: true,
      deathAttemptSeatIds: [],
    });
    expect(
      resolvePoNight(state, {
        charged: true,
        targetSeatIds: ["seat-2", "seat-3", "seat-4"],
      }),
    ).toEqual({
      charged: false,
      deathAttemptSeatIds: ["seat-2", "seat-3", "seat-4"],
    });
  });

  test("死亡管线区分阻止、僵怖表面死亡、刺客穿透和实际死亡归因", () => {
    const state = 状态(["zombuul", "fool", "pukka", "tealady", "assassin"]);
    expect(
      resolveBadMoonRisingDeath(state, {
        targetSeatId: "seat-2",
        causeId: "bmr.pukka",
        protectedSeatIds: ["seat-2"],
      }),
    ).toMatchObject({ actuallyDied: false, preventedBy: "protection" });
    expect(
      resolveBadMoonRisingDeath(state, {
        targetSeatId: "seat-1",
        causeId: "bmr.pukka",
      }),
    ).toMatchObject({
      actuallyDied: false,
      publiclyDead: true,
      zombuulFirstDeath: true,
    });
    expect(
      resolveBadMoonRisingDeath(state, {
        targetSeatId: "seat-2",
        causeId: "bmr.assassin",
        ignoresProtection: true,
        protectedSeatIds: ["seat-2"],
      }),
    ).toMatchObject({ actuallyDied: true, causeId: "bmr.assassin" });
  });
});
