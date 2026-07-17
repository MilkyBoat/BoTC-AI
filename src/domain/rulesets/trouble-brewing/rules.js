import { TROUBLE_BREWING_ROLE_BY_ID } from "./catalog";

const findSeat = (state, seatId) =>
  state?.seats.find(({ seatId: id }) => id === seatId) ?? null;

const activeConditions = (state, seatId) =>
  (state?.abilityConditions ?? []).filter(
    (condition) => condition.seatId === seatId && condition.status === "active",
  );

const isIntoxicated = (state, seatId) =>
  activeConditions(state, seatId).some(({ conditionType }) =>
    ["drunk", "poisoned", "ability-disabled"].includes(conditionType),
  );

export const isTroubleBrewingRoleEffective = (
  state,
  seatId,
  roleId,
  { allowDead = false } = {},
) => {
  const seat = findSeat(state, seatId);
  return Boolean(
    seat &&
      roleId !== "drunk" &&
      seat.actualRoleId === roleId &&
      (seat.alive || allowDead) &&
      !isIntoxicated(state, seatId),
  );
};

export const getNearestLivingNeighbors = (state, seatId) => {
  const seats = state.seats
    .slice()
    .sort((left, right) => left.order - right.order);
  const originIndex = seats.findIndex(({ seatId: id }) => id === seatId);
  if (originIndex < 0) return [];
  const neighbors = [];
  for (const direction of [-1, 1]) {
    for (let distance = 1; distance < seats.length; distance += 1) {
      const index =
        (originIndex + direction * distance + seats.length) % seats.length;
      if (seats[index].alive) {
        if (!neighbors.includes(seats[index].seatId)) {
          neighbors.push(seats[index].seatId);
        }
        break;
      }
    }
  }
  return neighbors;
};

const registrationValue = (seat, registrations, kind) => {
  const selected = registrations?.[seat.seatId];
  if (selected !== undefined) return selected === kind;
  if (kind === "evil") return seat.alignment === "evil";
  if (kind === "demon") return seat.characterType === "demon";
  return seat.characterType === kind;
};

const seatRegistersAsRole = (seat, registrations, roleId) => {
  const selected = registrations?.[seat.seatId];
  if (selected !== undefined) return selected === roleId;
  return seat.actualRoleId === roleId;
};

export const validatePairInformation = (
  state,
  { roleId, shownRoleId = null, seatIds = [], registrations = {} },
) => {
  const expectedType = {
    washerwoman: "townsfolk",
    librarian: "outsider",
    investigator: "minion",
  }[roleId];
  const shownRole = TROUBLE_BREWING_ROLE_BY_ID.get(shownRoleId);
  if (!expectedType) return false;
  if (shownRoleId === null) {
    if (roleId === "washerwoman" || seatIds.length !== 0) return false;
    return !state.seats.some((seat) =>
      registrationValue(seat, registrations, expectedType),
    );
  }
  if (
    shownRole?.characterType !== expectedType ||
    seatIds.length !== 2 ||
    new Set(seatIds).size !== 2
  ) {
    return false;
  }
  const seats = seatIds.map((seatId) => findSeat(state, seatId));
  return (
    seats.every(Boolean) &&
    seats.filter((seat) =>
      seatRegistersAsRole(seat, registrations, shownRoleId),
    ).length === 1
  );
};

export const validateRoleReveal = (
  state,
  { targetSeatId, shownRoleId, registrations = {} },
) => {
  const target = findSeat(state, targetSeatId);
  if (!target || !TROUBLE_BREWING_ROLE_BY_ID.has(shownRoleId)) return false;
  return seatRegistersAsRole(target, registrations, shownRoleId);
};

export const createSpyGrimoire = (state) => ({
  seats: state.seats.map(
    ({ seatId, order, alive, actualRoleId, perceivedRoleId, alignment }) => ({
      seatId,
      order,
      alive,
      actualRoleId,
      perceivedRoleId,
      alignment,
      conditions: activeConditions(state, seatId).map(
        ({ conditionType }) => conditionType,
      ),
    }),
  ),
  redHerringSeatId: state.troubleBrewing?.setup?.redHerringSeatId ?? null,
  demonBluffs: state.troubleBrewing?.setup?.demonBluffs ?? [],
});

export const countChefEvilPairs = (state, registrations = {}) => {
  const seats = state.seats
    .slice()
    .sort((left, right) => left.order - right.order);
  if (seats.length < 2) return 0;
  return seats.reduce((count, seat, index) => {
    const next = seats[(index + 1) % seats.length];
    return (
      count +
      (registrationValue(seat, registrations, "evil") &&
      registrationValue(next, registrations, "evil")
        ? 1
        : 0)
    );
  }, 0);
};

export const countEmpathEvilNeighbors = (state, seatId, registrations = {}) =>
  getNearestLivingNeighbors(state, seatId).filter((neighborSeatId) =>
    registrationValue(findSeat(state, neighborSeatId), registrations, "evil"),
  ).length;

export const resolveFortuneTellerAnswer = (
  state,
  targetSeatIds,
  registrations = {},
) => {
  const redHerringSeatId =
    state.troubleBrewing?.setup?.redHerringSeatId ?? null;
  return targetSeatIds.some((seatId) => {
    const seat = findSeat(state, seatId);
    return (
      seatId === redHerringSeatId ||
      (seat !== null && registrationValue(seat, registrations, "demon"))
    );
  });
};

export const canMonkProtect = (state, ownerSeatId, targetSeatId) =>
  ownerSeatId !== targetSeatId && findSeat(state, targetSeatId) !== null;

export const createPoisonTransition = (
  state,
  { poisonerSeatId, abilityInstanceId, targetSeatId },
) => {
  if (!isTroubleBrewingRoleEffective(state, poisonerSeatId, "poisoner")) {
    return { endedConditionIds: [], newCondition: null };
  }
  const target = findSeat(state, targetSeatId);
  if (!target) return { endedConditionIds: [], newCondition: null };
  return {
    endedConditionIds: (state.abilityConditions ?? [])
      .filter(
        (condition) =>
          condition.status === "active" &&
          condition.sourceAbilityInstanceId === abilityInstanceId &&
          condition.conditionType === "poisoned",
      )
      .map(({ conditionId }) => conditionId),
    newCondition: {
      conditionId: `condition-poison-${abilityInstanceId}-${state.nightNumber}`,
      seatId: targetSeatId,
      conditionType: "poisoned",
      sourceId: "tb.poisoner",
      sourceAbilityInstanceId: abilityInstanceId,
      active: true,
    },
  };
};

const activeMonkProtection = (state, targetSeatId) =>
  (state.ongoingAbilityEffects ?? []).some(
    (effect) =>
      effect.status === "active" &&
      effect.effectType === "tb.monk-protection" &&
      effect.targetIds.includes(targetSeatId) &&
      isTroubleBrewingRoleEffective(
        state,
        findSeat(
          state,
          state.abilityInstances.find(
            ({ instanceId }) => instanceId === effect.abilityInstanceId,
          )?.ownerSeatId,
        )?.seatId,
        "monk",
      ),
  );

const getImpHarmPrevention = (state, targetSeatId) => {
  const target = findSeat(state, targetSeatId);
  if (!target?.alive) return "already-dead";
  if (activeMonkProtection(state, targetSeatId)) return "monk";
  if (isTroubleBrewingRoleEffective(state, targetSeatId, "soldier")) {
    return "soldier";
  }
  return null;
};

export const canImpHarmSeat = (state, targetSeatId) =>
  getImpHarmPrevention(state, targetSeatId) === null;

const livingNonTravelers = (state) =>
  state.seats.filter(
    ({ alive, characterType }) => alive && characterType !== "traveler",
  );

export const findImpSuccessorCandidates = (state, dyingImpSeatId) => {
  const scarlet = state.seats.find(
    (seat) =>
      seat.seatId !== dyingImpSeatId &&
      seat.characterType === "minion" &&
      isTroubleBrewingRoleEffective(state, seat.seatId, "scarletwoman"),
  );
  if (scarlet && livingNonTravelers(state).length >= 5) {
    return [scarlet.seatId];
  }
  return state.seats
    .filter(
      (seat) =>
        seat.seatId !== dyingImpSeatId &&
        seat.alive &&
        seat.characterType === "minion",
    )
    .map(({ seatId }) => seatId);
};

export const resolveTroubleBrewingDeath = (
  state,
  {
    targetSeatId,
    sourceRoleId = null,
    sourceSeatId = null,
    causeId,
    byExecution = false,
    redirectSeatId = null,
    successorSeatId = null,
  },
) => {
  const target = findSeat(state, targetSeatId);
  if (!target?.alive) {
    return { died: false, preventedBy: "already-dead", targetSeatId };
  }
  if (sourceRoleId === "imp") {
    const prevention = getImpHarmPrevention(state, targetSeatId);
    if (prevention !== null) {
      return {
        died: false,
        preventedBy: prevention,
        targetSeatId,
      };
    }
    if (
      target.actualRoleId === "mayor" &&
      isTroubleBrewingRoleEffective(state, targetSeatId, "mayor") &&
      redirectSeatId !== null
    ) {
      if (redirectSeatId === targetSeatId || !findSeat(state, redirectSeatId)) {
        return {
          died: false,
          preventedBy: "invalid-mayor-redirect",
          targetSeatId,
        };
      }
      return {
        ...resolveTroubleBrewingDeath(state, {
          targetSeatId: redirectSeatId,
          sourceRoleId,
          sourceSeatId,
          causeId,
        }),
        redirectedFromSeatId: targetSeatId,
      };
    }
  }

  const result = {
    died: true,
    targetSeatId,
    causeId,
    byExecution,
    roleChange: null,
    winner: null,
  };
  if (
    byExecution &&
    isTroubleBrewingRoleEffective(state, targetSeatId, "saint")
  ) {
    result.winner = {
      alignment: target.alignment === "good" ? "evil" : "good",
      reason: "saint-executed",
    };
    return result;
  }

  if (target.characterType === "demon") {
    const selfKill = sourceRoleId === "imp" && sourceSeatId === targetSeatId;
    const candidates = findImpSuccessorCandidates(state, targetSeatId);
    if (selfKill && candidates.length > 0) {
      const selected =
        successorSeatId ?? (candidates.length === 1 ? candidates[0] : null);
      if (!selected || !candidates.includes(selected)) {
        return {
          died: false,
          targetSeatId,
          preventedBy: "successor-adjudication-required",
          successorCandidateSeatIds: candidates,
        };
      }
      result.roleChange = {
        seatId: selected,
        fromRoleId: findSeat(state, selected).actualRoleId,
        toRoleId: "imp",
      };
    } else {
      const scarlet =
        candidates.length === 1 &&
        findSeat(state, candidates[0])?.actualRoleId === "scarletwoman"
          ? candidates[0]
          : null;
      if (!selfKill && scarlet !== null) {
        result.roleChange = {
          seatId: scarlet,
          fromRoleId: "scarletwoman",
          toRoleId: "imp",
        };
      } else {
        result.winner = { alignment: "good", reason: "all-demons-dead" };
      }
    }
  }
  if (!result.winner && !result.roleChange) {
    const livingAfter = livingNonTravelers(state).filter(
      ({ seatId }) => seatId !== targetSeatId,
    );
    if (livingAfter.length <= 2) {
      result.winner = { alignment: "evil", reason: "two-alive" };
    }
  }
  return result;
};

export const resolveSlayerShot = (
  state,
  { slayerSeatId, targetSeatId, registeredAs = null },
) => {
  if (!isTroubleBrewingRoleEffective(state, slayerSeatId, "slayer")) {
    return { used: true, died: false, targetSeatId, suppressed: true };
  }
  const target = findSeat(state, targetSeatId);
  const registersDemon =
    target?.characterType === "demon" ||
    (target?.actualRoleId === "recluse" && registeredAs === "demon");
  if (!target?.alive || !registersDemon) {
    return { used: true, died: false, targetSeatId, suppressed: false };
  }
  const death = resolveTroubleBrewingDeath(state, {
    targetSeatId,
    sourceRoleId: "slayer",
    sourceSeatId: slayerSeatId,
    causeId: "tb.slayer",
  });
  if (target.actualRoleId === "recluse") death.winner = null;
  return { used: true, suppressed: false, ...death };
};

export const virginExecutesNominator = (
  state,
  { virginSeatId, nominatorSeatId, nominatorRegisteredAs = null },
) => {
  if (!isTroubleBrewingRoleEffective(state, virginSeatId, "virgin")) {
    return false;
  }
  const nominator = findSeat(state, nominatorSeatId);
  return Boolean(
    nominator &&
      (nominator.characterType === "townsfolk" ||
        (nominator.actualRoleId === "spy" &&
          nominatorRegisteredAs === "townsfolk")),
  );
};

export const mayorWinsAtDayEnd = (state) =>
  livingNonTravelers(state).length === 3 &&
  state.executionToday === null &&
  state.seats.some(({ seatId }) =>
    isTroubleBrewingRoleEffective(state, seatId, "mayor"),
  );

export const checkButlerVoteViolation = (state, voteClosedPayload) => {
  const voters = new Set(voteClosedPayload.voterSeatIds);
  return (state.troubleBrewing?.markers ?? [])
    .map((marker) =>
      marker.content
        ? {
            markerType: marker.type,
            ...marker.content,
          }
        : marker,
    )
    .filter(
      ({ markerType, active }) => markerType === "butler-master" && active,
    )
    .filter(
      ({ ownerSeatId, targetSeatId }) =>
        isTroubleBrewingRoleEffective(state, ownerSeatId, "butler") &&
        voters.has(ownerSeatId) &&
        !voters.has(targetSeatId),
    )
    .map(({ ownerSeatId, targetSeatId }) => ({
      butlerSeatId: ownerSeatId,
      masterSeatId: targetSeatId,
      nominationId: voteClosedPayload.nominationId,
    }));
};

export const getRoleTruth = (state, seatId) => {
  const seat = findSeat(state, seatId);
  if (!seat) return null;
  const role = TROUBLE_BREWING_ROLE_BY_ID.get(seat.actualRoleId);
  return role
    ? {
        roleId: role.id,
        characterType: role.characterType,
        alignment: seat.alignment,
      }
    : null;
};
