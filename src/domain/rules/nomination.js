import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_SCHEMA_ID,
  PROTOCOL_VERSION,
} from "../protocol/constants";
import { protocolError } from "../protocol/errors";
import { cloneAndFreezeJson } from "../protocol/immutable";
import { BASIC_RULE_SOURCES } from "./basic";

const payloadReference = (name) => ({
  $ref: `${PROTOCOL_SCHEMA_ID}#/definitions/${name}`,
});

export const NOMINATION_RULE_SOURCES = Object.freeze({
  NOMINATION: "zh-wiki-ability-nomination",
  VOTE: "zh-wiki-ability-vote",
  EXILE: "zh-wiki-glossary",
});

const controllers = new Set(["host", "system"]);
const findSeat = (state, seatId) =>
  state?.seats.find((seat) => seat.seatId === seatId);
const hasActiveBallot = (state) =>
  state?.activeNomination !== null || state?.activeExile !== null;
const sortedSeats = (state) =>
  state.seats.slice().sort((left, right) => left.order - right.order);

const rejectController = (command, reject) =>
  controllers.has(command.actor.kind)
    ? null
    : reject("ACTOR_NOT_AUTHORIZED", "当前主体无权控制提名或表决窗口", {
        actorKind: command.actor.kind,
      });

const rejectSeatAction = (command, seatId, reject) => {
  if (controllers.has(command.actor.kind)) return null;
  if (command.actor.kind !== "seat") {
    return reject("ACTOR_NOT_AUTHORIZED", "当前主体无权提交玩家表决动作", {
      actorKind: command.actor.kind,
    });
  }
  if (command.actor.id !== seatId) {
    return reject("ACTOR_SEAT_MISMATCH", "席位主体只能替自己的席位行动", {
      actorSeatId: command.actor.id,
      requestedSeatId: seatId,
    });
  }
  return null;
};

const rejectUnlessDay = (state, reject) => {
  if (state?.lifecycle !== "running" || state.phase !== "day") {
    return reject("INVALID_GAME_PHASE", "提名与表决只能在运行中的白天进行", {
      lifecycle: state?.lifecycle ?? null,
      phase: state?.phase ?? null,
    });
  }
  if (state.executionToday !== null) {
    return reject("EXECUTION_ALREADY_OCCURRED", "当前白天已经完成常规处决", {
      dayNumber: state.dayNumber,
    });
  }
  return null;
};

const rejectActiveBallot = (state, reject) =>
  hasActiveBallot(state)
    ? reject("ACTIVE_BALLOT_IN_PROGRESS", "当前已有尚未结束的提名或流放窗口")
    : null;

export const deriveVotingOrder = (state, nomineeSeatId) => {
  const seats = sortedSeats(state);
  const index = seats.findIndex(({ seatId }) => seatId === nomineeSeatId);
  if (index < 0) throw new Error("被提名席位不存在");
  return [...seats.slice(index + 1), ...seats.slice(0, index + 1)].map(
    ({ seatId }) => seatId,
  );
};

const livingThreshold = (state) =>
  Math.ceil(state.seats.filter(({ alive }) => alive).length / 2);
const allPlayersThreshold = (state) => Math.ceil(state.seats.length / 2);

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

export const createOpenNominationCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.NOMINATION_OPEN,
    payload: {
      nominationId: options.nominationId,
      nominatorSeatId: options.nominatorSeatId,
      nomineeSeatId: options.nomineeSeatId,
    },
  });
export const createOpenVoteCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.VOTE_OPEN,
    payload: { nominationId: options.nominationId },
  });
export const createRecordVoteCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.VOTE_RECORD,
    payload: {
      nominationId: options.nominationId,
      voterSeatId: options.voterSeatId,
      support: options.support,
    },
  });
export const createCloseVoteCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.VOTE_CLOSE,
    payload: { nominationId: options.nominationId },
  });
export const createOpenExileCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.EXILE_OPEN,
    payload: {
      exileId: options.exileId,
      proposerSeatId: options.proposerSeatId,
      travelerSeatId: options.travelerSeatId,
    },
  });
export const createSetExileSupportCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.EXILE_SUPPORT_SET,
    payload: {
      exileId: options.exileId,
      supporterSeatId: options.supporterSeatId,
      support: options.support,
    },
  });
export const createCloseExileCommand = (options) =>
  createCommand({
    ...options,
    type: COMMAND_TYPES.EXILE_CLOSE,
    payload: { exileId: options.exileId },
  });

const nominationError = (
  state,
  { nominationId, nominatorSeatId, nomineeSeatId },
) => {
  if (
    state.nominationsToday.some(
      (record) => record.nominationId === nominationId,
    )
  ) {
    return ["NOMINATION_ID_ALREADY_USED", "当前白天已经使用该提名 ID"];
  }
  const nominator = findSeat(state, nominatorSeatId);
  if (!nominator) return ["SEAT_NOT_FOUND", "提名者席位不存在"];
  if (!nominator.alive)
    return ["NOMINATOR_NOT_ALIVE", "只有存活玩家可以发起提名"];
  if (
    state.nominationsToday.some(
      (record) => record.nominatorSeatId === nominatorSeatId,
    )
  ) {
    return ["NOMINATOR_ALREADY_USED", "该玩家今天已经发起过一次提名"];
  }
  const nominee = findSeat(state, nomineeSeatId);
  if (!nominee) return ["SEAT_NOT_FOUND", "被提名者席位不存在"];
  if (nominee.characterType === "traveler") {
    return [
      "TRAVELER_CANNOT_BE_NOMINATED",
      "旅行者不能被常规提名，只能进入流放流程",
    ];
  }
  if (
    state.nominationsToday.some(
      (record) => record.nomineeSeatId === nomineeSeatId,
    )
  ) {
    return ["NOMINEE_ALREADY_NOMINATED", "该玩家今天已经被提名过一次"];
  }
  return null;
};

const calculateVoteOutcome = (state, nomineeSeatId, total, threshold) => {
  const previousHighest = state.highestNominationVotes;
  const enough = total >= threshold && total >= 1;
  if (total > previousHighest) {
    return {
      result: enough ? "candidate" : "not-enough",
      highestVotes: total,
      executionCandidate: enough
        ? { seatId: nomineeSeatId, votes: total }
        : null,
    };
  }
  if (total === previousHighest && state.nominationsToday.length > 0) {
    return {
      result: total > 0 ? "tie" : "not-enough",
      highestVotes: previousHighest,
      executionCandidate: null,
    };
  }
  return {
    result: enough ? "lower" : "not-enough",
    highestVotes: previousHighest,
    executionCandidate: state.executionCandidate,
  };
};

const buildVoteClosedPayload = (state) => {
  const active = state.activeNomination;
  const voterSeatIds = active.decisions
    .filter(({ support }) => support)
    .map(({ seatId }) => seatId);
  const outcome = calculateVoteOutcome(
    state,
    active.nomineeSeatId,
    voterSeatIds.length,
    active.threshold,
  );
  return {
    nominationId: active.nominationId,
    nomineeSeatId: active.nomineeSeatId,
    total: voterSeatIds.length,
    threshold: active.threshold,
    voterSeatIds,
    result: outcome.result,
    highestVotes: outcome.highestVotes,
    executionCandidateSeatId: outcome.executionCandidate?.seatId ?? null,
    ruleSourceId: NOMINATION_RULE_SOURCES.VOTE,
  };
};

const buildExileClosedPayload = (state) => {
  const active = state.activeExile;
  const supporterSeatIds = sortedSeats(state)
    .filter(({ seatId }) =>
      active.decisions.some(
        (decision) => decision.seatId === seatId && decision.support,
      ),
    )
    .map(({ seatId }) => seatId);
  const threshold = allPlayersThreshold(state);
  return {
    exileId: active.exileId,
    travelerSeatId: active.travelerSeatId,
    total: supporterSeatIds.length,
    threshold,
    supporterSeatIds,
    succeeded: supporterSeatIds.length >= threshold,
    ruleSourceId: NOMINATION_RULE_SOURCES.EXILE,
  };
};

export const NOMINATION_COMMAND_DEFINITIONS = Object.freeze(
  [
    {
      type: COMMAND_TYPES.NOMINATION_OPEN,
      payloadSchema: payloadReference("nominationOpenPayload"),
      handle: ({ state, command, reject }) => {
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = rejectActiveBallot(state, reject);
        if (active) return active;
        const unauthorized = rejectSeatAction(
          command,
          command.payload.nominatorSeatId,
          reject,
        );
        if (unauthorized) return unauthorized;
        const reason = nominationError(state, command.payload);
        if (reason) return reject(reason[0], reason[1]);
        return {
          events: [
            {
              type: EVENT_TYPES.NOMINATION_OPENED,
              payload: {
                ...command.payload,
                dayNumber: state.dayNumber,
                ruleSourceId: NOMINATION_RULE_SOURCES.NOMINATION,
              },
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.VOTE_OPEN,
      payloadSchema: payloadReference("voteOpenPayload"),
      handle: ({ state, command, reject }) => {
        const unauthorized = rejectController(command, reject);
        if (unauthorized) return unauthorized;
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = state.activeNomination;
        if (!active || active.nominationId !== command.payload.nominationId) {
          return reject("NOMINATION_NOT_ACTIVE", "指定提名当前未处于活动状态");
        }
        if (active.stage !== "defense") {
          return reject("VOTING_ALREADY_OPEN", "当前提名已经打开投票窗口");
        }
        return {
          events: [
            {
              type: EVENT_TYPES.VOTE_OPENED,
              payload: {
                nominationId: active.nominationId,
                nomineeSeatId: active.nomineeSeatId,
                votingOrder: deriveVotingOrder(state, active.nomineeSeatId),
                threshold: livingThreshold(state),
                ruleSourceId: NOMINATION_RULE_SOURCES.VOTE,
              },
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.VOTE_RECORD,
      payloadSchema: payloadReference("voteRecordPayload"),
      handle: ({ state, command, reject }) => {
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = state.activeNomination;
        if (!active || active.nominationId !== command.payload.nominationId) {
          return reject("NOMINATION_NOT_ACTIVE", "指定提名当前未处于活动状态");
        }
        if (active.stage !== "voting") {
          return reject("VOTING_NOT_OPEN", "当前投票窗口不接受新的逐席决定");
        }
        const expectedSeatId = active.votingOrder[active.currentVoterIndex];
        if (command.payload.voterSeatId !== expectedSeatId) {
          return reject("VOTER_OUT_OF_ORDER", "当前席位不在本次投票游标位置", {
            expectedSeatId,
            actualSeatId: command.payload.voterSeatId,
          });
        }
        const unauthorized = rejectSeatAction(
          command,
          command.payload.voterSeatId,
          reject,
        );
        if (unauthorized) return unauthorized;
        const voter = findSeat(state, command.payload.voterSeatId);
        if (
          command.payload.support &&
          !voter.alive &&
          !voter.deadVoteAvailable
        ) {
          return reject("DEAD_VOTE_UNAVAILABLE", "死亡玩家已经没有可用死亡票", {
            seatId: voter.seatId,
          });
        }
        return {
          events: [
            {
              type: EVENT_TYPES.VOTE_RECORDED,
              payload: {
                ...command.payload,
                usedDeadVote: command.payload.support && !voter.alive,
                ruleSourceId: NOMINATION_RULE_SOURCES.VOTE,
              },
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.VOTE_CLOSE,
      payloadSchema: payloadReference("voteClosePayload"),
      handle: ({ state, command, reject }) => {
        const unauthorized = rejectController(command, reject);
        if (unauthorized) return unauthorized;
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = state.activeNomination;
        if (!active || active.nominationId !== command.payload.nominationId) {
          return reject("NOMINATION_NOT_ACTIVE", "指定提名当前未处于活动状态");
        }
        if (active.stage !== "ready-to-close") {
          return reject(
            "VOTING_NOT_COMPLETE",
            "全部席位完成计票后才能关闭窗口",
          );
        }
        return {
          events: [
            {
              type: EVENT_TYPES.VOTE_CLOSED,
              payload: buildVoteClosedPayload(state),
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.EXILE_OPEN,
      payloadSchema: payloadReference("exileOpenPayload"),
      handle: ({ state, command, reject }) => {
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = rejectActiveBallot(state, reject);
        if (active) return active;
        const unauthorized = rejectSeatAction(
          command,
          command.payload.proposerSeatId,
          reject,
        );
        if (unauthorized) return unauthorized;
        if (!findSeat(state, command.payload.proposerSeatId)) {
          return reject("SEAT_NOT_FOUND", "流放提议者席位不存在");
        }
        if (
          state.exilesToday.some(
            ({ exileId }) => exileId === command.payload.exileId,
          )
        ) {
          return reject("EXILE_ID_ALREADY_USED", "当前白天已经使用该流放 ID");
        }
        const traveler = findSeat(state, command.payload.travelerSeatId);
        if (!traveler) return reject("SEAT_NOT_FOUND", "流放目标席位不存在");
        if (traveler.characterType !== "traveler") {
          return reject(
            "EXILE_TARGET_NOT_TRAVELER",
            "只有旅行者能成为流放目标",
          );
        }
        if (!traveler.alive) {
          return reject("EXILE_TARGET_NOT_ALIVE", "流放目标旅行者当前已经死亡");
        }
        if (
          state.exilesToday.some(
            ({ travelerSeatId }) => travelerSeatId === traveler.seatId,
          )
        ) {
          return reject(
            "TRAVELER_ALREADY_PROPOSED_FOR_EXILE",
            "该旅行者今天已经被提议流放过一次",
          );
        }
        return {
          events: [
            {
              type: EVENT_TYPES.EXILE_OPENED,
              payload: {
                ...command.payload,
                dayNumber: state.dayNumber,
                ruleSourceId: NOMINATION_RULE_SOURCES.EXILE,
              },
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.EXILE_SUPPORT_SET,
      payloadSchema: payloadReference("exileSupportSetPayload"),
      handle: ({ state, command, reject }) => {
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = state.activeExile;
        if (!active || active.exileId !== command.payload.exileId) {
          return reject("EXILE_NOT_ACTIVE", "指定流放当前未处于活动状态");
        }
        const unauthorized = rejectSeatAction(
          command,
          command.payload.supporterSeatId,
          reject,
        );
        if (unauthorized) return unauthorized;
        if (!findSeat(state, command.payload.supporterSeatId)) {
          return reject("SEAT_NOT_FOUND", "流放支持席位不存在");
        }
        return {
          events: [
            {
              type: EVENT_TYPES.EXILE_SUPPORT_SET,
              payload: {
                ...command.payload,
                ruleSourceId: NOMINATION_RULE_SOURCES.EXILE,
              },
            },
          ],
        };
      },
    },
    {
      type: COMMAND_TYPES.EXILE_CLOSE,
      payloadSchema: payloadReference("exileClosePayload"),
      handle: ({ state, command, reject }) => {
        const unauthorized = rejectController(command, reject);
        if (unauthorized) return unauthorized;
        const invalid = rejectUnlessDay(state, reject);
        if (invalid) return invalid;
        const active = state.activeExile;
        if (!active || active.exileId !== command.payload.exileId) {
          return reject("EXILE_NOT_ACTIVE", "指定流放当前未处于活动状态");
        }
        const payload = buildExileClosedPayload(state);
        return {
          events: [
            { type: EVENT_TYPES.EXILE_CLOSED, payload },
            ...(payload.succeeded
              ? [
                  {
                    type: EVENT_TYPES.PLAYER_DIED,
                    payload: {
                      seatId: active.travelerSeatId,
                      causeId: "exile",
                      sourceId: "exile.close",
                      ruleSourceId: BASIC_RULE_SOURCES.LIFE,
                    },
                  },
                ]
              : []),
          ],
        };
      },
    },
  ].map(Object.freeze),
);

const assertSame = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}与当前权威状态不一致`);
  }
};

export const NOMINATION_EVENT_DEFINITIONS = Object.freeze(
  [
    {
      type: EVENT_TYPES.NOMINATION_OPENED,
      payloadSchema: payloadReference("nominationOpenedPayload"),
      reduce: (state, event) => {
        if (
          state?.lifecycle !== "running" ||
          state.phase !== "day" ||
          state.executionToday !== null ||
          hasActiveBallot(state) ||
          event.payload.dayNumber !== state.dayNumber ||
          event.payload.ruleSourceId !== NOMINATION_RULE_SOURCES.NOMINATION
        ) {
          throw new Error("提名打开事件与当前白天状态不一致");
        }
        const reason = nominationError(state, event.payload);
        if (reason) throw new Error(reason[1]);
        return {
          ...state,
          activeNomination: {
            nominationId: event.payload.nominationId,
            dayNumber: state.dayNumber,
            nominatorSeatId: event.payload.nominatorSeatId,
            nomineeSeatId: event.payload.nomineeSeatId,
            stage: "defense",
            votingOrder: [],
            currentVoterIndex: 0,
            threshold: 0,
            decisions: [],
          },
        };
      },
    },
    {
      type: EVENT_TYPES.VOTE_OPENED,
      payloadSchema: payloadReference("voteOpenedPayload"),
      reduce: (state, event) => {
        const active = state?.activeNomination;
        if (!active || active.stage !== "defense") {
          throw new Error("只有辩护阶段可以打开投票窗口");
        }
        assertSame(
          event.payload,
          {
            nominationId: active.nominationId,
            nomineeSeatId: active.nomineeSeatId,
            votingOrder: deriveVotingOrder(state, active.nomineeSeatId),
            threshold: livingThreshold(state),
            ruleSourceId: NOMINATION_RULE_SOURCES.VOTE,
          },
          "投票打开事件",
        );
        return {
          ...state,
          activeNomination: {
            ...active,
            stage: "voting",
            votingOrder: event.payload.votingOrder,
            threshold: event.payload.threshold,
          },
        };
      },
    },
    {
      type: EVENT_TYPES.VOTE_RECORDED,
      payloadSchema: payloadReference("voteRecordedPayload"),
      reduce: (state, event) => {
        const active = state?.activeNomination;
        if (!active || active.stage !== "voting") {
          throw new Error("当前没有可记录决定的投票窗口");
        }
        const expectedSeatId = active.votingOrder[active.currentVoterIndex];
        const voter = findSeat(state, event.payload.voterSeatId);
        const shouldUseDeadVote = event.payload.support && !voter?.alive;
        if (
          event.payload.nominationId !== active.nominationId ||
          event.payload.voterSeatId !== expectedSeatId ||
          !voter ||
          event.payload.ruleSourceId !== NOMINATION_RULE_SOURCES.VOTE ||
          event.payload.usedDeadVote !== shouldUseDeadVote ||
          (event.payload.usedDeadVote && !voter.deadVoteAvailable)
        ) {
          throw new Error("逐席投票事件与当前游标或死亡票状态不一致");
        }
        const nextIndex = active.currentVoterIndex + 1;
        return {
          ...state,
          seats: event.payload.usedDeadVote
            ? state.seats.map((seat) =>
                seat.seatId === voter.seatId
                  ? { ...seat, deadVoteAvailable: false }
                  : seat,
              )
            : state.seats,
          activeNomination: {
            ...active,
            stage:
              nextIndex === active.votingOrder.length
                ? "ready-to-close"
                : "voting",
            currentVoterIndex: nextIndex,
            decisions: [
              ...active.decisions,
              {
                seatId: voter.seatId,
                support: event.payload.support,
                usedDeadVote: event.payload.usedDeadVote,
              },
            ],
          },
        };
      },
    },
    {
      type: EVENT_TYPES.VOTE_CLOSED,
      payloadSchema: payloadReference("voteClosedPayload"),
      reduce: (state, event) => {
        const active = state?.activeNomination;
        if (!active || active.stage !== "ready-to-close") {
          throw new Error("只有完成全部逐席计票后才能归约投票结果");
        }
        const expected = buildVoteClosedPayload(state);
        assertSame(event.payload, expected, "投票关闭事件");
        return {
          ...state,
          nominationsToday: [
            ...state.nominationsToday,
            {
              nominationId: active.nominationId,
              dayNumber: active.dayNumber,
              nominatorSeatId: active.nominatorSeatId,
              nomineeSeatId: active.nomineeSeatId,
              total: expected.total,
              threshold: expected.threshold,
              voterSeatIds: expected.voterSeatIds,
              result: expected.result,
              executionCandidateSeatId: expected.executionCandidateSeatId,
            },
          ],
          activeNomination: null,
          highestNominationVotes: expected.highestVotes,
          executionCandidate:
            expected.executionCandidateSeatId === null
              ? null
              : {
                  seatId: expected.executionCandidateSeatId,
                  votes: expected.highestVotes,
                },
        };
      },
    },
    {
      type: EVENT_TYPES.EXILE_OPENED,
      payloadSchema: payloadReference("exileOpenedPayload"),
      reduce: (state, event) => {
        const proposer = findSeat(state, event.payload.proposerSeatId);
        const traveler = findSeat(state, event.payload.travelerSeatId);
        if (
          state?.lifecycle !== "running" ||
          state.phase !== "day" ||
          state.executionToday !== null ||
          hasActiveBallot(state) ||
          !proposer ||
          !traveler?.alive ||
          traveler.characterType !== "traveler" ||
          event.payload.dayNumber !== state.dayNumber ||
          event.payload.ruleSourceId !== NOMINATION_RULE_SOURCES.EXILE ||
          state.exilesToday.some(
            ({ travelerSeatId }) => travelerSeatId === traveler.seatId,
          )
        ) {
          throw new Error("流放打开事件与当前白天或旅行者状态不一致");
        }
        return {
          ...state,
          activeExile: {
            exileId: event.payload.exileId,
            dayNumber: state.dayNumber,
            proposerSeatId: proposer.seatId,
            travelerSeatId: traveler.seatId,
            decisions: [],
          },
        };
      },
    },
    {
      type: EVENT_TYPES.EXILE_SUPPORT_SET,
      payloadSchema: payloadReference("exileSupportSetEventPayload"),
      reduce: (state, event) => {
        const active = state?.activeExile;
        const supporter = findSeat(state, event.payload.supporterSeatId);
        if (
          !active ||
          active.exileId !== event.payload.exileId ||
          !supporter ||
          event.payload.ruleSourceId !== NOMINATION_RULE_SOURCES.EXILE
        ) {
          throw new Error("流放支持事件与当前窗口不一致");
        }
        const decisions = active.decisions.filter(
          ({ seatId }) => seatId !== supporter.seatId,
        );
        decisions.push({
          seatId: supporter.seatId,
          support: event.payload.support,
        });
        const order = new Map(
          sortedSeats(state).map(({ seatId }, index) => [seatId, index]),
        );
        decisions.sort(
          (left, right) => order.get(left.seatId) - order.get(right.seatId),
        );
        return { ...state, activeExile: { ...active, decisions } };
      },
    },
    {
      type: EVENT_TYPES.EXILE_CLOSED,
      payloadSchema: payloadReference("exileClosedPayload"),
      reduce: (state, event) => {
        const active = state?.activeExile;
        if (!active) throw new Error("当前没有可关闭的流放窗口");
        const expected = buildExileClosedPayload(state);
        assertSame(event.payload, expected, "流放关闭事件");
        return {
          ...state,
          exilesToday: [
            ...state.exilesToday,
            {
              exileId: active.exileId,
              dayNumber: active.dayNumber,
              proposerSeatId: active.proposerSeatId,
              travelerSeatId: active.travelerSeatId,
              supporterSeatIds: expected.supporterSeatIds,
              total: expected.total,
              threshold: expected.threshold,
              succeeded: expected.succeeded,
            },
          ],
          activeExile: null,
        };
      },
    },
  ].map(Object.freeze),
);

const invariantError = (message, details) => {
  throw protocolError("INVARIANT_VIOLATION", message, details);
};
const unique = (items) => new Set(items).size === items.length;

export const assertNominationStateInvariants = (state) => {
  if (state === null) return;
  if (
    state.seats.some(
      ({ alive, deadVoteAvailable }) => alive && deadVoteAvailable,
    )
  ) {
    invariantError("存活席位不能持有死亡票");
  }
  const empty =
    state.nominationsToday.length === 0 &&
    state.activeNomination === null &&
    state.highestNominationVotes === 0 &&
    state.executionCandidate === null &&
    state.exilesToday.length === 0 &&
    state.activeExile === null;
  if (state.phase !== "day") {
    if (!empty) invariantError("非白天状态包含提名或流放数据");
    return;
  }
  if (state.activeNomination !== null && state.activeExile !== null) {
    invariantError("同一时间存在多个活动表决窗口");
  }
  const seatIds = new Set(state.seats.map(({ seatId }) => seatId));
  const ids = state.nominationsToday.map(({ nominationId }) => nominationId);
  const nominators = state.nominationsToday.map(
    ({ nominatorSeatId }) => nominatorSeatId,
  );
  const nominees = state.nominationsToday.map(
    ({ nomineeSeatId }) => nomineeSeatId,
  );
  if (
    !unique(ids) ||
    !unique(nominators) ||
    !unique(nominees) ||
    state.nominationsToday.some(
      (record) =>
        record.dayNumber !== state.dayNumber ||
        !seatIds.has(record.nominatorSeatId) ||
        findSeat(state, record.nomineeSeatId)?.characterType === "traveler" ||
        !unique(record.voterSeatIds) ||
        record.voterSeatIds.some((seatId) => !seatIds.has(seatId)) ||
        record.total !== record.voterSeatIds.length,
    )
  ) {
    invariantError("当天提名历史包含重复或失效引用");
  }
  const highest = Math.max(
    0,
    ...state.nominationsToday.map(({ total }) => total),
  );
  if (state.highestNominationVotes !== highest) {
    invariantError("当天最高提名票数与历史不一致");
  }
  if (state.executionCandidate !== null) {
    const matching = state.nominationsToday.filter(
      ({ total }) => total === state.executionCandidate.votes,
    );
    const record = matching.find(
      ({ nomineeSeatId }) => nomineeSeatId === state.executionCandidate.seatId,
    );
    if (
      state.executionCandidate.votes !== highest ||
      matching.length !== 1 ||
      !record ||
      record.total < record.threshold ||
      record.total < 1
    ) {
      invariantError("处决候选不是当天唯一达标最高票");
    }
  }
  const active = state.activeNomination;
  if (active !== null) {
    if (
      active.dayNumber !== state.dayNumber ||
      ids.includes(active.nominationId) ||
      nominators.includes(active.nominatorSeatId) ||
      nominees.includes(active.nomineeSeatId) ||
      !findSeat(state, active.nominatorSeatId)?.alive ||
      findSeat(state, active.nomineeSeatId)?.characterType === "traveler"
    ) {
      invariantError("活动提名资格或引用无效");
    }
    if (active.stage === "defense") {
      if (
        active.votingOrder.length ||
        active.currentVoterIndex ||
        active.threshold ||
        active.decisions.length
      ) {
        invariantError("辩护阶段包含投票窗口状态");
      }
    } else {
      if (
        JSON.stringify(active.votingOrder) !==
          JSON.stringify(deriveVotingOrder(state, active.nomineeSeatId)) ||
        active.threshold !== livingThreshold(state) ||
        active.currentVoterIndex !== active.decisions.length ||
        active.decisions.some(
          (decision, index) =>
            decision.seatId !== active.votingOrder[index] ||
            (decision.usedDeadVote &&
              findSeat(state, decision.seatId).deadVoteAvailable),
        ) ||
        (active.stage === "voting" &&
          active.currentVoterIndex >= active.votingOrder.length) ||
        (active.stage === "ready-to-close" &&
          active.currentVoterIndex !== active.votingOrder.length)
      ) {
        invariantError("活动投票顺序、游标、门槛或死亡票状态无效");
      }
    }
  }
  const exileTargets = state.exilesToday.map(
    ({ travelerSeatId }) => travelerSeatId,
  );
  if (
    !unique(state.exilesToday.map(({ exileId }) => exileId)) ||
    !unique(exileTargets) ||
    state.exilesToday.some(
      (record) =>
        record.dayNumber !== state.dayNumber ||
        !seatIds.has(record.proposerSeatId) ||
        findSeat(state, record.travelerSeatId)?.characterType !== "traveler" ||
        !unique(record.supporterSeatIds) ||
        record.total !== record.supporterSeatIds.length ||
        record.threshold !== allPlayersThreshold(state) ||
        record.succeeded !== record.total >= record.threshold,
    )
  ) {
    invariantError("当天流放历史包含重复或失效结果");
  }
  const exile = state.activeExile;
  if (
    exile !== null &&
    (exile.dayNumber !== state.dayNumber ||
      state.exilesToday.some(({ exileId }) => exileId === exile.exileId) ||
      exileTargets.includes(exile.travelerSeatId) ||
      !seatIds.has(exile.proposerSeatId) ||
      !findSeat(state, exile.travelerSeatId)?.alive ||
      findSeat(state, exile.travelerSeatId)?.characterType !== "traveler" ||
      !unique(exile.decisions.map(({ seatId }) => seatId)) ||
      exile.decisions.some(({ seatId }) => !seatIds.has(seatId)))
  ) {
    invariantError("活动流放资格、目标或支持记录无效");
  }
};
