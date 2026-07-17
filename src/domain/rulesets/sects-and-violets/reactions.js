import { EVENT_TYPES } from "../../protocol";
import { BASIC_RULE_SOURCES, determineBasicWinner } from "../../rules/basic";
import { SECTS_AND_VIOLETS_EVENT_TYPES } from "./events";
import {
  getNoDashiiPoisonedTownsfolk,
  isSectsAndVioletsRoleEffective,
  resolveEvilTwinOutcome,
  resolveWitchNomination,
} from "./rules";

const 信息 = (
  event,
  recipientSeatId,
  sourceRoleId,
  delivered,
  ruleSourceIds,
) => ({
  type: SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED,
  payload: {
    recordId: `snv-info-${event.eventId}-${recipientSeatId}-${sourceRoleId}`,
    recipientSeatId,
    sourceRoleId,
    truth: delivered,
    delivered,
    truthful: true,
    vortoxConstrained: false,
    ruleSourceIds,
  },
});

const setupReaction = Object.freeze({
  id: "snv.setup-information-reaction",
  priority: 10,
  eventTypes: [EVENT_TYPES.GAME_STARTED],
  react: ({ stateAfter: state, event }) => {
    if (!state.sectsAndViolets) return [];
    const candidates = [];
    const setup = state.sectsAndViolets.setup;
    const demons = state.seats.filter(
      ({ characterType }) => characterType === "demon",
    );
    const minions = state.seats.filter(
      ({ characterType }) => characterType === "minion",
    );
    if (state.seats.length >= 7) {
      minions.forEach((current) =>
        candidates.push(
          信息(
            event,
            current.seatId,
            current.actualRoleId,
            {
              kind: "evil-recognition",
              demonSeatIds: demons.map(({ seatId }) => seatId),
            },
            ["zh-wiki-snv"],
          ),
        ),
      );
      demons.forEach((current) =>
        candidates.push(
          信息(
            event,
            current.seatId,
            current.actualRoleId,
            {
              kind: "demon-information",
              minionSeatIds: minions.map(({ seatId }) => seatId),
              demonBluffs: setup.demonBluffs,
            },
            ["zh-wiki-snv"],
          ),
        ),
      );
    }
    if (setup.evilTwinSeatId && setup.goodTwinSeatId) {
      const evilTwin = state.seats.find(
        ({ seatId }) => seatId === setup.evilTwinSeatId,
      );
      const goodTwin = state.seats.find(
        ({ seatId }) => seatId === setup.goodTwinSeatId,
      );
      candidates.push(
        信息(
          event,
          evilTwin.seatId,
          "eviltwin",
          {
            kind: "evil-twin-information",
            otherTwinSeatId: goodTwin.seatId,
            otherTwinRoleId: goodTwin.actualRoleId,
          },
          ["zh-wiki-role-eviltwin"],
        ),
        信息(
          event,
          goodTwin.seatId,
          "eviltwin",
          {
            kind: "good-twin-information",
            otherTwinSeatId: evilTwin.seatId,
            otherTwinRoleId: evilTwin.actualRoleId,
          },
          ["zh-wiki-role-eviltwin"],
        ),
      );
    }
    const noDashii = state.seats.find(
      ({ actualRoleId }) => actualRoleId === "nodashii",
    );
    if (noDashii) {
      candidates.push({
        type: SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
        payload: {
          recordId: `snv-marker-${event.eventId}-nodashii-poisoned`,
          markerType: "nodashii-poisoned",
          ownerSeatId: noDashii.seatId,
          targetSeatIds: getNoDashiiPoisonedTownsfolk(state, noDashii.seatId),
          active: true,
          persistent: true,
          ruleSourceIds: ["zh-wiki-role-nodashii"],
        },
      });
    }
    return candidates;
  },
});

const 死亡后触发 = Object.freeze({
  sage: SECTS_AND_VIOLETS_EVENT_TYPES.SAGE_AWAKENED,
  sweetheart: SECTS_AND_VIOLETS_EVENT_TYPES.SWEETHEART_TRIGGERED,
  barber: SECTS_AND_VIOLETS_EVENT_TYPES.BARBER_TRIGGERED,
  klutz: SECTS_AND_VIOLETS_EVENT_TYPES.KLUTZ_TRIGGERED,
});

const deathTriggerReaction = Object.freeze({
  id: "snv.death-trigger-reaction",
  priority: 20,
  eventTypes: [SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED],
  react: ({ stateAfter: state, event }) => {
    if (!event.payload.actuallyDied) return [];
    const target = state.seats.find(
      ({ seatId }) => seatId === event.payload.targetSeatId,
    );
    const type = 死亡后触发[target?.actualRoleId];
    if (!type) return [];
    if (
      target.actualRoleId === "sage" &&
      !/^snv\.(fanggu|vigormortis|nodashii|vortox)$/.test(event.payload.causeId)
    ) {
      return [];
    }
    return [
      {
        type,
        payload: {
          seatId: target.seatId,
          deathRecordId: event.payload.recordId,
          ruleSourceIds: [`zh-wiki-role-${target.actualRoleId}`],
        },
      },
    ];
  },
});

const deathWinnerReaction = Object.freeze({
  id: "snv.death-winner-reaction",
  priority: 25,
  eventTypes: [SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED],
  react: ({ stateAfter: state, event }) => {
    if (
      !event.payload.actuallyDied ||
      event.payload.causeId === "snv.pithag.demon-created-balance"
    ) {
      return [];
    }
    const setup = state.sectsAndViolets.setup;
    const evilTwin = state.seats.find(
      ({ seatId }) => seatId === setup.evilTwinSeatId,
    );
    const goodTwin = state.seats.find(
      ({ seatId }) => seatId === setup.goodTwinSeatId,
    );
    const twinOutcome = resolveEvilTwinOutcome({
      evilTwinAlive: evilTwin?.alive === true,
      goodTwinAlive: goodTwin?.alive === true,
      goodTwinExecuted:
        event.payload.causeId === "execution" &&
        event.payload.targetSeatId === setup.goodTwinSeatId,
    });
    const winner = twinOutcome.winner
      ? { alignment: "evil", reason: "evil-twin-good-twin-executed" }
      : determineBasicWinner(state.seats);
    const blocksGood = resolveEvilTwinOutcome({
      evilTwinAlive: evilTwin?.alive === true,
      goodTwinAlive: goodTwin?.alive === true,
      proposedWinner: winner?.alignment ?? null,
    }).preventGoodWin;
    if (!winner || blocksGood) return [];
    return [
      {
        type: SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
        payload: {
          alignment: winner.alignment,
          reason: winner.reason,
          ruleSourceIds: twinOutcome.winner
            ? ["zh-wiki-role-eviltwin"]
            : [BASIC_RULE_SOURCES.VICTORY],
        },
      },
    ];
  },
});

const witchNominationReaction = Object.freeze({
  id: "snv.witch-nomination-reaction",
  priority: 30,
  eventTypes: [EVENT_TYPES.NOMINATION_OPENED],
  react: ({ stateAfter: state, event }) => {
    const activeCurses = (state.sectsAndViolets?.markers ?? []).filter(
      ({ type, content }) => type === "witch-cursed" && content.active,
    );
    const curse = activeCurses.at(-1);
    if (!curse) return [];
    const witchEffective = isSectsAndVioletsRoleEffective(
      state,
      curse.content.ownerSeatId,
      "witch",
      { allowDead: true },
    );
    const outcome = resolveWitchNomination({
      cursedSeatId: curse.content.targetSeatIds[0],
      nominatorSeatId: event.payload.nominatorSeatId,
      livingCount: state.seats.filter(({ alive }) => alive).length,
      witchEffective,
    });
    if (!outcome.dies) return [];
    return [
      {
        type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
        payload: {
          recordId: `death-${event.eventId}-witch`,
          targetSeatId: event.payload.nominatorSeatId,
          causeId: "snv.witch",
          actuallyDied: true,
          retainsAbilityAfterDeath: false,
          poisonedSeatIds: [],
          ruleSourceIds: ["zh-wiki-role-witch"],
        },
      },
    ];
  },
});

export const SECTS_AND_VIOLETS_EVENT_REACTIONS = Object.freeze([
  setupReaction,
  deathTriggerReaction,
  deathWinnerReaction,
  witchNominationReaction,
]);
