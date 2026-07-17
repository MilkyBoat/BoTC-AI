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
  seats.map((seat) => (seat.seatId === seatId ? { ...seat, alive } : seat));

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
}) =>
  createCommand({
    commandId,
    gameId,
    expectedRevision,
    actor,
    type: COMMAND_TYPES.GAME_START,
    payload: { seats },
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
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      if (state?.lifecycle !== "preparing" || state.phase !== "setup") {
        return reject("INVALID_GAME_PHASE", "只有准备阶段可以开始对局", {
          lifecycle: state?.lifecycle ?? null,
          phase: state?.phase ?? null,
        });
      }
      const reason = validateSetupSeats(command.payload.seats);
      if (reason) return reject("INVALID_SETUP", reason);
      return {
        events: [
          {
            type: EVENT_TYPES.GAME_STARTED,
            payload: {
              seats: command.payload.seats,
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
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject);
      if (invalidState) return invalidState;
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
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject);
      if (invalidState) return invalidState;
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
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectUnauthorized(command, reject);
      if (unauthorized) return unauthorized;
      const invalidState = rejectUnlessRunning(state, reject, "day");
      if (invalidState) return invalidState;
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
        seats: event.payload.seats.map((seat) => ({ ...seat, alive: true })),
        executionToday: null,
        winner: null,
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
      return {
        ...state,
        phase: event.payload.to,
        dayNumber: event.payload.dayNumber,
        nightNumber: event.payload.nightNumber,
        executionToday:
          event.payload.to === "day" ? null : state.executionToday,
      };
    },
  }),
  Object.freeze({
    type: EVENT_TYPES.PLAYER_DIED,
    payloadSchema: payloadReference("lifeEventPayload"),
    reduce: (state, event) => {
      if (
        state?.lifecycle !== "running" ||
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
        state.executionToday !== null ||
        event.payload.dayNumber !== state.dayNumber ||
        event.payload.ruleSourceId !== BASIC_RULE_SOURCES.EXECUTION
      ) {
        throw new Error("处决事件与当前白天状态不一致");
      }
      const seat = findSeat(state, event.payload.seatId);
      if (!seat || event.payload.died !== seat.alive) {
        throw new Error("处决事件目标或死亡结果不一致");
      }
      return {
        ...state,
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
      return {
        ...state,
        lifecycle: "ended",
        phase: "ended",
        winner: {
          alignment: winner.alignment,
          reason: winner.reason,
          decidedAtRevision: event.sequence,
        },
      };
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
  const expectedWinner = determineBasicWinner(state.seats);
  if (
    !expectedWinner ||
    expectedWinner.alignment !== state.winner.alignment ||
    expectedWinner.reason !== state.winner.reason ||
    state.winner.decidedAtRevision !== state.revision
  ) {
    invariantError("结束状态胜方与权威事实不一致");
  }
};
