export const PROTOCOL_VERSION = "0.2.0";
export const PROTOCOL_SCHEMA_ID =
  "https://botc-ai.local/schema/domain-protocol-v0.2.0.json";

export const COMMAND_TYPES = Object.freeze({
  GAME_CREATE: "game.create",
  GAME_START: "game.start",
  PHASE_ADVANCE: "phase.advance",
  PLAYER_KILL: "player.kill",
  PLAYER_REVIVE: "player.revive",
  EXECUTION_RESOLVE: "execution.resolve",
});

export const EVENT_TYPES = Object.freeze({
  GAME_CREATED: "game.created",
  GAME_STARTED: "game.started",
  PHASE_ADVANCED: "phase.advanced",
  PLAYER_DIED: "player.died",
  PLAYER_REVIVED: "player.revived",
  PLAYER_EXECUTED: "player.executed",
  GAME_ENDED: "game.ended",
});
