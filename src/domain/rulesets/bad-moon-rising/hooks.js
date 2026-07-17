import { canonicalizeJson } from "../../protocol/immutable";
import { ROLE_ABILITY_EVENT_TYPES } from "../../abilities";
import { EVENT_TYPES } from "../../protocol";
import { BASIC_RULE_SOURCES, determineBasicWinner } from "../../rules/basic";
import {
  BAD_MOON_RISING_PACKAGE_ID,
  BAD_MOON_RISING_PACKAGE_VERSION,
  BAD_MOON_RISING_ROLE_BY_ID,
} from "./catalog";
import {
  buildBadMoonRisingSeatInputs,
  createBadMoonRisingAbilityInstances,
  createInitialBadMoonRisingState,
  validateBadMoonRisingSetup,
} from "./setup";
import { BAD_MOON_RISING_EVENT_TYPES } from "./events";
import {
  isBadMoonRisingRoleEffective,
  resolveBadMoonRisingDeath,
  resolveTeaLadyProtection,
} from "./rules";

const 相同 = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);

const 拒绝 = (code, message, details) => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const setupFromCommand = (command) => {
  const state = command.payload.badMoonRising;
  return {
    assignments: command.payload.seats.map(
      ({ seatId, order, actualRoleId, perceivedRoleId, roleInstanceId }) => ({
        seatId,
        order,
        actualRoleId,
        perceivedRoleId,
        roleInstanceId,
      }),
    ),
    godfatherDelta: state?.setup?.godfatherDelta ?? 0,
    grandchildSeatId: state?.setup?.grandchildSeatId ?? null,
    demonBluffs: state?.setup?.demonBluffs ?? [],
    lunaticMinionSeatIds: state?.setup?.lunaticMinionSeatIds ?? [],
    lunaticBluffs: state?.setup?.lunaticBluffs ?? [],
  };
};

const validateGameStart = ({ command }) => {
  const state = command.payload.badMoonRising;
  if (
    state?.packageId !== BAD_MOON_RISING_PACKAGE_ID ||
    state?.version !== BAD_MOON_RISING_PACKAGE_VERSION
  ) {
    return 拒绝(
      "INVALID_BAD_MOON_RISING_SETUP",
      "开局必须精确绑定《黯月初升》规则包状态",
    );
  }
  const setup = setupFromCommand(command);
  const validation = validateBadMoonRisingSetup(setup);
  if (!validation.valid) {
    return 拒绝(
      "INVALID_BAD_MOON_RISING_SETUP",
      "《黯月初升》角色分配或开局裁量无效",
      { errors: validation.errors },
    );
  }
  if (
    !相同(
      command.payload.seats,
      buildBadMoonRisingSeatInputs(setup.assignments),
    )
  ) {
    return 拒绝(
      "INVALID_BAD_MOON_RISING_SEATS",
      "开局席位类型、阵营或角色真相不一致",
    );
  }
  if (
    !相同(
      command.payload.abilityInstances,
      createBadMoonRisingAbilityInstances(setup.assignments).instances,
    )
  ) {
    return 拒绝(
      "INVALID_BAD_MOON_RISING_ABILITIES",
      "开局能力实例与角色分配不一致",
    );
  }
  if (!相同(state, createInitialBadMoonRisingState(setup))) {
    return 拒绝(
      "INVALID_BAD_MOON_RISING_SETUP",
      "开局子状态与角色分配或设置裁量不一致",
    );
  }
  return null;
};

const activeBallot = (state) =>
  state.activeNomination !== null || state.activeExile !== null;

const protectedSeatIds = (state, { byExecution = false } = {}) => {
  const result = new Set();
  (state.badMoonRising?.markers ?? []).forEach(({ type, content }) => {
    const owner = state.seats.find(
      ({ seatId }) => seatId === content.ownerSeatId,
    );
    const sourceEffective =
      !owner ||
      isBadMoonRisingRoleEffective(state, owner.seatId, owner.actualRoleId);
    if (
      (type === "death-protection" ||
        (byExecution &&
          ["execution-protection", "pacifist-protection"].includes(type))) &&
      content.active !== false &&
      sourceEffective
    ) {
      (content.targetSeatIds ?? [content.targetSeatId]).forEach((seatId) => {
        if (seatId) result.add(seatId);
      });
    }
  });
  state.seats
    .filter(({ actualRoleId }) => actualRoleId === "tealady")
    .forEach(({ seatId }) =>
      resolveTeaLadyProtection(state, seatId).forEach((target) =>
        result.add(target),
      ),
    );
  (state.ongoingAbilityEffects ?? [])
    .filter(({ status, effectType }) => {
      if (status !== "active") return false;
      if (
        !["bmr.sailor-protection", "bmr.innkeeper-protection"].includes(
          effectType,
        ) &&
        !(byExecution && effectType === "bmr.devils-advocate-protection")
      ) {
        return false;
      }
      return true;
    })
    .forEach(({ targetIds }) =>
      targetIds.forEach((seatId) => result.add(seatId)),
    );
  return Array.from(result);
};

const seatsAfterOutcome = (state, outcome) =>
  state.seats.map((seat) => {
    if (seat.seatId !== outcome.targetSeatId) return seat;
    if (outcome.zombuulFirstDeath) {
      return { ...seat, alive: false, secretlyAlive: true };
    }
    if (outcome.actuallyDied) {
      return { ...seat, alive: false, secretlyAlive: false };
    }
    return seat;
  });

const terminalAbilityCleanupEvents = (state) => [
  ...state.adjudicationTasks
    .filter(({ status }) => status === "pending")
    .map(({ taskId }) => ({
      type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_CANCELLED,
      payload: { taskId, reason: "phase-ended" },
    })),
  ...state.abilityTriggers
    .filter(({ status }) =>
      ["pending", "waiting-adjudication"].includes(status),
    )
    .map(({ triggerId }) => ({
      type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_CANCELLED,
      payload: { triggerId, reason: "phase-ended" },
    })),
];

const foolProtection = (state, targetSeatId, ignoresProtection) => {
  if (ignoresProtection) return null;
  const instance = state.abilityInstances.find(
    ({ ownerSeatId, definitionId, status, usesConsumed }) =>
      ownerSeatId === targetSeatId &&
      definitionId === "bmr.fool.ability" &&
      status === "active" &&
      usesConsumed === 0,
  );
  return instance && isBadMoonRisingRoleEffective(state, targetSeatId, "fool")
    ? instance
    : null;
};

const executionPhaseEvent = (state) => ({
  type: EVENT_TYPES.PHASE_ADVANCED,
  payload: {
    from: "day",
    to: "night",
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber + 1,
    reason: "execution",
    ruleSourceId: BASIC_RULE_SOURCES.EXECUTION,
  },
});

export const createBadMoonRisingDeathPlan = (
  state,
  { basis, targetSeatId, causeId, sourceId, ignoresProtection = false },
) => {
  const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
  if (!target || (!target.alive && !target.secretlyAlive)) {
    throw new Error("死亡计划目标必须是当前真实存活玩家");
  }
  const baseProtectedSeatIds = protectedSeatIds(state);
  const foolInstance = baseProtectedSeatIds.includes(target.seatId)
    ? null
    : foolProtection(state, target.seatId, ignoresProtection);
  const outcome = resolveBadMoonRisingDeath(state, {
    targetSeatId: target.seatId,
    causeId,
    protectedSeatIds: [
      ...baseProtectedSeatIds,
      ...(foolInstance ? [target.seatId] : []),
    ],
    ignoresProtection,
  });
  if (foolInstance && !outcome.actuallyDied) outcome.preventedBy = "fool";
  const events = [];
  if (foolInstance && !outcome.actuallyDied) {
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.ABILITY_USE_CONSUMED,
      payload: {
        abilityInstanceId: foolInstance.instanceId,
        reason: "fool-first-death-prevented",
        ruleSourceIds: ["zh-wiki-role-fool"],
      },
    });
  }
  if (outcome.actuallyDied && !target.secretlyAlive) {
    events.push({
      type: EVENT_TYPES.PLAYER_DIED,
      payload: {
        seatId: target.seatId,
        causeId,
        ...(sourceId === undefined ? {} : { sourceId }),
        ruleSourceId: BASIC_RULE_SOURCES.LIFE,
      },
    });
  }
  events.push({
    type: BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
    payload: {
      recordId: `death-${basis}-${target.seatId}`,
      targetSeatId: target.seatId,
      causeId,
      actuallyDied: outcome.actuallyDied,
      publiclyDead: outcome.publiclyDead,
      zombuulFirstDeath: outcome.zombuulFirstDeath ?? false,
      preventedBy: outcome.preventedBy,
      ruleSourceIds: ["zh-wiki-bmr"],
    },
  });
  const sourceRoleId = sourceId?.replace(/^bmr\./, "");
  const grandmother = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "grandmother",
  );
  const grandmotherDies =
    outcome.actuallyDied &&
    target.seatId === state.badMoonRising.setup.grandchildSeatId &&
    BAD_MOON_RISING_ROLE_BY_ID.get(sourceRoleId)?.characterType === "demon" &&
    grandmother &&
    isBadMoonRisingRoleEffective(
      {
        ...state,
        seats: seatsAfterOutcome(state, outcome),
      },
      grandmother.seatId,
      "grandmother",
    );
  if (grandmotherDies) {
    const chainedState = {
      ...state,
      seats: seatsAfterOutcome(state, outcome),
    };
    const chained = createBadMoonRisingDeathPlan(chainedState, {
      basis: `${basis}-grandmother`,
      targetSeatId: grandmother.seatId,
      causeId: "bmr.grandmother",
      sourceId: `bmr.${sourceRoleId}`,
    });
    events.push(...chained.events);
  } else {
    const winner = determineBasicWinner(seatsAfterOutcome(state, outcome));
    if (winner) {
      events.push(...terminalAbilityCleanupEvents(state));
      events.push({
        type: EVENT_TYPES.GAME_ENDED,
        payload: {
          ...winner,
          ruleSourceId: BASIC_RULE_SOURCES.VICTORY,
        },
      });
    }
  }
  return { events, outcome };
};

const handleKill = ({ state, command, reject }) => {
  if (activeBallot(state)) {
    return reject(
      "ACTIVE_BALLOT_IN_PROGRESS",
      "活动提名或流放窗口期间不能改变生死",
    );
  }
  const target = state.seats.find(
    ({ seatId }) => seatId === command.payload.seatId,
  );
  if (!target) return reject("SEAT_NOT_FOUND", "死亡命令引用了不存在的席位");
  if (!target.alive && !target.secretlyAlive) {
    return reject("PLAYER_ALREADY_DEAD", "目标席位已经死亡");
  }
  const plan = createBadMoonRisingDeathPlan(state, {
    basis: command.commandId,
    targetSeatId: target.seatId,
    causeId: command.payload.causeId,
    sourceId: command.payload.sourceId,
    ignoresProtection:
      command.payload.sourceId === "bmr.assassin" ||
      command.payload.causeId.includes("assassin"),
  });
  return { events: plan.events };
};

export const createBadMoonRisingRevivalPlan = (
  state,
  { basis, targetSeatId, causeId, sourceRoleId },
) => {
  const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
  if (!target || target.alive || target.secretlyAlive) {
    throw new Error("复活计划目标必须是当前真正死亡玩家");
  }
  const newRoleInstanceId = `role-${basis}-${target.seatId}`;
  return {
    events: [
      {
        type: BAD_MOON_RISING_EVENT_TYPES.PLAYER_REVIVED,
        payload: {
          recordId: `resurrection-${basis}-${target.seatId}`,
          targetSeatId: target.seatId,
          newRoleInstanceId,
          newAbilityInstanceId: `bmr-ability-${newRoleInstanceId}`,
          causeId,
          sourceRoleId,
          ruleSourceIds: [`zh-wiki-role-${sourceRoleId}`],
        },
      },
    ],
  };
};

const handleRevive = ({ state, command, reject }) => {
  if (activeBallot(state)) {
    return reject(
      "ACTIVE_BALLOT_IN_PROGRESS",
      "活动提名或流放窗口期间不能复活玩家",
    );
  }
  const target = state.seats.find(
    ({ seatId }) => seatId === command.payload.seatId,
  );
  if (!target) return reject("SEAT_NOT_FOUND", "复活命令引用了不存在的席位");
  if (target.alive || target.secretlyAlive) {
    return reject("PLAYER_ALREADY_ALIVE", "目标席位并未真正死亡");
  }
  const sourceRoleId = command.payload.sourceId?.replace(/^bmr\./, "");
  if (!["professor", "shabaloth"].includes(sourceRoleId)) {
    return reject(
      "INVALID_BAD_MOON_RISING_REVIVAL_SOURCE",
      "《黯月初升》复活只能来自教授或沙巴洛斯",
    );
  }
  return createBadMoonRisingRevivalPlan(state, {
    basis: command.commandId,
    targetSeatId: target.seatId,
    causeId: command.payload.causeId,
    sourceRoleId,
  });
};

const handleExecution = ({ state, command, reject }) => {
  if (activeBallot(state)) {
    return reject(
      "ACTIVE_BALLOT_IN_PROGRESS",
      "活动提名或流放窗口期间不能结算处决",
    );
  }
  if (state.executionToday !== null) {
    return reject("EXECUTION_ALREADY_OCCURRED", "当前白天已经进行过常规处决");
  }
  const target = state.seats.find(
    ({ seatId }) => seatId === command.payload.seatId,
  );
  if (!target) return reject("SEAT_NOT_FOUND", "处决命令引用了不存在的席位");
  if (target.characterType === "traveler") {
    return reject("TRAVELER_CANNOT_BE_EXECUTED", "旅行者不能被常规处决");
  }
  if (state.executionCandidate === null) {
    return reject("NO_EXECUTION_CANDIDATE", "当前白天没有处决候选");
  }
  if (state.executionCandidate.seatId !== target.seatId) {
    return reject(
      "EXECUTION_CANDIDATE_MISMATCH",
      "处决目标必须是当前唯一即将被处决候选",
    );
  }

  const baseProtectedSeatIds = protectedSeatIds(state, { byExecution: true });
  const foolInstance = baseProtectedSeatIds.includes(target.seatId)
    ? null
    : foolProtection(state, target.seatId, false);
  const outcome = resolveBadMoonRisingDeath(state, {
    targetSeatId: target.seatId,
    causeId: "execution",
    protectedSeatIds: [
      ...baseProtectedSeatIds,
      ...(foolInstance ? [target.seatId] : []),
    ],
  });
  if (foolInstance && !outcome.actuallyDied) outcome.preventedBy = "fool";

  const events = [
    {
      type: BAD_MOON_RISING_EVENT_TYPES.PLAYER_EXECUTED,
      payload: {
        recordId: `execution-${command.commandId}-${target.seatId}`,
        targetSeatId: target.seatId,
        dayNumber: state.dayNumber,
        died: outcome.actuallyDied,
        ruleSourceIds: [BASIC_RULE_SOURCES.EXECUTION],
      },
    },
  ];
  if (foolInstance && !outcome.actuallyDied) {
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.ABILITY_USE_CONSUMED,
      payload: {
        abilityInstanceId: foolInstance.instanceId,
        reason: "fool-first-execution-death-prevented",
        ruleSourceIds: ["zh-wiki-role-fool"],
      },
    });
  }
  if (outcome.actuallyDied && !target.secretlyAlive) {
    events.push({
      type: EVENT_TYPES.PLAYER_DIED,
      payload: {
        seatId: target.seatId,
        causeId: "execution",
        sourceId: "execution.resolve",
        ruleSourceId: BASIC_RULE_SOURCES.LIFE,
      },
    });
  }
  events.push({
    type: BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
    payload: {
      recordId: `death-${command.commandId}-${target.seatId}`,
      targetSeatId: target.seatId,
      causeId: "execution",
      actuallyDied: outcome.actuallyDied,
      publiclyDead: outcome.publiclyDead,
      zombuulFirstDeath: outcome.zombuulFirstDeath ?? false,
      preventedBy: outcome.preventedBy,
      ruleSourceIds: ["zh-wiki-bmr"],
    },
  });
  const minstrel = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "minstrel",
  );
  if (
    outcome.actuallyDied &&
    target.characterType === "minion" &&
    minstrel &&
    isBadMoonRisingRoleEffective(state, minstrel.seatId, "minstrel")
  ) {
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
      payload: {
        recordId: `marker-${command.commandId}-minstrel-drunk`,
        markerType: "drunk",
        ownerSeatId: minstrel.seatId,
        targetSeatIds: state.seats
          .filter(
            ({ seatId, characterType }) =>
              seatId !== minstrel.seatId && characterType !== "traveler",
          )
          .map(({ seatId }) => seatId),
        remainingPhaseTransitions: 3,
        active: true,
        ruleSourceIds: ["zh-wiki-role-minstrel"],
      },
    });
  }

  const continuation = state.badMoonRising.mastermindContinuation;
  if (continuation.active) {
    events.push(...terminalAbilityCleanupEvents(state));
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.GAME_ENDED,
      payload: {
        alignment: target.alignment === "good" ? "evil" : "good",
        reason:
          target.alignment === "good"
            ? "mastermind-good-executed"
            : "mastermind-no-good-executed",
        ruleSourceIds: ["zh-wiki-role-mastermind"],
      },
    });
    return { events };
  }

  const winner = determineBasicWinner(seatsAfterOutcome(state, outcome));
  const mastermind = state.seats.find(
    ({ seatId, actualRoleId }) =>
      actualRoleId === "mastermind" &&
      isBadMoonRisingRoleEffective(state, seatId, "mastermind"),
  );
  const activatesMastermind = Boolean(
    winner?.reason === "all-demons-dead" &&
      outcome.actuallyDied &&
      target.characterType === "demon" &&
      mastermind,
  );
  if (activatesMastermind) {
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.MASTERMIND_ACTIVATED,
      payload: {
        demonSeatId: target.seatId,
        dayNumber: state.dayNumber,
        ruleSourceIds: ["zh-wiki-role-mastermind"],
      },
    });
    events.push(executionPhaseEvent(state));
  } else if (winner) {
    events.push(...terminalAbilityCleanupEvents(state));
    events.push({
      type: EVENT_TYPES.GAME_ENDED,
      payload: {
        ...winner,
        ruleSourceId: BASIC_RULE_SOURCES.VICTORY,
      },
    });
  } else {
    events.push(executionPhaseEvent(state));
  }
  return { events };
};

const handlePhaseAdvance = ({ state }) => {
  if (
    state.phase !== "day" ||
    !state.badMoonRising.mastermindContinuation.active ||
    activeBallot(state) ||
    state.executionCandidate !== null
  ) {
    return null;
  }
  return {
    events: [
      ...terminalAbilityCleanupEvents(state),
      {
        type: BAD_MOON_RISING_EVENT_TYPES.GAME_ENDED,
        payload: {
          alignment: "good",
          reason: "mastermind-no-good-executed",
          ruleSourceIds: ["zh-wiki-role-mastermind"],
        },
      },
    ],
  };
};

export const BAD_MOON_RISING_RULE_HOOKS = Object.freeze({
  handleExecution,
  handleKill,
  handlePhaseAdvance,
  handleRevive,
  validateGameStart,
});
