import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_SCHEMA_ID,
  PROTOCOL_VERSION,
} from "../protocol/constants";
import { cloneAndFreezeJson } from "../protocol/immutable";
import { protocolError } from "../protocol/errors";

const payloadReference = (name) => ({
  $ref: `${PROTOCOL_SCHEMA_ID}#/definitions/${name}`,
});

export const BASIC_RULE_SOURCES = Object.freeze({
  PHASE: "zh-wiki-glossary",
  LIFE: "zh-wiki-glossary",
  EXECUTION: "zh-wiki-ability-execution",
  VICTORY: "zh-wiki-ability-special-win-loss-condition",
});

const controllerKinds = new Set(["host", "system"]);

const rejectUnauthorized = (command, reject) =>
  controllerKinds.has(command.actor.kind)
    ? null
    : reject("ACTOR_NOT_AUTHORIZED", "当前主体无权执行基础对局控制命令", {
        actorKind: command.actor.kind,
      });

const rejectUnlessRunning = (state, reject, phase) => {
  if (state?.lifecycle !== "running") {
    return reject("INVALID_GAME_PHASE", "当前对局不处于运行阶段", {
      lifecycle: state?.lifecycle ?? null,
      phase: state?.phase ?? null,
    });
  }
  if (phase !== undefined && state.phase !== phase) {
    return reject("INVALID_GAME_PHASE", `当前操作只能在 ${phase} 阶段执行`, {
      expected: phase,
      actual: state.phase,
    });
  }
  return null;
};

const findSeat = (state, seatId) =>
  state?.seats.find((seat) => seat.seatId === seatId);

const validateSetupSeats = (seats) => {
  const ids = new Set();
  const orders = new Set();
  for (const seat of seats) {
    if (ids.has(seat.seatId) || orders.has(seat.order)) {
      return "席位 ID 与顺序必须唯一";
    }
    ids.add(seat.seatId);
    orders.add(seat.order);
  }
  if (seats.some((seat, index) => seat.order !== index + 1)) {
    return "席位顺序必须从 1 开始连续递增";
  }
  if (
    seats.filter(({ characterType }) => characterType !== "traveler").length < 3
  ) {
    return "开局至少需要三名非旅行者玩家";
  }
  if (!seats.some(({ characterType }) => characterType === "demon")) {
    return "开局至少需要一名恶魔";
  }
  return null;
};

const assertSetupSeats = (seats) => {
  const reason = validateSetupSeats(seats);
  if (reason) throw new Error(reason);
};

const nextPhasePayload = (state, reason, ruleSourceId) => {
  if (state.phase === "first-night") {
    return {
      from: "first-night",
      to: "day",
      dayNumber: 1,
      nightNumber: 1,
      reason,
      ruleSourceId,
    };
  }
  if (state.phase === "day") {
    return {
      from: "day",
      to: "night",
      dayNumber: state.dayNumber,
      nightNumber: state.nightNumber + 1,
      reason,
      ruleSourceId,
    };
  }
  if (state.phase === "night") {
    return {
      from: "night",
      to: "day",
      dayNumber: state.dayNumber + 1,
      nightNumber: state.nightNumber,
      reason,
      ruleSourceId,
    };
  }
  throw new Error(`阶段 ${state.phase} 不能继续推进`);
};

const withSeatAlive = (seats, seatId, alive) =>
  seats.map((seat) =>
    seat.seatId === seatId
      ? { ...seat, alive, deadVoteAvailable: !alive }
      : seat,
  );

const clearBallotState = (state) => ({
  ...state,
  nominationsToday: [],
  activeNomination: null,
  highestNominationVotes: 0,
  executionCandidate: null,
  exilesToday: [],
  activeExile: null,
});

const hasActiveBallot = (state) =>
  state.activeNomination !== null || state.activeExile !== null;

const rejectActiveBallotChange = (state, reject) =>
  hasActiveBallot(state)
    ? reject(
        "ACTIVE_BALLOT_IN_PROGRESS",
        "活动提名或流放窗口期间不能改变生死、阶段或处决",
      )
    : null;

const invokeOverrideHook = (rolePackage, hookName, context) => {
  const hook = rolePackage.ruleHooks?.[hookName];
  if (!hook) return null;
  return hook(context) ?? null;
};

const invokeGameStartValidation = (rolePackage, context) => {
  const validate = rolePackage.ruleHooks?.validateGameStart;
  if (!validate) return null;
  const result = validate(context);
  if (result === null || result === undefined) return null;
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some(
      (key) => !["code", "message", "details"].includes(key),
    ) ||
    !/^[A-Z][A-Z0-9_]{1,63}$/.test(result.code ?? "") ||
    typeof result.message !== "string" ||
    result.message.length === 0 ||
    (result.details !== undefined &&
      (result.details === null ||
        typeof result.details !== "object" ||
        Array.isArray(result.details)))
  ) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE_HOOK_RESULT",
      "validateGameStart 钩子返回了无效的领域拒绝",
    );
  }
  return result;
};

export const determineBasicWinner = (seats) => {
  const livingDemons = seats.filter(
    ({ alive, characterType }) => alive && characterType === "demon",
  );
  if (livingDemons.length === 0) {
    return { alignment: "good", reason: "all-demons-dead" };
  }
  const livingNonTravelers = seats.filter(
    ({ alive, characterType }) => alive && characterType !== "traveler",
  );
  if (livingNonTravelers.length <= 2) {
    return { alignment: "evil", reason: "two-alive" };
  }
  return null;
};

const winnerEvent = (winner) => ({
  type: EVENT_TYPES.GAME_ENDED,
  payload: {
    ...winner,
    ruleSourceId: BASIC_RULE_SOURCES.VICTORY,
  },
});

const lifeEventPayload = (command) => ({
  seatId: command.payload.seatId,
  causeId: command.payload.causeId,
  ...(command.payload.sourceId === undefined
    ? {}
    : { sourceId: command.payload.sourceId }),
  ruleSourceId: BASIC_RULE_SOURCES.LIFE,
});

const createCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  type,
  payload,
}) =>
  cloneAndFreezeJson({
    protocolVersion: PROTOCOL_VERSION,
    commandId,
    gameId,
    expectedRevision,
    actor,
    type,
    payload,
  });

export const createStartGameCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  seats,
  abilityInstances = [],
  troubleBrewing,
}) =>
  createCommand({
    commandId,
    gameId,
    expectedRevision,
    actor,
    type: COMMAND_TYPES.GAME_START,
    payload: {
      seats,
      abilityInstances,
      ...(troubleBrewing === undefined ? {} : { troubleBrewing }),
    },
  });

export const createAdvancePhaseCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
}) =>
  createCommand({
    commandId,
    gameId,
    expectedRevision,
    actor,
    type: COMMAND_TYPES.PHASE_ADVANCE,
    payload: {},
  });

const createLifeCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  seatId,
  causeId,
  sourceId,
  type,
}) =>
  createCommand({
    commandId,
    gameId,
    expectedRevision,
    actor,
    type,
    payload: {
      seatId,
      causeId,
      ...(sourceId === undefined ? {} : { sourceId }),
    },
  });

export const createKillPlayerCommand = (options) =>
  createLifeCommand({ ...options, type: COMMAND_TYPES.PLAYER_KILL });

export const createRevivePlayerCommand = (options) =>
  createLifeCommand({ ...options, type: COMMAND_TYPES.PLAYER_REVIVE });

export const createResolveExecutionCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  seatId,
}) =>
  createCommand({
    commandId,
    gameId,
    expectedRevision,
    actor,
    type: COMMAND_TYPES.EXECUTION_RESOLVE,
    payload: { seatId },
  });

export const BASIC_COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: COMMAND_TYPES.GAME_START,
    payloadSchema: payloadReference("gameStartPayload"),
    handle: ({ state, command, reject, rolePackage }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      if (state?.lifecycle !== "preparing" || state.phase !== "setup") {
        return reject("INVALID_GAME_PHASE", "只有准备阶段可以开始对局", {
          lifecycle: state?.lifecycle ?? null,
          phase: state?.phase ?? null,
        });
      }
      const hookError = invokeGameStartValidation(rolePackage, {
        state,
        command,
        rolePackage,
      });
      if (hookError) {
        return reject(hookError.code, hookError.message, hookError.details);
      }
      const reason = validateSetupSeats(command.payload.seats);
      if (reason) return reject("INVALID_SETUP", reason);
      const instanceIds = new Set();
      for (const instance of command.payload.abilityInstances) {
        const definition = rolePackage.getAbilityDefinition(
          instance.definitionId,
        );
        if (
          instanceIds.has(instance.instanceId) ||
          !command.payload.seats.some(
            ({ seatId }) => seatId === instance.ownerSeatId,
          ) ||
          !definition ||
          definition.roleId !== instance.sourceRoleId
        ) {
          return reject(
            "INVALID_ABILITY_INSTANCE",
            "开局能力实例的 ID、拥有席位、定义或来源角色无效",
            { instanceId: instance.instanceId },
          );
        }
        instanceIds.add(instance.instanceId);
      }
      return {
        events: [
          {
            type: EVENT_TYPES.GAME_STARTED,
            payload: {
              seats: command.payload.seats,
              abilityInstances: command.payload.abilityInstances,
              ...(command.payload.troubleBrewing === undefined
                ? {}
                : { troubleBrewing: command.payload.troubleBrewing }),
              ruleSourceId: BASIC_RULE_SOURCES.PHASE,
            },
          },
        ],
      };
    },
  }),
  Object.freeze({
    type: COMMAND_TYPES.PHASE_ADVANCE,
    payloadSchema: payloadReference("emptyPayload"),
    handle: ({ state, command, reject, rolePackage }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject);
      if (invalidState) return invalidState;
      const hookResult = invokeOverrideHook(rolePackage, "handlePhaseAdvance", {
        state,
        command,
        reject,
        rolePackage,
      });
      if (hookResult) return hookResult;
      if (
        state.abilityTriggers.some(({ status }) =>
          ["pending", "waiting-adjudication"].includes(status),
        ) ||
        state.adjudicationTasks.some(({ status }) => status === "pending")
      ) {
        return reject(
          "ABILITY_QUEUE_BLOCKED",
          "当前阶段仍有未完成的能力触发或说书人裁量任务",
        );
      }
      if (state.phase === "day") {
        const active = rejectActiveBallotChange(state, reject);
        if (active) return active;
        if (state.executionCandidate !== null) {
          return reject(
            "EXECUTION_CANDIDATE_PENDING",
            "当前存在即将被处决候选，不能按无人处决结束白天",
            { seatId: state.executionCandidate.seatId },
          );
        }
      }
      return {
        events: [
          {
            type: EVENT_TYPES.PHASE_ADVANCED,
            payload: nextPhasePayload(
              state,
              "manual",
              BASIC_RULE_SOURCES.PHASE,
            ),
          },
        ],
      };
    },
  }),
  Object.freeze({
    type: COMMAND_TYPES.PLAYER_KILL,
    payloadSchema: payloadReference("lifeCommandPayload"),
    handle: ({ state, command, reject, rolePackage }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject);
      if (invalidState) return invalidState;
      const hookResult = invokeOverrideHook(rolePackage, "handleKill", {
        state,
        command,
        reject,
        rolePackage,
      });
      if (hookResult) return hookResult;
      const active = rejectActiveBallotChange(state, reject);
      if (active) return active;
      const seat = findSeat(state, command.payload.seatId);
      if (!seat) {
        return reject("SEAT_NOT_FOUND", "死亡命令引用了不存在的席位", {
          seatId: command.payload.seatId,
        });
      }
      if (!seat.alive) {
        return reject("PLAYER_ALREADY_DEAD", "目标席位已经死亡", {
          seatId: seat.seatId,
        });
      }
      const winner = determineBasicWinner(
        withSeatAlive(state.seats, seat.seatId, false),
      );
      return {
        events: [
          {
            type: EVENT_TYPES.PLAYER_DIED,
            payload: lifeEventPayload(command),
          },
          ...(winner ? [winnerEvent(winner)] : []),
        ],
      };
    },
  }),
  Object.freeze({
    type: COMMAND_TYPES.PLAYER_REVIVE,
    payloadSchema: payloadReference("lifeCommandPayload"),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject);
      if (invalidState) return invalidState;
      const active = rejectActiveBallotChange(state, reject);
      if (active) return active;
      const seat = findSeat(state, command.payload.seatId);
      if (!seat) {
        return reject("SEAT_NOT_FOUND", "复活命令引用了不存在的席位", {
          seatId: command.payload.seatId,
        });
      }
      if (seat.alive) {
        return reject("PLAYER_ALREADY_ALIVE", "目标席位当前仍然存活", {
          seatId: seat.seatId,
        });
      }
      return {
        events: [
          {
            type: EVENT_TYPES.PLAYER_REVIVED,
            payload: lifeEventPayload(command),
          },
        ],
      };
    },
  }),
  Object.freeze({
    type: COMMAND_TYPES.EXECUTION_RESOLVE,
    payloadSchema: payloadReference("executionResolvePayload"),
    handle: ({ state, command, reject, rolePackage }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject, "day");
      if (invalidState) return invalidState;
      const hookResult = invokeOverrideHook(rolePackage, "handleExecution", {
        state,
        command,
        reject,
        rolePackage,
      });
      if (hookResult) return hookResult;
      const active = rejectActiveBallotChange(state, reject);
      if (active) return active;
      if (state.executionToday !== null) {
        return reject(
          "EXECUTION_ALREADY_OCCURRED",
          "当前白天已经进行过常规处决",
          { dayNumber: state.dayNumber },
        );
      }
      const seat = findSeat(state, command.payload.seatId);
      if (!seat) {
        return reject("SEAT_NOT_FOUND", "处决命令引用了不存在的席位", {
          seatId: command.payload.seatId,
        });
      }
      if (seat.characterType === "traveler") {
        return reject(
          "TRAVELER_CANNOT_BE_EXECUTED",
          "旅行者不能被常规处决，只能进入流放流程",
          { seatId: seat.seatId },
        );
      }
      if (state.executionCandidate === null) {
        return reject(
          "NO_EXECUTION_CANDIDATE",
          "当前白天没有由提名投票产生的处决候选",
        );
      }
      if (state.executionCandidate.seatId !== seat.seatId) {
        return reject(
          "EXECUTION_CANDIDATE_MISMATCH",
          "处决目标必须是当前唯一即将被处决候选",
          {
            expectedSeatId: state.executionCandidate.seatId,
            actualSeatId: seat.seatId,
          },
        );
      }
      const seatsAfter = seat.alive
        ? withSeatAlive(state.seats, seat.seatId, false)
        : state.seats;
      const winner = seat.alive ? determineBasicWinner(seatsAfter) : null;
      return {
        events: [
          {
            type: EVENT_TYPES.PLAYER_EXECUTED,
            payload: {
              seatId: seat.seatId,
              dayNumber: state.dayNumber,
              died: seat.alive,
              ruleSourceId: BASIC_RULE_SOURCES.EXECUTION,
            },
          },
          ...(seat.alive
            ? [
                {
                  type: EVENT_TYPES.PLAYER_DIED,
                  payload: {
                    seatId: seat.seatId,
                    causeId: "execution",
                    sourceId: "execution.resolve",
                    ruleSourceId: BASIC_RULE_SOURCES.LIFE,
                  },
                },
              ]
            : []),
          ...(winner
            ? [winnerEvent(winner)]
            : [
                {
                  type: EVENT_TYPES.PHASE_ADVANCED,
                  payload: nextPhasePayload(
                    state,
                    "execution",
                    BASIC_RULE_SOURCES.EXECUTION,
                  ),
                },
              ]),
        ],
      };
    },
  }),
]);

export const BASIC_EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: EVENT_TYPES.GAME_STARTED,
    payloadSchema: payloadReference("gameStartedPayload"),
    reduce: (state, event) => {
      if (state?.lifecycle !== "preparing" || state.phase !== "setup") {
        throw new Error("只有准备状态可以归约 game.started");
      }
      if (event.payload.ruleSourceId !== BASIC_RULE_SOURCES.PHASE) {
        throw new Error("开局事件规则来源不匹配");
      }
      assertSetupSeats(event.payload.seats);
      return {
        ...state,
        lifecycle: "running",
        phase: "first-night",
        dayNumber: 0,
        nightNumber: 1,
        seats: event.payload.seats.map((seat) => ({
          ...seat,
          alive: true,
          deadVoteAvailable: false,
        })),
        executionToday: null,
        winner: null,
        abilityInstances: event.payload.abilityInstances.map((instance) => ({
          ...instance,
          status: "active",
          usesConsumed: 0,
          createdAtRevision: event.sequence,
          endedAtRevision: null,
        })),
        ...(event.payload.troubleBrewing === undefined
          ? {}
          : { troubleBrewing: event.payload.troubleBrewing }),
      };
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.PHASE_ADVANCED,
    payloadSchema: payloadReference("phaseAdvancedPayload"),
    reduce: (state, event) => {
      if (state?.lifecycle !== "running") {
        throw new Error("只有运行中的对局可以推进阶段");
      }
      if (hasActiveBallot(state)) {
        throw new Error("活动提名或流放窗口期间不能归约阶段推进事件");
      }
      if (state.phase === "day") {
        const reason = state.executionToday === null ? "manual" : "execution";
        if (
          event.payload.reason !== reason ||
          state.executionCandidate !== null
        ) {
          throw new Error("白天阶段推进与处决候选或处决记录不一致");
        }
      } else if (event.payload.reason !== "manual") {
        throw new Error("非白天阶段不能使用处决原因推进");
      }
      const expectedSource =
        event.payload.reason === "execution"
          ? BASIC_RULE_SOURCES.EXECUTION
          : BASIC_RULE_SOURCES.PHASE;
      const expected = nextPhasePayload(
        state,
        event.payload.reason,
        expectedSource,
      );
      if (JSON.stringify(event.payload) !== JSON.stringify(expected)) {
        throw new Error("阶段推进事件与当前状态不一致");
      }
      return clearBallotState({
        ...state,
        phase: event.payload.to,
        dayNumber: event.payload.dayNumber,
        nightNumber: event.payload.nightNumber,
        executionToday:
          event.payload.to === "day" ? null : state.executionToday,
      });
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.PLAYER_DIED,
    payloadSchema: payloadReference("lifeEventPayload"),
    reduce: (state, event) => {
      if (
        state?.lifecycle !== "running" ||
        hasActiveBallot(state) ||
        event.payload.ruleSourceId !== BASIC_RULE_SOURCES.LIFE
      ) {
        throw new Error("死亡事件的对局状态或规则来源无效");
      }
      const seat = findSeat(state, event.payload.seatId);
      if (!seat || !seat.alive) throw new Error("死亡事件目标必须当前存活");
      return {
        ...state,
        seats: withSeatAlive(state.seats, seat.seatId, false),
      };
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.PLAYER_REVIVED,
    payloadSchema: payloadReference("lifeEventPayload"),
    reduce: (state, event) => {
      if (
        state?.lifecycle !== "running" ||
        hasActiveBallot(state) ||
        event.payload.ruleSourceId !== BASIC_RULE_SOURCES.LIFE
      ) {
        throw new Error("复活事件的对局状态或规则来源无效");
      }
      const seat = findSeat(state, event.payload.seatId);
      if (!seat || seat.alive) throw new Error("复活事件目标必须当前死亡");
      return {
        ...state,
        seats: withSeatAlive(state.seats, seat.seatId, true),
      };
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.PLAYER_EXECUTED,
    payloadSchema: payloadReference("playerExecutedPayload"),
    reduce: (state, event) => {
      if (
        state?.lifecycle !== "running" ||
        state.phase !== "day" ||
        hasActiveBallot(state) ||
        state.executionToday !== null ||
        event.payload.dayNumber !== state.dayNumber ||
        event.payload.ruleSourceId !== BASIC_RULE_SOURCES.EXECUTION
      ) {
        throw new Error("处决事件与当前白天状态不一致");
      }
      const seat = findSeat(state, event.payload.seatId);
      if (
        !seat ||
        seat.characterType === "traveler" ||
        state.executionCandidate?.seatId !== seat.seatId ||
        event.payload.died !== seat.alive
      ) {
        throw new Error("处决事件目标或死亡结果不一致");
      }
      return {
        ...state,
        executionCandidate: null,
        executionToday: {
          dayNumber: state.dayNumber,
          seatId: seat.seatId,
          died: event.payload.died,
        },
      };
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.GAME_ENDED,
    payloadSchema: payloadReference("gameEndedPayload"),
    reduce: (state, event) => {
      if (
        state?.lifecycle !== "running" ||
        event.payload.ruleSourceId !== BASIC_RULE_SOURCES.VICTORY
      ) {
        throw new Error("结束事件的对局状态或规则来源无效");
      }
      const winner = determineBasicWinner(state.seats);
      if (
        !winner ||
        winner.alignment !== event.payload.alignment ||
        winner.reason !== event.payload.reason
      ) {
        throw new Error("结束事件与当前常规胜负事实不一致");
      }
      return clearBallotState({
        ...state,
        lifecycle: "ended",
        phase: "ended",
        winner: {
          alignment: winner.alignment,
          reason: winner.reason,
          decidedAtRevision: event.sequence,
        },
      });
    },
  }),
]);

const invariantError = (message, details) => {
  throw protocolError("INVARIANT_VIOLATION", message, details);
};

export const assertBasicStateInvariants = (state) => {
  if (state === null) return;
  const seatIds = new Set(state.seats.map(({ seatId }) => seatId));
  const seatOrders = new Set(state.seats.map(({ order }) => order));
  if (
    seatIds.size !== state.seats.length ||
    seatOrders.size !== state.seats.length
  ) {
    invariantError("权威状态包含重复席位 ID 或顺序");
  }
  if (state.seats.some((seat, index) => seat.order !== index + 1)) {
    invariantError("权威状态席位顺序不连续");
  }
  if (state.lifecycle === "preparing") {
    if (
      state.phase !== "setup" ||
      state.dayNumber !== 0 ||
      state.nightNumber !== 0 ||
      state.seats.length !== 0 ||
      state.executionToday !== null ||
      state.winner !== null
    ) {
      invariantError("准备阶段状态组合无效");
    }
    return;
  }

  const setupReason = validateSetupSeats(state.seats);
  if (setupReason)
    invariantError("权威状态基础席位无效", { reason: setupReason });

  if (state.executionToday !== null) {
    if (
      !seatIds.has(state.executionToday.seatId) ||
      state.executionToday.dayNumber !== state.dayNumber
    ) {
      invariantError("当天处决记录引用了无效席位或日号");
    }
  }

  if (state.lifecycle === "running") {
    if (
      !["first-night", "day", "night"].includes(state.phase) ||
      state.winner !== null
    ) {
      invariantError("运行阶段状态组合无效");
    }
    if (
      (state.phase === "first-night" &&
        (state.dayNumber !== 0 || state.nightNumber !== 1)) ||
      (state.phase === "day" && state.dayNumber !== state.nightNumber) ||
      (state.phase === "night" && state.nightNumber !== state.dayNumber + 1)
    ) {
      invariantError("昼夜阶段与编号不一致");
    }
    const pendingWinner = determineBasicWinner(state.seats);
    if (pendingWinner) {
      invariantError("运行状态遗漏了已经满足的常规胜负", pendingWinner);
    }
    return;
  }

  if (state.lifecycle !== "ended" || state.phase !== "ended" || !state.winner) {
    invariantError("结束阶段状态组合无效");
  }
  const specialWinnerAlignments = {
    "saint-executed": "evil",
    "mayor-three-alive-no-execution": "good",
  };
  const specialAlignment = specialWinnerAlignments[state.winner.reason];
  const winnerRevisionMatches = state.troubleBrewing
    ? state.winner.decidedAtRevision <= state.revision
    : state.winner.decidedAtRevision === state.revision;
  if (specialAlignment !== undefined) {
    if (state.winner.alignment !== specialAlignment || !winnerRevisionMatches) {
      invariantError("特殊胜利的阵营或决定修订无效");
    }
    return;
  }
  const expectedWinner = determineBasicWinner(state.seats);
  if (
    !expectedWinner ||
    expectedWinner.alignment !== state.winner.alignment ||
    expectedWinner.reason !== state.winner.reason ||
    !winnerRevisionMatches
  ) {
    invariantError("结束状态胜方与权威事实不一致");
  }
};
