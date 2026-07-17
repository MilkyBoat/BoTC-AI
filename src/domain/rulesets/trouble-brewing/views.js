import { cloneAndFreezeJson } from "../../protocol/immutable";
import { TROUBLE_BREWING_ROLE_BY_ID } from "./catalog";

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
  publicActions: state.troubleBrewing?.publicActions ?? [],
});

const informationForSeat = (state, seatId) =>
  (state.troubleBrewing?.information ?? []).filter(
    ({ content }) => content.recipientSeatId === seatId,
  );

export const createTroubleBrewingParticipantView = (state, principal) => {
  const common = publicState(state);
  if (["public", "observer"].includes(principal?.kind)) {
    return cloneAndFreezeJson({ viewType: principal.kind, ...common });
  }
  if (principal?.kind === "storyteller") {
    return cloneAndFreezeJson({
      viewType: "storyteller",
      ...common,
      seats: state.seats.map((seat) => ({ ...seat })),
      setup: state.troubleBrewing?.setup ?? null,
      information: state.troubleBrewing?.information ?? [],
      markers: state.troubleBrewing?.markers ?? [],
      registrationHistory: state.troubleBrewing?.registrationHistory ?? [],
      butlerViolations: state.troubleBrewing?.butlerViolations ?? [],
    });
  }
  if (principal?.kind !== "seat") {
    throw new Error("《暗流涌动》参与者视图主体类型无效");
  }
  const seat = state.seats.find(({ seatId }) => seatId === principal.seatId);
  if (!seat) throw new Error("《暗流涌动》参与者视图席位不存在");
  const perceivedRole = TROUBLE_BREWING_ROLE_BY_ID.get(seat.perceivedRoleId);
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
