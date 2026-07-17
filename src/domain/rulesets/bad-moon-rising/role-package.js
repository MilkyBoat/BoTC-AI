import sourceManifest from "../../../../knowledge/rulesets/bad-moon-rising-sources.json";
import {
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
} from "../../abilities";
import { M1_RULESET_IDENTITY } from "../../protocol";
import {
  BAD_MOON_RISING_PACKAGE_ID,
  BAD_MOON_RISING_PACKAGE_VERSION,
  BAD_MOON_RISING_FIRST_NIGHT_ORDER,
  BAD_MOON_RISING_OTHER_NIGHT_ORDER,
  BAD_MOON_RISING_ROLE_CATALOG,
} from "./catalog";
import {
  BAD_MOON_RISING_EVENT_DEFINITIONS,
  BAD_MOON_RISING_EVENT_TYPE_LIST,
  BAD_MOON_RISING_EVENT_TYPES,
} from "./events";
import { BAD_MOON_RISING_RULE_HOOKS } from "./hooks";
import { createBadMoonRisingHandlers } from "./handlers";

const 稳定Id = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};

const 通用输入 = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    targetSeatId: 稳定Id,
    targetSeatIds: {
      type: "array",
      maxItems: 3,
      items: 稳定Id,
    },
    roleId: 稳定Id,
    guessedRoleId: 稳定Id,
    drunkSeatId: 稳定Id,
    statementId: 稳定Id,
    truth: { type: "boolean" },
    regurgitateSeatId: 稳定Id,
    skip: { type: "boolean" },
  },
});

const 首夜角色 = new Set([
  "sailor",
  "courtier",
  "devilsadvocate",
  "pukka",
  "chambermaid",
]);
const 其他夜角色 = new Set([
  "sailor",
  "innkeeper",
  "courtier",
  "gambler",
  "devilsadvocate",
  "lunatic",
  "exorcist",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "assassin",
  "godfather",
  "professor",
  "gossip",
  "tinker",
  "moonchild",
  "chambermaid",
]);
const 信息角色 = new Set(["chambermaid"]);
const 裁量角色 = new Set(["sailor", "chambermaid", "innkeeper"]);
const 限次角色 = new Set(["courtier", "professor", "assassin", "fool"]);

const 死亡事件 = [
  BAD_MOON_RISING_EVENT_TYPES.ABILITY_USE_CONSUMED,
  BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
  BAD_MOON_RISING_EVENT_TYPES.GAME_ENDED,
].sort();
const 允许事件 = {
  sailor: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED],
  chambermaid: [BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED],
  exorcist: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED],
  innkeeper: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED],
  gambler: [BAD_MOON_RISING_EVENT_TYPES.ACTION_RECORDED, ...死亡事件].sort(),
  gossip: [BAD_MOON_RISING_EVENT_TYPES.ACTION_RECORDED, ...死亡事件].sort(),
  courtier: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED],
  professor: [BAD_MOON_RISING_EVENT_TYPES.PLAYER_REVIVED],
  tinker: 死亡事件,
  moonchild: [BAD_MOON_RISING_EVENT_TYPES.ACTION_RECORDED, ...死亡事件].sort(),
  lunatic: [BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED],
  godfather: 死亡事件,
  devilsadvocate: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED],
  assassin: 死亡事件,
  zombuul: 死亡事件,
  pukka: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED, ...死亡事件].sort(),
  shabaloth: [
    BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
    BAD_MOON_RISING_EVENT_TYPES.PLAYER_REVIVED,
    ...死亡事件,
  ].sort(),
  po: [BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED, ...死亡事件].sort(),
};

const 建立触发 = (roleId) => {
  const triggers = [];
  if (首夜角色.has(roleId)) {
    triggers.push({
      triggerId: `bmr.${roleId}.first-night`,
      kind: "first-night",
      priority: (BAD_MOON_RISING_FIRST_NIGHT_ORDER.indexOf(roleId) + 1) * 100,
      actor: roleId === "chambermaid" ? "storyteller" : "seat",
      skippable: false,
    });
  }
  if (其他夜角色.has(roleId)) {
    triggers.push({
      triggerId: `bmr.${roleId}.other-night`,
      kind: "other-night",
      priority: (BAD_MOON_RISING_OTHER_NIGHT_ORDER.indexOf(roleId) + 1) * 100,
      actor: ["gossip", "tinker"].includes(roleId) ? "storyteller" : "seat",
      skippable: ["courtier", "professor", "assassin", "po"].includes(roleId),
    });
  }
  if (triggers.length === 0) {
    triggers.push({
      triggerId: `bmr.${roleId}.entry`,
      kind: "entry",
      priority: 100,
      actor: "system",
      skippable: false,
    });
  }
  return triggers;
};

const 能力定义 = BAD_MOON_RISING_ROLE_CATALOG.map(({ id, sourceId }) => ({
  abilityId: `bmr.${id}.ability`,
  roleId: `bmr.${id}`,
  handlerId: `bmr.${id}.handler`,
  sourceRefs: [{ sourceId }],
  triggers: 建立触发(id),
  actionInputSchema: 通用输入,
  allowedEventTypes: 允许事件[id] ?? [],
  usageLimit: 限次角色.has(id) ? 1 : null,
  retainsAfterDeath: ["moonchild", "zombuul"].includes(id),
  intoxicationPolicy: 信息角色.has(id) ? "storyteller-information" : "suppress",
  ...(裁量角色.has(id)
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
  packageId: BAD_MOON_RISING_PACKAGE_ID,
  version: BAD_MOON_RISING_PACKAGE_VERSION,
  frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
  canonicalLanguage: "zh-CN",
  ruleset: M1_RULESET_IDENTITY,
  sources: sourceManifest.sources,
  eventTypes: BAD_MOON_RISING_EVENT_TYPE_LIST,
  abilities: 能力定义,
};
manifest.integrity = {
  algorithm: "sha256",
  scope: "manifest-without-integrity",
  value: calculateRoleAbilityPackageIntegrity(manifest),
};

export const BAD_MOON_RISING_ROLE_PACKAGE_MANIFEST = Object.freeze(manifest);
export const BAD_MOON_RISING_ROLE_PACKAGE = createRoleAbilityPackage({
  manifest,
  handlers: createBadMoonRisingHandlers(),
  eventDefinitions: BAD_MOON_RISING_EVENT_DEFINITIONS,
  ruleHooks: BAD_MOON_RISING_RULE_HOOKS,
});
