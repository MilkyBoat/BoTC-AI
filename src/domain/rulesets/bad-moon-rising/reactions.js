import { EVENT_TYPES } from "../../protocol";
import { BAD_MOON_RISING_EVENT_TYPES } from "./events";

const 信息 = (event, recipientSeatId, sourceRoleId, result, ruleSourceIds) => ({
  type: BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED,
  payload: {
    recordId: `bmr-info-${event.eventId}-${recipientSeatId}-${sourceRoleId}`,
    recipientSeatId,
    sourceRoleId,
    result,
    ruleSourceIds,
  },
});

const setupReaction = Object.freeze({
  id: "bmr.setup-information-reaction",
  priority: 10,
  eventTypes: [EVENT_TYPES.GAME_STARTED],
  react: ({ stateAfter: state, event }) => {
    if (!state.badMoonRising) return [];
    const candidates = [];
    const setup = state.badMoonRising.setup;
    const demons = state.seats.filter(
      ({ characterType }) => characterType === "demon",
    );
    const minions = state.seats.filter(
      ({ characterType }) => characterType === "minion",
    );
    if (state.seats.length >= 7) {
      minions.forEach((seat) =>
        candidates.push(
          信息(
            event,
            seat.seatId,
            seat.actualRoleId,
            {
              kind: "evil-recognition",
              demonSeatIds: demons.map(({ seatId }) => seatId),
            },
            ["zh-wiki-bmr"],
          ),
        ),
      );
      demons.forEach((seat) =>
        candidates.push(
          信息(
            event,
            seat.seatId,
            seat.actualRoleId,
            {
              kind: "demon-information",
              minionSeatIds: minions.map(({ seatId }) => seatId),
              demonBluffs: setup.demonBluffs,
              lunaticSeatId: setup.lunaticSeatId,
            },
            ["zh-wiki-bmr"],
          ),
        ),
      );
    }
    const lunatic = state.seats.find(
      ({ actualRoleId }) => actualRoleId === "lunatic",
    );
    if (lunatic) {
      candidates.push(
        信息(
          event,
          lunatic.seatId,
          "lunatic",
          {
            kind: "lunatic-information",
            perceivedDemonRoleId: lunatic.perceivedRoleId,
            minionSeatIds: setup.lunaticMinionSeatIds,
            demonBluffs: setup.lunaticBluffs,
          },
          ["zh-wiki-role-lunatic"],
        ),
      );
    }
    const grandmother = state.seats.find(
      ({ actualRoleId }) => actualRoleId === "grandmother",
    );
    const grandchild = state.seats.find(
      ({ seatId }) => seatId === setup.grandchildSeatId,
    );
    if (grandmother && grandchild) {
      candidates.push(
        信息(
          event,
          grandmother.seatId,
          "grandmother",
          {
            kind: "grandchild-information",
            grandchildSeatId: grandchild.seatId,
            roleId: grandchild.actualRoleId,
          },
          ["zh-wiki-role-grandmother"],
        ),
      );
    }
    const godfather = state.seats.find(
      ({ actualRoleId }) => actualRoleId === "godfather",
    );
    if (godfather) {
      candidates.push(
        信息(
          event,
          godfather.seatId,
          "godfather",
          {
            kind: "outsider-information",
            roleIds: state.seats
              .filter(({ characterType }) => characterType === "outsider")
              .map(({ actualRoleId }) => actualRoleId),
          },
          ["zh-wiki-role-godfather"],
        ),
      );
    }
    return candidates;
  },
});

const markerExpiryReaction = Object.freeze({
  id: "bmr.marker-expiry-reaction",
  priority: 20,
  eventTypes: [EVENT_TYPES.PHASE_ADVANCED],
  react: ({ stateAfter: state }) =>
    (state.badMoonRising?.markers ?? [])
      .filter(
        ({ content }) =>
          content.active && content.remainingPhaseTransitions !== null,
      )
      .map(({ recordId, type, content }) => {
        const remaining = Math.max(0, content.remainingPhaseTransitions - 1);
        return {
          type: BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
          payload: {
            recordId,
            markerType: type,
            ownerSeatId: content.ownerSeatId,
            targetSeatIds: content.targetSeatIds,
            remainingPhaseTransitions: remaining,
            active: remaining > 0,
            ruleSourceIds: content.ruleSourceIds,
          },
        };
      }),
});

export const BAD_MOON_RISING_EVENT_REACTIONS = Object.freeze([
  setupReaction,
  markerExpiryReaction,
]);
