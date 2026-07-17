/* global globalThis */

import {
  BUILTIN_COMMAND_DEFINITIONS,
  BUILTIN_EVENT_DEFINITIONS,
} from "./builtins";
import { EVENT_TYPES, PROTOCOL_VERSION } from "./constants";
import { DomainProtocolError, protocolError } from "./errors";
import {
  canonicalizeJson,
  cloneAndFreezeJson,
  cloneJson,
  deepFreeze,
} from "./immutable";
import { M1_RULESET_IDENTITY } from "./ruleset";
import { sha256Hex } from "./sha256";
import { assertValid, createProtocolValidators } from "./validators";
import { assertBasicStateInvariants } from "../rules/basic";
import { assertNominationStateInvariants } from "../rules/nomination";
import { M1_ROLE_ABILITY_FRAMEWORK_PACKAGE } from "../abilities";
import { MAX_REACTION_EVENTS } from "../abilities/constants";
import { createRoleAbilityFramework } from "../abilities/framework";

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENGINE_INTERNALS = new WeakMap();
const RESTORE_STREAM = Symbol("domain-protocol-restore-stream");
const IS_SUPPORTED_RULESET = Symbol("is-supported-ruleset");
const IS_SUPPORTED_ROLE_PACKAGE = Symbol("is-supported-role-package");
const CURRENT_REVISION = Symbol("current-revision");
const VALIDATE_COMMAND = Symbol("validate-command");
const PERSIST_RECEIPT = Symbol("persist-receipt");
const REJECT_COMMAND = Symbol("reject-command");
const CREATE_EVENT = Symbol("create-event");
const REDUCE_EVENT = Symbol("reduce-event");
const RESTORE = Symbol("restore");
const VALIDATE_RECEIPT_HISTORY = Symbol("validate-receipt-history");

const getInternals = (engine) => {
  const internals = ENGINE_INTERNALS.get(engine);
  if (!internals) {
    throw protocolError("INVALID_ENGINE", "领域协议引擎实例无效");
  }
  return internals;
};

const defaultClock = () => new Date().toISOString();
const defaultIdFactory = (kind) => {
  if (globalThis.crypto?.randomUUID) {
    return `${kind}-${globalThis.crypto.randomUUID()}`;
  }
  throw protocolError(
    "ID_FACTORY_REQUIRED",
    "当前浏览器不支持安全 ID 生成，请显式提供 idFactory",
  );
};

const sameJson = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);

const commandFingerprint = (command) =>
  `sha256:${sha256Hex(canonicalizeJson(command))}`;

const cloneProtocolInput = (value, code, message) => {
  try {
    return cloneJson(value);
  } catch (error) {
    throw protocolError(code, message, { reason: error.message });
  }
};

const callDependency = (dependency, args, code, message) => {
  try {
    return dependency(...args);
  } catch (error) {
    if (error instanceof DomainProtocolError) throw error;
    throw protocolError(code, message, { reason: error.message });
  }
};

const mergeDefinitions = (builtins, extensions, kind) => {
  const definitions = [...builtins, ...(extensions ?? [])];
  const seen = new Set();
  definitions.forEach((definition) => {
    if (seen.has(definition?.type)) {
      throw protocolError(
        kind === "command" ? "DUPLICATE_COMMAND_TYPE" : "DUPLICATE_EVENT_TYPE",
        `${kind === "command" ? "命令" : "事件"}类型重复注册：${
          definition?.type ?? "<unknown>"
        }`,
        { type: definition?.type },
      );
    }
    seen.add(definition?.type);
  });
  return definitions;
};

const assertDefinitionFunctions = (commandDefinitions, eventDefinitions) => {
  commandDefinitions.forEach((definition) => {
    if (!definition || typeof definition !== "object") {
      throw protocolError("INVALID_DEFINITION", "命令定义必须是对象");
    }
    if (typeof definition.handle !== "function") {
      throw protocolError(
        "INVALID_DEFINITION",
        `命令 ${definition.type} 缺少处理器`,
      );
    }
  });
  eventDefinitions.forEach((definition) => {
    if (!definition || typeof definition !== "object") {
      throw protocolError("INVALID_DEFINITION", "事件定义必须是对象");
    }
    if (typeof definition.reduce !== "function") {
      throw protocolError(
        "INVALID_DEFINITION",
        `事件 ${definition.type} 缺少归约器`,
      );
    }
  });
};

const assertEventReactions = (reactions, eventDefinitions) => {
  if (!Array.isArray(reactions)) {
    throw protocolError("INVALID_DEFINITION", "事件反应器定义必须是数组");
  }
  const eventTypes = new Set(eventDefinitions.map(({ type }) => type));
  const ids = new Set();
  reactions.forEach((reaction) => {
    if (
      !reaction ||
      !STABLE_ID_PATTERN.test(reaction.id ?? "") ||
      !Number.isInteger(reaction.priority) ||
      reaction.priority < 0 ||
      !Array.isArray(reaction.eventTypes) ||
      reaction.eventTypes.length === 0 ||
      new Set(reaction.eventTypes).size !== reaction.eventTypes.length ||
      reaction.eventTypes.some((type) => !eventTypes.has(type)) ||
      typeof reaction.react !== "function" ||
      ids.has(reaction.id)
    ) {
      throw protocolError("INVALID_DEFINITION", "事件反应器定义无效", {
        id: reaction?.id,
      });
    }
    ids.add(reaction.id);
  });
  return Object.freeze(
    reactions
      .slice()
      .sort(
        (left, right) =>
          left.priority - right.priority || left.id.localeCompare(right.id),
      ),
  );
};

const assertStateInvariantDefinitions = (definitions) => {
  if (!Array.isArray(definitions)) {
    throw protocolError("INVALID_DEFINITION", "状态不变量定义必须是数组");
  }
  const ids = new Set();
  definitions.forEach((definition) => {
    if (
      !definition ||
      !STABLE_ID_PATTERN.test(definition.id ?? "") ||
      typeof definition.assert !== "function" ||
      ids.has(definition.id)
    ) {
      throw protocolError("INVALID_DEFINITION", "状态不变量定义无效", {
        id: definition?.id,
      });
    }
    ids.add(definition.id);
  });
  return Object.freeze(
    definitions.slice().sort((a, b) => a.id.localeCompare(b.id)),
  );
};

const assertStateInvariants = (state, extensionDefinitions) => {
  assertBasicStateInvariants(state);
  assertNominationStateInvariants(state);
  extensionDefinitions.forEach((definition) => {
    try {
      definition.assert(state);
    } catch (error) {
      if (error instanceof DomainProtocolError) throw error;
      throw protocolError(
        "INVARIANT_VIOLATION",
        `扩展状态不变量 ${definition.id} 校验失败`,
        { reason: error.message },
      );
    }
  });
};

const createReceipt = ({
  command,
  fingerprint,
  status,
  revisionBefore,
  revisionAfter,
  eventIds,
  recordedAt,
  error,
}) => {
  const receipt = {
    schemaVersion: PROTOCOL_VERSION,
    commandId: command.commandId,
    commandFingerprint: fingerprint,
    gameId: command.gameId,
    status,
    revisionBefore,
    revisionAfter,
    eventIds,
    recordedAt,
  };
  if (error) receipt.error = error;
  return receipt;
};

const rejection = (code, message, details) => ({
  rejection: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
});

const assertHandlerResult = (result) => {
  if (!result || typeof result !== "object") {
    throw protocolError(
      "INVALID_HANDLER_RESULT",
      "命令处理器必须返回事件列表或领域拒绝",
    );
  }
  if (result.rejection) {
    const { code, message, details } = result.rejection;
    if (
      !/^[A-Z][A-Z0-9_]{1,63}$/.test(code ?? "") ||
      typeof message !== "string" ||
      message.length === 0 ||
      (details !== undefined &&
        (details === null ||
          typeof details !== "object" ||
          Array.isArray(details)))
    ) {
      throw protocolError(
        "INVALID_HANDLER_RESULT",
        "命令处理器返回了无效的领域拒绝",
      );
    }
    return;
  }
  if (!Array.isArray(result.events)) {
    throw protocolError(
      "INVALID_HANDLER_RESULT",
      "命令处理器必须返回 events 数组",
    );
  }
};

class DomainProtocolEngine {
  constructor(options) {
    const {
      gameId,
      clock = defaultClock,
      idFactory = defaultIdFactory,
      commandDefinitions,
      eventDefinitions,
      supportedRulesets = [M1_RULESET_IDENTITY],
      rolePackage = M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
      eventReactions = [],
      stateInvariants = [],
    } = options ?? {};
    const restoreStream = options?.[RESTORE_STREAM];
    if (!STABLE_ID_PATTERN.test(gameId ?? "")) {
      throw protocolError("INVALID_GAME_ID", "对局 ID 不符合稳定 ASCII 格式", {
        gameId,
      });
    }
    if (typeof clock !== "function" || typeof idFactory !== "function") {
      throw protocolError(
        "INVALID_DEPENDENCY",
        "clock 与 idFactory 必须是函数",
      );
    }
    const roleAbilityFramework = createRoleAbilityFramework(
      rolePackage,
      BUILTIN_EVENT_DEFINITIONS.map(({ type }) => type),
    );
    const mergedCommandDefinitions = mergeDefinitions(
      BUILTIN_COMMAND_DEFINITIONS,
      [
        ...roleAbilityFramework.commandDefinitions,
        ...(commandDefinitions ?? []),
      ],
      "command",
    );
    const mergedEventDefinitions = mergeDefinitions(
      BUILTIN_EVENT_DEFINITIONS,
      [
        ...roleAbilityFramework.eventDefinitions,
        ...rolePackage.eventDefinitions,
        ...(eventDefinitions ?? []),
      ],
      "event",
    );
    assertDefinitionFunctions(mergedCommandDefinitions, mergedEventDefinitions);
    const checkedEventReactions = assertEventReactions(
      [...roleAbilityFramework.eventReactions, ...eventReactions],
      mergedEventDefinitions,
    );
    const checkedStateInvariants = assertStateInvariantDefinitions([
      ...roleAbilityFramework.stateInvariants,
      ...stateInvariants,
    ]);
    const validators = createProtocolValidators({
      commandDefinitions: mergedCommandDefinitions,
      eventDefinitions: mergedEventDefinitions,
    });
    ENGINE_INTERNALS.set(this, {
      gameId,
      clock,
      idFactory,
      supportedRulesets: cloneAndFreezeJson(supportedRulesets),
      rolePackage,
      eventReactions: checkedEventReactions,
      stateInvariants: checkedStateInvariants,
      validators,
      commands: new Map(
        mergedCommandDefinitions.map((definition) => [
          definition.type,
          definition,
        ]),
      ),
      events: new Map(
        mergedEventDefinitions.map((definition) => [
          definition.type,
          definition,
        ]),
      ),
      state: null,
      eventLog: [],
      receiptLog: [],
      receiptsByCommandId: new Map(),
    });
    if (restoreStream !== undefined) {
      assertValid(
        validators.eventStream,
        restoreStream,
        "INVALID_EVENT_STREAM",
        "事件流不符合领域协议",
      );
      this[RESTORE](restoreStream);
    }
    Object.freeze(this);
  }

  getState() {
    const { state } = getInternals(this);
    return state === null ? null : cloneAndFreezeJson(state);
  }

  getEvents() {
    return cloneAndFreezeJson(getInternals(this).eventLog);
  }

  getReceipts() {
    return cloneAndFreezeJson(getInternals(this).receiptLog);
  }

  [IS_SUPPORTED_RULESET](ruleset) {
    return getInternals(this).supportedRulesets.some((candidate) =>
      sameJson(candidate, ruleset),
    );
  }

  [IS_SUPPORTED_ROLE_PACKAGE](identity) {
    return sameJson(getInternals(this).rolePackage.identity, identity);
  }

  [CURRENT_REVISION]() {
    return getInternals(this).state?.revision ?? 0;
  }

  [VALIDATE_COMMAND](command) {
    if (
      command &&
      typeof command === "object" &&
      command.protocolVersion !== PROTOCOL_VERSION
    ) {
      throw protocolError(
        "UNSUPPORTED_PROTOCOL_VERSION",
        `不支持命令协议版本：${String(command.protocolVersion)}`,
        { supported: PROTOCOL_VERSION },
      );
    }
    assertValid(
      getInternals(this).validators.commandEnvelope,
      command,
      "INVALID_COMMAND",
      "命令信封不符合领域协议",
    );
    const internals = getInternals(this);
    if (command.gameId !== internals.gameId) {
      throw protocolError("GAME_ID_MISMATCH", "命令不属于当前对局", {
        expected: internals.gameId,
        actual: command.gameId,
      });
    }
    const definition = internals.commands.get(command.type);
    if (!definition) {
      throw protocolError(
        "UNKNOWN_COMMAND_TYPE",
        `未注册命令类型：${command.type}`,
        { type: command.type },
      );
    }
    assertValid(
      internals.validators.commandPayloads.get(command.type),
      command.payload,
      "INVALID_COMMAND_PAYLOAD",
      `命令 ${command.type} 的负载不符合 Schema`,
    );
    return definition;
  }

  [PERSIST_RECEIPT](receipt) {
    const internals = getInternals(this);
    assertValid(
      internals.validators.receipt,
      receipt,
      "INVALID_RECEIPT",
      "命令回执不符合领域协议",
    );
    const readonlyReceipt = cloneAndFreezeJson(receipt);
    internals.receiptLog = deepFreeze([
      ...internals.receiptLog,
      readonlyReceipt,
    ]);
    internals.receiptsByCommandId.set(receipt.commandId, readonlyReceipt);
    return cloneAndFreezeJson(readonlyReceipt);
  }

  [REJECT_COMMAND](command, fingerprint, code, message, details) {
    const revision = this[CURRENT_REVISION]();
    return this[PERSIST_RECEIPT](
      createReceipt({
        command,
        fingerprint,
        status: "rejected",
        revisionBefore: revision,
        revisionAfter: revision,
        eventIds: [],
        recordedAt: callDependency(
          getInternals(this).clock,
          [],
          "CLOCK_FAILURE",
          "领域协议时钟执行失败",
        ),
        error: {
          code,
          message,
          ...(details === undefined ? {} : { details }),
        },
      }),
    );
  }

  dispatch(input) {
    const internals = getInternals(this);
    const command = cloneProtocolInput(
      input,
      "INVALID_COMMAND",
      "命令包含非 JSON 数据",
    );
    const definition = this[VALIDATE_COMMAND](command);
    const fingerprint = commandFingerprint(command);
    const existing = internals.receiptsByCommandId.get(command.commandId);
    if (existing) {
      if (existing.commandFingerprint !== fingerprint) {
        throw protocolError(
          "IDEMPOTENCY_CONFLICT",
          "同一命令 ID 已被不同内容占用",
          { commandId: command.commandId },
        );
      }
      return cloneAndFreezeJson(existing);
    }

    const revisionBefore = this[CURRENT_REVISION]();
    if (command.expectedRevision !== revisionBefore) {
      return this[REJECT_COMMAND](
        command,
        fingerprint,
        "REVISION_CONFLICT",
        "命令基于过期的状态修订",
        { expected: command.expectedRevision, actual: revisionBefore },
      );
    }

    const readonlyCommand = cloneAndFreezeJson(command);
    let result;
    try {
      result = definition.handle({
        state: internals.state,
        command: readonlyCommand,
        reject: rejection,
        isSupportedRuleset: (ruleset) => this[IS_SUPPORTED_RULESET](ruleset),
        isSupportedRolePackage: (identity) =>
          this[IS_SUPPORTED_ROLE_PACKAGE](identity),
        rolePackage: internals.rolePackage,
      });
    } catch (error) {
      if (error instanceof DomainProtocolError) throw error;
      throw protocolError("HANDLER_FAILURE", "命令处理器执行失败", {
        type: command.type,
        reason: error.message,
      });
    }
    assertHandlerResult(result);
    if (result.rejection) {
      const { code, message, details } = result.rejection;
      return this[REJECT_COMMAND](command, fingerprint, code, message, details);
    }

    const recordedAt = callDependency(
      internals.clock,
      [],
      "CLOCK_FAILURE",
      "领域协议时钟执行失败",
    );
    let trialState = internals.state;
    const trialEvents = [];
    const pendingCandidates = result.events.slice();
    while (pendingCandidates.length > 0) {
      if (
        trialEvents.length >= MAX_REACTION_EVENTS ||
        trialEvents.length + pendingCandidates.length > MAX_REACTION_EVENTS
      ) {
        throw protocolError(
          "EVENT_REACTION_LIMIT",
          `单个命令最多产生 ${MAX_REACTION_EVENTS} 个连锁事件`,
        );
      }
      const rawCandidate = pendingCandidates.shift();
      const candidate = cloneProtocolInput(
        rawCandidate,
        "INVALID_EVENT_CANDIDATE",
        "命令处理器生成了非 JSON 事件",
      );
      const event = this[CREATE_EVENT](
        candidate,
        command,
        trialState,
        recordedAt,
        revisionBefore + trialEvents.length + 1,
      );
      if (
        internals.eventLog.some(({ eventId }) => eventId === event.eventId) ||
        trialEvents.some(({ eventId }) => eventId === event.eventId)
      ) {
        throw protocolError(
          "DUPLICATE_EVENT_ID",
          `事件 ID 重复：${event.eventId}`,
          { eventId: event.eventId },
        );
      }
      const stateBefore = trialState;
      trialState = this[REDUCE_EVENT](trialState, event);
      trialEvents.push(event);
      const reactionCandidatesForEvent = [];
      for (const reaction of internals.eventReactions) {
        if (!reaction.eventTypes.includes(event.type)) continue;
        let reactionCandidates;
        try {
          reactionCandidates = reaction.react({
            stateBefore,
            stateAfter: trialState,
            event,
            rolePackage: internals.rolePackage,
          });
        } catch (error) {
          if (error instanceof DomainProtocolError) throw error;
          throw protocolError(
            "EVENT_REACTION_FAILURE",
            `事件反应器 ${reaction.id} 执行失败`,
            { reason: error.message },
          );
        }
        if (!Array.isArray(reactionCandidates)) {
          throw protocolError(
            "INVALID_REACTION_RESULT",
            `事件反应器 ${reaction.id} 必须返回候选事件数组`,
          );
        }
        reactionCandidatesForEvent.push(...reactionCandidates);
      }
      pendingCandidates.unshift(...reactionCandidatesForEvent);
    }
    assertStateInvariants(trialState, internals.stateInvariants);

    const receipt = createReceipt({
      command,
      fingerprint,
      status: "accepted",
      revisionBefore,
      revisionAfter: trialState?.revision ?? revisionBefore,
      eventIds: trialEvents.map(({ eventId }) => eventId),
      recordedAt,
    });
    assertValid(
      internals.validators.receipt,
      receipt,
      "INVALID_RECEIPT",
      "命令回执不符合领域协议",
    );

    internals.state = trialState;
    internals.eventLog = deepFreeze([...internals.eventLog, ...trialEvents]);
    return this[PERSIST_RECEIPT](receipt);
  }

  [CREATE_EVENT](candidate, command, state, recordedAt, sequence) {
    const internals = getInternals(this);
    if (
      !candidate ||
      typeof candidate.type !== "string" ||
      !candidate.payload ||
      typeof candidate.payload !== "object" ||
      Array.isArray(candidate.payload) ||
      Object.keys(candidate).some((key) => !["type", "payload"].includes(key))
    ) {
      throw protocolError(
        "INVALID_EVENT_CANDIDATE",
        "候选事件必须只包含 type 与 payload",
      );
    }
    const definition = internals.events.get(candidate.type);
    if (!definition) {
      throw protocolError(
        "UNKNOWN_EVENT_TYPE",
        `未注册事件类型：${candidate.type}`,
        { type: candidate.type },
      );
    }
    assertValid(
      internals.validators.eventPayloads.get(candidate.type),
      candidate.payload,
      "INVALID_EVENT_PAYLOAD",
      `事件 ${candidate.type} 的负载不符合 Schema`,
    );
    const ruleset =
      state?.ruleset ??
      (candidate.type === EVENT_TYPES.GAME_CREATED
        ? candidate.payload.ruleset
        : undefined);
    if (!ruleset) {
      throw protocolError(
        "GAME_NOT_INITIALIZED",
        "初始化前只能提交 game.created 事件",
      );
    }
    const rulePackage =
      state?.rulePackage ??
      (candidate.type === EVENT_TYPES.GAME_CREATED
        ? candidate.payload.rulePackage
        : undefined);
    if (!rulePackage) {
      throw protocolError(
        "GAME_NOT_INITIALIZED",
        "初始化前只能提交包含规则包身份的 game.created 事件",
      );
    }
    const event = {
      protocolVersion: PROTOCOL_VERSION,
      eventId: callDependency(
        internals.idFactory,
        ["event"],
        "ID_FACTORY_FAILURE",
        "事件 ID 工厂执行失败",
      ),
      gameId: internals.gameId,
      sequence,
      type: candidate.type,
      causationId: command.commandId,
      actor: command.actor,
      recordedAt,
      ruleset,
      rulePackage,
      payload: candidate.payload,
    };
    assertValid(
      internals.validators.eventEnvelope,
      event,
      "INVALID_EVENT",
      "生成的事件信封不符合领域协议",
    );
    return cloneAndFreezeJson(event);
  }

  [REDUCE_EVENT](previousState, event) {
    const internals = getInternals(this);
    const expectedSequence = (previousState?.revision ?? 0) + 1;
    if (event.sequence !== expectedSequence) {
      throw protocolError("SEQUENCE_MISMATCH", "事件序号不连续", {
        expected: expectedSequence,
        actual: event.sequence,
      });
    }
    if (event.gameId !== internals.gameId) {
      throw protocolError("GAME_ID_MISMATCH", "事件不属于当前对局", {
        expected: internals.gameId,
        actual: event.gameId,
      });
    }
    if (previousState && !sameJson(previousState.ruleset, event.ruleset)) {
      throw protocolError(
        "RULESET_IDENTITY_MISMATCH",
        "事件规则集身份与权威状态不一致",
      );
    }
    if (
      previousState &&
      !sameJson(previousState.rulePackage, event.rulePackage)
    ) {
      throw protocolError(
        "ROLE_PACKAGE_IDENTITY_MISMATCH",
        "事件角色能力规则包身份与权威状态不一致",
      );
    }
    if (previousState === null) {
      if (
        event.type !== EVENT_TYPES.GAME_CREATED ||
        !sameJson(event.ruleset, event.payload.ruleset) ||
        !this[IS_SUPPORTED_RULESET](event.ruleset)
      ) {
        throw protocolError(
          "RULESET_IDENTITY_MISMATCH",
          "初始化事件没有固定受支持的规则集身份",
        );
      }
      if (
        !sameJson(event.rulePackage, event.payload.rulePackage) ||
        !this[IS_SUPPORTED_ROLE_PACKAGE](event.rulePackage)
      ) {
        throw protocolError(
          "ROLE_PACKAGE_IDENTITY_MISMATCH",
          "初始化事件没有固定受支持的角色能力规则包身份",
        );
      }
    }
    const definition = internals.events.get(event.type);
    if (!definition) {
      throw protocolError(
        "UNKNOWN_EVENT_TYPE",
        `未注册事件类型：${event.type}`,
        { type: event.type },
      );
    }
    let reduced;
    try {
      reduced = definition.reduce(previousState, event);
    } catch (error) {
      throw protocolError("REDUCER_FAILURE", "事件归约器执行失败", {
        type: event.type,
        reason: error.message,
      });
    }
    let nextState;
    try {
      nextState = cloneJson(reduced);
    } catch (error) {
      throw protocolError("INVALID_STATE", "归约器返回了非 JSON 状态", {
        type: event.type,
        reason: error.message,
      });
    }
    if (
      !nextState ||
      typeof nextState !== "object" ||
      Array.isArray(nextState)
    ) {
      throw protocolError("INVALID_STATE", "归约器必须返回权威状态对象");
    }
    nextState.revision = event.sequence;
    if (
      previousState &&
      (nextState.gameId !== previousState.gameId ||
        nextState.schemaVersion !== previousState.schemaVersion ||
        !sameJson(nextState.ruleset, previousState.ruleset))
    ) {
      throw protocolError(
        "INVARIANT_VIOLATION",
        "事件归约器修改了协议拥有的对局身份字段",
      );
    }
    if (
      previousState &&
      !sameJson(nextState.rulePackage, previousState.rulePackage)
    ) {
      throw protocolError(
        "INVARIANT_VIOLATION",
        "事件归约器修改了协议拥有的角色能力规则包身份",
      );
    }
    assertValid(
      internals.validators.state,
      nextState,
      "INVALID_STATE",
      "归约后的权威状态不符合 Schema",
    );
    return cloneAndFreezeJson(nextState);
  }

  exportEventStream() {
    const internals = getInternals(this);
    const stream = {
      formatVersion: PROTOCOL_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      gameId: internals.gameId,
      ruleset: internals.state?.ruleset ?? null,
      rulePackage: internals.state?.rulePackage ?? null,
      events: internals.eventLog,
      receipts: internals.receiptLog,
    };
    assertValid(
      internals.validators.eventStream,
      stream,
      "INVALID_EVENT_STREAM",
      "导出的事件流不符合领域协议",
    );
    return cloneAndFreezeJson(stream);
  }

  [RESTORE](stream) {
    const internals = getInternals(this);
    let state = null;
    const events = [];
    const receiptBoundaries = new Set(
      stream.receipts
        .filter(
          ({ status, eventIds }) =>
            status === "accepted" && eventIds.length > 0,
        )
        .map(({ eventIds }) => eventIds[eventIds.length - 1]),
    );
    stream.events.forEach((event, index) => {
      if (event.protocolVersion !== PROTOCOL_VERSION) {
        throw protocolError(
          "UNSUPPORTED_PROTOCOL_VERSION",
          `不支持事件协议版本：${event.protocolVersion}`,
        );
      }
      if (event.sequence !== index + 1) {
        throw protocolError("SEQUENCE_MISMATCH", "事件序号不连续", {
          expected: index + 1,
          actual: event.sequence,
        });
      }
      if (event.gameId !== internals.gameId) {
        throw protocolError("GAME_ID_MISMATCH", "事件不属于当前对局", {
          expected: internals.gameId,
          actual: event.gameId,
        });
      }
      const definition = internals.events.get(event.type);
      if (!definition) {
        throw protocolError(
          "UNKNOWN_EVENT_TYPE",
          `未注册事件类型：${event.type}`,
          { type: event.type },
        );
      }
      assertValid(
        internals.validators.eventPayloads.get(event.type),
        event.payload,
        "INVALID_EVENT_PAYLOAD",
        `事件 ${event.type} 的负载不符合 Schema`,
      );
      state = this[REDUCE_EVENT](state, cloneAndFreezeJson(event));
      events.push(cloneAndFreezeJson(event));
      if (receiptBoundaries.has(event.eventId)) {
        assertStateInvariants(state, internals.stateInvariants);
      }
    });

    if (!sameJson(stream.ruleset, state?.ruleset ?? null)) {
      throw protocolError(
        "RULESET_IDENTITY_MISMATCH",
        "事件流规则集身份与重放状态不一致",
      );
    }
    if (!sameJson(stream.rulePackage, state?.rulePackage ?? null)) {
      throw protocolError(
        "ROLE_PACKAGE_IDENTITY_MISMATCH",
        "事件流角色能力规则包身份与重放状态不一致",
      );
    }
    assertStateInvariants(state, internals.stateInvariants);
    this[VALIDATE_RECEIPT_HISTORY](
      stream.receipts,
      events,
      state?.revision ?? 0,
    );
    internals.state = state;
    internals.eventLog = deepFreeze(events);
    internals.receiptLog = cloneAndFreezeJson(stream.receipts);
    internals.receiptsByCommandId = new Map(
      internals.receiptLog.map((receipt) => [receipt.commandId, receipt]),
    );
  }

  [VALIDATE_RECEIPT_HISTORY](receipts, events, finalRevision) {
    const { gameId } = getInternals(this);
    const receiptIds = new Set();
    const referencedEventIds = new Set();
    const eventsById = new Map(events.map((event) => [event.eventId, event]));
    let revision = 0;
    receipts.forEach((receipt) => {
      if (receiptIds.has(receipt.commandId) || receipt.gameId !== gameId) {
        throw protocolError(
          "INVALID_EVENT_STREAM",
          "事件流包含重复或跨对局的命令回执",
        );
      }
      receiptIds.add(receipt.commandId);
      if (receipt.revisionBefore !== revision) {
        throw protocolError(
          "INVALID_EVENT_STREAM",
          "命令回执的处理前修订不连续",
        );
      }
      if (receipt.status === "rejected") {
        if (
          receipt.revisionAfter !== revision ||
          receipt.eventIds.length !== 0
        ) {
          throw protocolError(
            "INVALID_EVENT_STREAM",
            "拒绝回执不能推进修订或引用事件",
          );
        }
        return;
      }
      const receiptEvents = receipt.eventIds.map((eventId) => {
        const event = eventsById.get(eventId);
        if (
          !event ||
          event.causationId !== receipt.commandId ||
          referencedEventIds.has(eventId)
        ) {
          throw protocolError(
            "INVALID_EVENT_STREAM",
            "成功回执引用了缺失、重复或因果不匹配的事件",
          );
        }
        referencedEventIds.add(eventId);
        return event;
      });
      receiptEvents.forEach((event, index) => {
        if (event.sequence !== revision + index + 1) {
          throw protocolError(
            "INVALID_EVENT_STREAM",
            "成功回执引用的事件顺序不连续",
          );
        }
      });
      const expectedAfter = revision + receiptEvents.length;
      if (receipt.revisionAfter !== expectedAfter) {
        throw protocolError(
          "INVALID_EVENT_STREAM",
          "成功回执的处理后修订与事件数量不一致",
        );
      }
      revision = expectedAfter;
    });
    if (
      revision !== finalRevision ||
      referencedEventIds.size !== events.length
    ) {
      throw protocolError(
        "INVALID_EVENT_STREAM",
        "事件流存在未被成功回执覆盖的事件或修订",
      );
    }
  }
}

export const createDomainProtocol = (options) =>
  new DomainProtocolEngine(options);

export const restoreDomainProtocol = (input, options = {}) => {
  const stream = cloneProtocolInput(
    input,
    "INVALID_EVENT_STREAM",
    "事件流包含非 JSON 数据",
  );
  if (stream?.formatVersion !== PROTOCOL_VERSION) {
    throw protocolError(
      "UNSUPPORTED_STREAM_FORMAT",
      `不支持事件流格式版本：${String(stream?.formatVersion)}`,
      { supported: PROTOCOL_VERSION },
    );
  }
  if (stream?.protocolVersion !== PROTOCOL_VERSION) {
    throw protocolError(
      "UNSUPPORTED_PROTOCOL_VERSION",
      `不支持事件流协议版本：${String(stream?.protocolVersion)}`,
      { supported: PROTOCOL_VERSION },
    );
  }
  return new DomainProtocolEngine({
    ...options,
    gameId: stream.gameId,
    [RESTORE_STREAM]: stream,
  });
};

export const isDomainProtocolError = (error) =>
  error instanceof DomainProtocolError;
