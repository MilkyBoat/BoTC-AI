import { BUILTIN_VIEW_EVENT_DEFINITIONS } from "./builtins";
import { PARTICIPANT_VIEW_VERSION } from "./constants";
import { ParticipantViewError, participantViewError } from "./errors";
import {
  canonicalizeJson,
  cloneAndFreezeJson,
  cloneJson,
} from "../protocol/immutable";
import { assertViewValid, createViewValidators } from "./validators";

const SERVICE_INTERNALS = new WeakMap();

const getInternals = (service) => {
  const internals = SERVICE_INTERNALS.get(service);
  if (!internals) {
    throw participantViewError(
      "INVALID_VIEW_SERVICE",
      "参与者视图服务实例无效",
    );
  }
  return internals;
};

const cloneInput = (value, code, message) => {
  try {
    return cloneJson(value);
  } catch (error) {
    throw participantViewError(code, message, { reason: error.message });
  }
};

const byOrder = (left, right) => left.order - right.order;
const sortByOrder = (items) => items.slice().sort(byOrder);
const sortById = (items, key) =>
  items.slice().sort((left, right) => left[key].localeCompare(right[key]));

const assertUnique = (items, key, label) => {
  const seen = new Set();
  items.forEach((item) => {
    if (seen.has(item[key])) {
      throw participantViewError(
        "INVALID_VIEW_SOURCE",
        `${label}存在重复的 ${key}`,
        { key, value: item[key] },
      );
    }
    seen.add(item[key]);
  });
};

const assertOrderedCollection = (items, idKey, label) => {
  assertUnique(items, idKey, label);
  assertUnique(items, "order", label);
};

const assertSeatReference = (seatIds, seatId, label) => {
  if (!seatIds.has(seatId)) {
    throw participantViewError(
      "INVALID_VIEW_SOURCE",
      `${label}引用了不存在的席位`,
      { seatId },
    );
  }
};

const validateSourceSemantics = (source) => {
  assertOrderedCollection(source.seats, "seatId", "席位");
  assertOrderedCollection(
    source.game.publicSpecialRules,
    "ruleId",
    "公开特殊规则",
  );
  assertOrderedCollection(source.publicRecords, "recordId", "公开记录");
  assertOrderedCollection(source.seatInformation, "informationId", "席位信息");
  assertOrderedCollection(source.adjudicationTasks, "taskId", "裁量任务");
  assertOrderedCollection(source.auditEntries, "auditId", "审计记录");

  const seatIds = new Set(source.seats.map(({ seatId }) => seatId));
  source.seats.forEach((seat) => {
    assertUnique(seat.truth.statuses, "statusId", `${seat.seatId} 真相状态`);
    assertOrderedCollection(
      seat.truth.storytellerNotes,
      "noteId",
      `${seat.seatId} 说书人标记`,
    );
    assertOrderedCollection(
      seat.perception.knownStatuses,
      "knowledgeId",
      `${seat.seatId} 已知状态`,
    );
    assertOrderedCollection(
      seat.legalActions,
      "actionId",
      `${seat.seatId} 合法动作`,
    );
    assertOrderedCollection(
      seat.actionHistory,
      "actionId",
      `${seat.seatId} 动作历史`,
    );
  });

  source.publicRecords.forEach((record) => {
    if (record.type === "public-message") {
      assertSeatReference(seatIds, record.senderSeatId, "公开消息");
    }
    if (record.type === "nomination") {
      assertSeatReference(seatIds, record.nominatorSeatId, "提名记录");
      assertSeatReference(seatIds, record.nomineeSeatId, "提名记录");
    }
    if (record.type === "vote-result") {
      assertSeatReference(seatIds, record.nomineeSeatId, "投票记录");
      record.voterSeatIds.forEach((seatId) =>
        assertSeatReference(seatIds, seatId, "投票记录"),
      );
    }
  });
  source.seatInformation.forEach(({ seatId }) =>
    assertSeatReference(seatIds, seatId, "席位信息"),
  );
  source.adjudicationTasks.forEach(({ candidateSeatIds }) =>
    candidateSeatIds.forEach((seatId) =>
      assertSeatReference(seatIds, seatId, "裁量任务"),
    ),
  );
};

const validateSource = (validators, value) => {
  const source = cloneInput(
    value,
    "INVALID_VIEW_SOURCE",
    "参与者视图源只能包含 JSON 数据",
  );
  assertViewValid(
    validators.source,
    source,
    "INVALID_VIEW_SOURCE",
    "参与者视图源不符合协议",
  );
  validateSourceSemantics(source);
  return source;
};

const resolvePrincipal = (internals, credential) => {
  let resolved;
  try {
    resolved = internals.resolvePrincipal(credential);
  } catch (_error) {
    throw participantViewError(
      "PRINCIPAL_RESOLUTION_FAILED",
      "参与者主体解析失败",
    );
  }
  if (resolved === undefined || resolved === null) {
    throw participantViewError("UNKNOWN_PRINCIPAL", "参与者凭证未对应有效主体");
  }
  const principal = cloneInput(
    resolved,
    "INVALID_PRINCIPAL",
    "参与者主体只能包含 JSON 数据",
  );
  assertViewValid(
    internals.validators.principal,
    principal,
    "INVALID_PRINCIPAL",
    "参与者主体不符合协议",
  );
  return principal;
};

const publicSeat = (seat) => ({
  seatId: seat.seatId,
  order: seat.order,
  displayName: seat.displayName,
  controllerKind: seat.controllerKind,
  publicState: seat.publicState,
});

const commonSnapshot = (source, viewType) => ({
  schemaVersion: PARTICIPANT_VIEW_VERSION,
  viewType,
  game: {
    gameId: source.game.gameId,
    ruleset: source.game.ruleset,
    status: source.game.status,
    phase: source.game.phase,
    publicSpecialRules: sortByOrder(source.game.publicSpecialRules),
  },
  seats: sortByOrder(source.seats).map(publicSeat),
  publicRecords: sortByOrder(source.publicRecords),
});

const buildPublicSnapshot = (source) => commonSnapshot(source, "public");

const buildObserverSnapshot = (publicSnapshot, policy) => ({
  ...publicSnapshot,
  viewType: "observer",
  publicRecords: publicSnapshot.publicRecords
    .filter(
      (record) =>
        (policy.includePublicMessages || record.type !== "public-message") &&
        (policy.includeHistory || !record.historical),
    )
    .map((record) => {
      if (policy.includeVoteDetails || record.type !== "vote-result") {
        return record;
      }
      const recordWithoutVoterDetails = { ...record };
      delete recordWithoutVoterDetails.voterSeatIds;
      return recordWithoutVoterDetails;
    }),
});

const informationForSeat = (source, seatId) =>
  sortByOrder(source.seatInformation).filter(
    (information) => information.seatId === seatId,
  );

const buildSeatSnapshot = (source, seat) => ({
  ...commonSnapshot(source, "seat"),
  self: {
    seatId: seat.seatId,
    perceivedRoleId: seat.perception.roleId,
    perceivedAlignment: seat.perception.alignment,
    knownStatuses: sortByOrder(seat.perception.knownStatuses),
    legalActions: sortByOrder(seat.legalActions),
    actionHistory: sortByOrder(seat.actionHistory),
    information: informationForSeat(source, seat.seatId),
  },
});

const buildStorytellerSnapshot = (source) => ({
  ...commonSnapshot(source, "storyteller"),
  seats: sortByOrder(source.seats).map((seat) => ({
    ...publicSeat(seat),
    truth: {
      roleId: seat.truth.roleId,
      alignment: seat.truth.alignment,
      statuses: sortById(seat.truth.statuses, "statusId"),
      storytellerNotes: sortByOrder(seat.truth.storytellerNotes),
    },
    perception: {
      roleId: seat.perception.roleId,
      alignment: seat.perception.alignment,
      knownStatuses: sortByOrder(seat.perception.knownStatuses),
    },
    legalActions: sortByOrder(seat.legalActions),
    actionHistory: sortByOrder(seat.actionHistory),
    information: informationForSeat(source, seat.seatId),
  })),
  adjudicationTasks: sortByOrder(source.adjudicationTasks),
  auditEntries: sortByOrder(source.auditEntries),
});

const snapshotForPrincipal = (internals, source, principal) => {
  let snapshot;
  if (principal.kind === "public") {
    snapshot = buildPublicSnapshot(source);
  } else if (principal.kind === "observer") {
    const publicSnapshot = buildPublicSnapshot(source);
    assertViewValid(
      internals.validators.snapshots.public,
      publicSnapshot,
      "INVALID_VIEW_RESULT",
      "公开视图投影结果不符合协议",
    );
    snapshot = buildObserverSnapshot(publicSnapshot, source.observerPolicy);
  } else if (principal.kind === "storyteller") {
    snapshot = buildStorytellerSnapshot(source);
  } else {
    const seat = source.seats.find(({ seatId }) => seatId === principal.seatId);
    if (!seat) {
      throw participantViewError("UNKNOWN_SEAT", "席位主体绑定的席位不存在", {
        seatId: principal.seatId,
      });
    }
    snapshot = buildSeatSnapshot(source, seat);
  }
  assertViewValid(
    internals.validators.snapshots[principal.kind],
    snapshot,
    "INVALID_VIEW_RESULT",
    `${principal.kind} 视图投影结果不符合协议`,
  );
  return cloneAndFreezeJson(snapshot);
};

const sameJson = (left, right) =>
  canonicalizeJson(left) === canonicalizeJson(right);

const assertEventReferences = (source, event) => {
  const seatIds = new Set(source.seats.map(({ seatId }) => seatId));
  const references = [];
  if (
    ["seat.information-delivered", "seat.truth-changed"].includes(event.type)
  ) {
    references.push(event.payload.seatId);
  }
  if (event.type === "public.message-posted") {
    references.push(event.payload.senderSeatId);
  }
  if (event.type === "public.vote-resolved") {
    references.push(event.payload.nomineeSeatId, ...event.payload.voterSeatIds);
  }
  if (event.type === "nomination.opened") {
    references.push(event.payload.nominatorSeatId, event.payload.nomineeSeatId);
  }
  if (event.type === "vote.opened") {
    references.push(event.payload.nomineeSeatId, ...event.payload.votingOrder);
  }
  if (event.type === "vote.recorded") {
    references.push(event.payload.voterSeatId);
  }
  if (event.type === "vote.closed") {
    references.push(event.payload.nomineeSeatId, ...event.payload.voterSeatIds);
    if (event.payload.executionCandidateSeatId !== null) {
      references.push(event.payload.executionCandidateSeatId);
    }
  }
  if (event.type === "exile.opened") {
    references.push(event.payload.proposerSeatId, event.payload.travelerSeatId);
  }
  if (event.type === "exile.support-set") {
    references.push(event.payload.supporterSeatId);
  }
  if (event.type === "exile.closed") {
    references.push(
      event.payload.travelerSeatId,
      ...event.payload.supporterSeatIds,
    );
  }
  if (references.some((seatId) => !seatIds.has(seatId))) {
    throw participantViewError(
      "INVALID_EVENT_PAYLOAD",
      "领域事件负载引用了不存在的席位",
    );
  }
};

const validateEvent = (internals, source, value) => {
  const event = cloneInput(
    value,
    "INVALID_DOMAIN_EVENT",
    "领域事件只能包含 JSON 数据",
  );
  assertViewValid(
    internals.validators.domainEvent,
    event,
    "INVALID_DOMAIN_EVENT",
    "领域事件信封不符合协议",
  );
  if (event.gameId !== source.game.gameId) {
    throw participantViewError(
      "GAME_ID_MISMATCH",
      "领域事件不属于当前参与者视图源",
    );
  }
  if (!sameJson(event.ruleset, source.game.ruleset)) {
    throw participantViewError(
      "RULESET_IDENTITY_MISMATCH",
      "领域事件规则集身份与参与者视图源不一致",
    );
  }
  const definition = internals.events.get(event.type);
  if (!definition) {
    throw participantViewError(
      "UNKNOWN_EVENT_TYPE",
      `领域事件类型没有参与者投影器：${event.type}`,
      { type: event.type },
    );
  }
  assertViewValid(
    internals.validators.sourcePayloads.get(event.type),
    event.payload,
    "INVALID_EVENT_PAYLOAD",
    `领域事件 ${event.type} 的负载不符合投影协议`,
  );
  assertEventReferences(source, event);
  return { definition, event };
};

const projectEvent = (internals, source, event, principal, definition) => {
  let projection;
  try {
    projection = definition.project({ source, event, principal });
  } catch (error) {
    if (error instanceof ParticipantViewError) throw error;
    throw participantViewError(
      "EVENT_PROJECTION_FAILED",
      `领域事件 ${event.type} 投影失败`,
      { type: event.type },
    );
  }
  if (projection === null) return null;
  if (!projection || typeof projection !== "object") {
    throw participantViewError(
      "INVALID_EVENT_PROJECTION",
      `领域事件 ${event.type} 返回了无效投影结果`,
    );
  }
  const declaredOutputTypes = new Set(
    definition.outputDefinitions.map(({ type }) => type),
  );
  if (!declaredOutputTypes.has(projection.type)) {
    throw participantViewError(
      "INVALID_EVENT_PROJECTION",
      `领域事件 ${event.type} 返回了未声明的视图事件类型`,
      { type: projection.type },
    );
  }
  const result = {
    schemaVersion: PARTICIPANT_VIEW_VERSION,
    viewType: principal.kind,
    type: projection.type,
    payload: projection.payload,
  };
  assertViewValid(
    internals.validators.viewEvent,
    result,
    "INVALID_EVENT_PROJECTION",
    "视图事件信封不符合协议",
  );
  assertViewValid(
    internals.validators.outputPayloads.get(result.type),
    result.payload,
    "INVALID_EVENT_PROJECTION",
    `视图事件 ${result.type} 的负载不符合协议`,
  );
  return cloneAndFreezeJson(result);
};

class ParticipantViewService {
  constructor(options) {
    const { resolvePrincipal: resolver, eventDefinitions = [] } = options ?? {};
    if (typeof resolver !== "function") {
      throw participantViewError(
        "INVALID_DEPENDENCY",
        "参与者视图服务必须提供 resolvePrincipal 函数",
      );
    }
    if (!Array.isArray(eventDefinitions)) {
      throw participantViewError(
        "INVALID_EVENT_DEFINITION",
        "eventDefinitions 必须是数组",
      );
    }
    const definitions = [
      ...BUILTIN_VIEW_EVENT_DEFINITIONS,
      ...eventDefinitions,
    ];
    const validators = createViewValidators(definitions);
    SERVICE_INTERNALS.set(this, {
      resolvePrincipal: resolver,
      validators,
      events: new Map(
        definitions.map((definition) => [definition.type, definition]),
      ),
    });
    Object.freeze(this);
  }

  createSnapshot(source, credential) {
    const internals = getInternals(this);
    const validatedSource = validateSource(internals.validators, source);
    const principal = resolvePrincipal(internals, credential);
    return snapshotForPrincipal(internals, validatedSource, principal);
  }

  projectEvent(source, event, credential) {
    const internals = getInternals(this);
    const validatedSource = validateSource(internals.validators, source);
    const principal = resolvePrincipal(internals, credential);
    const validatedEvent = validateEvent(internals, validatedSource, event);
    if (
      principal.kind === "seat" &&
      !validatedSource.seats.some(({ seatId }) => seatId === principal.seatId)
    ) {
      throw participantViewError("UNKNOWN_SEAT", "席位主体绑定的席位不存在", {
        seatId: principal.seatId,
      });
    }
    return projectEvent(
      internals,
      validatedSource,
      validatedEvent.event,
      principal,
      validatedEvent.definition,
    );
  }
}

export const createParticipantViewService = (options) =>
  new ParticipantViewService(options);
