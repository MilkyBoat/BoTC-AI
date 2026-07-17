import Ajv from "ajv";
import protocolSchema from "./protocol.schema.json";
import { PROTOCOL_SCHEMA_ID } from "./constants";
import { protocolError } from "./errors";

const definitionReference = (name) => ({
  $ref: `${PROTOCOL_SCHEMA_ID}#/definitions/${name}`,
});

const formatErrors = (errors = []) =>
  errors.map(({ dataPath, keyword, message, params }) => ({
    path: dataPath || "/",
    keyword,
    message,
    params,
  }));

const compilePayloadValidators = (ajv, definitions, kind) => {
  const validators = new Map();
  definitions.forEach((definition) => {
    if (
      !definition ||
      typeof definition.type !== "string" ||
      typeof definition.payloadSchema !== "object" ||
      definition.payloadSchema === null
    ) {
      throw protocolError(
        "INVALID_DEFINITION",
        `${kind}定义缺少类型或负载 Schema`,
      );
    }
    if (validators.has(definition.type)) {
      throw protocolError(
        kind === "命令" ? "DUPLICATE_COMMAND_TYPE" : "DUPLICATE_EVENT_TYPE",
        `${kind}类型重复注册：${definition.type}`,
        { type: definition.type },
      );
    }
    try {
      validators.set(definition.type, ajv.compile(definition.payloadSchema));
    } catch (error) {
      throw protocolError(
        "INVALID_DEFINITION",
        `${kind} ${definition.type} 的负载 Schema 无法编译`,
        { type: definition.type, reason: error.message },
      );
    }
  });
  return validators;
};

export const createProtocolValidators = ({
  commandDefinitions,
  eventDefinitions,
}) => {
  const ajv = new Ajv({ allErrors: true, jsonPointers: true });
  ajv.addSchema(protocolSchema);
  const compile = (name) => ajv.compile(definitionReference(name));
  return {
    commandEnvelope: compile("commandEnvelope"),
    eventEnvelope: compile("eventEnvelope"),
    state: compile("state"),
    receipt: compile("receipt"),
    eventStream: compile("eventStream"),
    commandPayloads: compilePayloadValidators(ajv, commandDefinitions, "命令"),
    eventPayloads: compilePayloadValidators(ajv, eventDefinitions, "事件"),
  };
};

export const assertValid = (validator, value, code, message) => {
  if (!validator(value)) {
    throw protocolError(code, message, {
      errors: formatErrors(validator.errors),
    });
  }
};

export const schemaReference = definitionReference;
