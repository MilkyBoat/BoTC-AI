import Ajv from "ajv";
import protocolSchema from "../protocol/protocol.schema.json";
import viewSchema from "./participant-views.schema.json";
import { PARTICIPANT_VIEW_SCHEMA_ID } from "./constants";
import { participantViewError } from "./errors";

const viewReference = (name) => ({
  $ref: `${PARTICIPANT_VIEW_SCHEMA_ID}#/definitions/${name}`,
});

const formatErrors = (errors = []) =>
  errors.map(({ dataPath, keyword, message, params }) => ({
    path: dataPath || "/",
    keyword,
    message,
    params,
  }));

const assertDefinition = (definition) => {
  if (
    !definition ||
    typeof definition !== "object" ||
    typeof definition.type !== "string" ||
    !definition.payloadSchema ||
    typeof definition.payloadSchema !== "object" ||
    typeof definition.project !== "function" ||
    !Array.isArray(definition.outputDefinitions) ||
    definition.outputDefinitions.length === 0
  ) {
    throw participantViewError(
      "INVALID_EVENT_DEFINITION",
      "视图事件定义缺少类型、负载 Schema、投影器或输出定义",
    );
  }
};

const compilePayload = (ajv, schema, type, kind) => {
  try {
    return ajv.compile(schema);
  } catch (error) {
    throw participantViewError(
      "INVALID_EVENT_DEFINITION",
      `${kind} ${type} 的负载 Schema 无法编译`,
      { type, reason: error.message },
    );
  }
};

export const createViewValidators = (eventDefinitions) => {
  const ajv = new Ajv({ allErrors: true, jsonPointers: true });
  ajv.addSchema(protocolSchema);
  ajv.addSchema(viewSchema);
  const compile = (name) => ajv.compile(viewReference(name));
  const sourcePayloads = new Map();
  const outputPayloads = new Map();

  eventDefinitions.forEach((definition) => {
    assertDefinition(definition);
    if (sourcePayloads.has(definition.type)) {
      throw participantViewError(
        "DUPLICATE_EVENT_TYPE",
        `领域事件类型重复注册：${definition.type}`,
        { type: definition.type },
      );
    }
    sourcePayloads.set(
      definition.type,
      compilePayload(
        ajv,
        definition.payloadSchema,
        definition.type,
        "领域事件",
      ),
    );
    definition.outputDefinitions.forEach((output) => {
      if (
        !output ||
        typeof output.type !== "string" ||
        !output.payloadSchema ||
        typeof output.payloadSchema !== "object"
      ) {
        throw participantViewError(
          "INVALID_EVENT_DEFINITION",
          `领域事件 ${definition.type} 包含无效输出定义`,
        );
      }
      if (outputPayloads.has(output.type)) {
        throw participantViewError(
          "DUPLICATE_VIEW_EVENT_TYPE",
          `视图事件类型重复注册：${output.type}`,
          { type: output.type },
        );
      }
      outputPayloads.set(
        output.type,
        compilePayload(ajv, output.payloadSchema, output.type, "视图事件"),
      );
    });
  });

  return {
    source: compile("participantViewSource"),
    principal: compile("principal"),
    snapshots: {
      storyteller: compile("storytellerSnapshot"),
      seat: compile("seatSnapshot"),
      public: compile("publicSnapshot"),
      observer: compile("observerSnapshot"),
    },
    domainEvent: ajv.compile({
      $ref: `${protocolSchema.$id}#/definitions/eventEnvelope`,
    }),
    viewEvent: compile("viewEvent"),
    sourcePayloads,
    outputPayloads,
  };
};

export const assertViewValid = (validator, value, code, message) => {
  if (!validator(value)) {
    throw participantViewError(code, message, {
      errors: formatErrors(validator.errors),
    });
  }
};
