import { PROTOCOL_SCHEMA_ID } from "../protocol/constants";

const stableId = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};
const text = { type: "string", minLength: 1, maxLength: 4096 };
const ruleset = {
  $ref: `${PROTOCOL_SCHEMA_ID}#/definitions/rulesetIdentity`,
};

const strictObject = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

const gameReadyPayload = strictObject(["gameId", "ruleset"], {
  gameId: stableId,
  ruleset,
});

const announcementPayload = strictObject(["text"], { text });

const publicMessagePayload = strictObject(["senderSeatId", "text"], {
  senderSeatId: stableId,
  text,
});

const votePayload = strictObject(
  ["nomineeSeatId", "total", "threshold", "voterSeatIds"],
  {
    nomineeSeatId: stableId,
    total: { type: "integer", minimum: 0 },
    threshold: { type: "integer", minimum: 0 },
    voterSeatIds: {
      type: "array",
      items: stableId,
      uniqueItems: true,
    },
  },
);

const observerVotePayload = strictObject(
  ["nomineeSeatId", "total", "threshold"],
  {
    nomineeSeatId: stableId,
    total: { type: "integer", minimum: 0 },
    threshold: { type: "integer", minimum: 0 },
  },
);

const informationSourcePayload = strictObject(["seatId", "kind", "text"], {
  seatId: stableId,
  kind: {
    enum: ["role-information", "storyteller-message", "action-result"],
  },
  text,
});

const informationSeatPayload = strictObject(["kind", "text"], {
  kind: {
    enum: ["role-information", "storyteller-message", "action-result"],
  },
  text,
});

const adjudicationPayload = strictObject(["taskId", "kind", "summary"], {
  taskId: stableId,
  kind: stableId,
  summary: text,
});

const truthPayload = strictObject(["seatId", "roleId", "alignment"], {
  seatId: stableId,
  roleId: stableId,
  alignment: { enum: ["good", "evil"] },
});

const isStoryteller = (principal) => principal.kind === "storyteller";

export const BUILTIN_VIEW_EVENT_DEFINITIONS = Object.freeze([
  {
    type: "game.created",
    payloadSchema: strictObject(["seed", "ruleset"], {
      seed: stableId,
      ruleset,
    }),
    outputDefinitions: [
      { type: "game.ready", payloadSchema: gameReadyPayload },
    ],
    project: ({ source }) => ({
      type: "game.ready",
      payload: { gameId: source.game.gameId, ruleset: source.game.ruleset },
    }),
  },
  {
    type: "public.announcement-published",
    payloadSchema: announcementPayload,
    outputDefinitions: [
      { type: "announcement.published", payloadSchema: announcementPayload },
    ],
    project: ({ event }) => ({
      type: "announcement.published",
      payload: { text: event.payload.text },
    }),
  },
  {
    type: "public.message-posted",
    payloadSchema: publicMessagePayload,
    outputDefinitions: [
      { type: "public.message-posted", payloadSchema: publicMessagePayload },
    ],
    project: ({ source, event, principal }) => {
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includePublicMessages
      ) {
        return null;
      }
      return {
        type: "public.message-posted",
        payload: {
          senderSeatId: event.payload.senderSeatId,
          text: event.payload.text,
        },
      };
    },
  },
  {
    type: "public.vote-resolved",
    payloadSchema: votePayload,
    outputDefinitions: [
      { type: "public.vote-resolved", payloadSchema: votePayload },
      {
        type: "observer.vote-resolved",
        payloadSchema: observerVotePayload,
      },
    ],
    project: ({ source, event, principal }) => {
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includeVoteDetails
      ) {
        return {
          type: "observer.vote-resolved",
          payload: {
            nomineeSeatId: event.payload.nomineeSeatId,
            total: event.payload.total,
            threshold: event.payload.threshold,
          },
        };
      }
      return {
        type: "public.vote-resolved",
        payload: {
          nomineeSeatId: event.payload.nomineeSeatId,
          total: event.payload.total,
          threshold: event.payload.threshold,
          voterSeatIds: event.payload.voterSeatIds,
        },
      };
    },
  },
  {
    type: "seat.information-delivered",
    payloadSchema: informationSourcePayload,
    outputDefinitions: [
      {
        type: "seat.information-recorded",
        payloadSchema: informationSourcePayload,
      },
      {
        type: "seat.information-received",
        payloadSchema: informationSeatPayload,
      },
    ],
    project: ({ event, principal }) => {
      if (isStoryteller(principal)) {
        return {
          type: "seat.information-recorded",
          payload: {
            seatId: event.payload.seatId,
            kind: event.payload.kind,
            text: event.payload.text,
          },
        };
      }
      if (
        principal.kind !== "seat" ||
        principal.seatId !== event.payload.seatId
      ) {
        return null;
      }
      return {
        type: "seat.information-received",
        payload: { kind: event.payload.kind, text: event.payload.text },
      };
    },
  },
  {
    type: "storyteller.adjudication-requested",
    payloadSchema: adjudicationPayload,
    outputDefinitions: [
      {
        type: "storyteller.adjudication-requested",
        payloadSchema: adjudicationPayload,
      },
    ],
    project: ({ event, principal }) =>
      isStoryteller(principal)
        ? {
            type: "storyteller.adjudication-requested",
            payload: {
              taskId: event.payload.taskId,
              kind: event.payload.kind,
              summary: event.payload.summary,
            },
          }
        : null,
  },
  {
    type: "seat.truth-changed",
    payloadSchema: truthPayload,
    outputDefinitions: [
      { type: "seat.truth-updated", payloadSchema: truthPayload },
    ],
    project: ({ event, principal }) =>
      isStoryteller(principal)
        ? {
            type: "seat.truth-updated",
            payload: {
              seatId: event.payload.seatId,
              roleId: event.payload.roleId,
              alignment: event.payload.alignment,
            },
          }
        : null,
  },
]);
