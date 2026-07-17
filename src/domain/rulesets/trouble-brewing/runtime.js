import {
  PROTOCOL_VERSION,
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "../../protocol";
import { cloneAndFreezeJson } from "../../protocol/immutable";
import { createStartGameCommand } from "../../rules/basic";
import { TROUBLE_BREWING_ROLE_PACKAGE } from "./role-package";
import {
  buildTroubleBrewingSeatInputs,
  createInitialTroubleBrewingState,
  createTroubleBrewingAbilityInstances,
} from "./setup";
import { TROUBLE_BREWING_EVENT_TYPES } from "./events";
import { TROUBLE_BREWING_EVENT_REACTIONS } from "./reactions";
import { TROUBLE_BREWING_STATE_INVARIANTS } from "./invariants";
import { roleSource } from "./resolution";

export const TROUBLE_BREWING_COMMAND_TYPES = Object.freeze({
  SLAYER_USE: "tb.slayer.use",
});

const stableId = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};
const strictObject = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

const slayerCommandDefinition = Object.freeze({
  type: TROUBLE_BREWING_COMMAND_TYPES.SLAYER_USE,
  payloadSchema: strictObject(["ownerSeatId", "targetSeatId"], {
    ownerSeatId: stableId,
    targetSeatId: stableId,
  }),
  handle: ({ state, command, reject }) => {
    if (state?.lifecycle !== "running" || state.phase !== "day") {
      return reject("INVALID_GAME_PHASE", "猎手只能在运行中的白天公开使用能力");
    }
    if (
      command.actor.kind === "seat" &&
      command.actor.id !== command.payload.ownerSeatId
    ) {
      return reject("ACTOR_NOT_AUTHORIZED", "席位只能提交自己的猎手动作");
    }
    if (!["seat", "host", "system"].includes(command.actor.kind)) {
      return reject("ACTOR_NOT_AUTHORIZED", "当前主体无权提交猎手动作");
    }
    const owner = state.seats.find(
      ({ seatId }) => seatId === command.payload.ownerSeatId,
    );
    const target = state.seats.find(
      ({ seatId }) => seatId === command.payload.targetSeatId,
    );
    const instance = state.abilityInstances.find(
      ({ ownerSeatId, definitionId, status }) =>
        ownerSeatId === owner?.seatId &&
        definitionId === "tb.slayer.ability" &&
        status === "active",
    );
    if (!owner?.alive || owner.actualRoleId !== "slayer" || !instance) {
      return reject("ABILITY_INSTANCE_NOT_FOUND", "存活猎手的能力实例不存在");
    }
    if (!target) return reject("SEAT_NOT_FOUND", "猎手目标席位不存在");
    if (instance.usesConsumed >= 1) {
      return reject("ABILITY_USAGE_EXHAUSTED", "猎手的一次性能力已经使用");
    }
    if (
      state.abilityTriggers.some(({ status }) =>
        ["pending", "waiting-adjudication"].includes(status),
      )
    ) {
      return reject("ABILITY_QUEUE_BLOCKED", "当前仍有未结算的能力触发");
    }
    return {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.SLAYER_ACTION_REQUESTED,
          payload: {
            ownerSeatId: owner.seatId,
            sourceEventId: command.commandId,
            ruleSourceIds: [roleSource("slayer")],
          },
        },
      ],
    };
  },
});

const runtimeOptions = (options = {}) => ({
  ...options,
  rolePackage: TROUBLE_BREWING_ROLE_PACKAGE,
  commandDefinitions: [
    slayerCommandDefinition,
    ...(options.commandDefinitions ?? []),
  ],
  eventReactions: [
    ...TROUBLE_BREWING_EVENT_REACTIONS,
    ...(options.eventReactions ?? []),
  ],
  stateInvariants: [
    ...TROUBLE_BREWING_STATE_INVARIANTS,
    ...(options.stateInvariants ?? []),
  ],
});

export const createTroubleBrewingDomainProtocol = (options) =>
  createDomainProtocol(runtimeOptions(options));

export const restoreTroubleBrewingDomainProtocol = (stream, options = {}) =>
  restoreDomainProtocol(stream, runtimeOptions(options));

export const createTroubleBrewingGameCommand = (options) =>
  createGameCommand({
    ...options,
    rulePackage: TROUBLE_BREWING_ROLE_PACKAGE.identity,
  });

export const createTroubleBrewingStartCommand = ({
  assignments,
  redHerringSeatId = null,
  demonBluffs = [],
  ...options
}) => {
  const { instances } = createTroubleBrewingAbilityInstances(assignments);
  return createStartGameCommand({
    ...options,
    seats: buildTroubleBrewingSeatInputs(assignments),
    abilityInstances: instances,
    troubleBrewing: createInitialTroubleBrewingState({
      assignments,
      redHerringSeatId,
      demonBluffs,
    }),
  });
};

export const createSlayerUseCommand = (options) =>
  cloneAndFreezeJson({
    protocolVersion: PROTOCOL_VERSION,
    commandId: options.commandId,
    gameId: options.gameId,
    expectedRevision: options.expectedRevision,
    actor: options.actor,
    type: TROUBLE_BREWING_COMMAND_TYPES.SLAYER_USE,
    payload: {
      ownerSeatId: options.ownerSeatId,
      targetSeatId: options.targetSeatId,
    },
  });
