import { TROUBLE_BREWING_EVENT_TYPES } from "./events";
import { resolveTroubleBrewingDeath } from "./rules";

export const roleSource = (roleId) => `zh-wiki-role-${roleId}`;

const sourcesForOutcome = (sourceRoleId, outcome) => {
  const sources = new Set([
    sourceRoleId ? roleSource(sourceRoleId) : "zh-wiki-glossary",
  ]);
  if (["soldier", "monk"].includes(outcome.preventedBy)) {
    sources.add(roleSource(outcome.preventedBy));
  }
  if (outcome.redirectedFromSeatId) sources.add(roleSource("mayor"));
  if (outcome.roleChange?.fromRoleId === "scarletwoman") {
    sources.add(roleSource("scarletwoman"));
  }
  return [...sources].sort();
};

export const buildDeathOutcomeEvents = (
  state,
  outcome,
  { basis, sourceRoleId = null, causeId, byExecution = false },
) => {
  const ruleSourceIds = sourcesForOutcome(sourceRoleId, outcome);
  if (!outcome.died) {
    return [
      {
        type: TROUBLE_BREWING_EVENT_TYPES.DEATH_PREVENTED,
        payload: {
          recordId: `death-prevented-${basis}`,
          targetSeatId: outcome.targetSeatId,
          causeId,
          preventedBy: outcome.preventedBy,
          ruleSourceIds,
        },
      },
    ];
  }
  const events = [];
  if (outcome.roleChange) {
    const newRoleInstanceId = `role-imp-${outcome.roleChange.seatId}-${
      state.revision + 1
    }`;
    events.push({
      type: TROUBLE_BREWING_EVENT_TYPES.ROLE_CHANGED,
      payload: {
        recordId: `role-change-${basis}`,
        seatId: outcome.roleChange.seatId,
        fromRoleId: outcome.roleChange.fromRoleId,
        toRoleId: outcome.roleChange.toRoleId,
        newRoleInstanceId,
        newAbilityInstance: {
          instanceId: `ability-${newRoleInstanceId}`,
          definitionId: "tb.imp.ability",
          ownerSeatId: outcome.roleChange.seatId,
          sourceRoleId: "tb.imp",
          sourceRoleInstanceId: newRoleInstanceId,
        },
        ruleSourceIds,
      },
    });
  }
  events.push({
    type: TROUBLE_BREWING_EVENT_TYPES.PLAYER_DIED,
    payload: {
      recordId: `death-${basis}`,
      targetSeatId: outcome.targetSeatId,
      causeId,
      sourceRoleId,
      byExecution,
      ruleSourceIds,
    },
  });
  if (outcome.winner) {
    events.push({
      type: TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
      payload: {
        ...outcome.winner,
        ruleSourceIds,
      },
    });
  }
  return events;
};

export const buildExecutionEvents = (
  state,
  targetSeatId,
  { basis, sourceRoleId = null, causeId = "execution" } = {},
) => {
  const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
  const died = target?.alive === true;
  const ruleSourceIds = ["zh-wiki-ability-execution"];
  const events = [
    {
      type: TROUBLE_BREWING_EVENT_TYPES.PLAYER_EXECUTED,
      payload: {
        recordId: `execution-${basis}`,
        targetSeatId,
        dayNumber: state.dayNumber,
        died,
        ruleSourceIds,
      },
    },
  ];
  if (!died) {
    events.push({
      type: TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
      payload: {
        targetSeatId,
        sourceEventId: basis,
        ruleSourceIds,
      },
    });
    return events;
  }
  const isSaint = target.actualRoleId === "saint";
  const outcome = resolveTroubleBrewingDeath(state, {
    targetSeatId,
    sourceRoleId,
    causeId,
    byExecution: !isSaint,
  });
  events.push(
    ...buildDeathOutcomeEvents(
      state,
      isSaint ? { ...outcome, winner: null } : outcome,
      {
        basis,
        sourceRoleId,
        causeId,
        byExecution: true,
      },
    ),
  );
  if (isSaint) {
    events.push({
      type: TROUBLE_BREWING_EVENT_TYPES.SAINT_EXECUTED,
      payload: {
        ownerSeatId: targetSeatId,
        sourceEventId: basis,
        ruleSourceIds: [roleSource("saint")],
      },
    });
  } else if (!outcome.winner) {
    events.push({
      type: TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
      payload: {
        targetSeatId,
        sourceEventId: basis,
        ruleSourceIds,
      },
    });
  }
  return events;
};
