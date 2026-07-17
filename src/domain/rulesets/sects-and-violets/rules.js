import { SECTS_AND_VIOLETS_ROLE_BY_ID } from "./catalog";

const 查席位 = (state, seatId) =>
  state.seats.find(({ seatId: candidate }) => candidate === seatId);

const 活动条件 = (state, seatId) =>
  (state.abilityConditions ?? []).some(
    ({ seatId: target, status, conditionType }) =>
      target === seatId &&
      status === "active" &&
      ["drunk", "poisoned", "ability-disabled"].includes(conditionType),
  ) ||
  (state.sectsAndViolets?.markers ?? []).some(
    ({ type, content }) =>
      content.active &&
      [
        "drunk",
        "poisoned",
        "nodashii-poisoned",
        "vigormortis-poisoned",
      ].includes(type) &&
      content.targetSeatIds?.includes(seatId),
  );

export const isSectsAndVioletsRoleEffective = (
  state,
  seatId,
  roleId,
  { allowDead = false, retainsAfterDeath = false } = {},
) => {
  const seat = 查席位(state, seatId);
  if (
    !seat ||
    seat.actualRoleId !== roleId ||
    (!seat.alive && !allowDead && !retainsAfterDeath) ||
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

const 环形距离 = (left, right, size) => {
  const direct = Math.abs(left - right);
  return Math.min(direct, size - direct);
};

export const resolveClockmakerDistance = (state, registrations = {}) => {
  const ordered = state.seats
    .slice()
    .sort((left, right) => left.order - right.order);
  const demons = ordered.filter(
    (seat) =>
      registrations[seat.seatId]?.includes("demon") ||
      seat.characterType === "demon",
  );
  const minions = ordered.filter(
    (seat) =>
      registrations[seat.seatId]?.includes("minion") ||
      seat.characterType === "minion",
  );
  if (demons.length === 0 || minions.length === 0) return 0;
  return Math.min(
    ...demons.flatMap((demon) =>
      minions
        .filter(({ seatId }) => seatId !== demon.seatId)
        .map((minion) =>
          环形距离(demon.order - 1, minion.order - 1, ordered.length),
        ),
    ),
  );
};

export const resolveDreamerInformation = (
  state,
  dreamerSeatId,
  targetSeatId,
  shownRoleIds,
  { vortoxActive = false, intoxicated = false } = {},
) => {
  const target = 查席位(state, targetSeatId);
  if (
    !target ||
    targetSeatId === dreamerSeatId ||
    target.characterType === "traveler" ||
    !Array.isArray(shownRoleIds) ||
    shownRoleIds.length !== 2 ||
    new Set(shownRoleIds).size !== 2
  ) {
    throw new Error("筑梦师必须选择其他非旅行者并展示两个不同角色");
  }
  const roles = shownRoleIds.map((roleId) =>
    SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId),
  );
  if (
    roles.some((role) => !role) ||
    roles.filter(({ alignment }) => alignment === "good").length !== 1 ||
    roles.filter(({ alignment }) => alignment === "evil").length !== 1
  ) {
    throw new Error("筑梦师信息必须包含一个善良角色和一个邪恶角色");
  }
  const truthful = shownRoleIds.includes(target.actualRoleId);
  if (!intoxicated && vortoxActive && truthful) {
    throw new Error("涡流有效时筑梦师展示的两个角色都必须错误");
  }
  if (!intoxicated && !vortoxActive && !truthful) {
    throw new Error("正常筑梦师信息必须恰有一个角色正确");
  }
  return {
    targetSeatId,
    shownRoleIds: shownRoleIds.slice(),
    truthful,
    vortoxConstrained: !intoxicated && vortoxActive,
  };
};

export const resolveSnakeCharmerChoice = (
  state,
  snakeCharmerSeatId,
  targetSeatId,
) => {
  const target = 查席位(state, targetSeatId);
  if (!target?.alive) throw new Error("舞蛇人必须选择一名存活玩家");
  const swapped =
    target.characterType === "demon" &&
    isSectsAndVioletsRoleEffective(state, snakeCharmerSeatId, "snakecharmer");
  return {
    swapped,
    newDemonSeatId: swapped ? snakeCharmerSeatId : null,
    newSnakeCharmerSeatId: swapped ? targetSeatId : null,
    poisonedSeatId: swapped ? targetSeatId : null,
  };
};

export const countMathematicianAbnormalities = (records, mathematicianSeatId) =>
  new Set(
    records
      .filter(
        ({ seatId, causedByOtherCharacter }) =>
          causedByOtherCharacter && seatId !== mathematicianSeatId,
      )
      .map(({ seatId }) => seatId),
  ).size;

export const resolveBooleanInformation = ({
  truth,
  delivered,
  vortoxActive = false,
  intoxicated = false,
}) => {
  if (typeof truth !== "boolean" || typeof delivered !== "boolean") {
    throw new Error("布尔信息必须使用明确的是或否");
  }
  if (!intoxicated && vortoxActive && delivered === truth) {
    throw new Error("涡流有效时镇民信息必须错误");
  }
  return {
    truth,
    delivered,
    truthful: truth === delivered,
    vortoxConstrained: !intoxicated && vortoxActive,
  };
};

export const resolveOracleCount = (state, registrations = {}) =>
  state.seats.filter(
    (seat) =>
      !seat.alive &&
      (registrations[seat.seatId]?.includes("evil") ||
        seat.alignment === "evil"),
  ).length;

export const resolveSeamstressChoice = (
  state,
  seamstressSeatId,
  targetSeatIds,
) => {
  if (
    !Array.isArray(targetSeatIds) ||
    targetSeatIds.length !== 2 ||
    new Set(targetSeatIds).size !== 2 ||
    targetSeatIds.includes(seamstressSeatId)
  ) {
    throw new Error("女裁缝必须选择除自己外两名不同玩家");
  }
  const targets = targetSeatIds.map((seatId) => 查席位(state, seatId));
  if (targets.some((target) => !target)) throw new Error("女裁缝目标不存在");
  return {
    targetSeatIds: targetSeatIds.slice(),
    sameAlignment: targets[0].alignment === targets[1].alignment,
    consumeUse: true,
  };
};

export const resolveJugglerGuesses = (state, guesses, registrations = {}) => {
  if (!Array.isArray(guesses) || guesses.length > 5) {
    throw new Error("杂耍艺人最多公开猜测五组玩家与角色");
  }
  const keys = new Set();
  const results = guesses.map(({ seatId, roleId }) => {
    const target = 查席位(state, seatId);
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId);
    const key = `${seatId}:${roleId}`;
    if (!target || !role || keys.has(key))
      throw new Error("杂耍猜测必须唯一且引用合法玩家与角色");
    keys.add(key);
    return {
      seatId,
      roleId,
      correct:
        target.actualRoleId === roleId ||
        registrations[seatId]?.includes(roleId) === true,
    };
  });
  return { correct: results.filter(({ correct }) => correct).length, results };
};

export const resolveSageInformation = (
  state,
  sageSeatId,
  demonSeatId,
  candidateSeatIds,
  { vortoxActive = false, intoxicated = false } = {},
) => {
  const sage = 查席位(state, sageSeatId);
  const demon = 查席位(state, demonSeatId);
  if (
    sage?.alive ||
    demon?.characterType !== "demon" ||
    !Array.isArray(candidateSeatIds) ||
    candidateSeatIds.length !== 2 ||
    new Set(candidateSeatIds).size !== 2 ||
    candidateSeatIds.some((seatId) => !查席位(state, seatId))
  ) {
    throw new Error("贤者信息必须在被恶魔杀死后展示两名不同玩家");
  }
  const containsDemon = candidateSeatIds.includes(demonSeatId);
  if (!intoxicated && vortoxActive && containsDemon) {
    throw new Error("涡流有效时贤者信息不能包含真实恶魔");
  }
  if (!intoxicated && !vortoxActive && !containsDemon) {
    throw new Error("正常贤者信息必须包含杀死贤者的恶魔");
  }
  return {
    valid: true,
    candidateSeatIds: candidateSeatIds.slice(),
    truthful: containsDemon,
  };
};

export const resolveMadnessAdjudication = ({
  sourceRoleId,
  targetSeatId,
  ruling,
  execute,
  evidenceSummary = "",
}) => {
  if (
    !["mutant", "cerenovus"].includes(sourceRoleId) ||
    !["complied", "not-complied", "no-ruling"].includes(ruling) ||
    typeof execute !== "boolean" ||
    (execute && ruling !== "not-complied")
  ) {
    throw new Error("疯狂必须由说书人提交候选受限的结构化裁定");
  }
  return {
    sourceRoleId,
    targetSeatId,
    ruling,
    evidenceSummary,
    executionRequested: execute,
    inferredIntent: false,
  };
};

export const resolveBarberSwap = (state, targetSeatIds) => {
  if (
    !Array.isArray(targetSeatIds) ||
    targetSeatIds.length !== 2 ||
    new Set(targetSeatIds).size !== 2
  ) {
    throw new Error("理发师交换必须选择两名不同玩家");
  }
  const targets = targetSeatIds.map((seatId) => 查席位(state, seatId));
  if (targets.some((target) => !target))
    throw new Error("理发师交换目标不存在");
  if (targets.some(({ characterType }) => characterType === "demon")) {
    throw new Error("理发师不能选择其他恶魔进行交换");
  }
  return {
    valid: true,
    targetSeatIds: targetSeatIds.slice(),
    preservesAlignments: true,
  };
};

export const resolvePithagChange = (state, targetSeatId, newRoleId) => {
  const target = 查席位(state, targetSeatId);
  const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(newRoleId);
  if (!target || !role) throw new Error("麻脸巫婆必须选择合法玩家与规则包角色");
  const inPlay = state.seats.some(
    ({ actualRoleId }) => actualRoleId === newRoleId,
  );
  return {
    changed: !inPlay,
    targetSeatId,
    newRoleId,
    createsDemon: !inPlay && role.characterType === "demon",
    preservesAlignment: true,
  };
};

export const resolveFangGuAttack = (state, demonSeatId, targetSeatId) => {
  const target = 查席位(state, targetSeatId);
  if (!target) throw new Error("方古目标不存在");
  const effective = isSectsAndVioletsRoleEffective(
    state,
    demonSeatId,
    "fanggu",
  );
  const jumps =
    effective &&
    target.alive &&
    target.characterType === "outsider" &&
    !state.sectsAndViolets?.fangGuJumpUsed;
  return {
    jumps,
    oldDemonDies: jumps,
    targetDies: effective && !jumps && target.alive,
    newAlignment: jumps ? "evil" : null,
  };
};

const 最近镇民 = (state, ownerSeatId, direction) => {
  const ordered = state.seats
    .slice()
    .sort((left, right) => left.order - right.order);
  const index = ordered.findIndex(({ seatId }) => seatId === ownerSeatId);
  if (index < 0) throw new Error("邻座计算引用了不存在的席位");
  for (let offset = 1; offset < ordered.length; offset += 1) {
    const candidate =
      ordered[(index + direction * offset + ordered.length) % ordered.length];
    if (candidate.characterType === "townsfolk") return candidate.seatId;
  }
  return null;
};

export const getNoDashiiPoisonedTownsfolk = (state, noDashiiSeatId) =>
  [
    ...new Set(
      [-1, 1]
        .map((direction) => 最近镇民(state, noDashiiSeatId, direction))
        .filter(Boolean),
    ),
  ].sort(
    (left, right) => 查席位(state, left).order - 查席位(state, right).order,
  );

export const resolveVigormortisKill = (state, targetSeatId) => {
  const target = 查席位(state, targetSeatId);
  if (!target) throw new Error("亡骨魔目标不存在");
  const ordered = state.seats
    .slice()
    .sort((left, right) => left.order - right.order);
  const index = ordered.findIndex(({ seatId }) => seatId === targetSeatId);
  const directNeighbors = [
    ordered[(index - 1 + ordered.length) % ordered.length],
    ordered[(index + 1) % ordered.length],
  ];
  return {
    targetSeatId,
    targetDies: target.alive,
    retainsAbilityAfterDeath: target.characterType === "minion" && target.alive,
    poisonedTownsfolkCandidates:
      target.characterType === "minion"
        ? directNeighbors
            .filter(({ characterType }) => characterType === "townsfolk")
            .map(({ seatId }) => seatId)
        : [],
  };
};

export const resolveEvilTwinOutcome = ({
  evilTwinAlive,
  goodTwinAlive,
  goodTwinExecuted = false,
  proposedWinner = null,
}) => ({
  preventGoodWin:
    proposedWinner === "good" &&
    evilTwinAlive === true &&
    goodTwinAlive === true,
  winner: goodTwinExecuted && !goodTwinAlive && evilTwinAlive ? "evil" : null,
});

export const resolveWitchNomination = ({
  cursedSeatId,
  nominatorSeatId,
  livingCount,
  witchEffective,
}) => ({
  dies:
    cursedSeatId === nominatorSeatId &&
    livingCount >= 4 &&
    witchEffective === true,
  nominationStillOccurs: true,
});

export const resolveKlutzChoice = (state, klutzSeatId, targetSeatId) => {
  const klutz = 查席位(state, klutzSeatId);
  const target = 查席位(state, targetSeatId);
  if (klutz?.alive || !target?.alive) {
    throw new Error("呆瓜得知死亡后必须公开选择一名存活玩家");
  }
  return { targetSeatId, winner: target.alignment === "evil" ? "evil" : null };
};

export const resolveVortoxNoExecution = ({
  vortoxEffective,
  executionOccurred,
}) => ({
  winner: vortoxEffective && !executionOccurred ? "evil" : null,
  reason: vortoxEffective && !executionOccurred ? "vortox-no-execution" : null,
});
