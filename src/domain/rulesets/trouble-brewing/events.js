const stableId = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};
const nullableStableId = { anyOf: [{ type: "null" }, stableId] };
const stableIdArray = {
  type: "array",
  uniqueItems: true,
  items: stableId,
};
const strictObject = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

export const TROUBLE_BREWING_EVENT_TYPES = Object.freeze({
  ACTION_RECORDED: "tb.action-recorded",
  BUTLER_VIOLATION_RECORDED: "tb.butler-violation-recorded",
  CONDITION_CHANGED: "tb.condition-changed",
  DEATH_PREVENTED: "tb.death-prevented",
  EXECUTION_COMPLETED: "tb.execution-completed",
  GAME_ENDED: "tb.game-ended",
  INFORMATION_DELIVERED: "tb.information-delivered",
  MARKER_CHANGED: "tb.marker-changed",
  PLAYER_DIED: "tb.player-died",
  PLAYER_EXECUTED: "tb.player-executed",
  RAVENKEEPER_AWAKENED: "tb.ravenkeeper-awakened",
  REGISTRATION_RECORDED: "tb.registration-recorded",
  ROLE_CHANGED: "tb.role-changed",
  SAINT_EXECUTED: "tb.saint-executed",
  SLAYER_ACTION_REQUESTED: "tb.slayer-action-requested",
  VIRGIN_NOMINATED: "tb.virgin-nominated",
});

export const TROUBLE_BREWING_EVENT_TYPE_LIST = Object.freeze(
  Object.values(TROUBLE_BREWING_EVENT_TYPES).sort(),
);

const sourceProperties = { ruleSourceIds: stableIdArray };
const record = (collection, payload, type = payload.type) => [
  ...collection.filter(({ recordId }) => recordId !== payload.recordId),
  {
    recordId: payload.recordId,
    type,
    content: Object.fromEntries(
      Object.entries(payload).filter(
        ([key]) => !["recordId", "ruleSourceIds", "type"].includes(key),
      ),
    ),
  },
];

const noStateChange = (state) => state;

export const TROUBLE_BREWING_EVENT_DEFINITIONS = Object.freeze(
  [
    {
      type: TROUBLE_BREWING_EVENT_TYPES.ACTION_RECORDED,
      payloadSchema: strictObject(
        [
          "recordId",
          "type",
          "actorSeatId",
          "targetSeatIds",
          "result",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          type: stableId,
          actorSeatId: stableId,
          targetSeatIds: stableIdArray,
          result: { type: "string", minLength: 1, maxLength: 128 },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          publicActions: record(
            state.troubleBrewing.publicActions,
            event.payload,
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.BUTLER_VIOLATION_RECORDED,
      payloadSchema: strictObject(
        [
          "recordId",
          "butlerSeatId",
          "masterSeatId",
          "nominationId",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          butlerSeatId: stableId,
          masterSeatId: stableId,
          nominationId: stableId,
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          butlerViolations: record(
            state.troubleBrewing.butlerViolations,
            event.payload,
            "butler-vote-violation",
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.CONDITION_CHANGED,
      payloadSchema: strictObject(
        ["endedConditionIds", "newCondition", "ruleSourceIds"],
        {
          endedConditionIds: stableIdArray,
          newCondition: {
            anyOf: [
              { type: "null" },
              strictObject(
                [
                  "conditionId",
                  "seatId",
                  "conditionType",
                  "sourceId",
                  "active",
                ],
                {
                  conditionId: stableId,
                  seatId: stableId,
                  conditionType: {
                    enum: ["drunk", "poisoned", "ability-disabled"],
                  },
                  sourceId: stableId,
                  sourceAbilityInstanceId: stableId,
                  active: { const: true },
                },
              ),
            ],
          },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => {
        const ended = new Set(event.payload.endedConditionIds);
        const abilityConditions = state.abilityConditions.map((condition) =>
          ended.has(condition.conditionId) && condition.status === "active"
            ? {
                ...condition,
                status: "cleared",
                completionReason: "cleared",
                completedAtRevision: event.sequence,
              }
            : condition,
        );
        if (event.payload.newCondition) {
          const condition = { ...event.payload.newCondition };
          delete condition.active;
          abilityConditions.push({
            ...condition,
            status: "active",
            completionReason: null,
            createdAtRevision: event.sequence,
            completedAtRevision: null,
          });
        }
        return { ...state, abilityConditions };
      },
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.DEATH_PREVENTED,
      payloadSchema: strictObject(
        ["recordId", "targetSeatId", "causeId", "preventedBy", "ruleSourceIds"],
        {
          recordId: stableId,
          targetSeatId: stableId,
          causeId: stableId,
          preventedBy: stableId,
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          deathHistory: record(
            state.troubleBrewing.deathHistory,
            event.payload,
            "death-prevented",
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
      payloadSchema: strictObject(["alignment", "reason", "ruleSourceIds"], {
        alignment: { enum: ["good", "evil"] },
        reason: {
          enum: [
            "all-demons-dead",
            "two-alive",
            "saint-executed",
            "mayor-three-alive-no-execution",
          ],
        },
        ...sourceProperties,
      }),
      reduce: (state, event) => ({
        ...state,
        lifecycle: "ended",
        phase: "ended",
        winner: {
          alignment: event.payload.alignment,
          reason: event.payload.reason,
          decidedAtRevision: event.sequence,
        },
        activeNomination: null,
        activeExile: null,
        nominationsToday: [],
        highestNominationVotes: 0,
        executionCandidate: null,
        exilesToday: [],
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
      payloadSchema: strictObject(
        ["targetSeatId", "sourceEventId", "ruleSourceIds"],
        {
          targetSeatId: stableId,
          sourceEventId: stableId,
          ...sourceProperties,
        },
      ),
      reduce: noStateChange,
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
      payloadSchema: strictObject(
        [
          "recordId",
          "recipientSeatId",
          "roleId",
          "kind",
          "content",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          recipientSeatId: stableId,
          roleId: stableId,
          kind: stableId,
          content: { type: "object" },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          information: record(
            state.troubleBrewing.information,
            event.payload,
            event.payload.kind,
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.MARKER_CHANGED,
      payloadSchema: strictObject(
        [
          "recordId",
          "markerType",
          "ownerSeatId",
          "targetSeatId",
          "active",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          markerType: stableId,
          ownerSeatId: stableId,
          targetSeatId: nullableStableId,
          active: { type: "boolean" },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          markers: record(
            state.troubleBrewing.markers,
            event.payload,
            event.payload.markerType,
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.PLAYER_DIED,
      payloadSchema: strictObject(
        [
          "recordId",
          "targetSeatId",
          "causeId",
          "sourceRoleId",
          "byExecution",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          targetSeatId: stableId,
          causeId: stableId,
          sourceRoleId: nullableStableId,
          byExecution: { type: "boolean" },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => {
        const target = state.seats.find(
          ({ seatId }) => seatId === event.payload.targetSeatId,
        );
        if (!target?.alive) throw new Error("死亡事件目标必须当前存活");
        return {
          ...state,
          seats: state.seats.map((seat) =>
            seat.seatId === target.seatId
              ? { ...seat, alive: false, deadVoteAvailable: true }
              : seat,
          ),
          troubleBrewing: {
            ...state.troubleBrewing,
            deathHistory: record(
              state.troubleBrewing.deathHistory,
              event.payload,
              "player-died",
            ),
          },
        };
      },
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.PLAYER_EXECUTED,
      payloadSchema: strictObject(
        ["recordId", "targetSeatId", "dayNumber", "died", "ruleSourceIds"],
        {
          recordId: stableId,
          targetSeatId: stableId,
          dayNumber: { type: "integer", minimum: 1 },
          died: { type: "boolean" },
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        activeNomination: null,
        executionCandidate: null,
        executionToday: {
          dayNumber: event.payload.dayNumber,
          seatId: event.payload.targetSeatId,
          died: event.payload.died,
        },
      }),
    },
    ...[
      TROUBLE_BREWING_EVENT_TYPES.RAVENKEEPER_AWAKENED,
      TROUBLE_BREWING_EVENT_TYPES.SAINT_EXECUTED,
      TROUBLE_BREWING_EVENT_TYPES.SLAYER_ACTION_REQUESTED,
      TROUBLE_BREWING_EVENT_TYPES.VIRGIN_NOMINATED,
    ].map((type) => ({
      type,
      payloadSchema: strictObject(
        ["ownerSeatId", "sourceEventId", "ruleSourceIds"],
        {
          ownerSeatId: stableId,
          sourceEventId: stableId,
          ...sourceProperties,
        },
      ),
      reduce: noStateChange,
    })),
    {
      type: TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
      payloadSchema: strictObject(
        [
          "recordId",
          "detectorRoleId",
          "targetSeatId",
          "registeredAs",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          detectorRoleId: stableId,
          targetSeatId: stableId,
          registeredAs: stableId,
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        troubleBrewing: {
          ...state.troubleBrewing,
          registrationHistory: record(
            state.troubleBrewing.registrationHistory,
            event.payload,
            "registration",
          ),
        },
      }),
    },
    {
      type: TROUBLE_BREWING_EVENT_TYPES.ROLE_CHANGED,
      payloadSchema: strictObject(
        [
          "recordId",
          "seatId",
          "fromRoleId",
          "toRoleId",
          "newRoleInstanceId",
          "newAbilityInstance",
          "ruleSourceIds",
        ],
        {
          recordId: stableId,
          seatId: stableId,
          fromRoleId: stableId,
          toRoleId: stableId,
          newRoleInstanceId: stableId,
          newAbilityInstance: strictObject(
            [
              "instanceId",
              "definitionId",
              "ownerSeatId",
              "sourceRoleId",
              "sourceRoleInstanceId",
            ],
            {
              instanceId: stableId,
              definitionId: stableId,
              ownerSeatId: stableId,
              sourceRoleId: stableId,
              sourceRoleInstanceId: stableId,
            },
          ),
          ...sourceProperties,
        },
      ),
      reduce: (state, event) => ({
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === event.payload.seatId
            ? {
                ...seat,
                actualRoleId: event.payload.toRoleId,
                perceivedRoleId: event.payload.toRoleId,
                characterType: "demon",
                alignment: "evil",
                roleInstanceId: event.payload.newRoleInstanceId,
              }
            : seat,
        ),
      }),
    },
  ].map(Object.freeze),
);
