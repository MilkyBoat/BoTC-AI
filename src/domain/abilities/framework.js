import { EVENT_TYPES, PROTOCOL_VERSION } from "../protocol/constants";
import { cloneAndFreezeJson } from "../protocol/immutable";
import { protocolError } from "../protocol/errors";
import { sha256Hex } from "../protocol/sha256";
import {
  ROLE_ABILITY_COMMAND_TYPES,
  ROLE_ABILITY_EVENT_TYPES,
} from "./constants";

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MESSAGE_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const CONTROLLERS = new Set(["host", "system"]);

const stableIdSchema = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};
const messageTypeSchema = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$",
  maxLength: 128,
};
const strictObject = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});
const instanceInputSchema = strictObject(
  [
    "instanceId",
    "definitionId",
    "ownerSeatId",
    "sourceRoleId",
    "sourceRoleInstanceId",
  ],
  {
    instanceId: stableIdSchema,
    definitionId: stableIdSchema,
    ownerSeatId: stableIdSchema,
    sourceRoleId: stableIdSchema,
    sourceRoleInstanceId: stableIdSchema,
  },
);
const inputObjectSchema = { type: "object" };

const createCommand = ({
  commandId,
  gameId,
  expectedRevision,
  actor,
  type,
  payload,
}) =>
  cloneAndFreezeJson({
    protocolVersion: PROTOCOL_VERSION,
    commandId,
    gameId,
    expectedRevision,
    actor,
    type,
    payload,
  });

export const createReplaceAbilityInstancesCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.INSTANCES_REPLACE,
    payload: {
      seatId: options.seatId,
      sourceRoleInstanceId: options.sourceRoleInstanceId,
      reason: options.reason,
      newInstances: options.newInstances,
    },
  });

export const createSetAbilityConditionCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.CONDITION_SET,
    payload: {
      conditionId: options.conditionId,
      seatId: options.seatId,
      conditionType: options.conditionType,
      sourceId: options.sourceId,
      ...(options.sourceAbilityInstanceId === undefined
        ? {}
        : { sourceAbilityInstanceId: options.sourceAbilityInstanceId }),
      active: options.active,
    },
  });

export const createResolveAbilityTriggerCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.TRIGGER_RESOLVE,
    payload: { triggerId: options.triggerId, input: options.input },
  });

export const createCancelAbilityTriggerCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.TRIGGER_CANCEL,
    payload: { triggerId: options.triggerId, reason: options.reason },
  });

export const createCancelAbilityEffectCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.EFFECT_CANCEL,
    payload: {
      effectId: options.effectId,
      effectKind: options.effectKind,
      reason: options.reason,
    },
  });

export const createResolveAbilityAdjudicationCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.ADJUDICATION_RESOLVE,
    payload: { taskId: options.taskId, result: options.result },
  });

export const createCancelAbilityAdjudicationCommand = (options) =>
  createCommand({
    ...options,
    type: ROLE_ABILITY_COMMAND_TYPES.ADJUDICATION_CANCEL,
    payload: { taskId: options.taskId, reason: options.reason },
  });

const findInstance = (state, instanceId) =>
  state?.abilityInstances.find(({ instanceId: id }) => id === instanceId);
const findTrigger = (state, triggerId) =>
  state?.abilityTriggers.find(({ triggerId: id }) => id === triggerId);
const findTask = (state, taskId) =>
  state?.adjudicationTasks.find(({ taskId: id }) => id === taskId);
const findSeat = (state, seatId) =>
  state?.seats.find(({ seatId: id }) => id === seatId);
const activeConditionsForSeat = (state, seatId) =>
  state.abilityConditions.filter(
    (condition) => condition.seatId === seatId && condition.status === "active",
  );

export const isAbilityInstanceEffective = (
  state,
  instance,
  abilityDefinition,
) => {
  if (!state || !instance || instance.status !== "active") return false;
  const seat = findSeat(state, instance.ownerSeatId);
  if (!seat || (!seat.alive && !abilityDefinition.retainsAfterDeath)) {
    return false;
  }
  return !activeConditionsForSeat(state, instance.ownerSeatId).some(
    ({ conditionType }) =>
      ["drunk", "poisoned", "ability-disabled"].includes(conditionType),
  );
};

export const isAbilityEffectActive = (state, effect, rolePackage) => {
  if (!effect || effect.status !== "active") return false;
  const instance = findInstance(state, effect.abilityInstanceId);
  if (!instance) return false;
  const definition = rolePackage?.getAbilityDefinition(instance.definitionId);
  if (!definition) {
    return (
      instance.status === "active" &&
      findSeat(state, instance.ownerSeatId)?.alive === true &&
      activeConditionsForSeat(state, instance.ownerSeatId).length === 0
    );
  }
  return isAbilityInstanceEffective(state, instance, definition);
};

const firstUnfinishedTrigger = (state) =>
  state.abilityTriggers.find(({ status }) =>
    ["pending", "waiting-adjudication"].includes(status),
  );

const rejectController = (command, reject) =>
  CONTROLLERS.has(command.actor.kind)
    ? null
    : reject("ACTOR_NOT_AUTHORIZED", "当前主体无权控制角色能力框架", {
        actorKind: command.actor.kind,
      });

const rejectTriggerActor = (command, trigger, instance, definition, reject) => {
  if (CONTROLLERS.has(command.actor.kind)) return null;
  if (
    definition.actor === "seat" &&
    command.actor.kind === "seat" &&
    command.actor.id === instance.ownerSeatId
  ) {
    return null;
  }
  return reject("ACTOR_NOT_AUTHORIZED", "当前主体无权结算该能力触发", {
    triggerId: trigger.triggerId,
    actorKind: command.actor.kind,
  });
};

const handlerValidationError = (result, fallbackMessage) => {
  if (result === null || result === undefined || result === true) return null;
  if (result === false) {
    return { code: "INVALID_ABILITY_INPUT", message: fallbackMessage };
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some(
      (key) => !["code", "message", "details"].includes(key),
    ) ||
    !/^[A-Z][A-Z0-9_]{1,63}$/.test(result.code ?? "") ||
    typeof result.message !== "string" ||
    result.message.length === 0 ||
    (result.details !== undefined &&
      (result.details === null ||
        typeof result.details !== "object" ||
        Array.isArray(result.details)))
  ) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE_RUNTIME",
      "能力处理器返回了无效的输入校验结果",
    );
  }
  return result;
};

const clonePlan = (plan) => {
  try {
    return JSON.parse(JSON.stringify(plan));
  } catch (error) {
    throw protocolError(
      "INVALID_ABILITY_PLAN",
      "能力处理器返回了非 JSON 效果计划",
      {
        reason: error.message,
      },
    );
  }
};

const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const validIdArray = (values) =>
  Array.isArray(values) &&
  new Set(values).size === values.length &&
  values.every((value) => STABLE_ID_PATTERN.test(value));

const validateEffectPlan = (
  input,
  definition,
  { allowTask = true, enforceUsage = true } = {},
) => {
  const plan = clonePlan(input);
  if (
    !exactKeys(plan, [
      "events",
      "ongoingEffects",
      "delayedEffects",
      "adjudicationTask",
      "consumeUse",
    ]) ||
    !Array.isArray(plan.events) ||
    !Array.isArray(plan.ongoingEffects) ||
    !Array.isArray(plan.delayedEffects) ||
    typeof plan.consumeUse !== "boolean" ||
    (!allowTask && plan.adjudicationTask !== null)
  ) {
    throw protocolError("INVALID_ABILITY_PLAN", "能力效果计划顶层结构无效");
  }
  for (const event of plan.events) {
    if (
      !exactKeys(event, ["type", "payload"]) ||
      !definition.allowedEventTypes.includes(event.type) ||
      !event.payload ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) {
      throw protocolError(
        "INVALID_ABILITY_PLAN",
        `能力 ${definition.abilityId} 产生了未授权的语义事件`,
      );
    }
  }
  for (const effect of plan.ongoingEffects) {
    if (
      !exactKeys(effect, [
        "effectId",
        "effectType",
        "targetIds",
        "endEventTypes",
      ]) ||
      !STABLE_ID_PATTERN.test(effect.effectId ?? "") ||
      !STABLE_ID_PATTERN.test(effect.effectType ?? "") ||
      !validIdArray(effect.targetIds) ||
      !Array.isArray(effect.endEventTypes) ||
      new Set(effect.endEventTypes).size !== effect.endEventTypes.length ||
      effect.endEventTypes.some(
        (type) => !MESSAGE_TYPE_PATTERN.test(type) || type.length > 128,
      )
    ) {
      throw protocolError("INVALID_ABILITY_PLAN", "持续效果定义无效");
    }
  }
  for (const effect of plan.delayedEffects) {
    const trigger = definition.triggers.find(
      ({ triggerId }) => triggerId === effect.triggerDefinitionId,
    );
    if (
      !exactKeys(effect, [
        "effectId",
        "effectType",
        "triggerDefinitionId",
        "targetIds",
        "eventTypes",
      ]) ||
      !STABLE_ID_PATTERN.test(effect.effectId ?? "") ||
      !STABLE_ID_PATTERN.test(effect.effectType ?? "") ||
      !trigger ||
      trigger.kind !== "delayed" ||
      !validIdArray(effect.targetIds) ||
      !Array.isArray(effect.eventTypes) ||
      effect.eventTypes.length === 0 ||
      new Set(effect.eventTypes).size !== effect.eventTypes.length ||
      effect.eventTypes.some(
        (type) => !MESSAGE_TYPE_PATTERN.test(type) || type.length > 128,
      )
    ) {
      throw protocolError("INVALID_ABILITY_PLAN", "延迟效果定义无效");
    }
  }
  if (plan.adjudicationTask !== null) {
    const task = plan.adjudicationTask;
    if (
      !allowTask ||
      !exactKeys(task, ["taskId", "kind", "summary", "candidateSeatIds"]) ||
      !STABLE_ID_PATTERN.test(task.taskId ?? "") ||
      !STABLE_ID_PATTERN.test(task.kind ?? "") ||
      typeof task.summary !== "string" ||
      task.summary.length === 0 ||
      task.summary.length > 512 ||
      !validIdArray(task.candidateSeatIds)
    ) {
      throw protocolError("INVALID_ABILITY_PLAN", "说书人裁量任务定义无效");
    }
  }
  if (
    (enforceUsage && definition.usageLimit === null && plan.consumeUse) ||
    (enforceUsage && definition.usageLimit !== null && !plan.consumeUse)
  ) {
    throw protocolError(
      "INVALID_ABILITY_PLAN",
      "能力效果计划的限次消费与规则包定义不一致",
    );
  }
  return plan;
};

const effectsCandidate = (plan, instance, trigger, definition) => {
  if (plan.ongoingEffects.length === 0 && plan.delayedEffects.length === 0) {
    return [];
  }
  return [
    {
      type: ROLE_ABILITY_EVENT_TYPES.EFFECTS_RECORDED,
      payload: {
        abilityInstanceId: instance.instanceId,
        triggerId: trigger.triggerId,
        ruleSourceIds: definition.sourceRefs.map(({ sourceId }) => sourceId),
        ongoingEffects: plan.ongoingEffects,
        delayedEffects: plan.delayedEffects,
      },
    },
  ];
};

const resolvedCandidate = (trigger, instance, plan, outcome) => ({
  type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_RESOLVED,
  payload: {
    triggerId: trigger.triggerId,
    abilityInstanceId: instance.instanceId,
    outcome,
    consumeUse: plan.consumeUse,
  },
});

const adjudicationCandidate = (plan, trigger, instance, definition) => ({
  type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_REQUESTED,
  payload: {
    ...plan.adjudicationTask,
    triggerId: trigger.triggerId,
    abilityInstanceId: instance.instanceId,
    resultSchema: definition.adjudicationResultSchema,
    ruleSourceIds: definition.sourceRefs.map(({ sourceId }) => sourceId),
    visibility: "storyteller-only",
    consumeUse: plan.consumeUse,
  },
});

const instanceInputError = (rolePackage, state, instance, seenIds) => {
  const definition = rolePackage.getAbilityDefinition(instance.definitionId);
  if (
    seenIds.has(instance.instanceId) ||
    state.abilityInstances.some(
      ({ instanceId }) => instanceId === instance.instanceId,
    ) ||
    !findSeat(state, instance.ownerSeatId) ||
    !definition ||
    definition.roleId !== instance.sourceRoleId
  ) {
    return "实例 ID、拥有席位、能力定义或来源角色无效";
  }
  seenIds.add(instance.instanceId);
  return null;
};

const buildCommandDefinitions = (rolePackage) => [
  {
    type: ROLE_ABILITY_COMMAND_TYPES.INSTANCES_REPLACE,
    payloadSchema: strictObject(
      ["seatId", "sourceRoleInstanceId", "reason", "newInstances"],
      {
        seatId: stableIdSchema,
        sourceRoleInstanceId: stableIdSchema,
        reason: {
          enum: ["character-change", "ability-gained", "ability-lost"],
        },
        newInstances: {
          type: "array",
          maxItems: 256,
          items: instanceInputSchema,
        },
      },
    ),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      if (
        state?.lifecycle !== "running" ||
        !findSeat(state, command.payload.seatId)
      ) {
        return reject(
          "INVALID_GAME_PHASE",
          "运行中且席位存在时才能替换能力实例",
        );
      }
      const seenIds = new Set();
      for (const instance of command.payload.newInstances) {
        if (
          instance.ownerSeatId !== command.payload.seatId ||
          instance.sourceRoleInstanceId !== command.payload.sourceRoleInstanceId
        ) {
          return reject(
            "INVALID_ABILITY_INSTANCE",
            "新能力实例必须属于目标席位与新角色实例",
          );
        }
        const reason = instanceInputError(
          rolePackage,
          state,
          instance,
          seenIds,
        );
        if (reason) return reject("INVALID_ABILITY_INSTANCE", reason);
      }
      return {
        events: [
          {
            type: ROLE_ABILITY_EVENT_TYPES.INSTANCES_REPLACED,
            payload: {
              seatId: command.payload.seatId,
              sourceRoleInstanceId: command.payload.sourceRoleInstanceId,
              reason: command.payload.reason,
              endedInstanceIds: state.abilityInstances
                .filter(
                  (instance) =>
                    instance.ownerSeatId === command.payload.seatId &&
                    instance.status === "active",
                )
                .map(({ instanceId }) => instanceId),
              newInstances: command.payload.newInstances,
            },
          },
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.CONDITION_SET,
    payloadSchema: strictObject(
      ["conditionId", "seatId", "conditionType", "sourceId", "active"],
      {
        conditionId: stableIdSchema,
        seatId: stableIdSchema,
        conditionType: {
          enum: ["drunk", "poisoned", "ability-disabled"],
        },
        sourceId: stableIdSchema,
        sourceAbilityInstanceId: stableIdSchema,
        active: { type: "boolean" },
      },
    ),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      if (
        state?.lifecycle !== "running" ||
        !findSeat(state, command.payload.seatId)
      ) {
        return reject(
          "INVALID_GAME_PHASE",
          "运行中且席位存在时才能变更能力条件",
        );
      }
      if (
        command.payload.sourceAbilityInstanceId &&
        !findInstance(state, command.payload.sourceAbilityInstanceId)
      ) {
        return reject("ABILITY_INSTANCE_NOT_FOUND", "条件来源能力实例不存在");
      }
      const current = state.abilityConditions.find(
        ({ conditionId }) => conditionId === command.payload.conditionId,
      );
      if (
        (command.payload.active && current) ||
        (!command.payload.active &&
          (!current ||
            current.status !== "active" ||
            current.seatId !== command.payload.seatId ||
            current.conditionType !== command.payload.conditionType ||
            current.sourceId !== command.payload.sourceId))
      ) {
        return reject(
          "INVALID_ABILITY_CONDITION",
          "能力条件的创建或解除与当前状态不一致",
        );
      }
      return {
        events: [
          {
            type: ROLE_ABILITY_EVENT_TYPES.CONDITION_SET,
            payload: command.payload,
          },
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.TRIGGER_RESOLVE,
    payloadSchema: strictObject(["triggerId", "input"], {
      triggerId: stableIdSchema,
      input: inputObjectSchema,
    }),
    handle: ({ state, command, reject }) => {
      if (state?.lifecycle !== "running") {
        return reject("INVALID_GAME_PHASE", "只能在运行中的对局结算能力触发");
      }
      const trigger = findTrigger(state, command.payload.triggerId);
      const first = firstUnfinishedTrigger(state);
      if (!trigger || trigger.status !== "pending" || first !== trigger) {
        return reject(
          "ABILITY_TRIGGER_NOT_READY",
          "只能结算队首待处理能力触发",
        );
      }
      const instance = findInstance(state, trigger.abilityInstanceId);
      const ability = instance
        ? rolePackage.getAbilityDefinition(instance.definitionId)
        : null;
      const definition = ability?.triggers.find(
        ({ triggerId }) => triggerId === trigger.definitionTriggerId,
      );
      if (!instance || !ability || !definition) {
        return reject(
          "ABILITY_INSTANCE_NOT_FOUND",
          "触发引用的能力实例或定义不存在",
        );
      }
      const unauthorized = rejectTriggerActor(
        command,
        trigger,
        instance,
        definition,
        reject,
      );
      if (unauthorized) return unauthorized;
      const validators = rolePackage.getValidators(ability.abilityId);
      if (!validators.actionInput(command.payload.input)) {
        return reject(
          "INVALID_ABILITY_INPUT",
          "能力动作输入不符合规则包 Schema",
        );
      }
      if (
        ability.usageLimit !== null &&
        instance.usesConsumed >= ability.usageLimit
      ) {
        return reject(
          "ABILITY_USAGE_EXHAUSTED",
          "该能力实例的限次尝试已经耗尽",
        );
      }
      const effective = isAbilityInstanceEffective(state, instance, ability);
      const handler = rolePackage.getHandler(ability.handlerId);
      if (typeof handler.validateInput === "function") {
        const validation = handlerValidationError(
          handler.validateInput({
            state,
            instance,
            trigger,
            input: cloneAndFreezeJson(command.payload.input),
            effective,
          }),
          "能力动作不满足当前权威状态约束",
        );
        if (validation) {
          return reject(
            validation.code,
            validation.message,
            validation.details,
          );
        }
      }
      let rawPlan;
      if (effective) {
        rawPlan = handler.resolve({
          state,
          instance,
          trigger,
          input: cloneAndFreezeJson(command.payload.input),
          effective: true,
        });
      } else if (ability.intoxicationPolicy === "storyteller-information") {
        if (typeof handler.createIntoxicatedAdjudication !== "function") {
          throw protocolError(
            "INVALID_ROLE_PACKAGE_RUNTIME",
            `能力 ${ability.abilityId} 缺少醉酒/中毒裁量处理器`,
          );
        }
        rawPlan = handler.createIntoxicatedAdjudication({
          state,
          instance,
          trigger,
          input: cloneAndFreezeJson(command.payload.input),
          effective: false,
        });
      } else if (typeof handler.resolveSuppressed === "function") {
        rawPlan = handler.resolveSuppressed({
          state,
          instance,
          trigger,
          input: cloneAndFreezeJson(command.payload.input),
          effective: false,
        });
      } else {
        rawPlan = {
          events: [],
          ongoingEffects: [],
          delayedEffects: [],
          adjudicationTask: null,
          consumeUse: ability.usageLimit !== null,
        };
      }
      const plan = validateEffectPlan(rawPlan, ability);
      const events = [
        ...plan.events,
        ...effectsCandidate(plan, instance, trigger, ability),
      ];
      if (plan.adjudicationTask) {
        events.push(adjudicationCandidate(plan, trigger, instance, ability));
      } else {
        events.push(
          resolvedCandidate(
            trigger,
            instance,
            plan,
            effective ? "applied" : "suppressed",
          ),
        );
      }
      return { events };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.TRIGGER_CANCEL,
    payloadSchema: strictObject(["triggerId", "reason"], {
      triggerId: stableIdSchema,
      reason: {
        enum: ["skipped", "source-invalid", "role-changed", "phase-ended"],
      },
    }),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      const trigger = findTrigger(state, command.payload.triggerId);
      const instance = trigger
        ? findInstance(state, trigger.abilityInstanceId)
        : null;
      const ability = instance
        ? rolePackage.getAbilityDefinition(instance.definitionId)
        : null;
      const definition = ability?.triggers.find(
        ({ triggerId }) => triggerId === trigger.definitionTriggerId,
      );
      if (
        !trigger ||
        trigger.status !== "pending" ||
        (command.payload.reason === "skipped" && !definition?.skippable)
      ) {
        return reject(
          "ABILITY_TRIGGER_NOT_CANCELLABLE",
          "该能力触发当前不能取消",
        );
      }
      return {
        events: [
          {
            type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_CANCELLED,
            payload: {
              triggerId: trigger.triggerId,
              reason: command.payload.reason,
            },
          },
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.EFFECT_CANCEL,
    payloadSchema: strictObject(["effectId", "effectKind", "reason"], {
      effectId: stableIdSchema,
      effectKind: { enum: ["ongoing", "delayed"] },
      reason: {
        enum: [
          "manual",
          "end-trigger",
          "source-invalid",
          "source-ineffective",
          "role-changed",
        ],
      },
    }),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      const collection =
        command.payload.effectKind === "ongoing"
          ? state?.ongoingAbilityEffects
          : state?.delayedAbilityEffects;
      const effect = collection?.find(
        ({ effectId }) => effectId === command.payload.effectId,
      );
      const cancellable =
        command.payload.effectKind === "ongoing"
          ? effect?.status === "active"
          : effect?.status === "pending";
      if (!cancellable) {
        return reject(
          "ABILITY_EFFECT_NOT_CANCELLABLE",
          "该能力效果当前不能取消",
        );
      }
      return {
        events: [
          {
            type: ROLE_ABILITY_EVENT_TYPES.EFFECT_CANCELLED,
            payload: command.payload,
          },
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.ADJUDICATION_RESOLVE,
    payloadSchema: strictObject(["taskId", "result"], {
      taskId: stableIdSchema,
      result: inputObjectSchema,
    }),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      const task = findTask(state, command.payload.taskId);
      if (!task || task.status !== "pending") {
        return reject(
          "ADJUDICATION_TASK_NOT_PENDING",
          "说书人裁量任务不是待处理状态",
        );
      }
      const instance = findInstance(state, task.abilityInstanceId);
      const ability = instance
        ? rolePackage.getAbilityDefinition(instance.definitionId)
        : null;
      const handler = ability
        ? rolePackage.getHandler(ability.handlerId)
        : null;
      const validator = ability
        ? rolePackage.getValidators(ability.abilityId)?.adjudicationResult
        : null;
      if (
        !ability ||
        !handler ||
        typeof handler.resolveAdjudication !== "function" ||
        !validator ||
        !validator(command.payload.result) ||
        (command.payload.result.seatId !== undefined &&
          !task.candidateSeatIds.includes(command.payload.result.seatId))
      ) {
        return reject(
          "INVALID_ADJUDICATION_RESULT",
          "说书人裁量结果不合法或已经过期",
        );
      }
      const trigger = findTrigger(state, task.triggerId);
      if (!trigger || trigger.status !== "waiting-adjudication") {
        return reject(
          "ABILITY_TRIGGER_NOT_READY",
          "裁量任务的来源触发状态无效",
        );
      }
      if (typeof handler.validateAdjudication === "function") {
        const validation = handlerValidationError(
          handler.validateAdjudication({
            state,
            instance,
            task,
            result: cloneAndFreezeJson(command.payload.result),
          }),
          "裁量结果不满足当前权威状态约束",
        );
        if (validation) {
          return reject(
            validation.code === "INVALID_ABILITY_INPUT"
              ? "INVALID_ADJUDICATION_RESULT"
              : validation.code,
            validation.message,
            validation.details,
          );
        }
      }
      const rawPlan = handler.resolveAdjudication({
        state,
        instance,
        trigger,
        task,
        result: cloneAndFreezeJson(command.payload.result),
      });
      const plan = validateEffectPlan(rawPlan, ability, {
        allowTask: false,
        enforceUsage: false,
      });
      if (plan.consumeUse) {
        throw protocolError(
          "INVALID_ABILITY_PLAN",
          "裁量解决阶段不能再次消费限次能力",
        );
      }
      return {
        events: [
          ...plan.events,
          ...effectsCandidate(plan, instance, trigger, ability),
          {
            type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_RESOLVED,
            payload: {
              taskId: task.taskId,
              result: command.payload.result,
            },
          },
          resolvedCandidate(trigger, instance, plan, "adjudicated"),
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_COMMAND_TYPES.ADJUDICATION_CANCEL,
    payloadSchema: strictObject(["taskId", "reason"], {
      taskId: stableIdSchema,
      reason: {
        enum: ["source-invalid", "role-changed", "phase-ended", "host-error"],
      },
    }),
    handle: ({ state, command, reject }) => {
      const unauthorized = rejectController(command, reject);
      if (unauthorized) return unauthorized;
      const task = findTask(state, command.payload.taskId);
      if (!task || task.status !== "pending") {
        return reject(
          "ADJUDICATION_TASK_NOT_PENDING",
          "说书人裁量任务不是待处理状态",
        );
      }
      return {
        events: [
          {
            type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_CANCELLED,
            payload: command.payload,
          },
          {
            type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_CANCELLED,
            payload: {
              triggerId: task.triggerId,
              reason: command.payload.reason,
            },
          },
        ],
      };
    },
  },
];

const replaceStatus = (records, idKey, id, mapper) =>
  records.map((record) => (record[idKey] === id ? mapper(record) : record));

const buildEventDefinitions = () => [
  {
    type: ROLE_ABILITY_EVENT_TYPES.INSTANCES_REPLACED,
    payloadSchema: strictObject(
      [
        "seatId",
        "sourceRoleInstanceId",
        "reason",
        "endedInstanceIds",
        "newInstances",
      ],
      {
        seatId: stableIdSchema,
        sourceRoleInstanceId: stableIdSchema,
        reason: {
          enum: ["character-change", "ability-gained", "ability-lost"],
        },
        endedInstanceIds: {
          type: "array",
          uniqueItems: true,
          items: stableIdSchema,
        },
        newInstances: {
          type: "array",
          maxItems: 256,
          items: instanceInputSchema,
        },
      },
    ),
    reduce: (state, event) => {
      const ended = new Set(event.payload.endedInstanceIds);
      const endsSource = (record) => ended.has(record.abilityInstanceId);
      return {
        ...state,
        abilityInstances: [
          ...state.abilityInstances.map((instance) =>
            ended.has(instance.instanceId)
              ? {
                  ...instance,
                  status: "replaced",
                  endedAtRevision: event.sequence,
                }
              : instance,
          ),
          ...event.payload.newInstances.map((instance) => ({
            ...instance,
            status: "active",
            usesConsumed: 0,
            createdAtRevision: event.sequence,
            endedAtRevision: null,
          })),
        ],
        abilityConditions: state.abilityConditions.map((condition) =>
          ended.has(condition.sourceAbilityInstanceId) &&
          condition.status === "active"
            ? {
                ...condition,
                status: "cleared",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : condition,
        ),
        abilityTriggers: state.abilityTriggers.map((trigger) =>
          endsSource(trigger) &&
          ["pending", "waiting-adjudication"].includes(trigger.status)
            ? {
                ...trigger,
                status: "cancelled",
                cancellationReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : trigger,
        ),
        ongoingAbilityEffects: state.ongoingAbilityEffects.map((effect) =>
          endsSource(effect) && effect.status === "active"
            ? {
                ...effect,
                status: "ended",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : effect,
        ),
        delayedAbilityEffects: state.delayedAbilityEffects.map((effect) =>
          endsSource(effect) && effect.status === "pending"
            ? {
                ...effect,
                status: "cancelled",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : effect,
        ),
        adjudicationTasks: state.adjudicationTasks.map((task) =>
          endsSource(task) && task.status === "pending"
            ? {
                ...task,
                status: "cancelled",
                cancellationReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : task,
        ),
      };
    },
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.CONDITION_SET,
    payloadSchema: strictObject(
      ["conditionId", "seatId", "conditionType", "sourceId", "active"],
      {
        conditionId: stableIdSchema,
        seatId: stableIdSchema,
        conditionType: {
          enum: ["drunk", "poisoned", "ability-disabled"],
        },
        sourceId: stableIdSchema,
        sourceAbilityInstanceId: stableIdSchema,
        active: { type: "boolean" },
      },
    ),
    reduce: (state, event) => {
      const { active, ...conditionPayload } = event.payload;
      return active
        ? {
            ...state,
            abilityConditions: [
              ...state.abilityConditions,
              {
                ...conditionPayload,
                status: "active",
                completionReason: null,
                createdAtRevision: event.sequence,
                completedAtRevision: null,
              },
            ],
          }
        : {
            ...state,
            abilityConditions: replaceStatus(
              state.abilityConditions,
              "conditionId",
              event.payload.conditionId,
              (condition) => ({
                ...condition,
                status: "cleared",
                completionReason: "cleared",
                completedAtRevision: event.sequence,
              }),
            ),
          };
    },
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_QUEUED,
    payloadSchema: strictObject(
      [
        "triggerId",
        "definitionTriggerId",
        "abilityInstanceId",
        "sourceEventId",
        "kind",
        "priority",
        "ownerSeatOrder",
        "phase",
        "dayNumber",
        "nightNumber",
      ],
      {
        triggerId: stableIdSchema,
        definitionTriggerId: stableIdSchema,
        abilityInstanceId: stableIdSchema,
        sourceEventId: stableIdSchema,
        delayedEffectId: stableIdSchema,
        kind: {
          enum: [
            "first-night",
            "other-night",
            "entry",
            "domain-event",
            "delayed",
          ],
        },
        priority: { type: "integer", minimum: 0, maximum: 1000000 },
        ownerSeatOrder: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
        },
        phase: { enum: ["first-night", "day", "night"] },
        dayNumber: { type: "integer", minimum: 0 },
        nightNumber: { type: "integer", minimum: 1 },
      },
    ),
    reduce: (state, event) => ({
      ...state,
      abilityTriggers: [
        ...state.abilityTriggers,
        {
          ...event.payload,
          status: "pending",
          outcome: null,
          cancellationReason: null,
          createdAtRevision: event.sequence,
          completedAtRevision: null,
        },
      ],
      delayedAbilityEffects: event.payload.delayedEffectId
        ? replaceStatus(
            state.delayedAbilityEffects,
            "effectId",
            event.payload.delayedEffectId,
            (effect) => ({
              ...effect,
              status: "triggered",
              completionReason: "triggered",
              completedAtRevision: event.sequence,
            }),
          )
        : state.delayedAbilityEffects,
    }),
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_RESOLVED,
    payloadSchema: strictObject(
      ["triggerId", "abilityInstanceId", "outcome", "consumeUse"],
      {
        triggerId: stableIdSchema,
        abilityInstanceId: stableIdSchema,
        outcome: { enum: ["applied", "suppressed", "adjudicated"] },
        consumeUse: { type: "boolean" },
      },
    ),
    reduce: (state, event) => ({
      ...state,
      abilityInstances: event.payload.consumeUse
        ? replaceStatus(
            state.abilityInstances,
            "instanceId",
            event.payload.abilityInstanceId,
            (instance) => ({
              ...instance,
              usesConsumed: instance.usesConsumed + 1,
            }),
          )
        : state.abilityInstances,
      abilityTriggers: replaceStatus(
        state.abilityTriggers,
        "triggerId",
        event.payload.triggerId,
        (trigger) => ({
          ...trigger,
          status: "resolved",
          outcome: event.payload.outcome,
          completedAtRevision: event.sequence,
        }),
      ),
    }),
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_CANCELLED,
    payloadSchema: strictObject(["triggerId", "reason"], {
      triggerId: stableIdSchema,
      reason: {
        enum: [
          "skipped",
          "source-invalid",
          "role-changed",
          "phase-ended",
          "host-error",
        ],
      },
    }),
    reduce: (state, event) => ({
      ...state,
      abilityTriggers: replaceStatus(
        state.abilityTriggers,
        "triggerId",
        event.payload.triggerId,
        (trigger) => ({
          ...trigger,
          status: "cancelled",
          cancellationReason: event.payload.reason,
          completedAtRevision: event.sequence,
        }),
      ),
    }),
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.EFFECTS_RECORDED,
    payloadSchema: strictObject(
      [
        "abilityInstanceId",
        "triggerId",
        "ruleSourceIds",
        "ongoingEffects",
        "delayedEffects",
      ],
      {
        abilityInstanceId: stableIdSchema,
        triggerId: stableIdSchema,
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableIdSchema,
        },
        ongoingEffects: {
          type: "array",
          items: strictObject(
            ["effectId", "effectType", "targetIds", "endEventTypes"],
            {
              effectId: stableIdSchema,
              effectType: stableIdSchema,
              targetIds: {
                type: "array",
                uniqueItems: true,
                items: stableIdSchema,
              },
              endEventTypes: {
                type: "array",
                uniqueItems: true,
                items: messageTypeSchema,
              },
            },
          ),
        },
        delayedEffects: {
          type: "array",
          items: strictObject(
            [
              "effectId",
              "effectType",
              "triggerDefinitionId",
              "targetIds",
              "eventTypes",
            ],
            {
              effectId: stableIdSchema,
              effectType: stableIdSchema,
              triggerDefinitionId: stableIdSchema,
              targetIds: {
                type: "array",
                uniqueItems: true,
                items: stableIdSchema,
              },
              eventTypes: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: messageTypeSchema,
              },
            },
          ),
        },
      },
    ),
    reduce: (state, event) => ({
      ...state,
      ongoingAbilityEffects: [
        ...state.ongoingAbilityEffects,
        ...event.payload.ongoingEffects.map((effect) => ({
          ...effect,
          abilityInstanceId: event.payload.abilityInstanceId,
          triggerId: event.payload.triggerId,
          ruleSourceIds: event.payload.ruleSourceIds,
          status: "active",
          completionReason: null,
          createdAtRevision: event.sequence,
          completedAtRevision: null,
        })),
      ],
      delayedAbilityEffects: [
        ...state.delayedAbilityEffects,
        ...event.payload.delayedEffects.map((effect) => ({
          ...effect,
          abilityInstanceId: event.payload.abilityInstanceId,
          triggerId: event.payload.triggerId,
          ruleSourceIds: event.payload.ruleSourceIds,
          status: "pending",
          completionReason: null,
          createdAtRevision: event.sequence,
          completedAtRevision: null,
        })),
      ],
    }),
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.EFFECT_CANCELLED,
    payloadSchema: strictObject(["effectId", "effectKind", "reason"], {
      effectId: stableIdSchema,
      effectKind: { enum: ["ongoing", "delayed"] },
      reason: {
        enum: [
          "manual",
          "end-trigger",
          "source-invalid",
          "source-ineffective",
          "role-changed",
        ],
      },
    }),
    reduce: (state, event) => {
      const key =
        event.payload.effectKind === "ongoing"
          ? "ongoingAbilityEffects"
          : "delayedAbilityEffects";
      return {
        ...state,
        [key]: replaceStatus(
          state[key],
          "effectId",
          event.payload.effectId,
          (effect) => ({
            ...effect,
            status:
              event.payload.effectKind === "ongoing" ? "ended" : "cancelled",
            completionReason: event.payload.reason,
            completedAtRevision: event.sequence,
          }),
        ),
      };
    },
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_REQUESTED,
    payloadSchema: strictObject(
      [
        "taskId",
        "kind",
        "summary",
        "candidateSeatIds",
        "triggerId",
        "abilityInstanceId",
        "resultSchema",
        "ruleSourceIds",
        "visibility",
        "consumeUse",
      ],
      {
        taskId: stableIdSchema,
        kind: stableIdSchema,
        summary: { type: "string", minLength: 1, maxLength: 512 },
        candidateSeatIds: {
          type: "array",
          uniqueItems: true,
          items: stableIdSchema,
        },
        triggerId: stableIdSchema,
        abilityInstanceId: stableIdSchema,
        resultSchema: { type: "object" },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableIdSchema,
        },
        visibility: { const: "storyteller-only" },
        consumeUse: { type: "boolean" },
      },
    ),
    reduce: (state, event) => {
      const { consumeUse, ...taskPayload } = event.payload;
      return {
        ...state,
        abilityInstances: consumeUse
          ? replaceStatus(
              state.abilityInstances,
              "instanceId",
              event.payload.abilityInstanceId,
              (instance) => ({
                ...instance,
                usesConsumed: instance.usesConsumed + 1,
              }),
            )
          : state.abilityInstances,
        abilityTriggers: replaceStatus(
          state.abilityTriggers,
          "triggerId",
          event.payload.triggerId,
          (trigger) => ({ ...trigger, status: "waiting-adjudication" }),
        ),
        adjudicationTasks: [
          ...state.adjudicationTasks,
          {
            ...taskPayload,
            status: "pending",
            result: null,
            cancellationReason: null,
            createdAtRevision: event.sequence,
            completedAtRevision: null,
          },
        ],
      };
    },
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_RESOLVED,
    payloadSchema: strictObject(["taskId", "result"], {
      taskId: stableIdSchema,
      result: inputObjectSchema,
    }),
    reduce: (state, event) => ({
      ...state,
      adjudicationTasks: replaceStatus(
        state.adjudicationTasks,
        "taskId",
        event.payload.taskId,
        (task) => ({
          ...task,
          status: "resolved",
          result: event.payload.result,
          completedAtRevision: event.sequence,
        }),
      ),
    }),
  },
  {
    type: ROLE_ABILITY_EVENT_TYPES.ADJUDICATION_CANCELLED,
    payloadSchema: strictObject(["taskId", "reason"], {
      taskId: stableIdSchema,
      reason: {
        enum: ["source-invalid", "role-changed", "phase-ended", "host-error"],
      },
    }),
    reduce: (state, event) => ({
      ...state,
      adjudicationTasks: replaceStatus(
        state.adjudicationTasks,
        "taskId",
        event.payload.taskId,
        (task) => ({
          ...task,
          status: "cancelled",
          cancellationReason: event.payload.reason,
          completedAtRevision: event.sequence,
        }),
      ),
    }),
  },
];

const stableTriggerId = (eventId, instanceId, triggerDefinitionId, effectId) =>
  `trigger-${sha256Hex(
    JSON.stringify([
      eventId,
      instanceId,
      triggerDefinitionId,
      effectId ?? null,
    ]),
  )}`;

const triggerCandidate = ({
  state,
  event,
  instance,
  definition,
  delayedEffectId,
}) => ({
  type: ROLE_ABILITY_EVENT_TYPES.TRIGGER_QUEUED,
  payload: {
    triggerId: stableTriggerId(
      event.eventId,
      instance.instanceId,
      definition.triggerId,
      delayedEffectId,
    ),
    definitionTriggerId: definition.triggerId,
    abilityInstanceId: instance.instanceId,
    sourceEventId: event.eventId,
    ...(delayedEffectId === undefined ? {} : { delayedEffectId }),
    kind: definition.kind,
    priority: definition.priority,
    ownerSeatOrder: findSeat(state, instance.ownerSeatId).order,
    phase: state.phase,
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
  },
});

const buildReaction = (rolePackage, registeredEventTypes) => ({
  id: "role-ability-framework.trigger-reaction",
  priority: 100,
  eventTypes: registeredEventTypes,
  react: ({ stateAfter: state, event }) => {
    if (!state || state.lifecycle !== "running") return [];
    const candidates = [];
    for (const effect of state.ongoingAbilityEffects) {
      if (
        effect.status === "active" &&
        effect.endEventTypes.includes(event.type)
      ) {
        candidates.push({
          type: ROLE_ABILITY_EVENT_TYPES.EFFECT_CANCELLED,
          payload: {
            effectId: effect.effectId,
            effectKind: "ongoing",
            reason: "end-trigger",
          },
        });
      }
    }
    let instances = state.abilityInstances.filter(
      ({ status }) => status === "active",
    );
    let triggerKind = null;
    if (event.type === EVENT_TYPES.GAME_STARTED) triggerKind = "first-night";
    if (
      event.type === EVENT_TYPES.PHASE_ADVANCED &&
      event.payload.to === "night"
    ) {
      triggerKind = "other-night";
    }
    if (event.type === ROLE_ABILITY_EVENT_TYPES.INSTANCES_REPLACED) {
      triggerKind = "entry";
      const newIds = new Set(
        event.payload.newInstances.map(({ instanceId }) => instanceId),
      );
      instances = instances.filter(({ instanceId }) => newIds.has(instanceId));
    }
    const queued = [];
    for (const instance of instances) {
      const ability = rolePackage.getAbilityDefinition(instance.definitionId);
      if (!ability) continue;
      const ownerSeat = findSeat(state, instance.ownerSeatId);
      if (!ownerSeat || (!ownerSeat.alive && !ability.retainsAfterDeath)) {
        continue;
      }
      for (const definition of ability.triggers) {
        if (
          (triggerKind !== null && definition.kind === triggerKind) ||
          (definition.kind === "domain-event" &&
            definition.eventTypes.includes(event.type))
        ) {
          queued.push(triggerCandidate({ state, event, instance, definition }));
        }
      }
    }
    for (const effect of state.delayedAbilityEffects) {
      if (
        effect.status !== "pending" ||
        !effect.eventTypes.includes(event.type)
      ) {
        continue;
      }
      const instance = findInstance(state, effect.abilityInstanceId);
      const ability = instance
        ? rolePackage.getAbilityDefinition(instance.definitionId)
        : null;
      const definition = ability?.triggers.find(
        ({ triggerId }) => triggerId === effect.triggerDefinitionId,
      );
      if (
        instance?.status === "active" &&
        definition &&
        isAbilityInstanceEffective(state, instance, ability)
      ) {
        queued.push(
          triggerCandidate({
            state,
            event,
            instance,
            definition,
            delayedEffectId: effect.effectId,
          }),
        );
      } else if (
        instance?.status === "active" &&
        definition &&
        !definition.waitWhenSourceIneffective
      ) {
        candidates.push({
          type: ROLE_ABILITY_EVENT_TYPES.EFFECT_CANCELLED,
          payload: {
            effectId: effect.effectId,
            effectKind: "delayed",
            reason: "source-ineffective",
          },
        });
      }
    }
    queued.sort((left, right) => {
      const a = left.payload;
      const b = right.payload;
      return (
        a.priority - b.priority ||
        a.ownerSeatOrder - b.ownerSeatOrder ||
        a.definitionTriggerId.localeCompare(b.definitionTriggerId) ||
        a.abilityInstanceId.localeCompare(b.abilityInstanceId)
      );
    });
    return [...candidates, ...queued].filter(
      (candidate) =>
        candidate.type !== ROLE_ABILITY_EVENT_TYPES.TRIGGER_QUEUED ||
        !state.abilityTriggers.some(
          ({ triggerId }) => triggerId === candidate.payload.triggerId,
        ),
    );
  },
});

const invariantError = (message, details) =>
  protocolError("INVARIANT_VIOLATION", message, details);

export const assertRoleAbilityStateInvariants = (state, rolePackage) => {
  if (state === null) return;
  const unique = (records, key) =>
    new Set(records.map((record) => record[key])).size === records.length;
  if (
    !unique(state.abilityInstances, "instanceId") ||
    !unique(state.abilityConditions, "conditionId") ||
    !unique(state.abilityTriggers, "triggerId") ||
    !unique(
      [...state.ongoingAbilityEffects, ...state.delayedAbilityEffects],
      "effectId",
    ) ||
    !unique(state.adjudicationTasks, "taskId")
  ) {
    throw invariantError("能力实例、条件、触发、效果或裁量任务 ID 重复");
  }
  const instanceIds = new Set(
    state.abilityInstances.map(({ instanceId }) => instanceId),
  );
  const triggerIds = new Set(
    state.abilityTriggers.map(({ triggerId }) => triggerId),
  );
  const seatIds = new Set(state.seats.map(({ seatId }) => seatId));
  const effectById = new Map(
    [...state.ongoingAbilityEffects, ...state.delayedAbilityEffects].map(
      (effect) => [effect.effectId, effect],
    ),
  );
  for (const instance of state.abilityInstances) {
    const definition = rolePackage.getAbilityDefinition(instance.definitionId);
    if (
      !definition ||
      definition.roleId !== instance.sourceRoleId ||
      !findSeat(state, instance.ownerSeatId) ||
      instance.usesConsumed < 0 ||
      (definition.usageLimit !== null &&
        instance.usesConsumed > definition.usageLimit)
    ) {
      throw invariantError("能力实例引用或用量无效", {
        instanceId: instance.instanceId,
      });
    }
  }
  for (const condition of state.abilityConditions) {
    const sourceInstance = condition.sourceAbilityInstanceId
      ? findInstance(state, condition.sourceAbilityInstanceId)
      : null;
    if (
      !seatIds.has(condition.seatId) ||
      (condition.sourceAbilityInstanceId && !sourceInstance) ||
      (condition.status === "active" &&
        sourceInstance &&
        sourceInstance.status !== "active")
    ) {
      throw invariantError("能力条件引用不存在或来源已经失效", {
        conditionId: condition.conditionId,
      });
    }
  }
  for (const trigger of state.abilityTriggers) {
    const instance = findInstance(state, trigger.abilityInstanceId);
    const ability = instance
      ? rolePackage.getAbilityDefinition(instance.definitionId)
      : null;
    const definition = ability?.triggers.find(
      ({ triggerId }) => triggerId === trigger.definitionTriggerId,
    );
    const delayedEffect = trigger.delayedEffectId
      ? effectById.get(trigger.delayedEffectId)
      : null;
    if (
      !instance ||
      !definition ||
      definition.kind !== trigger.kind ||
      definition.priority !== trigger.priority ||
      findSeat(state, instance.ownerSeatId)?.order !== trigger.ownerSeatOrder ||
      (trigger.kind === "delayed") !== Boolean(trigger.delayedEffectId) ||
      (trigger.delayedEffectId &&
        (!delayedEffect ||
          delayedEffect.abilityInstanceId !== trigger.abilityInstanceId))
    ) {
      throw invariantError("能力触发与实例、定义或延迟效果不一致", {
        triggerId: trigger.triggerId,
      });
    }
  }
  const sourcedRecords = [
    ...state.abilityTriggers,
    ...state.ongoingAbilityEffects,
    ...state.delayedAbilityEffects,
    ...state.adjudicationTasks,
  ];
  if (
    sourcedRecords.some(
      ({ abilityInstanceId }) => !instanceIds.has(abilityInstanceId),
    ) ||
    state.adjudicationTasks.some(({ triggerId }) => !triggerIds.has(triggerId))
  ) {
    throw invariantError("能力触发、效果或裁量任务引用不存在");
  }
  for (const effect of [
    ...state.ongoingAbilityEffects,
    ...state.delayedAbilityEffects,
  ]) {
    const trigger = findTrigger(state, effect.triggerId);
    if (
      !trigger ||
      trigger.abilityInstanceId !== effect.abilityInstanceId ||
      (effect.triggerDefinitionId &&
        !rolePackage
          .getAbilityDefinition(
            findInstance(state, effect.abilityInstanceId)?.definitionId,
          )
          ?.triggers.some(
            ({ triggerId, kind }) =>
              triggerId === effect.triggerDefinitionId && kind === "delayed",
          ))
    ) {
      throw invariantError("能力效果与来源触发或延迟定义不一致", {
        effectId: effect.effectId,
      });
    }
  }
  const pendingTasksByTrigger = new Map();
  for (const task of state.adjudicationTasks.filter(
    ({ status }) => status === "pending",
  )) {
    const trigger = findTrigger(state, task.triggerId);
    pendingTasksByTrigger.set(
      task.triggerId,
      (pendingTasksByTrigger.get(task.triggerId) ?? 0) + 1,
    );
    if (
      trigger?.status !== "waiting-adjudication" ||
      trigger.abilityInstanceId !== task.abilityInstanceId ||
      task.candidateSeatIds.some((seatId) => !seatIds.has(seatId))
    ) {
      throw invariantError("待裁量任务与来源触发状态不一致");
    }
  }
  if (
    state.abilityTriggers.some(
      (trigger) =>
        trigger.status === "waiting-adjudication" &&
        pendingTasksByTrigger.get(trigger.triggerId) !== 1,
    ) ||
    Array.from(pendingTasksByTrigger.values()).some((count) => count !== 1)
  ) {
    throw invariantError("待裁量任务与等待中的触发不是一一对应");
  }
  const triggerGroups = new Map();
  for (const trigger of state.abilityTriggers) {
    const group = triggerGroups.get(trigger.sourceEventId) ?? [];
    group.push(trigger);
    triggerGroups.set(trigger.sourceEventId, group);
  }
  const compareTriggers = (left, right) =>
    left.priority - right.priority ||
    left.ownerSeatOrder - right.ownerSeatOrder ||
    left.definitionTriggerId.localeCompare(right.definitionTriggerId) ||
    left.abilityInstanceId.localeCompare(right.abilityInstanceId);
  if (
    Array.from(triggerGroups.values()).some((triggers) =>
      triggers.some(
        (trigger, index) =>
          index > 0 && compareTriggers(triggers[index - 1], trigger) > 0,
      ),
    )
  ) {
    throw invariantError("同一来源事件产生的能力触发顺序不稳定");
  }
  if (
    state.lifecycle !== "running" &&
    (state.abilityTriggers.some(({ status }) =>
      ["pending", "waiting-adjudication"].includes(status),
    ) ||
      state.adjudicationTasks.some(({ status }) => status === "pending"))
  ) {
    throw invariantError("非运行阶段仍存在未完成能力触发或裁量任务");
  }
  for (const instance of state.abilityInstances.filter(
    ({ status }) => status !== "active",
  )) {
    if (
      sourcedRecords.some(
        (record) =>
          record.abilityInstanceId === instance.instanceId &&
          ["pending", "waiting-adjudication", "active"].includes(record.status),
      )
    ) {
      throw invariantError("已替换能力实例仍存在活动触发、效果或任务");
    }
  }
};

export const createRoleAbilityFramework = (rolePackage, builtInEventTypes) => {
  const eventDefinitions = buildEventDefinitions();
  const registeredEventTypes = Array.from(
    new Set([
      ...builtInEventTypes,
      ...rolePackage.manifest.eventTypes,
      ...eventDefinitions.map(({ type }) => type),
    ]),
  ).sort();
  return Object.freeze({
    commandDefinitions: Object.freeze(buildCommandDefinitions(rolePackage)),
    eventDefinitions: Object.freeze(eventDefinitions),
    eventReactions: Object.freeze([
      buildReaction(rolePackage, registeredEventTypes),
    ]),
    stateInvariants: Object.freeze([
      Object.freeze({
        id: "role-ability-framework.state",
        assert: (state) => assertRoleAbilityStateInvariants(state, rolePackage),
      }),
    ]),
  });
};
