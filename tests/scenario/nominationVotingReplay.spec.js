import {
  DomainProtocolError,
  createDomainProtocol,
  createGameCommand,
  restoreDomainProtocol,
} from "@/domain/protocol";
import {
  createAdvancePhaseCommand,
  createCloseExileCommand,
  createCloseVoteCommand,
  createKillPlayerCommand,
  createOpenExileCommand,
  createOpenNominationCommand,
  createOpenVoteCommand,
  createRecordVoteCommand,
  createSetExileSupportCommand,
  createStartGameCommand,
} from "@/domain/rules";

const GAME_ID = "game-m1-r5-replay";
const HOST = Object.freeze({ kind: "host", id: "host-r5-replay" });
const seatActor = (seatId) => ({ kind: "seat", id: seatId });
const SEATS = Object.freeze([
  { seatId: "seat-a", order: 1, characterType: "townsfolk" },
  { seatId: "seat-b", order: 2, characterType: "outsider" },
  { seatId: "seat-c", order: 3, characterType: "minion" },
  { seatId: "seat-d", order: 4, characterType: "townsfolk" },
  { seatId: "seat-e", order: 5, characterType: "townsfolk" },
  { seatId: "seat-demon", order: 6, characterType: "demon" },
  { seatId: "seat-traveler", order: 7, characterType: "traveler" },
]);

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T13:00:00.000Z",
    idFactory: (kind) => `${kind}-r5-replay-${++序号}`,
  };
};

const 参数 = (引擎, commandId, actor = HOST) => ({
  commandId,
  gameId: GAME_ID,
  expectedRevision: 引擎.getState()?.revision ?? 0,
  actor,
});

const 建立白天 = () => {
  const 引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
  引擎.dispatch(
    createGameCommand({
      ...参数(引擎, "command-create"),
      seed: "seed-r5-replay",
    }),
  );
  引擎.dispatch(
    createStartGameCommand({
      ...参数(引擎, "command-start"),
      seats: SEATS,
    }),
  );
  引擎.dispatch(
    createAdvancePhaseCommand({ ...参数(引擎, "command-first-day") }),
  );
  return 引擎;
};

const 完成一轮投票 = (引擎) => {
  引擎.dispatch(
    createOpenNominationCommand({
      ...参数(引擎, "command-nominate", seatActor("seat-a")),
      nominationId: "nomination-replay",
      nominatorSeatId: "seat-a",
      nomineeSeatId: "seat-b",
    }),
  );
  引擎.dispatch(
    createOpenVoteCommand({
      ...参数(引擎, "command-open-vote"),
      nominationId: "nomination-replay",
    }),
  );
  const 支持 = new Set(["seat-a", "seat-b", "seat-c", "seat-d"]);
  while (引擎.getState().activeNomination.stage !== "ready-to-close") {
    const 活动 = 引擎.getState().activeNomination;
    const seatId = 活动.votingOrder[活动.currentVoterIndex];
    引擎.dispatch(
      createRecordVoteCommand({
        ...参数(引擎, `command-vote-${seatId}`, seatActor(seatId)),
        nominationId: "nomination-replay",
        voterSeatId: seatId,
        support: 支持.has(seatId),
      }),
    );
  }
  return 引擎.dispatch(
    createCloseVoteCommand({
      ...参数(引擎, "command-close-vote"),
      nominationId: "nomination-replay",
    }),
  );
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

const 把最后拒绝回执伪造成接受事件 = (事件流, commandId, type, payload) => {
  const 前一事件 = 事件流.events.at(-1);
  const 事件 = {
    ...前一事件,
    eventId: `event-tampered-${type}`,
    sequence: 前一事件.sequence + 1,
    type,
    causationId: commandId,
    actor: HOST,
    payload,
  };
  const 回执 = 事件流.receipts.find(
    ({ commandId: current }) => current === commandId,
  );
  expect(回执).toMatchObject({ status: "rejected", eventIds: [] });
  回执.status = "accepted";
  回执.revisionAfter = 事件.sequence;
  回执.eventIds = [事件.eventId];
  delete 回执.error;
  事件流.events.push(事件);
};

describe("M1-R5 提名投票事件重放场景", () => {
  test("活动投票窗口可导出恢复并从精确游标继续", () => {
    const 原引擎 = 建立白天();
    原引擎.dispatch(
      createOpenNominationCommand({
        ...参数(原引擎, "command-nominate", seatActor("seat-a")),
        nominationId: "nomination-active",
        nominatorSeatId: "seat-a",
        nomineeSeatId: "seat-c",
      }),
    );
    原引擎.dispatch(
      createOpenVoteCommand({
        ...参数(原引擎, "command-open-vote"),
        nominationId: "nomination-active",
      }),
    );
    [true, false].forEach((support, index) => {
      const 活动 = 原引擎.getState().activeNomination;
      const seatId = 活动.votingOrder[活动.currentVoterIndex];
      原引擎.dispatch(
        createRecordVoteCommand({
          ...参数(原引擎, `command-partial-${index}`, seatActor(seatId)),
          nominationId: "nomination-active",
          voterSeatId: seatId,
          support,
        }),
      );
    });

    const 恢复引擎 = restoreDomainProtocol(
      原引擎.exportEventStream(),
      创建依赖(),
    );
    expect(恢复引擎.getState()).toEqual(原引擎.getState());
    expect(恢复引擎.getEvents()).toEqual(原引擎.getEvents());
    expect(恢复引擎.getReceipts()).toEqual(原引擎.getReceipts());
  });

  test("完整投票与流放日志确定性重放且幂等回执保持", () => {
    const 原引擎 = 建立白天();
    const 关票命令 = 完成一轮投票(原引擎);
    原引擎.dispatch(
      createOpenExileCommand({
        ...参数(原引擎, "command-open-exile", seatActor("seat-c")),
        exileId: "exile-replay",
        proposerSeatId: "seat-c",
        travelerSeatId: "seat-traveler",
      }),
    );
    ["seat-a", "seat-b", "seat-c", "seat-d"].forEach((seatId) => {
      原引擎.dispatch(
        createSetExileSupportCommand({
          ...参数(原引擎, `command-exile-${seatId}`, seatActor(seatId)),
          exileId: "exile-replay",
          supporterSeatId: seatId,
          support: true,
        }),
      );
    });
    const 关闭流放命令 = createCloseExileCommand({
      ...参数(原引擎, "command-close-exile"),
      exileId: "exile-replay",
    });
    const 关闭流放回执 = 原引擎.dispatch(关闭流放命令);

    const 恢复引擎 = restoreDomainProtocol(
      原引擎.exportEventStream(),
      创建依赖(),
    );
    expect(恢复引擎.getState()).toEqual(原引擎.getState());
    expect(恢复引擎.getEvents()).toEqual(原引擎.getEvents());
    expect(恢复引擎.getReceipts()).toEqual(原引擎.getReceipts());
    expect(恢复引擎.dispatch(关闭流放命令)).toEqual(关闭流放回执);
    expect(关票命令).toMatchObject({ status: "accepted" });
  });

  test("成功流放的记录与死亡是同一原子命令批次", () => {
    const 引擎 = 建立白天();
    引擎.dispatch(
      createOpenExileCommand({
        ...参数(引擎, "command-open-exile", seatActor("seat-a")),
        exileId: "exile-atomic",
        proposerSeatId: "seat-a",
        travelerSeatId: "seat-traveler",
      }),
    );
    ["seat-a", "seat-b", "seat-c", "seat-d"].forEach((seatId) => {
      引擎.dispatch(
        createSetExileSupportCommand({
          ...参数(引擎, `command-support-${seatId}`, seatActor(seatId)),
          exileId: "exile-atomic",
          supporterSeatId: seatId,
          support: true,
        }),
      );
    });
    const 回执 = 引擎.dispatch(
      createCloseExileCommand({
        ...参数(引擎, "command-close-exile"),
        exileId: "exile-atomic",
      }),
    );
    const 批次 = 引擎
      .getEvents()
      .filter(({ eventId }) => 回执.eventIds.includes(eventId));

    expect(批次.map(({ type }) => type)).toEqual([
      "exile.closed",
      "player.died",
    ]);
    expect(new Set(批次.map(({ causationId }) => causationId))).toEqual(
      new Set(["command-close-exile"]),
    );
  });

  test("篡改投票顺序时重放失败关闭", () => {
    const 引擎 = 建立白天();
    完成一轮投票(引擎);
    const 篡改顺序 = JSON.parse(JSON.stringify(引擎.exportEventStream()));
    const 投票事件 = 篡改顺序.events.find(
      ({ type }) => type === "vote.recorded",
    );
    投票事件.payload.voterSeatId = "seat-demon";

    expect(["REDUCER_FAILURE", "INVARIANT_VIOLATION"]).toContain(
      捕获错误码(() => restoreDomainProtocol(篡改顺序, 创建依赖())),
    );
  });

  test("篡改日志不能在活动窗口插入死亡或绕过候选直接入夜", () => {
    const 活动窗口 = 建立白天();
    活动窗口.dispatch(
      createOpenNominationCommand({
        ...参数(活动窗口, "command-open-freeze", seatActor("seat-a")),
        nominationId: "nomination-freeze-replay",
        nominatorSeatId: "seat-a",
        nomineeSeatId: "seat-b",
      }),
    );
    活动窗口.dispatch(
      createKillPlayerCommand({
        ...参数(活动窗口, "command-rejected-kill"),
        seatId: "seat-c",
        causeId: "tampered-kill",
      }),
    );
    const 伪造死亡 = JSON.parse(JSON.stringify(活动窗口.exportEventStream()));
    把最后拒绝回执伪造成接受事件(
      伪造死亡,
      "command-rejected-kill",
      "player.died",
      {
        seatId: "seat-c",
        causeId: "tampered-kill",
        ruleSourceId: "zh-wiki-glossary",
      },
    );
    expect(捕获错误码(() => restoreDomainProtocol(伪造死亡, 创建依赖()))).toBe(
      "REDUCER_FAILURE",
    );

    const 有候选 = 建立白天();
    完成一轮投票(有候选);
    有候选.dispatch(
      createAdvancePhaseCommand({
        ...参数(有候选, "command-rejected-advance"),
      }),
    );
    const 伪造入夜 = JSON.parse(JSON.stringify(有候选.exportEventStream()));
    把最后拒绝回执伪造成接受事件(
      伪造入夜,
      "command-rejected-advance",
      "phase.advanced",
      {
        from: "day",
        to: "night",
        dayNumber: 1,
        nightNumber: 2,
        reason: "manual",
        ruleSourceId: "zh-wiki-glossary",
      },
    );
    expect(捕获错误码(() => restoreDomainProtocol(伪造入夜, 创建依赖()))).toBe(
      "REDUCER_FAILURE",
    );
  });

  test("0.2.0 旧事件流明确拒绝，不推断死亡票和提名状态", () => {
    const 旧事件流 = {
      formatVersion: "0.2.0",
      protocolVersion: "0.2.0",
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
