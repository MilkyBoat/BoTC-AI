import {
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
} from "@/domain/abilities";
import { M1_RULESET_IDENTITY } from "@/domain/protocol";

const 空输入 = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const 能力定义 = [
  {
    abilityId: "test.death-ability",
    roleId: "test.death-role",
    handlerId: "test.death-handler",
    sourceRefs: [{ sourceId: "zh-wiki-ability-death-triggered-ability" }],
    triggers: [
      {
        triggerId: "test.on-player-died",
        kind: "domain-event",
        priority: 40,
        actor: "system",
        skippable: false,
        eventTypes: ["player.died"],
      },
    ],
    actionInputSchema: 空输入,
    allowedEventTypes: [],
    usageLimit: null,
    retainsAfterDeath: true,
    intoxicationPolicy: "suppress",
  },
  {
    abilityId: "test.follow-ability",
    roleId: "test.follow-role",
    handlerId: "test.follow-handler",
    sourceRefs: [{ sourceId: "zh-wiki-ability-continuous-detection" }],
    triggers: [
      {
        triggerId: "test.follow-domain-event",
        kind: "domain-event",
        priority: 200,
        actor: "seat",
        skippable: false,
        eventTypes: ["test.ability-applied"],
      },
    ],
    actionInputSchema: 空输入,
    allowedEventTypes: [],
    usageLimit: null,
    retainsAfterDeath: false,
    intoxicationPolicy: "suppress",
  },
  {
    abilityId: "test.information-ability",
    roleId: "test.information-role",
    handlerId: "test.information-handler",
    sourceRefs: [{ sourceId: "zh-wiki-ability-information-gain" }],
    triggers: [
      {
        triggerId: "test.information-first-night",
        kind: "first-night",
        priority: 50,
        actor: "storyteller",
        skippable: false,
      },
    ],
    actionInputSchema: 空输入,
    adjudicationResultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["seatId"],
      properties: {
        seatId: {
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
        },
      },
    },
    allowedEventTypes: ["test.information-delivered"],
    usageLimit: 1,
    retainsAfterDeath: false,
    intoxicationPolicy: "storyteller-information",
  },
  {
    abilityId: "test.primary-ability",
    roleId: "test.primary-role",
    handlerId: "test.primary-handler",
    sourceRefs: [{ sourceId: "zh-wiki-important-details" }],
    triggers: [
      {
        triggerId: "test.primary-delayed",
        kind: "delayed",
        priority: 110,
        actor: "system",
        skippable: false,
        waitWhenSourceIneffective: false,
      },
      {
        triggerId: "test.primary-entry",
        kind: "entry",
        priority: 90,
        actor: "storyteller",
        skippable: false,
      },
      {
        triggerId: "test.primary-first-night",
        kind: "first-night",
        priority: 100,
        actor: "storyteller",
        skippable: false,
      },
      {
        triggerId: "test.primary-other-night",
        kind: "other-night",
        priority: 100,
        actor: "storyteller",
        skippable: false,
      },
    ],
    actionInputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recordEffects: { type: "boolean" },
        invalidPlan: {
          enum: [
            "non-json",
            "top-level",
            "event",
            "ongoing",
            "delayed",
            "task",
            "usage",
          ],
        },
      },
    },
    allowedEventTypes: ["test.ability-applied"],
    usageLimit: 3,
    retainsAfterDeath: false,
    intoxicationPolicy: "suppress",
  },
];

const 清单 = {
  $schema: "./role-ability-package.schema.json",
  packageId: "test.m1-r6-fictional-package",
  version: "1.0.0",
  frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
  canonicalLanguage: "zh-CN",
  ruleset: M1_RULESET_IDENTITY,
  eventTypes: ["test.ability-applied", "test.information-delivered"],
  abilities: 能力定义,
};
清单.integrity = {
  algorithm: "sha256",
  scope: "manifest-without-integrity",
  value: calculateRoleAbilityPackageIntegrity(清单),
};

const 空效果计划 = (覆盖 = {}) => ({
  events: [],
  ongoingEffects: [],
  delayedEffects: [],
  adjudicationTask: null,
  consumeUse: false,
  ...覆盖,
});

const 创建非法计划 = (mode) => {
  if (mode === "non-json") {
    const plan = 空效果计划({ consumeUse: true });
    plan.circular = plan;
    return plan;
  }
  if (mode === "top-level") {
    return { ...空效果计划({ consumeUse: true }), patch: [] };
  }
  if (mode === "event") {
    return 空效果计划({
      events: [{ type: "test.not-allowed", payload: {} }],
      consumeUse: true,
    });
  }
  if (mode === "ongoing") {
    return 空效果计划({
      ongoingEffects: [
        {
          effectId: "invalid effect id",
          effectType: "test.invalid",
          targetIds: [],
          endEventTypes: [],
        },
      ],
      consumeUse: true,
    });
  }
  if (mode === "delayed") {
    return 空效果计划({
      delayedEffects: [
        {
          effectId: "invalid-delayed",
          effectType: "test.invalid",
          triggerDefinitionId: "test.primary-delayed",
          targetIds: [],
          eventTypes: [],
        },
      ],
      consumeUse: true,
    });
  }
  if (mode === "task") {
    return 空效果计划({
      adjudicationTask: {
        taskId: "invalid-task",
        kind: "test.invalid",
        summary: "",
        candidateSeatIds: [],
      },
      consumeUse: true,
    });
  }
  return 空效果计划({ consumeUse: false });
};

const handlers = {
  "test.death-handler": Object.freeze({
    resolve: () => 空效果计划(),
  }),
  "test.follow-handler": Object.freeze({
    resolve: () => 空效果计划(),
  }),
  "test.information-handler": Object.freeze({
    resolve: () =>
      空效果计划({
        events: [
          { type: "test.information-delivered", payload: { seatId: "seat-2" } },
        ],
        consumeUse: true,
      }),
    createIntoxicatedAdjudication: ({ trigger }) =>
      空效果计划({
        adjudicationTask: {
          taskId: `task-${trigger.triggerId.slice(-32)}`,
          kind: "test.intoxicated-information",
          summary: "为醉酒或中毒的信息能力选择合法结果",
          candidateSeatIds: ["seat-1", "seat-2", "seat-3"],
        },
        consumeUse: true,
      }),
    resolveAdjudication: ({ result }) =>
      空效果计划({
        events: [
          {
            type: "test.information-delivered",
            payload: { seatId: result.seatId },
          },
        ],
      }),
  }),
  "test.primary-handler": Object.freeze({
    resolve: ({ trigger, input }) => {
      if (input.invalidPlan) return 创建非法计划(input.invalidPlan);
      return 空效果计划({
        events: [{ type: "test.ability-applied", payload: {} }],
        ongoingEffects: input.recordEffects
          ? [
              {
                effectId: `ongoing-${trigger.triggerId.slice(-32)}`,
                effectType: "test.protection",
                targetIds: ["seat-2"],
                endEventTypes: ["game.ended"],
              },
            ]
          : [],
        delayedEffects: input.recordEffects
          ? [
              {
                effectId: `delayed-${trigger.triggerId.slice(-32)}`,
                effectType: "test.follow-up",
                triggerDefinitionId: "test.primary-delayed",
                targetIds: ["seat-3"],
                eventTypes: ["player.died"],
              },
            ]
          : [],
        consumeUse: true,
      });
    },
  }),
};

const eventDefinitions = [
  {
    type: "test.ability-applied",
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    reduce: (state) => state,
  },
  {
    type: "test.information-delivered",
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["seatId"],
      properties: {
        seatId: {
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
        },
      },
    },
    reduce: (state) => state,
  },
];

export const FICTIONAL_ROLE_ABILITY_PACKAGE = createRoleAbilityPackage({
  manifest: 清单,
  handlers,
  eventDefinitions,
});

export const FICTIONAL_ABILITY_INSTANCES = Object.freeze([
  Object.freeze({
    instanceId: "ability-instance-death",
    definitionId: "test.death-ability",
    ownerSeatId: "seat-4",
    sourceRoleId: "test.death-role",
    sourceRoleInstanceId: "role-instance-death",
  }),
  Object.freeze({
    instanceId: "ability-instance-information",
    definitionId: "test.information-ability",
    ownerSeatId: "seat-1",
    sourceRoleId: "test.information-role",
    sourceRoleInstanceId: "role-instance-information",
  }),
  Object.freeze({
    instanceId: "ability-instance-primary",
    definitionId: "test.primary-ability",
    ownerSeatId: "seat-2",
    sourceRoleId: "test.primary-role",
    sourceRoleInstanceId: "role-instance-primary",
  }),
  Object.freeze({
    instanceId: "ability-instance-follow",
    definitionId: "test.follow-ability",
    ownerSeatId: "seat-3",
    sourceRoleId: "test.follow-role",
    sourceRoleInstanceId: "role-instance-follow",
  }),
]);
