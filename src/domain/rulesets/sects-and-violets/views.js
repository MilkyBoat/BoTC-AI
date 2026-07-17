import { cloneAndFreezeJson } from "../../protocol/immutable";
import { SECTS_AND_VIOLETS_ROLE_BY_ID } from "./catalog";

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
          "truth",
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
  publicActions: (state.sectsAndViolets?.publicActions ?? []).map(清理公开记录),
});

const informationForSeat = (state, seatId) =>
  (state.sectsAndViolets?.information ?? [])
    .filter(({ content }) => content.recipientSeatId === seatId)
    .map(({ recordId, type, content }) => ({
      recordId,
      type,
      content: { delivered: content.delivered },
    }));

export const createSectsAndVioletsParticipantView = (state, principal) => {
  const common = publicState(state);
  if (["public", "observer"].includes(principal?.kind)) {
    return cloneAndFreezeJson({ viewType: principal.kind, ...common });
  }
  if (principal?.kind === "storyteller") {
    return cloneAndFreezeJson({
      viewType: "storyteller",
      ...common,
      seats: state.seats.map((seat) => ({ ...seat })),
      setup: state.sectsAndViolets?.setup ?? null,
      information: state.sectsAndViolets?.information ?? [],
      markers: state.sectsAndViolets?.markers ?? [],
      abilityAbnormalities: state.sectsAndViolets?.abilityAbnormalities ?? [],
      characterChanges: state.sectsAndViolets?.characterChanges ?? [],
      deathHistory: state.sectsAndViolets?.deathHistory ?? [],
      madnessRulings: state.sectsAndViolets?.madnessRulings ?? [],
      adjudicationTasks: state.adjudicationTasks ?? [],
    });
  }
  if (principal?.kind !== "seat") {
    throw new Error("《梦殒春宵》参与者视图主体类型无效");
  }
  const current = state.seats.find(({ seatId }) => seatId === principal.seatId);
  if (!current) throw new Error("《梦殒春宵》参与者视图席位不存在");
  const perceivedRole = SECTS_AND_VIOLETS_ROLE_BY_ID.get(
    current.perceivedRoleId,
  );
  return cloneAndFreezeJson({
    viewType: "seat",
    ...common,
    self: {
      seatId: current.seatId,
      perceivedRoleId: current.perceivedRoleId,
      perceivedAlignment: perceivedRole?.alignment ?? current.alignment,
      information: informationForSeat(state, current.seatId),
    },
  });
};
