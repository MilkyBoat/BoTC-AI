import {
  createAdvancePhaseCommand,
  createKillPlayerCommand,
  createResolveExecutionCommand,
  createStartGameCommand,
} from "@/domain/rules";
import {
  DomainProtocolError,
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "@/domain/protocol";

const GAME_ID = "game-m1-r4-replay";
const HOST = { kind: "host", id: "host-m1-r4-replay" };
const 席位 = [
  { seatId: "seat-demon", order: 1, characterType: "demon" },
  { seatId: "seat-a", order: 2, characterType: "townsfolk" },
  { seatId: "seat-b", order: 3, characterType: "outsider" },
  { seatId: "seat-c", order: 4, characterType: "minion" },
  { seatId: "seat-d", order: 5, characterType: "townsfolk" },
];

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T13:00:00.000Z",
    idFactory: (类别) => `${类别}-r4-replay-${++序号}`,
  };
};

const 创建基础命令 = (引擎, commandId, type, payload = {}) => {
  const common = {
    commandId,
    gameId: GAME_ID,
    expectedRevision: 引擎.getState()?.revision ?? 0,
    actor: HOST,
  };
  if (type === "create") {
    return createGameCommand({ ...common, seed: "seed-r4-replay" });
  }
  if (type === "start") {
    return createStartGameCommand({ ...common, seats: 席位 });
  }
  if (type === "advance") return createAdvancePhaseCommand(common);
  if (type === "kill") {
    return createKillPlayerCommand({
      ...common,
      seatId: payload.seatId,
      causeId: "scenario-kill",
    });
  }
  return createResolveExecutionCommand({
    ...common,
    seatId: payload.seatId,
  });
};

const 建立白天对局 = () => {
  const 引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
  引擎.dispatch(创建基础命令(引擎, "command-create", "create"));
  引擎.dispatch(创建基础命令(引擎, "command-start", "start"));
  引擎.dispatch(创建基础命令(引擎, "command-to-day", "advance"));
  return 引擎;
};

const 捕获错误码 = (执行) => {
  try {
    执行();
  } catch (错误) {
    expect(错误).toBeInstanceOf(DomainProtocolError);
    return 错误.code;
  }
  throw new Error("预期领域协议失败");
};

describe("M1-R4 基础规则事件重放场景", () => {
  test("跨昼夜、死亡和处决的完整日志可确定性重放", () => {
    const 原引擎 = 建立白天对局();
    原引擎.dispatch(
      创建基础命令(原引擎, "command-kill-a", "kill", {
        seatId: "seat-a",
      }),
    );
    const 处决命令 = 创建基础命令(原引擎, "command-execute-b", "execute", {
      seatId: "seat-b",
    });
    const 处决回执 = 原引擎.dispatch(处决命令);
    const 事件流 = 原引擎.exportEventStream();

    const 恢复引擎 = restoreDomainProtocol(事件流, 创建依赖());

    expect(恢复引擎.getState()).toEqual(原引擎.getState());
    expect(恢复引擎.getEvents()).toEqual(原引擎.getEvents());
    expect(恢复引擎.getReceipts()).toEqual(原引擎.getReceipts());
    expect(恢复引擎.dispatch(处决命令)).toEqual(处决回执);
  });

  test("处决多事件批次保持连续修订和单一因果命令", () => {
    const 引擎 = 建立白天对局();
    const 回执 = 引擎.dispatch(
      创建基础命令(引擎, "command-execute-a", "execute", {
        seatId: "seat-a",
      }),
    );
    const 批次事件 = 引擎
      .getEvents()
      .filter(({ eventId }) => 回执.eventIds.includes(eventId));

    expect(批次事件.map(({ sequence }) => sequence)).toEqual([4, 5, 6]);
    expect(new Set(批次事件.map(({ causationId }) => causationId))).toEqual(
      new Set(["command-execute-a"]),
    );
    expect(回执).toMatchObject({ revisionBefore: 3, revisionAfter: 6 });
  });

  test("删去致胜批次的结束事件即使同步修订回执也因不变量失败", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      创建基础命令(引擎, "command-kill-demon", "kill", {
        seatId: "seat-demon",
      }),
    );
    const 事件流 = JSON.parse(JSON.stringify(引擎.exportEventStream()));
    const 结束事件 = 事件流.events.pop();
    expect(结束事件.type).toBe("game.ended");
    const 最后回执 = 事件流.receipts.at(-1);
    最后回执.eventIds.pop();
    最后回执.revisionAfter -= 1;

    expect(捕获错误码(() => restoreDomainProtocol(事件流, 创建依赖()))).toBe(
      "INVARIANT_VIOLATION",
    );
  });

  test("重放不能绕过席位唯一与连续顺序不变量", () => {
    const 引擎 = 建立白天对局();
    const 事件流 = JSON.parse(JSON.stringify(引擎.exportEventStream()));
    const 开局事件 = 事件流.events.find(({ type }) => type === "game.started");
    开局事件.payload.seats[1].seatId = 开局事件.payload.seats[0].seatId;

    expect(捕获错误码(() => restoreDomainProtocol(事件流, 创建依赖()))).toBe(
      "REDUCER_FAILURE",
    );
  });

  test("旧 0.1.0 事件流被明确拒绝而不是按新状态语义补字段", () => {
    const 旧事件流 = {
      formatVersion: "0.1.0",
      protocolVersion: "0.1.0",
      gameId: GAME_ID,
      ruleset: null,
      events: [],
      receipts: [],
    };

    expect(捕获错误码(() => restoreDomainProtocol(旧事件流, 创建依赖()))).toBe(
      "UNSUPPORTED_STREAM_FORMAT",
    );
  });
});
