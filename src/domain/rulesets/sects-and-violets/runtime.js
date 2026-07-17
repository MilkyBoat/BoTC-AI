import {
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "../../protocol";
import { createStartGameCommand } from "../../rules/basic";
import { SECTS_AND_VIOLETS_EVENT_REACTIONS } from "./reactions";
import { SECTS_AND_VIOLETS_ROLE_PACKAGE } from "./role-package";
import {
  buildSectsAndVioletsSeatInputs,
  createInitialSectsAndVioletsState,
  createSectsAndVioletsAbilityInstances,
} from "./setup";

const runtimeOptions = (options = {}) => ({
  ...options,
  rolePackage: SECTS_AND_VIOLETS_ROLE_PACKAGE,
  eventReactions: [
    ...SECTS_AND_VIOLETS_EVENT_REACTIONS,
    ...(options.eventReactions ?? []),
  ],
});

export const createSectsAndVioletsDomainProtocol = (options) =>
  createDomainProtocol(runtimeOptions(options));

export const restoreSectsAndVioletsDomainProtocol = (stream, options = {}) =>
  restoreDomainProtocol(stream, runtimeOptions(options));

export const createSectsAndVioletsGameCommand = (options) =>
  createGameCommand({
    ...options,
    rulePackage: SECTS_AND_VIOLETS_ROLE_PACKAGE.identity,
  });

export const createSectsAndVioletsStartCommand = ({
  assignments,
  evilTwinSeatId = null,
  goodTwinSeatId = null,
  demonBluffs = [],
  ...options
}) => {
  const setup = {
    assignments,
    evilTwinSeatId,
    goodTwinSeatId,
    demonBluffs,
  };
  return createStartGameCommand({
    ...options,
    seats: buildSectsAndVioletsSeatInputs(assignments),
    abilityInstances:
      createSectsAndVioletsAbilityInstances(assignments).instances,
    sectsAndViolets: createInitialSectsAndVioletsState(setup),
  });
};
