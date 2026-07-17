import sourceManifest from "../../../../knowledge/rulesets/trouble-brewing-sources.json";
import {
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
} from "../../abilities";
import { M1_RULESET_IDENTITY } from "../../protocol";
import {
  TROUBLE_BREWING_PACKAGE_ID,
  TROUBLE_BREWING_PACKAGE_VERSION,
  TROUBLE_BREWING_ROLE_CATALOG,
} from "./catalog";
import {
  TROUBLE_BREWING_EVENT_DEFINITIONS,
  TROUBLE_BREWING_EVENT_TYPE_LIST,
  TROUBLE_BREWING_EVENT_TYPES,
} from "./events";
import { createTroubleBrewingHandlers } from "./handlers";
import { TROUBLE_BREWING_RULE_HOOKS } from "./hooks";

const 空输入 = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {},
});
const 目标输入 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["targetSeatId"],
  properties: {
    targetSeatId: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    },
  },
});
const 双目标输入 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["targetSeatIds"],
  properties: {
    targetSeatIds: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
      },
    },
  },
});

const 触发定义 = Object.freeze({
  washerwoman: [["first-night", 300, "storyteller"]],
  librarian: [["first-night", 310, "storyteller"]],
  investigator: [["first-night", 320, "storyteller"]],
  chef: [["first-night", 330, "storyteller"]],
  empath: [
    ["first-night", 340, "storyteller"],
    ["other-night", 800, "storyteller"],
  ],
  fortuneteller: [
    ["first-night", 350, "seat"],
    ["other-night", 810, "seat"],
  ],
  undertaker: [["other-night", 790, "storyteller"]],
  monk: [["other-night", 200, "seat"]],
  ravenkeeper: [["domain-event", 700, "seat", "tb.ravenkeeper-awakened"]],
  virgin: [["domain-event", 100, "system", "tb.virgin-nominated"]],
  slayer: [["domain-event", 100, "seat", "tb.slayer-action-requested"]],
  soldier: [["entry", 100, "system"]],
  mayor: [["entry", 100, "system"]],
  butler: [
    ["first-night", 360, "seat"],
    ["other-night", 820, "seat"],
  ],
  drunk: [["entry", 100, "system"]],
  recluse: [["entry", 100, "system"]],
  saint: [["domain-event", 100, "system", "tb.saint-executed"]],
  poisoner: [
    ["first-night", 100, "seat"],
    ["other-night", 100, "seat"],
  ],
  spy: [
    ["first-night", 200, "storyteller"],
    ["other-night", 300, "storyteller"],
  ],
  scarletwoman: [["entry", 100, "system"]],
  baron: [["entry", 100, "system"]],
  imp: [["other-night", 500, "seat"]],
});

const 有目标 = new Set([
  "monk",
  "ravenkeeper",
  "slayer",
  "butler",
  "poisoner",
  "imp",
]);
const 信息角色集合 = new Set([
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortuneteller",
  "undertaker",
  "ravenkeeper",
  "spy",
]);

const 信息事件 = [
  TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
  TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
].sort();
const 死亡事件 = [
  TROUBLE_BREWING_EVENT_TYPES.DEATH_PREVENTED,
  TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
  TROUBLE_BREWING_EVENT_TYPES.PLAYER_DIED,
  TROUBLE_BREWING_EVENT_TYPES.ROLE_CHANGED,
].sort();
const 允许事件 = {
  butler: [TROUBLE_BREWING_EVENT_TYPES.MARKER_CHANGED],
  imp: 死亡事件,
  poisoner: [TROUBLE_BREWING_EVENT_TYPES.CONDITION_CHANGED],
  saint: [
    TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
    TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
  ].sort(),
  slayer: [
    ...死亡事件,
    TROUBLE_BREWING_EVENT_TYPES.ACTION_RECORDED,
    TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
  ].sort(),
  virgin: [
    ...死亡事件,
    TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
    TROUBLE_BREWING_EVENT_TYPES.PLAYER_EXECUTED,
    TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
    TROUBLE_BREWING_EVENT_TYPES.SAINT_EXECUTED,
  ].sort(),
};

const 建立触发 = (roleId, [kind, priority, actor, eventType], index) => ({
  triggerId: `tb.${roleId}.${kind}.${index + 1}`,
  kind,
  priority,
  actor,
  skippable: false,
  ...(eventType === undefined ? {} : { eventTypes: [eventType] }),
});

const 能力定义 = TROUBLE_BREWING_ROLE_CATALOG.map(({ id, sourceId }) => ({
  abilityId: `tb.${id}.ability`,
  roleId: `tb.${id}`,
  handlerId: `tb.${id}.handler`,
  sourceRefs: [{ sourceId }],
  triggers: 触发定义[id].map((trigger, index) => 建立触发(id, trigger, index)),
  actionInputSchema:
    id === "fortuneteller" ? 双目标输入 : 有目标.has(id) ? 目标输入 : 空输入,
  allowedEventTypes: 信息角色集合.has(id) ? 信息事件 : 允许事件[id] ?? [],
  usageLimit: ["ravenkeeper", "virgin", "slayer"].includes(id) ? 1 : null,
  retainsAfterDeath: ["ravenkeeper", "recluse", "saint"].includes(id),
  intoxicationPolicy: [
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortuneteller",
    "undertaker",
    "ravenkeeper",
    "spy",
  ].includes(id)
    ? "storyteller-information"
    : "suppress",
  ...([
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortuneteller",
    "undertaker",
    "ravenkeeper",
    "spy",
    "imp",
    "slayer",
    "virgin",
  ].includes(id)
    ? {
        adjudicationResultSchema: {
          type: "object",
          additionalProperties: true,
        },
      }
    : {}),
})).sort((left, right) => left.abilityId.localeCompare(right.abilityId));

const manifest = {
  $schema: "./role-ability-package.schema.json",
  packageId: TROUBLE_BREWING_PACKAGE_ID,
  version: TROUBLE_BREWING_PACKAGE_VERSION,
  frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
  canonicalLanguage: "zh-CN",
  ruleset: M1_RULESET_IDENTITY,
  sources: sourceManifest.sources,
  eventTypes: TROUBLE_BREWING_EVENT_TYPE_LIST,
  abilities: 能力定义,
};
manifest.integrity = {
  algorithm: "sha256",
  scope: "manifest-without-integrity",
  value: calculateRoleAbilityPackageIntegrity(manifest),
};

export const TROUBLE_BREWING_ROLE_PACKAGE_MANIFEST = Object.freeze(manifest);
export const TROUBLE_BREWING_ROLE_PACKAGE = createRoleAbilityPackage({
  manifest,
  handlers: createTroubleBrewingHandlers(),
  eventDefinitions: TROUBLE_BREWING_EVENT_DEFINITIONS,
  ruleHooks: TROUBLE_BREWING_RULE_HOOKS,
});
