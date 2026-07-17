import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_SCHEMA_ID,
  PROTOCOL_VERSION,
} from "./constants";
import { cloneAndFreezeJson } from "./immutable";
import { M1_RULESET_IDENTITY } from "./ruleset";
import {
  BASIC_COMMAND_DEFINITIONS,
  BASIC_EVENT_DEFINITIONS,
} from "../rules/basic";
import {
  NOMINATION_COMMAND_DEFINITIONS,
  NOMINATION_EVENT_DEFINITIONS,
} from "../rules/nomination";

const payloadReference = (name) => ({
  $ref: `${PROTOCOL_SCHEMA_ID}#/definitions/${name}`,
});

export const createGameCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  seed,
  ruleset = M1_RULESET_IDENTITY,
}) =>
  cloneAndFreezeJson({
    protocolVersion: PROTOCOL_VERSION,
    commandId,
    gameId,
    expectedRevision,
    actor,
    type: COMMAND_TYPES.GAME_CREATE,
    payload: { ruleset, seed },
  });

export const BUILTIN_COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: COMMAND_TYPES.GAME_CREATE,
    payloadSchema: payloadReference("gameCreatePayload"),
    handle: ({ state, command, reject, isSupportedRuleset }) => {
      if (!["host", "system"].includes(command.actor.kind)) {
        return reject("ACTOR_NOT_AUTHORIZED", "当前主体无权创建权威对局", {
          actorKind: command.actor.kind,
        });
      }
      if (state !== null) {
        return reject("GAME_ALREADY_INITIALIZED", "当前对局已经完成初始化");
      }
      if (!isSupportedRuleset(command.payload.ruleset)) {
        return reject(
          "UNSUPPORTED_RULESET",
          "请求的规则集身份不受当前内核支持",
          {
            ruleset: command.payload.ruleset,
          },
        );
      }
      return {
        events: [
          {
            type: EVENT_TYPES.GAME_CREATED,
            payload: {
              ruleset: command.payload.ruleset,
              seed: command.payload.seed,
            },
          },
        ],
      };
    },
  }),
  ...BASIC_COMMAND_DEFINITIONS,
  ...NOMINATION_COMMAND_DEFINITIONS,
]);

export const BUILTIN_EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: EVENT_TYPES.GAME_CREATED,
    payloadSchema: payloadReference("gameCreatedPayload"),
    reduce: (state, event) => {
      if (state !== null)
        throw new Error("已初始化状态不能再次归约 game.created");
      return {
        schemaVersion: PROTOCOL_VERSION,
        gameId: event.gameId,
        ruleset: event.payload.ruleset,
        seed: event.payload.seed,
        revision: event.sequence,
        lifecycle: "preparing",
        phase: "setup",
        dayNumber: 0,
        nightNumber: 0,
        seats: [],
        executionToday: null,
        winner: null,
        nominationsToday: [],
        activeNomination: null,
        highestNominationVotes: 0,
        executionCandidate: null,
        exilesToday: [],
        activeExile: null,
      };
    },
  }),
  ...BASIC_EVENT_DEFINITIONS,
  ...NOMINATION_EVENT_DEFINITIONS,
]);
