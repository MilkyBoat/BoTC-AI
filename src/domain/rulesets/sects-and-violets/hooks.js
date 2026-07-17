import { canonicalizeJson } from "../../protocol/immutable";
import { EVENT_TYPES } from "../../protocol";
import { BASIC_RULE_SOURCES, determineBasicWinner } from "../../rules/basic";
import {
  SECTS_AND_VIOLETS_PACKAGE_ID,
  SECTS_AND_VIOLETS_PACKAGE_VERSION,
} from "./catalog";
import {
  buildSectsAndVioletsSeatInputs,
  createInitialSectsAndVioletsState,
  createSectsAndVioletsAbilityInstances,
  validateSectsAndVioletsSetup,
} from "./setup";
import { SECTS_AND_VIOLETS_EVENT_TYPES } from "./events";
import {
  isSectsAndVioletsRoleEffective,
  resolveEvilTwinOutcome,
  resolveVortoxNoExecution,
} from "./rules";

const 相同 = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);
const 拒绝 = (code, message, details) => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const setupFromCommand = (command) => ({
  assignments: command.payload.seats.map(
    ({ seatId, order, actualRoleId, perceivedRoleId, roleInstanceId }) => ({
      seatId,
      order,
      actualRoleId,
      perceivedRoleId,
      roleInstanceId,
    }),
  ),
  evilTwinSeatId:
    command.payload.sectsAndViolets?.setup?.evilTwinSeatId ?? null,
  goodTwinSeatId:
    command.payload.sectsAndViolets?.setup?.goodTwinSeatId ?? null,
  demonBluffs: command.payload.sectsAndViolets?.setup?.demonBluffs ?? [],
});

const validateGameStart = ({ command }) => {
  const state = command.payload.sectsAndViolets;
  if (
    state?.packageId !== SECTS_AND_VIOLETS_PACKAGE_ID ||
    state?.version !== SECTS_AND_VIOLETS_PACKAGE_VERSION
  ) {
    return 拒绝(
      "INVALID_SECTS_AND_VIOLETS_SETUP",
      "开局必须精确绑定《梦殒春宵》规则包状态",
    );
  }
  const setup = setupFromCommand(command);
  const validation = validateSectsAndVioletsSetup(setup);
  if (!validation.valid) {
    return 拒绝(
      "INVALID_SECTS_AND_VIOLETS_SETUP",
      "《梦殒春宵》角色分配或开局裁量无效",
      { errors: validation.errors },
    );
  }
  if (
    !相同(
      command.payload.seats,
      buildSectsAndVioletsSeatInputs(setup.assignments),
    )
  ) {
    return 拒绝(
      "INVALID_SECTS_AND_VIOLETS_SEATS",
      "开局席位类型、阵营或角色真相不一致",
    );
  }
  if (
    !相同(
      command.payload.abilityInstances,
      createSectsAndVioletsAbilityInstances(setup.assignments).instances,
    )
  ) {
    return 拒绝(
      "INVALID_SECTS_AND_VIOLETS_ABILITIES",
      "开局能力实例与角色分配不一致",
    );
  }
  if (!相同(state, createInitialSectsAndVioletsState(setup))) {
    return 拒绝(
      "INVALID_SECTS_AND_VIOLETS_SETUP",
      "开局子状态与角色分配或设置裁量不一致",
    );
  }
  return null;
};

const activeVortox = (state) => {
  const vortox = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "vortox",
  );
  return Boolean(
    vortox && isSectsAndVioletsRoleEffective(state, vortox.seatId, "vortox"),
  );
};

const activeBallot = (state) =>
  state.activeNomination !== null || state.activeExile !== null;

const twinBlocksGoodWin = (state, seatsAfter) => {
  const evilTwin = seatsAfter.find(
    ({ seatId }) => seatId === state.sectsAndViolets.setup.evilTwinSeatId,
  );
  const goodTwin = seatsAfter.find(
    ({ seatId }) => seatId === state.sectsAndViolets.setup.goodTwinSeatId,
  );
  return resolveEvilTwinOutcome({
    evilTwinAlive: evilTwin?.alive === true,
    goodTwinAlive: goodTwin?.alive === true,
    proposedWinner: "good",
  }).preventGoodWin;
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

const handlePhaseAdvance = ({ state }) => {
  if (state.phase !== "day") return null;
  const outcome = resolveVortoxNoExecution({
    vortoxEffective: activeVortox(state),
    executionOccurred: state.executionToday !== null,
  });
  return outcome.winner
    ? {
        events: [
          {
            type: SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
            payload: {
              alignment: "evil",
              reason: outcome.reason,
              ruleSourceIds: ["zh-wiki-role-vortox"],
            },
          },
        ],
      }
    : null;
};

const handleKill = ({ state, command, reject }) => {
  if (activeBallot(state)) {
    return reject(
      "ACTIVE_BALLOT_IN_PROGRESS",
      "活动提名或流放窗口期间不能结算死亡",
    );
  }
  const target = state.seats.find(
    ({ seatId }) => seatId === command.payload.seatId,
  );
  if (!target) return reject("SEAT_NOT_FOUND", "死亡命令引用了不存在的席位");
  if (!target.alive) return reject("PLAYER_ALREADY_DEAD", "目标席位已经死亡");
  return {
    events: [
      {
        type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
        payload: {
          recordId: `death-${command.commandId}-${target.seatId}`,
          targetSeatId: target.seatId,
          causeId: command.payload.causeId,
          actuallyDied: true,
          retainsAbilityAfterDeath: false,
          poisonedSeatIds: [],
          ruleSourceIds: [command.payload.sourceId ?? "zh-wiki-snv"],
        },
      },
    ],
  };
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
    return reject("EXECUTION_CANDIDATE_MISMATCH", "处决目标必须是当前唯一候选");
  }
  const evilTwinSeatId = state.sectsAndViolets.setup.evilTwinSeatId;
  const goodTwinSeatId = state.sectsAndViolets.setup.goodTwinSeatId;
  const evilTwin = state.seats.find(({ seatId }) => seatId === evilTwinSeatId);
  const seatsAfter = target.alive
    ? state.seats.map((seat) =>
        seat.seatId === target.seatId ? { ...seat, alive: false } : seat,
      )
    : state.seats;
  const goodTwinAfter = seatsAfter.find(
    ({ seatId }) => seatId === goodTwinSeatId,
  );
  const twinOutcome = resolveEvilTwinOutcome({
    evilTwinAlive: evilTwin?.alive === true,
    goodTwinAlive: goodTwinAfter?.alive === true,
    goodTwinExecuted: target.alive && command.payload.seatId === goodTwinSeatId,
  });
  const winner = target.alive ? determineBasicWinner(seatsAfter) : null;
  const blocksGood =
    winner?.alignment === "good" && twinBlocksGoodWin(state, seatsAfter);
  const terminal = twinOutcome.winner
    ? { alignment: "evil", reason: "evil-twin-good-twin-executed" }
    : winner && !blocksGood
    ? winner
    : null;
  return {
    events: [
      {
        type: EVENT_TYPES.PLAYER_EXECUTED,
        payload: {
          seatId: target.seatId,
          dayNumber: state.dayNumber,
          died: target.alive,
          ruleSourceId: BASIC_RULE_SOURCES.EXECUTION,
        },
      },
      ...(target.alive
        ? [
            {
              type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
              payload: {
                recordId: `death-${command.commandId}-${target.seatId}`,
                targetSeatId: target.seatId,
                causeId: "execution",
                actuallyDied: true,
                retainsAbilityAfterDeath: false,
                poisonedSeatIds: [],
                ruleSourceIds: [BASIC_RULE_SOURCES.EXECUTION],
              },
            },
          ]
        : []),
      ...(terminal ? [] : [executionPhaseEvent(state)]),
    ],
  };
};

export const SECTS_AND_VIOLETS_RULE_HOOKS = Object.freeze({
  handleExecution,
  handleKill,
  handlePhaseAdvance,
  validateGameStart,
});
