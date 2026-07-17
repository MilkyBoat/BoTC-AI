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

const positiveInteger = {
  type: "integer",
  minimum: 1,
  maximum: Number.MAX_SAFE_INTEGER,
};
const nonNegativeInteger = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
};
const seatIds = {
  type: "array",
  items: stableId,
  uniqueItems: true,
};
const nullableSeatId = { anyOf: [{ type: "null" }, stableId] };

const nominationOpenedSourcePayload = strictObject(
  [
    "nominationId",
    "dayNumber",
    "nominatorSeatId",
    "nomineeSeatId",
    "ruleSourceId",
  ],
  {
    nominationId: stableId,
    dayNumber: positiveInteger,
    nominatorSeatId: stableId,
    nomineeSeatId: stableId,
    ruleSourceId: stableId,
  },
);
const nominationOpenedViewPayload = strictObject(
  ["nominationId", "dayNumber", "nominatorSeatId", "nomineeSeatId"],
  {
    nominationId: stableId,
    dayNumber: positiveInteger,
    nominatorSeatId: stableId,
    nomineeSeatId: stableId,
  },
);

const voteOpenedSourcePayload = strictObject(
  ["nominationId", "nomineeSeatId", "votingOrder", "threshold", "ruleSourceId"],
  {
    nominationId: stableId,
    nomineeSeatId: stableId,
    votingOrder: { ...seatIds, minItems: 1 },
    threshold: positiveInteger,
    ruleSourceId: stableId,
  },
);
const voteOpenedViewPayload = strictObject(
  ["nominationId", "nomineeSeatId", "votingOrder", "threshold"],
  {
    nominationId: stableId,
    nomineeSeatId: stableId,
    votingOrder: { ...seatIds, minItems: 1 },
    threshold: positiveInteger,
  },
);

const voteRecordedSourcePayload = strictObject(
  ["nominationId", "voterSeatId", "support", "usedDeadVote", "ruleSourceId"],
  {
    nominationId: stableId,
    voterSeatId: stableId,
    support: { type: "boolean" },
    usedDeadVote: { type: "boolean" },
    ruleSourceId: stableId,
  },
);
const voteRecordedViewPayload = strictObject(
  ["nominationId", "voterSeatId", "support", "usedDeadVote"],
  {
    nominationId: stableId,
    voterSeatId: stableId,
    support: { type: "boolean" },
    usedDeadVote: { type: "boolean" },
  },
);

const nominationResult = {
  enum: ["not-enough", "candidate", "tie", "lower"],
};
const voteClosedSourcePayload = strictObject(
  [
    "nominationId",
    "nomineeSeatId",
    "total",
    "threshold",
    "voterSeatIds",
    "result",
    "highestVotes",
    "executionCandidateSeatId",
    "ruleSourceId",
  ],
  {
    nominationId: stableId,
    nomineeSeatId: stableId,
    total: nonNegativeInteger,
    threshold: positiveInteger,
    voterSeatIds: seatIds,
    result: nominationResult,
    highestVotes: nonNegativeInteger,
    executionCandidateSeatId: nullableSeatId,
    ruleSourceId: stableId,
  },
);
const voteClosedViewProperties = {
  nominationId: stableId,
  nomineeSeatId: stableId,
  total: nonNegativeInteger,
  threshold: positiveInteger,
  result: nominationResult,
  highestVotes: nonNegativeInteger,
  executionCandidateSeatId: nullableSeatId,
};
const voteClosedViewPayload = strictObject(
  [...Object.keys(voteClosedViewProperties), "voterSeatIds"],
  { ...voteClosedViewProperties, voterSeatIds: seatIds },
);
const observerVoteClosedPayload = strictObject(
  Object.keys(voteClosedViewProperties),
  voteClosedViewProperties,
);

const exileOpenedSourcePayload = strictObject(
  ["exileId", "dayNumber", "proposerSeatId", "travelerSeatId", "ruleSourceId"],
  {
    exileId: stableId,
    dayNumber: positiveInteger,
    proposerSeatId: stableId,
    travelerSeatId: stableId,
    ruleSourceId: stableId,
  },
);
const exileOpenedViewPayload = strictObject(
  ["exileId", "dayNumber", "proposerSeatId", "travelerSeatId"],
  {
    exileId: stableId,
    dayNumber: positiveInteger,
    proposerSeatId: stableId,
    travelerSeatId: stableId,
  },
);
const exileSupportSourcePayload = strictObject(
  ["exileId", "supporterSeatId", "support", "ruleSourceId"],
  {
    exileId: stableId,
    supporterSeatId: stableId,
    support: { type: "boolean" },
    ruleSourceId: stableId,
  },
);
const exileSupportViewPayload = strictObject(
  ["exileId", "supporterSeatId", "support"],
  {
    exileId: stableId,
    supporterSeatId: stableId,
    support: { type: "boolean" },
  },
);
const exileClosedSourcePayload = strictObject(
  [
    "exileId",
    "travelerSeatId",
    "total",
    "threshold",
    "supporterSeatIds",
    "succeeded",
    "ruleSourceId",
  ],
  {
    exileId: stableId,
    travelerSeatId: stableId,
    total: nonNegativeInteger,
    threshold: positiveInteger,
    supporterSeatIds: seatIds,
    succeeded: { type: "boolean" },
    ruleSourceId: stableId,
  },
);
const exileClosedViewProperties = {
  exileId: stableId,
  travelerSeatId: stableId,
  total: nonNegativeInteger,
  threshold: positiveInteger,
  succeeded: { type: "boolean" },
};
const exileClosedViewPayload = strictObject(
  [...Object.keys(exileClosedViewProperties), "supporterSeatIds"],
  { ...exileClosedViewProperties, supporterSeatIds: seatIds },
);
const observerExileClosedPayload = strictObject(
  Object.keys(exileClosedViewProperties),
  exileClosedViewProperties,
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
    type: "nomination.opened",
    payloadSchema: nominationOpenedSourcePayload,
    outputDefinitions: [
      { type: "nomination.opened", payloadSchema: nominationOpenedViewPayload },
    ],
    project: ({ event }) => ({
      type: "nomination.opened",
      payload: {
        nominationId: event.payload.nominationId,
        dayNumber: event.payload.dayNumber,
        nominatorSeatId: event.payload.nominatorSeatId,
        nomineeSeatId: event.payload.nomineeSeatId,
      },
    }),
  },
  {
    type: "vote.opened",
    payloadSchema: voteOpenedSourcePayload,
    outputDefinitions: [
      { type: "vote.opened", payloadSchema: voteOpenedViewPayload },
    ],
    project: ({ event }) => ({
      type: "vote.opened",
      payload: {
        nominationId: event.payload.nominationId,
        nomineeSeatId: event.payload.nomineeSeatId,
        votingOrder: event.payload.votingOrder,
        threshold: event.payload.threshold,
      },
    }),
  },
  {
    type: "vote.recorded",
    payloadSchema: voteRecordedSourcePayload,
    outputDefinitions: [
      { type: "vote.recorded", payloadSchema: voteRecordedViewPayload },
    ],
    project: ({ source, event, principal }) => {
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includeVoteDetails
      ) {
        return null;
      }
      return {
        type: "vote.recorded",
        payload: {
          nominationId: event.payload.nominationId,
          voterSeatId: event.payload.voterSeatId,
          support: event.payload.support,
          usedDeadVote: event.payload.usedDeadVote,
        },
      };
    },
  },
  {
    type: "vote.closed",
    payloadSchema: voteClosedSourcePayload,
    outputDefinitions: [
      { type: "vote.closed", payloadSchema: voteClosedViewPayload },
      {
        type: "observer.vote-closed",
        payloadSchema: observerVoteClosedPayload,
      },
    ],
    project: ({ source, event, principal }) => {
      const payload = {
        nominationId: event.payload.nominationId,
        nomineeSeatId: event.payload.nomineeSeatId,
        total: event.payload.total,
        threshold: event.payload.threshold,
        result: event.payload.result,
        highestVotes: event.payload.highestVotes,
        executionCandidateSeatId: event.payload.executionCandidateSeatId,
      };
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includeVoteDetails
      ) {
        return { type: "observer.vote-closed", payload };
      }
      return {
        type: "vote.closed",
        payload: { ...payload, voterSeatIds: event.payload.voterSeatIds },
      };
    },
  },
  {
    type: "exile.opened",
    payloadSchema: exileOpenedSourcePayload,
    outputDefinitions: [
      { type: "exile.opened", payloadSchema: exileOpenedViewPayload },
    ],
    project: ({ event }) => ({
      type: "exile.opened",
      payload: {
        exileId: event.payload.exileId,
        dayNumber: event.payload.dayNumber,
        proposerSeatId: event.payload.proposerSeatId,
        travelerSeatId: event.payload.travelerSeatId,
      },
    }),
  },
  {
    type: "exile.support-set",
    payloadSchema: exileSupportSourcePayload,
    outputDefinitions: [
      { type: "exile.support-set", payloadSchema: exileSupportViewPayload },
    ],
    project: ({ source, event, principal }) => {
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includeVoteDetails
      ) {
        return null;
      }
      return {
        type: "exile.support-set",
        payload: {
          exileId: event.payload.exileId,
          supporterSeatId: event.payload.supporterSeatId,
          support: event.payload.support,
        },
      };
    },
  },
  {
    type: "exile.closed",
    payloadSchema: exileClosedSourcePayload,
    outputDefinitions: [
      { type: "exile.closed", payloadSchema: exileClosedViewPayload },
      {
        type: "observer.exile-closed",
        payloadSchema: observerExileClosedPayload,
      },
    ],
    project: ({ source, event, principal }) => {
      const payload = {
        exileId: event.payload.exileId,
        travelerSeatId: event.payload.travelerSeatId,
        total: event.payload.total,
        threshold: event.payload.threshold,
        succeeded: event.payload.succeeded,
      };
      if (
        principal.kind === "observer" &&
        !source.observerPolicy.includeVoteDetails
      ) {
        return { type: "observer.exile-closed", payload };
      }
      return {
        type: "exile.closed",
        payload: {
          ...payload,
          supporterSeatIds: event.payload.supporterSeatIds,
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
