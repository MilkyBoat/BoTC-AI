import {
  M1_RULESET_IDENTITY,
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  PROTOCOL_VERSION,
  DomainProtocolError,
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "@/domain/protocol";

const GAME_ID = "game-replay-001";
const HOST = { kind: "host", id: "host-replay-001" };

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T09:00:00.000Z",
    idFactory: (类别) => `${类别}-replay-${++序号}`,
  };
};

const 创建命令 = () =>
  createGameCommand({
    commandId: "command-replay-create",
    gameId: GAME_ID,
    expectedRevision: 0,
    actor: HOST,
    seed: "seed-replay-fixed",
  });

const 捕获错误码 = (执行) => {
  try {
    执行();
  } catch (错误) {
    expect(错误).toBeInstanceOf(DomainProtocolError);
    return 错误.code;
  }
  throw new Error("预期协议操作失败");
};

describe("M1-R2 事件流导出与确定性重放场景", () => {
  test("完整事件流在新实例中重放出相同状态和幂等回执", () => {
    const 原引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
    const 原回执 = 原引擎.dispatch(创建命令());
    const 事件流 = 原引擎.exportEventStream();

    const 恢复引擎 = restoreDomainProtocol(事件流, 创建依赖());

    expect(恢复引擎.getState()).toEqual(原引擎.getState());
    expect(恢复引擎.getEvents()).toEqual(原引擎.getEvents());
    expect(恢复引擎.getReceipts()).toEqual(原引擎.getReceipts());
    expect(恢复引擎.dispatch(创建命令())).toEqual(原回执);
    expect(恢复引擎.getEvents()).toHaveLength(1);
  });

  test("空事件流可以恢复为空的同一对局协议实例", () => {
    const 原引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });

    const 恢复引擎 = restoreDomainProtocol(
      原引擎.exportEventStream(),
      创建依赖(),
    );

    expect(恢复引擎.getState()).toBeNull();
    expect(恢复引擎.getEvents()).toEqual([]);
    expect(恢复引擎.getReceipts()).toEqual([]);
  });

  test("领域拒绝发生在创建前时仍能按回执顺序恢复并继续创建", () => {
    const 原引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
    const 不支持规则集命令 = JSON.parse(JSON.stringify(创建命令()));
    不支持规则集命令.commandId = "command-unsupported-ruleset";
    不支持规则集命令.payload.ruleset.version = "0.3.0";
    expect(原引擎.dispatch(不支持规则集命令).status).toBe("rejected");
    原引擎.dispatch(创建命令());

    const 恢复引擎 = restoreDomainProtocol(
      原引擎.exportEventStream(),
      创建依赖(),
    );

    expect(恢复引擎.getState()).toEqual(原引擎.getState());
    expect(恢复引擎.getReceipts().map(({ status }) => status)).toEqual([
      "rejected",
      "accepted",
    ]);
  });

  test.each([
    [
      "未知事件流版本",
      (事件流) => {
        事件流.formatVersion = "9.0.0";
      },
      "UNSUPPORTED_STREAM_FORMAT",
    ],
    [
      "跳跃事件序号",
      (事件流) => {
        事件流.events[0].sequence = 2;
      },
      "SEQUENCE_MISMATCH",
    ],
    [
      "跨对局事件",
      (事件流) => {
        事件流.events[0].gameId = "game-other";
      },
      "GAME_ID_MISMATCH",
    ],
    [
      "未知事件类型",
      (事件流) => {
        事件流.events[0].type = "unknown.event";
      },
      "UNKNOWN_EVENT_TYPE",
    ],
    [
      "事件规则集身份漂移",
      (事件流) => {
        事件流.events[0].ruleset.version = "0.3.0";
      },
      "RULESET_IDENTITY_MISMATCH",
    ],
    [
      "回执引用不存在的事件",
      (事件流) => {
        事件流.receipts[0].eventIds[0] = "event-missing";
      },
      "INVALID_EVENT_STREAM",
    ],
    [
      "事件信封额外字段",
      (事件流) => {
        事件流.events[0].unexpected = true;
      },
      "INVALID_EVENT_STREAM",
    ],
  ])("%s 时停止可写恢复", (_名称, 篡改, code) => {
    const 引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
    引擎.dispatch(创建命令());
    const 事件流 = JSON.parse(JSON.stringify(引擎.exportEventStream()));
    篡改(事件流);

    expect(捕获错误码(() => restoreDomainProtocol(事件流, 创建依赖()))).toBe(
      code,
    );
  });

  test("导出信封显式保存格式、协议、对局和规则集身份", () => {
    const 引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
    引擎.dispatch(创建命令());

    expect(引擎.exportEventStream()).toMatchObject({
      formatVersion: PROTOCOL_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      gameId: GAME_ID,
      ruleset: M1_RULESET_IDENTITY,
      rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
      events: [expect.any(Object)],
      receipts: [expect.any(Object)],
    });
  });
});
