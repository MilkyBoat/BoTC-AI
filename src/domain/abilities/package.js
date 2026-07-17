import Ajv from "ajv";
import packageSchema from "../../../knowledge/rulesets/role-ability-package.schema.json";
import frameworkManifest from "../../../knowledge/rulesets/m1-role-ability-framework-package.json";
import scope from "../../../knowledge/rulesets/m1-ruleset-scope.json";
import { DomainProtocolError, protocolError } from "../protocol/errors";
import { canonicalizeJson, cloneAndFreezeJson } from "../protocol/immutable";
import { M1_RULESET_IDENTITY } from "../protocol/ruleset";
import { sha256Hex } from "../protocol/sha256";

const validateManifest = new Ajv({ allErrors: true }).compile(packageSchema);
const sourceIds = new Set(scope.sources.map(({ id }) => id));

const sameJson = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);

const sortedUnique = (values) =>
  new Set(values).size === values.length &&
  values.every((value, index) => index === 0 || values[index - 1] < value);

const formatSchemaErrors = (errors = []) =>
  errors.map(({ dataPath, keyword, message, params }) => ({
    path: dataPath || "/",
    keyword,
    message,
    params,
  }));

export const calculateRoleAbilityPackageIntegrity = (input) => {
  const manifest = JSON.parse(JSON.stringify(input));
  delete manifest.integrity;
  return `sha256:${sha256Hex(canonicalizeJson(manifest))}`;
};

const assertManifest = (manifest) => {
  if (!validateManifest(manifest)) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE",
      "角色能力规则包清单不符合 Schema",
      {
        errors: formatSchemaErrors(validateManifest.errors),
      },
    );
  }
  if (
    manifest.integrity.value !== calculateRoleAbilityPackageIntegrity(manifest)
  ) {
    throw protocolError(
      "ROLE_PACKAGE_INTEGRITY_MISMATCH",
      "角色能力规则包清单完整性校验失败",
    );
  }
  if (!sameJson(manifest.ruleset, M1_RULESET_IDENTITY)) {
    throw protocolError(
      "ROLE_PACKAGE_RULESET_MISMATCH",
      "角色能力规则包没有精确绑定当前 M1 规则集",
    );
  }
  if (!sortedUnique(manifest.eventTypes)) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE",
      "角色能力规则包事件类型必须唯一并按稳定 ID 排序",
    );
  }
  const abilityIds = manifest.abilities.map(({ abilityId }) => abilityId);
  const handlerIds = manifest.abilities.map(({ handlerId }) => handlerId);
  if (
    !sortedUnique(abilityIds) ||
    new Set(handlerIds).size !== handlerIds.length
  ) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE",
      "能力定义必须按唯一 ID 排序且处理器 ID 不得重复",
    );
  }
  for (const ability of manifest.abilities) {
    const triggerIds = ability.triggers.map(({ triggerId }) => triggerId);
    const sourceRefIds = ability.sourceRefs.map(({ sourceId }) => sourceId);
    if (
      new Set(triggerIds).size !== triggerIds.length ||
      new Set(sourceRefIds).size !== sourceRefIds.length ||
      sourceRefIds.some((sourceId) => !sourceIds.has(sourceId)) ||
      ability.allowedEventTypes.some(
        (eventType) => !manifest.eventTypes.includes(eventType),
      )
    ) {
      throw protocolError(
        "INVALID_ROLE_PACKAGE",
        `能力 ${ability.abilityId} 的触发、来源或事件白名单无效`,
      );
    }
  }
};

const assertRuntime = (manifest, handlers, eventDefinitions) => {
  if (
    !handlers ||
    typeof handlers !== "object" ||
    Array.isArray(handlers) ||
    !Array.isArray(eventDefinitions)
  ) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE_RUNTIME",
      "角色能力规则包运行时定义无效",
    );
  }
  const expectedHandlers = manifest.abilities.map(({ handlerId }) => handlerId);
  const actualHandlers = Object.keys(handlers).sort();
  const expectedEventTypes = manifest.eventTypes;
  const actualEventTypes = eventDefinitions.map(({ type }) => type).sort();
  if (
    !sameJson(expectedHandlers.slice().sort(), actualHandlers) ||
    !sameJson(expectedEventTypes, actualEventTypes)
  ) {
    throw protocolError(
      "INVALID_ROLE_PACKAGE_RUNTIME",
      "规则包清单与处理器或语义事件定义不一致",
    );
  }
  for (const handlerId of expectedHandlers) {
    const handler = handlers[handlerId];
    if (!handler || typeof handler.resolve !== "function") {
      throw protocolError(
        "INVALID_ROLE_PACKAGE_RUNTIME",
        `能力处理器 ${handlerId} 缺少 resolve 函数`,
      );
    }
  }
  for (const ability of manifest.abilities) {
    const handler = handlers[ability.handlerId];
    if (
      ability.intoxicationPolicy === "storyteller-information" &&
      (typeof handler.createIntoxicatedAdjudication !== "function" ||
        typeof handler.resolveAdjudication !== "function")
    ) {
      throw protocolError(
        "INVALID_ROLE_PACKAGE_RUNTIME",
        `信息能力处理器 ${ability.handlerId} 缺少结构化裁量函数`,
      );
    }
  }
  for (const definition of eventDefinitions) {
    if (
      !definition ||
      typeof definition.type !== "string" ||
      !definition.payloadSchema ||
      typeof definition.reduce !== "function"
    ) {
      throw protocolError(
        "INVALID_ROLE_PACKAGE_RUNTIME",
        "规则包语义事件定义缺少类型、Schema 或归约器",
      );
    }
  }
};

const compileAbilityValidators = (manifest) => {
  const ajv = new Ajv({ allErrors: true, jsonPointers: true });
  return new Map(
    manifest.abilities.map((ability) => {
      try {
        return [
          ability.abilityId,
          Object.freeze({
            actionInput: ajv.compile(ability.actionInputSchema),
            adjudicationResult:
              ability.adjudicationResultSchema === undefined
                ? null
                : ajv.compile(ability.adjudicationResultSchema),
          }),
        ];
      } catch (error) {
        throw protocolError(
          "INVALID_ROLE_PACKAGE",
          `能力 ${ability.abilityId} 的动态 Schema 无法编译`,
          { reason: error.message },
        );
      }
    }),
  );
};

export const createRoleAbilityPackage = ({
  manifest: inputManifest,
  handlers = {},
  eventDefinitions = [],
}) => {
  let manifest;
  try {
    manifest = JSON.parse(JSON.stringify(inputManifest));
  } catch (error) {
    throw protocolError("INVALID_ROLE_PACKAGE", "角色能力规则包清单不是 JSON", {
      reason: error.message,
    });
  }
  assertManifest(manifest);
  assertRuntime(manifest, handlers, eventDefinitions);
  const frozenManifest = cloneAndFreezeJson(manifest);
  const abilityById = new Map(
    frozenManifest.abilities.map((ability) => [ability.abilityId, ability]),
  );
  const handlerById = new Map(Object.entries(handlers));
  const validatorsByAbilityId = compileAbilityValidators(frozenManifest);
  const identity = cloneAndFreezeJson({
    id: manifest.packageId,
    version: manifest.version,
    frameworkVersion: manifest.frameworkVersion,
    integrity: manifest.integrity.value,
  });
  const runtime = {
    identity,
    manifest: frozenManifest,
    eventDefinitions: Object.freeze(eventDefinitions.slice()),
    getAbilityDefinition: (abilityId) => abilityById.get(abilityId) ?? null,
    getHandler: (handlerId) => handlerById.get(handlerId) ?? null,
    getValidators: (abilityId) => validatorsByAbilityId.get(abilityId) ?? null,
  };
  return Object.freeze(runtime);
};

export const M1_ROLE_ABILITY_FRAMEWORK_PACKAGE = createRoleAbilityPackage({
  manifest: frameworkManifest,
});

export const isRoleAbilityPackageError = (error) =>
  error instanceof DomainProtocolError;
