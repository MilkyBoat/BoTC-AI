import { BAD_MOON_RISING_ROLE_BY_ID } from "./catalog";

const 查席位 = (state, seatId) =>
  state.seats.find(({ seatId: candidate }) => candidate === seatId);

const 活动条件 = (state, seatId) =>
  (state.abilityConditions ?? []).some(
    ({ seatId: target, status, conditionType }) =>
      target === seatId &&
      status === "active" &&
      ["drunk", "poisoned", "ability-disabled"].includes(conditionType),
  ) ||
  (state.badMoonRising?.markers ?? []).some(
    ({ type, content }) =>
      content.active &&
      ["drunk", "poisoned", "pukka-poisoned"].includes(type) &&
      content.targetSeatIds?.includes(seatId),
  );

export const isBadMoonRisingRoleEffective = (
  state,
  seatId,
  roleId,
  { allowDead = false } = {},
) => {
  const seat = 查席位(state, seatId);
  if (
    !seat ||
    seat.actualRoleId !== roleId ||
    (!seat.alive && !allowDead) ||
    活动条件(state, seatId)
  ) {
    return false;
  }
  return (state.abilityInstances ?? []).some(
    ({ ownerSeatId, sourceRoleInstanceId, status }) =>
      ownerSeatId === seatId &&
      sourceRoleInstanceId === seat.roleInstanceId &&
      status === "active",
  );
};

export const getBadMoonRisingLivingNeighbors = (state, seatId) => {
  const ordered = state.seats.slice().sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(
    ({ seatId: candidate }) => candidate === seatId,
  );
  if (index < 0) throw new Error("邻座计算引用了不存在的席位");
  const result = [];
  for (const direction of [-1, 1]) {
    for (let offset = 1; offset < ordered.length; offset += 1) {
      const candidate =
        ordered[(index + direction * offset + ordered.length) % ordered.length];
      if (candidate.alive) {
        result.push(candidate.seatId);
        break;
      }
    }
  }
  return result;
};

export const resolveGrandmotherTrigger = (
  state,
  { grandmotherSeatId, grandchildSeatId, killedSeatId, sourceRoleId },
) => ({
  grandmotherSeatId,
  dies:
    killedSeatId === grandchildSeatId &&
    BAD_MOON_RISING_ROLE_BY_ID.get(sourceRoleId)?.characterType === "demon" &&
    isBadMoonRisingRoleEffective(state, grandmotherSeatId, "grandmother"),
});

export const resolveSailorChoice = (
  state,
  sailorSeatId,
  targetSeatId,
  drunkSeatId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target?.alive) throw new Error("水手只能选择存活玩家");
  if (![sailorSeatId, targetSeatId].includes(drunkSeatId)) {
    throw new Error("水手醉酒目标必须是水手或所选玩家");
  }
  return {
    drunkSeatId,
    sailorCannotDie:
      drunkSeatId !== sailorSeatId &&
      isBadMoonRisingRoleEffective(state, sailorSeatId, "sailor"),
  };
};

export const countChambermaidWakeups = (wakeRecords, targetSeatIds) =>
  wakeRecords.filter(
    ({ seatId, reason }) =>
      targetSeatIds.includes(seatId) && reason === "own-ability",
  ).length;

export const resolveExorcistChoice = (
  state,
  exorcistSeatId,
  targetSeatId,
  previousTargetSeatId,
) => {
  if (targetSeatId === previousTargetSeatId) {
    throw new Error("驱魔人不能连续两个夜晚选择同一玩家");
  }
  const target = 查席位(state, targetSeatId);
  if (!target) throw new Error("驱魔人目标不存在");
  const isDemon = target.characterType === "demon";
  return {
    targetSeatId,
    demonSeatId: isDemon ? targetSeatId : null,
    preventsWake:
      isDemon &&
      isBadMoonRisingRoleEffective(state, exorcistSeatId, "exorcist"),
    preservesDelayedEffects: true,
  };
};

export const resolveInnkeeperChoice = (
  state,
  innkeeperSeatId,
  targetSeatIds,
  drunkSeatId,
) => {
  if (
    targetSeatIds.length !== 2 ||
    new Set(targetSeatIds).size !== 2 ||
    !targetSeatIds.includes(drunkSeatId) ||
    targetSeatIds.some((seatId) => !查席位(state, seatId))
  ) {
    throw new Error("旅店老板必须选择两名玩家并从中选择一名醉酒者");
  }
  const effective = isBadMoonRisingRoleEffective(
    state,
    innkeeperSeatId,
    "innkeeper",
  );
  return {
    drunkSeatId,
    protectedSeatIds:
      effective && drunkSeatId !== innkeeperSeatId ? targetSeatIds.slice() : [],
  };
};

export const resolveGamblerGuess = (
  state,
  gamblerSeatId,
  targetSeatId,
  guessedRoleId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target || !BAD_MOON_RISING_ROLE_BY_ID.has(guessedRoleId)) {
    throw new Error("赌徒目标或猜测角色无效");
  }
  const correct = target.actualRoleId === guessedRoleId;
  return {
    correct,
    gamblerDies:
      !correct && isBadMoonRisingRoleEffective(state, gamblerSeatId, "gambler"),
  };
};

export const resolveGossipStatement = (state, gossipSeatId, statement) => {
  if (
    typeof statement?.statementId !== "string" ||
    typeof statement.truth !== "boolean" ||
    (statement.truth && !查席位(state, statement.targetSeatId))
  ) {
    throw new Error("造谣声明必须公开、明确且可判定真假");
  }
  const causesDeath =
    statement.truth &&
    isBadMoonRisingRoleEffective(state, gossipSeatId, "gossip");
  return {
    statementId: statement.statementId,
    truth: statement.truth,
    causesDeath,
    targetSeatId: causesDeath ? statement.targetSeatId : null,
  };
};

export const resolveCourtierChoice = (state, courtierSeatId, roleId) => {
  if (!BAD_MOON_RISING_ROLE_BY_ID.has(roleId)) {
    throw new Error("侍臣必须选择规则包中的角色");
  }
  const target = state.seats.find(
    ({ actualRoleId }) => actualRoleId === roleId,
  );
  return {
    selectedRoleId: roleId,
    targetSeatId:
      target && isBadMoonRisingRoleEffective(state, courtierSeatId, "courtier")
        ? target.seatId
        : null,
    duration: { days: 3, nights: 3 },
    consumeUse: true,
  };
};

export const resolveProfessorChoice = (
  state,
  professorSeatId,
  targetSeatId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target || target.alive) throw new Error("教授只能选择一名死亡玩家");
  const revived =
    target.characterType === "townsfolk" &&
    isBadMoonRisingRoleEffective(state, professorSeatId, "professor");
  return {
    revived,
    targetSeatId,
    resetAbilityInstance: revived,
    consumeUse: true,
  };
};

export const resolveMinstrelTrigger = (
  state,
  { seatId, byExecution, actuallyDied },
) => {
  const target = 查席位(state, seatId);
  const minstrel = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "minstrel",
  );
  const triggered =
    target?.characterType === "minion" &&
    byExecution &&
    actuallyDied &&
    minstrel &&
    isBadMoonRisingRoleEffective(state, minstrel.seatId, "minstrel");
  return {
    drunkSeatIds: triggered
      ? state.seats
          .filter(
            ({ seatId: candidate, characterType }) =>
              candidate !== minstrel.seatId && characterType !== "traveler",
          )
          .map(({ seatId: candidate }) => candidate)
      : [],
  };
};

export const resolveTeaLadyProtection = (state, teaLadySeatId) => {
  if (!isBadMoonRisingRoleEffective(state, teaLadySeatId, "tealady")) return [];
  const neighbors = getBadMoonRisingLivingNeighbors(state, teaLadySeatId);
  return neighbors.length === 2 &&
    neighbors.every((seatId) => 查席位(state, seatId).alignment === "good")
    ? neighbors
    : [];
};

export const resolvePacifistProtection = (
  state,
  targetSeatId,
  storytellerChooses,
) => {
  const pacifist = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "pacifist",
  );
  const target = 查席位(state, targetSeatId);
  return Boolean(
    storytellerChooses &&
      target?.alignment === "good" &&
      pacifist &&
      isBadMoonRisingRoleEffective(state, pacifist.seatId, "pacifist"),
  );
};

export const resolveFoolProtection = (state, foolSeatId, { alreadyUsed }) =>
  !alreadyUsed && isBadMoonRisingRoleEffective(state, foolSeatId, "fool");

export const resolveTinkerDeath = (
  state,
  tinkerSeatId,
  { protectedSeatIds = [] },
) =>
  isBadMoonRisingRoleEffective(state, tinkerSeatId, "tinker") &&
  !protectedSeatIds.includes(tinkerSeatId);

export const resolveMoonchildChoice = (
  state,
  moonchildSeatId,
  targetSeatId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target?.alive) throw new Error("月之子必须选择一名存活玩家");
  const effective = isBadMoonRisingRoleEffective(
    state,
    moonchildSeatId,
    "moonchild",
    { allowDead: true },
  );
  return {
    targetSeatId,
    targetAlignmentAtChoice: target.alignment,
    causesDeathTonight: effective && target.alignment === "good",
  };
};

export const resolveGoonSelection = (
  state,
  { goonSeatId, selectingSeatId, alreadyTriggeredTonight, activeSelection },
) => {
  const selector = 查席位(state, selectingSeatId);
  const goon = 查席位(state, goonSeatId);
  if (!selector || goon?.actualRoleId !== "goon") {
    throw new Error("莽夫或选择者不存在");
  }
  if (alreadyTriggeredTonight || !activeSelection) {
    return {
      triggered: false,
      goonAlignment: goon.alignment,
      drunkSeatId: null,
      selectedEffectSuppressed: false,
    };
  }
  return {
    triggered: true,
    goonAlignment: selector.alignment,
    drunkSeatId: selectingSeatId,
    selectedEffectSuppressed: selector.actualRoleId !== "assassin",
  };
};

export const resolveLunaticAction = (
  state,
  lunaticSeatId,
  targetSeatIds,
  demonSeatId,
) => {
  if (
    查席位(state, lunaticSeatId)?.actualRoleId !== "lunatic" ||
    查席位(state, demonSeatId)?.characterType !== "demon" ||
    targetSeatIds.some((seatId) => !查席位(state, seatId))
  ) {
    throw new Error("疯子模拟行动引用了无效席位");
  }
  return {
    lunaticSeatId,
    demonSeatId,
    targetSeatIds: targetSeatIds.slice(),
    causesDeath: false,
  };
};

export const resolveGodfatherTrigger = (state, deathRecords) => ({
  wakesTonight: deathRecords.some(({ seatId, phase, actuallyDied }) => {
    const target = 查席位(state, seatId);
    return (
      phase === "day" && actuallyDied && target?.characterType === "outsider"
    );
  }),
  maxKills: 1,
});

export const resolveDevilsAdvocateChoice = (
  state,
  targetSeatId,
  previousTargetSeatId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target?.alive || targetSeatId === previousTargetSeatId) {
    throw new Error("魔鬼代言人必须选择与上一夜不同的存活玩家");
  }
  return { targetSeatId, preventsExecutionDeathTomorrow: true };
};

export const resolveMastermindContinuation = (options) => {
  if (options.active) {
    return {
      active: false,
      winner:
        options.executedAlignment === undefined
          ? "good"
          : options.executedAlignment === "good"
          ? "evil"
          : "good",
    };
  }
  const active = Boolean(
    options.demonActuallyDied &&
      options.byExecution &&
      options.mastermindEffective,
  );
  return { active, extraNight: active ? 1 : 0, extraDay: active ? 1 : 0 };
};

export const resolvePukkaNight = (
  state,
  { demonSeatId, targetSeatId, previousPoisonedSeatId = null, demonEffective },
) => {
  if (!查席位(state, targetSeatId)) throw new Error("普卡目标不存在");
  const effective =
    demonEffective && isBadMoonRisingRoleEffective(state, demonSeatId, "pukka");
  return {
    poisonedSeatId: effective ? targetSeatId : null,
    deathAttemptSeatId: effective ? previousPoisonedSeatId : null,
    healthySeatId: effective ? previousPoisonedSeatId : null,
  };
};

export const resolveShabalothNight = (
  state,
  { targetSeatIds, previousTargetSeatIds = [], regurgitateSeatId = null },
) => {
  if (
    targetSeatIds.length !== 2 ||
    targetSeatIds.some((seatId) => !查席位(state, seatId))
  ) {
    throw new Error("沙巴洛斯必须按顺序选择两名玩家");
  }
  if (
    regurgitateSeatId !== null &&
    (!previousTargetSeatIds.includes(regurgitateSeatId) ||
      查席位(state, regurgitateSeatId)?.alive)
  ) {
    throw new Error("沙巴洛斯只能反刍上一夜选择且当前死亡的玩家");
  }
  return {
    reviveSeatId: regurgitateSeatId,
    deathAttemptSeatIds: targetSeatIds.slice(),
  };
};

export const resolvePoNight = (state, { charged, targetSeatIds }) => {
  if (targetSeatIds.some((seatId) => !查席位(state, seatId))) {
    throw new Error("珀选择了不存在的玩家");
  }
  if (
    (charged && targetSeatIds.length !== 3) ||
    (!charged && targetSeatIds.length > 1)
  ) {
    throw new Error(
      charged ? "蓄力后的珀必须选择三名玩家" : "珀至多选择一名玩家",
    );
  }
  return {
    charged: !charged && targetSeatIds.length === 0,
    deathAttemptSeatIds: targetSeatIds.slice(),
  };
};

export const resolveBadMoonRisingDeath = (
  state,
  { targetSeatId, causeId, protectedSeatIds = [], ignoresProtection = false },
) => {
  const target = 查席位(state, targetSeatId);
  if (!target || (!target.alive && !target.secretlyAlive)) {
    return {
      targetSeatId,
      causeId,
      actuallyDied: false,
      publiclyDead: true,
      preventedBy: "already-dead",
    };
  }
  if (!ignoresProtection && protectedSeatIds.includes(targetSeatId)) {
    return {
      targetSeatId,
      causeId,
      actuallyDied: false,
      publiclyDead: false,
      preventedBy: "protection",
    };
  }
  const zombuulAlreadyTriggered =
    target.secretlyAlive ||
    (state.badMoonRising?.markers ?? []).some(
      ({ type, content }) =>
        type === "zombuul-publicly-dead" && content.seatId === targetSeatId,
    );
  if (
    target.actualRoleId === "zombuul" &&
    !zombuulAlreadyTriggered &&
    isBadMoonRisingRoleEffective(state, targetSeatId, "zombuul")
  ) {
    return {
      targetSeatId,
      causeId,
      actuallyDied: false,
      publiclyDead: true,
      zombuulFirstDeath: true,
      preventedBy: "zombuul-first-death",
    };
  }
  return {
    targetSeatId,
    causeId,
    actuallyDied: true,
    publiclyDead: true,
    zombuulFirstDeath: false,
    preventedBy: null,
  };
};
