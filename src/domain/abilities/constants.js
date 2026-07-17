export const ROLE_ABILITY_FRAMEWORK_VERSION = "0.1.0";

export const ROLE_ABILITY_COMMAND_TYPES = Object.freeze({
  INSTANCES_REPLACE: "ability.instances.replace",
  CONDITION_SET: "ability.condition.set",
  TRIGGER_RESOLVE: "ability.trigger.resolve",
  TRIGGER_CANCEL: "ability.trigger.cancel",
  EFFECT_CANCEL: "ability.effect.cancel",
  ADJUDICATION_RESOLVE: "ability.adjudication.resolve",
  ADJUDICATION_CANCEL: "ability.adjudication.cancel",
});

export const ROLE_ABILITY_EVENT_TYPES = Object.freeze({
  INSTANCES_REPLACED: "ability.instances.replaced",
  CONDITION_SET: "ability.condition-set",
  TRIGGER_QUEUED: "ability.trigger.queued",
  TRIGGER_RESOLVED: "ability.trigger.resolved",
  TRIGGER_CANCELLED: "ability.trigger.cancelled",
  EFFECTS_RECORDED: "ability.effects.recorded",
  EFFECT_CANCELLED: "ability.effect.cancelled",
  ADJUDICATION_REQUESTED: "ability.adjudication.requested",
  ADJUDICATION_RESOLVED: "ability.adjudication.resolved",
  ADJUDICATION_CANCELLED: "ability.adjudication.cancelled",
});

export const MAX_REACTION_EVENTS = 256;
