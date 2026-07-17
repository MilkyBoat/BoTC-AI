import { ROLE_ABILITY_EVENT_TYPES } from "../../abilities";
import { EVENT_TYPES } from "../../protocol";
import { BASIC_RULE_SOURCES } from "../../rules/basic";
import { TROUBLE_BREWING_EVENT_TYPES } from "./events";
import { checkButlerVoteViolation } from "./rules";
import { roleSource } from "./resolution";

const setupReaction = {
  id: "tb.setup-reaction",
  priority: 10,
  eventTypes: [EVENT_TYPES.GAME_STARTED],
  react: ({ stateAfter: state, event }) => {
    if (!state.troubleBrewing) return [];
    const candidates = state.seats
      .filter(({ actualRoleId }) => actualRoleId === "drunk")
      .map((seat) => ({
        type: TROUBLE_BREWING_EVENT_TYPES.CONDITION_CHANGED,
        payload: {
          endedConditionIds: [],
          newCondition: {
            conditionId: `condition-drunk-${seat.roleInstanceId}`,
            seatId: seat.seatId,
            conditionType: "drunk",
            sourceId: "tb.drunk",
            active: true,
          },
          ruleSourceIds: [roleSource("drunk")],
        },
      }));
    if (state.seats.length >= 7) {
      const demons = state.seats.filter(
        ({ characterType }) => characterType === "demon",
      );
      const minions = state.seats.filter(
        ({ characterType }) => characterType === "minion",
      );
      minions.forEach((seat) =>
        candidates.push({
          type: TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
          payload: {
            recordId: `evil-recognition-${event.eventId}-${seat.seatId}`,
            recipientSeatId: seat.seatId,
            roleId: seat.actualRoleId,
            kind: "evil-recognition",
            content: { demonSeatIds: demons.map(({ seatId }) => seatId) },
            ruleSourceIds: ["zh-wiki-tb"],
          },
        }),
      );
      demons.forEach((seat) =>
        candidates.push({
          type: TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
          payload: {
            recordId: `demon-information-${event.eventId}-${seat.seatId}`,
            recipientSeatId: seat.seatId,
            roleId: seat.actualRoleId,
            kind: "demon-information",
            content: {
              minionSeatIds: minions.map(({ seatId }) => seatId),
              demonBluffs: state.troubleBrewing.setup.demonBluffs,
            },
            ruleSourceIds: ["zh-wiki-tb"],
          },
        }),
      );
    }
    return candidates;
  },
};

const phaseReaction = {
  id: "tb.phase-reaction",
  priority: 10,
  eventTypes: [
    EVENT_TYPES.PHASE_ADVANCED,
    TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
  ],
  react: ({ stateAfter: state, event }) => {
    if (!state.troubleBrewing) return [];
    if (event.type === TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED) {
      return [
        {
          type: EVENT_TYPES.PHASE_ADVANCED,
          payload: {
            from: "day",
            to: "night",
            dayNumber: state.dayNumber,
            nightNumber: state.nightNumber + 1,
            reason: "execution",
            ruleSourceId: BASIC_RULE_SOURCES.EXECUTION,
          },
        },
      ];
    }
    if (event.payload.to !== "night") return [];
    const endedConditionIds = state.abilityConditions
      .filter(
        ({ status, conditionType, sourceId }) =>
          status === "active" &&
          conditionType === "poisoned" &&
          sourceId === "tb.poisoner",
      )
      .map(({ conditionId }) => conditionId);
    return endedConditionIds.length === 0
      ? []
      : [
          {
            type: TROUBLE_BREWING_EVENT_TYPES.CONDITION_CHANGED,
            payload: {
              endedConditionIds,
              newCondition: null,
              ruleSourceIds: [roleSource("poisoner")],
            },
          },
        ];
  },
};

const nominationReaction = {
  id: "tb.virgin-nomination-reaction",
  priority: 20,
  eventTypes: [EVENT_TYPES.NOMINATION_OPENED],
  react: ({ stateAfter: state, event }) => {
    const nominee = state.seats.find(
      ({ seatId }) => seatId === event.payload.nomineeSeatId,
    );
    return nominee?.actualRoleId === "virgin"
      ? [
          {
            type: TROUBLE_BREWING_EVENT_TYPES.VIRGIN_NOMINATED,
            payload: {
              ownerSeatId: nominee.seatId,
              sourceEventId: event.eventId,
              ruleSourceIds: [roleSource("virgin")],
            },
          },
        ]
      : [];
  },
};

const deathReaction = {
  id: "tb.ravenkeeper-death-reaction",
  priority: 20,
  eventTypes: [TROUBLE_BREWING_EVENT_TYPES.PLAYER_DIED],
  react: ({ stateBefore, event }) => {
    const target = stateBefore.seats.find(
      ({ seatId }) => seatId === event.payload.targetSeatId,
    );
    return target?.actualRoleId === "ravenkeeper" &&
      stateBefore.phase === "night"
      ? [
          {
            type: TROUBLE_BREWING_EVENT_TYPES.RAVENKEEPER_AWAKENED,
            payload: {
              ownerSeatId: target.seatId,
              sourceEventId: event.eventId,
              ruleSourceIds: [roleSource("ravenkeeper")],
            },
          },
        ]
      : [];
  },
};

const roleChangeReaction = {
  id: "tb.role-change-reaction",
  priority: 20,
  eventTypes: [TROUBLE_BREWING_EVENT_TYPES.ROLE_CHANGED],
  react: ({ stateBefore, event }) => [
    {
      type: ROLE_ABILITY_EVENT_TYPES.INSTANCES_REPLACED,
      payload: {
        seatId: event.payload.seatId,
        sourceRoleInstanceId: event.payload.newRoleInstanceId,
        reason: "character-change",
        endedInstanceIds: stateBefore.abilityInstances
          .filter(
            ({ ownerSeatId, status }) =>
              ownerSeatId === event.payload.seatId && status === "active",
          )
          .map(({ instanceId }) => instanceId),
        newInstances: [event.payload.newAbilityInstance],
      },
    },
  ],
};

const butlerReaction = {
  id: "tb.butler-vote-reaction",
  priority: 20,
  eventTypes: [EVENT_TYPES.VOTE_CLOSED],
  react: ({ stateAfter: state, event }) =>
    checkButlerVoteViolation(state, event.payload).map((violation) => ({
      type: TROUBLE_BREWING_EVENT_TYPES.BUTLER_VIOLATION_RECORDED,
      payload: {
        recordId: `butler-violation-${event.eventId}-${violation.butlerSeatId}`,
        ...violation,
        ruleSourceIds: [roleSource("butler")],
      },
    })),
};

export const TROUBLE_BREWING_EVENT_REACTIONS = Object.freeze(
  [
    setupReaction,
    phaseReaction,
    nominationReaction,
    deathReaction,
    roleChangeReaction,
    butlerReaction,
  ].map(Object.freeze),
);
