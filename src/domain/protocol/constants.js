export const PROTOCOL_VERSION = "0.6.0";
export const PROTOCOL_SCHEMA_ID =
  "https://botc-ai.local/schema/domain-protocol-v0.6.0.json";

export const COMMAND_TYPES = Object.freeze({
  GAME_CREATE: "game.create",
  GAME_START: "game.start",
  PHASE_ADVANCE: "phase.advance",
  PLAYER_KILL: "player.kill",
  PLAYER_REVIVE: "player.revive",
  EXECUTION_RESOLVE: "execution.resolve",
  NOMINATION_OPEN: "nomination.open",
  VOTE_OPEN: "vote.open",
  VOTE_RECORD: "vote.record",
  VOTE_CLOSE: "vote.close",
  EXILE_OPEN: "exile.open",
  EXILE_SUPPORT_SET: "exile.support.set",
  EXILE_CLOSE: "exile.close",
});

export const EVENT_TYPES = Object.freeze({
  GAME_CREATED: "game.created",
  GAME_STARTED: "game.started",
  PHASE_ADVANCED: "phase.advanced",
  PLAYER_DIED: "player.died",
  PLAYER_REVIVED: "player.revived",
  PLAYER_EXECUTED: "player.executed",
  GAME_ENDED: "game.ended",
  NOMINATION_OPENED: "nomination.opened",
  VOTE_OPENED: "vote.opened",
  VOTE_RECORDED: "vote.recorded",
  VOTE_CLOSED: "vote.closed",
  EXILE_OPENED: "exile.opened",
  EXILE_SUPPORT_SET: "exile.support-set",
  EXILE_CLOSED: "exile.closed",
});
