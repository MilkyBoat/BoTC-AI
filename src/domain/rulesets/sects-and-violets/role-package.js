import sourceManifest from "../../../../knowledge/rulesets/sects-and-violets-sources.json";
import {
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
} from "../../abilities";
import { M1_RULESET_IDENTITY } from "../../protocol";
import {
  SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER,
  SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER,
  SECTS_AND_VIOLETS_PACKAGE_ID,
  SECTS_AND_VIOLETS_PACKAGE_VERSION,
  SECTS_AND_VIOLETS_ROLE_CATALOG,
} from "./catalog";
import {
  SECTS_AND_VIOLETS_EVENT_DEFINITIONS,
  SECTS_AND_VIOLETS_EVENT_TYPE_LIST,
  SECTS_AND_VIOLETS_EVENT_TYPES,
} from "./events";
import { createSectsAndVioletsHandlers } from "./handlers";
import { SECTS_AND_VIOLETS_RULE_HOOKS } from "./hooks";

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
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: 稳定Id,
    },
    roleId: 稳定Id,
    ruling: { enum: ["complied", "not-complied", "no-ruling"] },
    execute: { type: "boolean" },
    evidenceSummary: { type: "string", maxLength: 512 },
    questionId: 稳定Id,
    skip: { type: "boolean" },
  },
});

const 信息角色 = new Set([
  "clockmaker",
  "dreamer",
  "mathematician",
  "flowergirl",
  "towncrier",
  "oracle",
  "savant",
  "seamstress",
  "artist",
  "juggler",
  "sage",
]);
const 限次角色 = new Set(["seamstress", "philosopher", "artist"]);

const 角色事件 = Object.freeze({
  clockmaker: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  dreamer: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  snakecharmer: [
    SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTERS_SWAPPED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  mathematician: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  flowergirl: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  towncrier: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  oracle: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  savant: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  seamstress: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  philosopher: [SECTS_AND_VIOLETS_EVENT_TYPES.PHILOSOPHER_ABILITY_GAINED],
  artist: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  juggler: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  sage: [SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED],
  mutant: [
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MADNESS_RULING_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  sweetheart: [SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED],
  barber: [
    SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTERS_SWAPPED,
  ],
  klutz: [
    SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
  ],
  eviltwin: [SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED],
  witch: [SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED],
  cerenovus: [
    SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MADNESS_RULING_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  pithag: [
    SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTER_CHANGED,
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  fanggu: [
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.FANG_GU_JUMPED,
  ],
  vigormortis: [
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  nodashii: [
    SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  ],
  vortox: [SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED],
});

const 首夜角色 = new Set(SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER);
const 其他夜角色 = new Set(SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER);
const 域事件角色 = Object.freeze({
  savant: "phase.advanced",
  artist: "phase.advanced",
  juggler: "phase.advanced",
  mutant: "phase.advanced",
  sage: SECTS_AND_VIOLETS_EVENT_TYPES.SAGE_AWAKENED,
  sweetheart: SECTS_AND_VIOLETS_EVENT_TYPES.SWEETHEART_TRIGGERED,
  barber: SECTS_AND_VIOLETS_EVENT_TYPES.BARBER_TRIGGERED,
  klutz: SECTS_AND_VIOLETS_EVENT_TYPES.KLUTZ_TRIGGERED,
});
const 死亡触发角色 = new Set(["sage", "sweetheart", "barber", "klutz"]);

const 角色行为主体 = (roleId) =>
  信息角色.has(roleId) && roleId !== "dreamer" && roleId !== "seamstress"
    ? "storyteller"
    : "seat";

const 建立触发 = (roleId) => {
  const triggers = [];
  if (首夜角色.has(roleId)) {
    triggers.push({
      triggerId: `snv.${roleId}.first-night`,
      kind: "first-night",
      priority: (SECTS_AND_VIOLETS_FIRST_NIGHT_ORDER.indexOf(roleId) + 1) * 100,
      actor: 角色行为主体(roleId),
      skippable: ["philosopher", "seamstress"].includes(roleId),
    });
  }
  if (其他夜角色.has(roleId) && !死亡触发角色.has(roleId)) {
    triggers.push({
      triggerId: `snv.${roleId}.other-night`,
      kind: "other-night",
      priority: (SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER.indexOf(roleId) + 1) * 100,
      actor: 角色行为主体(roleId),
      skippable: ["philosopher", "seamstress", "pithag", "barber"].includes(
        roleId,
      ),
    });
  }
  if (域事件角色[roleId]) {
    triggers.push({
      triggerId: `snv.${roleId}.domain-event`,
      kind: "domain-event",
      priority: 死亡触发角色.has(roleId)
        ? (SECTS_AND_VIOLETS_OTHER_NIGHT_ORDER.indexOf(roleId) + 1) * 100
        : 100,
      actor: ["mutant", "sage", "sweetheart", "barber"].includes(roleId)
        ? "storyteller"
        : "seat",
      skippable: false,
      eventTypes: [域事件角色[roleId]],
    });
  }
  if (triggers.length === 0) {
    triggers.push({
      triggerId: `snv.${roleId}.entry`,
      kind: "entry",
      priority: 100,
      actor: "system",
      skippable: false,
    });
  }
  return triggers;
};

const 能力定义 = SECTS_AND_VIOLETS_ROLE_CATALOG.map(({ id, sourceId }) => ({
  abilityId: `snv.${id}.ability`,
  roleId: `snv.${id}`,
  handlerId: `snv.${id}.handler`,
  sourceRefs: [{ sourceId }],
  triggers: 建立触发(id),
  actionInputSchema: 通用输入,
  allowedEventTypes: 角色事件[id].slice().sort(),
  usageLimit: 限次角色.has(id) ? 1 : null,
  retainsAfterDeath: ["sage", "sweetheart", "barber", "klutz"].includes(id),
  intoxicationPolicy: 信息角色.has(id) ? "storyteller-information" : "suppress",
  ...(信息角色.has(id) || ["pithag", "sweetheart", "vigormortis"].includes(id)
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
  packageId: SECTS_AND_VIOLETS_PACKAGE_ID,
  version: SECTS_AND_VIOLETS_PACKAGE_VERSION,
  frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
  canonicalLanguage: "zh-CN",
  ruleset: M1_RULESET_IDENTITY,
  sources: sourceManifest.sources,
  eventTypes: SECTS_AND_VIOLETS_EVENT_TYPE_LIST,
  abilities: 能力定义,
};
manifest.integrity = {
  algorithm: "sha256",
  scope: "manifest-without-integrity",
  value: calculateRoleAbilityPackageIntegrity(manifest),
};

export const SECTS_AND_VIOLETS_ROLE_PACKAGE_MANIFEST = Object.freeze(manifest);
export const SECTS_AND_VIOLETS_ROLE_PACKAGE = createRoleAbilityPackage({
  manifest,
  handlers: createSectsAndVioletsHandlers(),
  eventDefinitions: SECTS_AND_VIOLETS_EVENT_DEFINITIONS,
  ruleHooks: SECTS_AND_VIOLETS_RULE_HOOKS,
});
