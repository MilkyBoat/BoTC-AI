import { cloneAndFreezeJson } from "../../protocol/immutable";
import { BAD_MOON_RISING_ROLE_BY_ID } from "./catalog";

const 清理公开记录 = ({ recordId, type, content }) => ({
  recordId,
  type,
  content: Object.fromEntries(
    Object.entries(content).filter(
      ([key]) =>
        ![
          "ruleSourceIds",
          "sourceRoleId",
          "recipientSeatId",
          "abilityEffective",
        ].includes(key),
    ),
  ),
});

const publicState = (state) => ({
  gameId: state.gameId,
  lifecycle: state.lifecycle,
  phase: state.phase,
  dayNumber: state.dayNumber,
  nightNumber: state.nightNumber,
  winner: state.winner,
  seats: state.seats.map(({ seatId, order, alive, deadVoteAvailable }) => ({
    seatId,
    order,
    alive,
    deadVoteAvailable,
  })),
  nominationsToday: state.nominationsToday,
  executionToday: state.executionToday,
  publicActions: (state.badMoonRising?.publicActions ?? []).map(清理公开记录),
});

const informationForSeat = (state, seatId) =>
  (state.badMoonRising?.information ?? [])
    .filter(({ content }) => content.recipientSeatId === seatId)
    .map(({ recordId, type, content }) => ({
      recordId,
      type,
      content: { result: content.result },
    }));

export const createBadMoonRisingParticipantView = (state, principal) => {
  const common = publicState(state);
  if (["public", "observer"].includes(principal?.kind)) {
    return cloneAndFreezeJson({ viewType: principal.kind, ...common });
  }
  if (principal?.kind === "storyteller") {
    return cloneAndFreezeJson({
      viewType: "storyteller",
      ...common,
      seats: state.seats.map((seat) => ({ ...seat })),
      setup: state.badMoonRising?.setup ?? null,
      information: state.badMoonRising?.information ?? [],
      markers: state.badMoonRising?.markers ?? [],
      deathHistory: state.badMoonRising?.deathHistory ?? [],
      resurrectionHistory: state.badMoonRising?.resurrectionHistory ?? [],
      adjudicationTasks: state.adjudicationTasks ?? [],
    });
  }
  if (principal?.kind !== "seat") {
    throw new Error("《黯月初升》参与者视图主体类型无效");
  }
  const seat = state.seats.find(({ seatId }) => seatId === principal.seatId);
  if (!seat) throw new Error("《黯月初升》参与者视图席位不存在");
  const perceivedRole = BAD_MOON_RISING_ROLE_BY_ID.get(seat.perceivedRoleId);
  return cloneAndFreezeJson({
    viewType: "seat",
    ...common,
    self: {
      seatId: seat.seatId,
      perceivedRoleId: seat.perceivedRoleId,
      perceivedAlignment: perceivedRole?.alignment ?? seat.alignment,
      information: informationForSeat(state, seat.seatId),
    },
  });
};
