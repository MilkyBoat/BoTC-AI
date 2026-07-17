import { canonicalizeJson } from "../../protocol/immutable";
import {
  TROUBLE_BREWING_PACKAGE_ID,
  TROUBLE_BREWING_PACKAGE_VERSION,
} from "./catalog";
import {
  buildTroubleBrewingSeatInputs,
  createInitialTroubleBrewingState,
  createTroubleBrewingAbilityInstances,
  validateTroubleBrewingSetup,
} from "./setup";
import { mayorWinsAtDayEnd, resolveTroubleBrewingDeath } from "./rules";
import { TROUBLE_BREWING_EVENT_TYPES } from "./events";
import {
  buildDeathOutcomeEvents,
  buildExecutionEvents,
  roleSource,
} from "./resolution";

const sameJson = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);
const activeBallot = (state) =>
  state.activeNomination !== null || state.activeExile !== null;
const pendingAbilityWork = (state) =>
  state.abilityTriggers.some(({ status }) =>
    ["pending", "waiting-adjudication"].includes(status),
  ) || state.adjudicationTasks.some(({ status }) => status === "pending");

const hookRejection = (code, message, details) => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const setupFromCommand = (command) => {
  const troubleBrewing = command.payload.troubleBrewing;
  const assignments = command.payload.seats.map(
    ({ seatId, order, actualRoleId, perceivedRoleId, roleInstanceId }) => ({
      seatId,
      order,
      actualRoleId,
      perceivedRoleId,
      roleInstanceId,
    }),
  );
  return {
    assignments,
    redHerringSeatId: troubleBrewing?.setup?.redHerringSeatId ?? null,
    demonBluffs: troubleBrewing?.setup?.demonBluffs ?? [],
  };
};

const validateGameStart = ({ command }) => {
  const troubleBrewing = command.payload.troubleBrewing;
  if (
    troubleBrewing?.packageId !== TROUBLE_BREWING_PACKAGE_ID ||
    troubleBrewing?.version !== TROUBLE_BREWING_PACKAGE_VERSION
  ) {
    return hookRejection(
      "INVALID_TROUBLE_BREWING_SETUP",
      "开局必须精确绑定《暗流涌动》规则包状态",
    );
  }
  const setup = setupFromCommand(command);
  const validation = validateTroubleBrewingSetup(setup);
  if (!validation.valid) {
    return hookRejection(
      "INVALID_TROUBLE_BREWING_SETUP",
      "《暗流涌动》角色分配或开局裁量无效",
      { errors: validation.errors },
    );
  }
  const expected = createTroubleBrewingAbilityInstances(setup.assignments);
  if (
    !sameJson(
      command.payload.seats,
      buildTroubleBrewingSeatInputs(setup.assignments),
    )
  ) {
    return hookRejection(
      "INVALID_TROUBLE_BREWING_SEATS",
      "开局席位角色类型或阵营与真实角色不一致",
    );
  }
  if (!sameJson(command.payload.abilityInstances, expected.instances)) {
    return hookRejection(
      "INVALID_TROUBLE_BREWING_ABILITIES",
      "开局能力实例与真实/感知角色不一致",
    );
  }
  if (!sameJson(troubleBrewing, createInitialTroubleBrewingState(setup))) {
    return hookRejection(
      "INVALID_TROUBLE_BREWING_SETUP",
      "开局状态与角色分配、邪恶方信息或裁量结果不一致",
    );
  }
  return null;
};

const handlePhaseAdvance = ({ state, reject }) => {
  if (state.phase !== "day" || !mayorWinsAtDayEnd(state)) return null;
  if (pendingAbilityWork(state)) {
    return reject(
      "ABILITY_QUEUE_BLOCKED",
      "当前阶段仍有未完成的能力触发或说书人裁量任务",
    );
  }
  if (activeBallot(state) || state.executionCandidate !== null) return null;
  return {
    events: [
      {
        type: TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
        payload: {
          alignment: "good",
          reason: "mayor-three-alive-no-execution",
          ruleSourceIds: [roleSource("mayor")],
        },
      },
    ],
  };
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
  if (!target.alive) return reject("PLAYER_ALREADY_DEAD", "目标席位已经死亡");
  const outcome = resolveTroubleBrewingDeath(state, {
    targetSeatId: target.seatId,
    causeId: command.payload.causeId,
  });
  return {
    events: buildDeathOutcomeEvents(state, outcome, {
      basis: command.commandId,
      causeId: command.payload.causeId,
    }),
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
    return reject(
      "EXECUTION_CANDIDATE_MISMATCH",
      "处决目标必须是当前唯一即将被处决候选",
    );
  }
  return {
    events: buildExecutionEvents(state, target.seatId, {
      basis: command.commandId,
      causeId: "execution",
    }),
  };
};

export const TROUBLE_BREWING_RULE_HOOKS = Object.freeze({
  handleExecution,
  handleKill,
  handlePhaseAdvance,
  validateGameStart,
});
