import {
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "../../protocol";
import { createStartGameCommand } from "../../rules/basic";
import { BAD_MOON_RISING_ROLE_PACKAGE } from "./role-package";
import { BAD_MOON_RISING_EVENT_REACTIONS } from "./reactions";
import {
  buildBadMoonRisingSeatInputs,
  createBadMoonRisingAbilityInstances,
  createInitialBadMoonRisingState,
} from "./setup";

const runtimeOptions = (options = {}) => ({
  ...options,
  rolePackage: BAD_MOON_RISING_ROLE_PACKAGE,
  eventReactions: [
    ...BAD_MOON_RISING_EVENT_REACTIONS,
    ...(options.eventReactions ?? []),
  ],
});

export const createBadMoonRisingDomainProtocol = (options) =>
  createDomainProtocol(runtimeOptions(options));

export const restoreBadMoonRisingDomainProtocol = (stream, options = {}) =>
  restoreDomainProtocol(stream, runtimeOptions(options));

export const createBadMoonRisingGameCommand = (options) =>
  createGameCommand({
    ...options,
    rulePackage: BAD_MOON_RISING_ROLE_PACKAGE.identity,
  });

export const createBadMoonRisingStartCommand = ({
  assignments,
  godfatherDelta = 0,
  grandchildSeatId = null,
  demonBluffs = [],
  lunaticMinionSeatIds = [],
  lunaticBluffs = [],
  ...options
}) => {
  const setup = {
    assignments,
    godfatherDelta,
    grandchildSeatId,
    demonBluffs,
    lunaticMinionSeatIds,
    lunaticBluffs,
  };
  return createStartGameCommand({
    ...options,
    seats: buildBadMoonRisingSeatInputs(assignments),
    abilityInstances:
      createBadMoonRisingAbilityInstances(assignments).instances,
    badMoonRising: createInitialBadMoonRisingState(setup),
  });
};
