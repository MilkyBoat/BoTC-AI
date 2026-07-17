import {
  COMMAND_TYPES,
  DomainProtocolError,
  EVENT_TYPES,
  M1_RULESET_IDENTITY,
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  PROTOCOL_VERSION,
  createDomainProtocol,
  createGameCommand,
} from "@/domain/protocol";
import { sha256Hex } from "@/domain/protocol/sha256";

const GAME_ID = "game-m1-r2-001";
const HOST = Object.freeze({ kind: "host", id: "host-001" });

const 创建确定性依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T08:00:00.000Z",
    idFactory: (类别) => `${类别}-${String(++序号).padStart(4, "0")}`,
  };
};

const 创建引擎 = (覆盖 = {}) =>
  createDomainProtocol({
    gameId: GAME_ID,
    ...创建确定性依赖(),
    ...覆盖,
  });

const 创建命令 = (覆盖 = {}) =>
  createGameCommand({
    commandId: "command-create-001",
    gameId: GAME_ID,
    expectedRevision: 0,
    actor: HOST,
    seed: "seed-fixed-001",
    ...覆盖,
  });

const 断言协议错误 = (执行, code) => {
  let 捕获错误;
  try {
    执行();
  } catch (错误) {
    捕获错误 = 错误;
  }
  expect(捕获错误).toBeInstanceOf(DomainProtocolError);
  expect(捕获错误).toMatchObject({ code });
  expect(捕获错误.message).toEqual(expect.any(String));
  expect(捕获错误.message.length).toBeGreaterThan(0);
};

const 测试扩展 = {
  commandDefinitions: [
    {
      type: "test.touch",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string", minLength: 1 } },
      },
      handle: ({ command }) => ({
        events: [{ type: "test.touched", payload: command.payload }],
      }),
    },
    {
      type: "test.reject",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      handle: ({ reject }) =>
        reject("TEST_REJECTED", "测试命令被领域规则拒绝", { reason: "fixed" }),
    },
    {
      type: "test.atomic-failure",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      handle: () => ({
        events: [
          { type: "test.touched", payload: { label: "first" } },
          { type: "test.reducer-failed", payload: {} },
        ],
      }),
    },
    {
      type: "test.mutate-state",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      handle: ({ state }) => {
        state.lifecycle = "tampered";
        return { events: [] };
      },
    },
  ],
  eventDefinitions: [
    {
      type: "test.touched",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string", minLength: 1 } },
      },
      reduce: (state) => state,
    },
    {
      type: "test.reducer-failed",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      reduce: () => {
        throw new Error("固定归约失败");
      },
    },
    {
      type: "test.reacted",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string", minLength: 1 } },
      },
      reduce: (state) => state,
    },
  ],
};

describe("M1-R2 领域状态与事件协议", () => {
  test("浏览器兼容 SHA-256 实现符合标准向量", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("从冻结的 M1-R1 清单派生唯一规则集身份", () => {
    expect(M1_RULESET_IDENTITY).toEqual({
      id: "botc-ai.m1-ruleset-scope",
      version: "0.2.0",
      canonicalLanguage: "zh-CN",
      sourceManifestVersion: "0.2.0",
      integrity:
        "sha256:aa2daef3eb6d5c29f944fa431837823eb1faea472aed71146f1a4d8a71e5dd2d",
    });
    expect(Object.isFrozen(M1_RULESET_IDENTITY)).toBe(true);
  });

  test("创建对局时提交单一事件并固定规则集、种子和修订", () => {
    const 引擎 = 创建引擎();
    const 回执 = 引擎.dispatch(创建命令());

    expect(回执).toMatchObject({
      schemaVersion: PROTOCOL_VERSION,
      commandId: "command-create-001",
      gameId: GAME_ID,
      status: "accepted",
      revisionBefore: 0,
      revisionAfter: 1,
      eventIds: ["event-0001"],
      recordedAt: "2026-07-17T08:00:00.000Z",
    });
    expect(回执.commandFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(引擎.getState()).toEqual({
      schemaVersion: PROTOCOL_VERSION,
      gameId: GAME_ID,
      ruleset: M1_RULESET_IDENTITY,
      rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
      seed: "seed-fixed-001",
      revision: 1,
      lifecycle: "preparing",
      phase: "setup",
      dayNumber: 0,
      nightNumber: 0,
      seats: [],
      executionToday: null,
      nominationsToday: [],
      activeNomination: null,
      highestNominationVotes: 0,
      executionCandidate: null,
      exilesToday: [],
      activeExile: null,
      abilityInstances: [],
      abilityConditions: [],
      abilityTriggers: [],
      ongoingAbilityEffects: [],
      delayedAbilityEffects: [],
      adjudicationTasks: [],
      winner: null,
    });
    expect(引擎.getEvents()).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        eventId: "event-0001",
        gameId: GAME_ID,
        sequence: 1,
        type: EVENT_TYPES.GAME_CREATED,
        causationId: "command-create-001",
        actor: HOST,
        recordedAt: "2026-07-17T08:00:00.000Z",
        ruleset: M1_RULESET_IDENTITY,
        rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
        payload: {
          seed: "seed-fixed-001",
          ruleset: M1_RULESET_IDENTITY,
          rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
        },
      },
    ]);
  });

  test("命令构造器只生成版本化的 game.create 信封", () => {
    expect(创建命令()).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-create-001",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      type: COMMAND_TYPES.GAME_CREATE,
      payload: {
        ruleset: M1_RULESET_IDENTITY,
        rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
        seed: "seed-fixed-001",
      },
    });
  });

  test.each([
    ["未知字段", { unexpected: true }, "INVALID_COMMAND"],
    ["非法命令 ID", { commandId: "含中文" }, "INVALID_COMMAND"],
    [
      "未知协议版本",
      { protocolVersion: "9.0.0" },
      "UNSUPPORTED_PROTOCOL_VERSION",
    ],
    ["跨对局命令", { gameId: "game-other" }, "GAME_ID_MISMATCH"],
    ["未知命令类型", { type: "unknown.command" }, "UNKNOWN_COMMAND_TYPE"],
  ])("拒绝%s且不占用事件流", (_名称, 覆盖, code) => {
    const 引擎 = 创建引擎();
    断言协议错误(() => 引擎.dispatch({ ...创建命令(), ...覆盖 }), code);
    expect(引擎.getState()).toBeNull();
    expect(引擎.getEvents()).toEqual([]);
    expect(引擎.getReceipts()).toEqual([]);
  });

  test("负载 Schema 严格拒绝额外字段", () => {
    const 引擎 = 创建引擎();
    const 命令 = JSON.parse(JSON.stringify(创建命令()));
    命令.payload.unexpected = true;

    断言协议错误(() => 引擎.dispatch(命令), "INVALID_COMMAND_PAYLOAD");
    expect(引擎.getEvents()).toHaveLength(0);
  });

  test("不支持的规则集形成可持久化领域拒绝回执", () => {
    const 引擎 = 创建引擎();
    const 命令 = JSON.parse(JSON.stringify(创建命令()));
    命令.payload.ruleset = {
      ...M1_RULESET_IDENTITY,
      version: "0.3.0",
    };

    const 首次 = 引擎.dispatch(命令);
    const 重试 = 引擎.dispatch({
      payload: {
        seed: "seed-fixed-001",
        ruleset: 命令.payload.ruleset,
        rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
      },
      type: COMMAND_TYPES.GAME_CREATE,
      actor: { id: "host-001", kind: "host" },
      expectedRevision: 0,
      gameId: GAME_ID,
      commandId: "command-create-001",
      protocolVersion: PROTOCOL_VERSION,
    });

    expect(首次).toMatchObject({
      status: "rejected",
      revisionBefore: 0,
      revisionAfter: 0,
      eventIds: [],
      error: { code: "UNSUPPORTED_RULESET", message: expect.any(String) },
    });
    expect(重试).toEqual(首次);
    expect(引擎.getReceipts()).toEqual([首次]);
  });

  test("幂等重试优先于当前修订校验且不会重新执行命令", () => {
    const 引擎 = 创建引擎(测试扩展);
    const 创建回执 = 引擎.dispatch(创建命令());
    引擎.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-touch-001",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      type: "test.touch",
      payload: { label: "advance" },
    });

    const 重试回执 = 引擎.dispatch(创建命令());

    expect(重试回执).toEqual(创建回执);
    expect(引擎.getState().revision).toBe(2);
    expect(引擎.getEvents()).toHaveLength(2);
  });

  test("相同命令 ID 对应不同规范化内容时报告幂等冲突", () => {
    const 引擎 = 创建引擎();
    引擎.dispatch(创建命令());

    断言协议错误(
      () => 引擎.dispatch(创建命令({ seed: "seed-different" })),
      "IDEMPOTENCY_CONFLICT",
    );
    expect(引擎.getEvents()).toHaveLength(1);
  });

  test("JSON 键顺序不影响命令指纹", () => {
    const 引擎 = 创建引擎();
    const 首次 = 引擎.dispatch(创建命令());
    const 原命令 = 创建命令();
    const 重排命令 = {
      type: 原命令.type,
      payload: {
        seed: 原命令.payload.seed,
        ruleset: {
          integrity: 原命令.payload.ruleset.integrity,
          sourceManifestVersion: 原命令.payload.ruleset.sourceManifestVersion,
          canonicalLanguage: 原命令.payload.ruleset.canonicalLanguage,
          version: 原命令.payload.ruleset.version,
          id: 原命令.payload.ruleset.id,
        },
        rulePackage: {
          integrity: 原命令.payload.rulePackage.integrity,
          frameworkVersion: 原命令.payload.rulePackage.frameworkVersion,
          version: 原命令.payload.rulePackage.version,
          id: 原命令.payload.rulePackage.id,
        },
      },
      actor: { id: HOST.id, kind: HOST.kind },
      expectedRevision: 0,
      gameId: GAME_ID,
      commandId: 原命令.commandId,
      protocolVersion: PROTOCOL_VERSION,
    };

    expect(引擎.dispatch(重排命令)).toEqual(首次);
  });

  test("新命令的过期修订形成持久化拒绝并要求新 ID 重试", () => {
    const 引擎 = 创建引擎(测试扩展);
    引擎.dispatch(创建命令());
    const 过期命令 = {
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-touch-stale",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      type: "test.touch",
      payload: { label: "stale" },
    };

    const 回执 = 引擎.dispatch(过期命令);

    expect(回执).toMatchObject({
      status: "rejected",
      revisionBefore: 1,
      revisionAfter: 1,
      error: { code: "REVISION_CONFLICT" },
    });
    expect(引擎.dispatch(过期命令)).toEqual(回执);
    断言协议错误(
      () => 引擎.dispatch({ ...过期命令, expectedRevision: 1 }),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  test("已初始化对局不能由新命令再次创建", () => {
    const 引擎 = 创建引擎();
    引擎.dispatch(创建命令());

    const 回执 = 引擎.dispatch(
      创建命令({
        commandId: "command-create-002",
        expectedRevision: 1,
      }),
    );

    expect(回执).toMatchObject({
      status: "rejected",
      revisionBefore: 1,
      revisionAfter: 1,
      error: { code: "GAME_ALREADY_INITIALIZED" },
    });
    expect(引擎.getEvents()).toHaveLength(1);
  });

  test("领域拒绝回执稳定保存错误详情", () => {
    const 引擎 = 创建引擎(测试扩展);
    引擎.dispatch(创建命令());

    const 回执 = 引擎.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-reject-001",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      type: "test.reject",
      payload: {},
    });

    expect(回执).toMatchObject({
      status: "rejected",
      error: {
        code: "TEST_REJECTED",
        message: "测试命令被领域规则拒绝",
        details: { reason: "fixed" },
      },
    });
  });

  test("多事件归约失败时不提交任何事件、状态或回执", () => {
    const 引擎 = 创建引擎(测试扩展);
    引擎.dispatch(创建命令());
    const 失败前状态 = 引擎.getState();
    const 失败前事件 = 引擎.getEvents();
    const 失败前回执 = 引擎.getReceipts();

    断言协议错误(
      () =>
        引擎.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: "command-atomic-001",
          gameId: GAME_ID,
          expectedRevision: 1,
          actor: HOST,
          type: "test.atomic-failure",
          payload: {},
        }),
      "REDUCER_FAILURE",
    );

    expect(引擎.getState()).toEqual(失败前状态);
    expect(引擎.getEvents()).toEqual(失败前事件);
    expect(引擎.getReceipts()).toEqual(失败前回执);
  });

  test("ID 工厂返回重复事件 ID 时整条新命令失败", () => {
    const 引擎 = 创建引擎({
      ...测试扩展,
      idFactory: () => "event-fixed",
    });
    引擎.dispatch(创建命令());
    const 失败前状态 = 引擎.getState();

    断言协议错误(
      () =>
        引擎.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: "command-duplicate-event-id",
          gameId: GAME_ID,
          expectedRevision: 1,
          actor: HOST,
          type: "test.touch",
          payload: { label: "duplicate" },
        }),
      "DUPLICATE_EVENT_ID",
    );
    expect(引擎.getState()).toEqual(失败前状态);
    expect(引擎.getEvents()).toHaveLength(1);
    expect(引擎.getReceipts()).toHaveLength(1);
  });

  test.each([
    [
      "时钟异常",
      {
        clock: () => {
          throw new Error("clock failed");
        },
      },
      "CLOCK_FAILURE",
    ],
    [
      "ID 工厂异常",
      {
        idFactory: () => {
          throw new Error("id failed");
        },
      },
      "ID_FACTORY_FAILURE",
    ],
  ])("%s 时返回稳定协议错误且不部分提交", (_名称, 依赖, code) => {
    const 引擎 = 创建引擎(依赖);

    断言协议错误(() => 引擎.dispatch(创建命令()), code);
    expect(引擎.getState()).toBeNull();
    expect(引擎.getEvents()).toEqual([]);
    expect(引擎.getReceipts()).toEqual([]);
  });

  test("处理器不能修改只读权威状态", () => {
    const 引擎 = 创建引擎(测试扩展);
    引擎.dispatch(创建命令());

    断言协议错误(
      () =>
        引擎.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: "command-mutate-001",
          gameId: GAME_ID,
          expectedRevision: 1,
          actor: HOST,
          type: "test.mutate-state",
          payload: {},
        }),
      "HANDLER_FAILURE",
    );
    expect(引擎.getState().lifecycle).toBe("preparing");
  });

  test("事件反应器按优先级与稳定 ID 展开同一原子事件批次", () => {
    const 调用顺序 = [];
    const 引擎 = 创建引擎({
      ...测试扩展,
      eventReactions: [
        {
          id: "reaction-z",
          priority: 20,
          eventTypes: ["test.touched"],
          react: ({ event }) => {
            调用顺序.push("z");
            expect(Object.isFrozen(event)).toBe(true);
            return [{ type: "test.reacted", payload: { label: "z" } }];
          },
        },
        {
          id: "reaction-a",
          priority: 10,
          eventTypes: ["test.touched"],
          react: ({ stateAfter }) => {
            调用顺序.push("a");
            expect(Object.isFrozen(stateAfter)).toBe(true);
            return [{ type: "test.reacted", payload: { label: "a" } }];
          },
        },
      ],
    });
    引擎.dispatch(创建命令());

    const 回执 = 引擎.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-reaction-touch",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      type: "test.touch",
      payload: { label: "source" },
    });

    expect(调用顺序).toEqual(["a", "z"]);
    expect(回执.eventIds).toHaveLength(3);
    expect(
      引擎
        .getEvents()
        .slice(-3)
        .map(({ type, payload }) => [type, payload]),
    ).toEqual([
      ["test.touched", { label: "source" }],
      ["test.reacted", { label: "a" }],
      ["test.reacted", { label: "z" }],
    ]);
  });

  test("事件反应连锁超过硬上限时整批失败", () => {
    const 引擎 = 创建引擎({
      ...测试扩展,
      eventReactions: [
        {
          id: "reaction-loop",
          priority: 1,
          eventTypes: ["test.touched", "test.reacted"],
          react: () => [{ type: "test.reacted", payload: { label: "loop" } }],
        },
      ],
    });
    引擎.dispatch(创建命令());

    断言协议错误(
      () =>
        引擎.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: "command-reaction-loop",
          gameId: GAME_ID,
          expectedRevision: 1,
          actor: HOST,
          type: "test.touch",
          payload: { label: "source" },
        }),
      "EVENT_REACTION_LIMIT",
    );
    expect(引擎.getState().revision).toBe(1);
    expect(引擎.getEvents()).toHaveLength(1);
  });

  test("扩展状态不变量失败时不提交候选事件", () => {
    const 引擎 = 创建引擎({
      ...测试扩展,
      stateInvariants: [
        {
          id: "invariant-no-touch",
          assert: (state) => {
            if (state?.revision > 1) throw new Error("测试不允许后续事件");
          },
        },
      ],
    });
    引擎.dispatch(创建命令());

    断言协议错误(
      () =>
        引擎.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: "command-invariant-touch",
          gameId: GAME_ID,
          expectedRevision: 1,
          actor: HOST,
          type: "test.touch",
          payload: { label: "source" },
        }),
      "INVARIANT_VIOLATION",
    );
    expect(引擎.getState().revision).toBe(1);
    expect(引擎.getEvents()).toHaveLength(1);
  });

  test("输入、查询结果和导出结果都不能反向修改内部状态", () => {
    const 引擎 = 创建引擎();
    const 命令 = JSON.parse(JSON.stringify(创建命令()));
    引擎.dispatch(命令);

    命令.payload.seed = "tampered-input";
    const 状态 = 引擎.getState();
    const 事件 = 引擎.getEvents();
    const 导出 = 引擎.exportEventStream();
    expect(Object.isFrozen(状态)).toBe(true);
    expect(Object.isFrozen(状态.ruleset)).toBe(true);
    expect(Object.isFrozen(事件[0].payload)).toBe(true);

    expect(() => {
      状态.seed = "tampered-state";
    }).toThrow();
    expect(() => {
      事件[0].payload.seed = "tampered-event";
    }).toThrow();
    expect(() => {
      导出.events[0].payload.seed = "tampered-export";
    }).toThrow();
    expect(引擎.getState().seed).toBe("seed-fixed-001");
  });

  test("引擎实例不暴露可绕过命令总线修改的内部字段", () => {
    const 引擎 = 创建引擎();
    引擎.dispatch(创建命令());

    expect(Object.isFrozen(引擎)).toBe(true);
    expect(引擎).not.toHaveProperty("state");
    expect(引擎).not.toHaveProperty("eventLog");
    expect(引擎).not.toHaveProperty("receiptLog");
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(引擎)).sort(),
    ).toEqual(
      [
        "constructor",
        "dispatch",
        "exportEventStream",
        "getEvents",
        "getReceipts",
        "getState",
      ].sort(),
    );
    expect(() => {
      引擎.state = { revision: 99 };
    }).toThrow();
    expect(引擎.getState().revision).toBe(1);
  });

  test("重复注册命令或事件类型时拒绝启动", () => {
    断言协议错误(
      () =>
        创建引擎({
          commandDefinitions: [测试扩展.commandDefinitions[0]],
          eventDefinitions: [
            测试扩展.eventDefinitions[0],
            测试扩展.eventDefinitions[0],
          ],
        }),
      "DUPLICATE_EVENT_TYPE",
    );
    断言协议错误(
      () =>
        创建引擎({
          commandDefinitions: [
            测试扩展.commandDefinitions[0],
            测试扩展.commandDefinitions[0],
          ],
          eventDefinitions: [测试扩展.eventDefinitions[0]],
        }),
      "DUPLICATE_COMMAND_TYPE",
    );
  });

  test("畸形扩展定义返回稳定错误而不是运行时 TypeError", () => {
    断言协议错误(
      () => 创建引擎({ commandDefinitions: [undefined] }),
      "INVALID_DEFINITION",
    );
    断言协议错误(
      () => 创建引擎({ eventDefinitions: [undefined] }),
      "INVALID_DEFINITION",
    );
  });
});
