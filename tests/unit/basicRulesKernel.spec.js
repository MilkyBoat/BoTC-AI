import {
  BASIC_RULE_SOURCES,
  createAdvancePhaseCommand,
  createCloseVoteCommand,
  createKillPlayerCommand,
  createOpenNominationCommand,
  createOpenVoteCommand,
  createRecordVoteCommand,
  createResolveExecutionCommand,
  createRevivePlayerCommand,
  createStartGameCommand,
} from "@/domain/rules";
import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_VERSION,
  createDomainProtocol,
  createGameCommand,
} from "@/domain/protocol";

const GAME_ID = "game-m1-r4-001";
const HOST = Object.freeze({ kind: "host", id: "host-r4-001" });
const SYSTEM = Object.freeze({ kind: "system", id: "system-r4-001" });

const 基础席位 = Object.freeze([
  { seatId: "seat-demon", order: 1, characterType: "demon" },
  { seatId: "seat-a", order: 2, characterType: "townsfolk" },
  { seatId: "seat-b", order: 3, characterType: "outsider" },
  { seatId: "seat-c", order: 4, characterType: "minion" },
  { seatId: "seat-d", order: 5, characterType: "townsfolk" },
]);

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T12:00:00.000Z",
    idFactory: (类别) => `${类别}-r4-${++序号}`,
  };
};

const 创建引擎 = () => createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });

const 初始化 = (引擎, 覆盖 = {}) =>
  引擎.dispatch(
    createGameCommand({
      commandId: "command-create-r4",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      seed: "seed-r4-fixed",
      ...覆盖,
    }),
  );

const 开始 = (引擎, 席位 = 基础席位, 覆盖 = {}) =>
  引擎.dispatch(
    createStartGameCommand({
      commandId: "command-start-r4",
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      seats: 席位,
      ...覆盖,
    }),
  );

const 创建并开始 = (席位 = 基础席位) => {
  const 引擎 = 创建引擎();
  初始化(引擎);
  开始(引擎, 席位);
  return 引擎;
};

const 推进 = (引擎, commandId, 覆盖 = {}) =>
  引擎.dispatch(
    createAdvancePhaseCommand({
      commandId,
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      ...覆盖,
    }),
  );

const 死亡 = (引擎, seatId, commandId, 覆盖 = {}) =>
  引擎.dispatch(
    createKillPlayerCommand({
      commandId,
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      seatId,
      causeId: "test-ability",
      sourceId: "role-test",
      ...覆盖,
    }),
  );

const 复活 = (引擎, seatId, commandId, 覆盖 = {}) =>
  引擎.dispatch(
    createRevivePlayerCommand({
      commandId,
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      seatId,
      causeId: "test-resurrection",
      sourceId: "role-test",
      ...覆盖,
    }),
  );

const 处决 = (引擎, seatId, commandId, 覆盖 = {}) =>
  引擎.dispatch(
    createResolveExecutionCommand({
      commandId,
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      seatId,
      ...覆盖,
    }),
  );

const 选为处决候选 = (引擎, seatId, 前缀) => {
  const nominationId = `nomination-${前缀}`;
  const nominatorSeatId = 引擎
    .getState()
    .seats.find(
      ({ alive, seatId: candidate }) => alive && candidate !== seatId,
    ).seatId;
  const 派发 = (命令) => {
    const 回执 = 引擎.dispatch(命令);
    expect(回执.status).toBe("accepted");
  };
  const 公共参数 = (commandId) => ({
    commandId,
    gameId: GAME_ID,
    expectedRevision: 引擎.getState().revision,
    actor: HOST,
  });

  派发(
    createOpenNominationCommand({
      ...公共参数(`command-${前缀}-nominate`),
      nominationId,
      nominatorSeatId,
      nomineeSeatId: seatId,
    }),
  );
  派发(
    createOpenVoteCommand({
      ...公共参数(`command-${前缀}-vote-open`),
      nominationId,
    }),
  );
  引擎.getState().activeNomination.votingOrder.forEach((voterSeatId, index) => {
    const voter = 引擎
      .getState()
      .seats.find(({ seatId: candidate }) => candidate === voterSeatId);
    派发(
      createRecordVoteCommand({
        ...公共参数(`command-${前缀}-vote-${index + 1}`),
        nominationId,
        voterSeatId,
        support: voter.alive,
      }),
    );
  });
  派发(
    createCloseVoteCommand({
      ...公共参数(`command-${前缀}-vote-close`),
      nominationId,
    }),
  );
  expect(引擎.getState().executionCandidate).toEqual({
    seatId,
    votes: 引擎.getState().seats.filter(({ alive }) => alive).length,
  });
};

describe("M1-R4 阶段与基础规则内核", () => {
  test("当前领域协议创建后进入准备阶段并初始化当日表决状态", () => {
    const 引擎 = 创建引擎();
    初始化(引擎);

    expect(PROTOCOL_VERSION).toBe("0.3.0");
    expect(引擎.getState()).toEqual({
      schemaVersion: PROTOCOL_VERSION,
      gameId: GAME_ID,
      ruleset: expect.any(Object),
      seed: "seed-r4-fixed",
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
      winner: null,
    });
  });

  test("合法开局按连续顺序建立存活席位并进入首夜", () => {
    const 引擎 = 创建引擎();
    初始化(引擎);
    const 回执 = 开始(引擎, [
      ...基础席位,
      { seatId: "seat-traveler", order: 6, characterType: "traveler" },
    ]);

    expect(回执).toMatchObject({
      status: "accepted",
      revisionBefore: 1,
      revisionAfter: 2,
    });
    expect(引擎.getState()).toMatchObject({
      lifecycle: "running",
      phase: "first-night",
      dayNumber: 0,
      nightNumber: 1,
      executionToday: null,
      winner: null,
      seats: [
        ...基础席位.map((seat) => ({ ...seat, alive: true })),
        {
          seatId: "seat-traveler",
          order: 6,
          characterType: "traveler",
          alive: true,
        },
      ],
    });
    expect(引擎.getEvents()[1]).toMatchObject({
      type: EVENT_TYPES.GAME_STARTED,
      payload: { ruleSourceId: BASIC_RULE_SOURCES.PHASE },
    });
  });

  test.each([
    [
      "重复席位 ID",
      [
        ...基础席位.slice(0, 4),
        { seatId: "seat-a", order: 5, characterType: "townsfolk" },
      ],
    ],
    [
      "跳跃顺序",
      基础席位.map((seat, index) =>
        index === 4 ? { ...seat, order: 6 } : seat,
      ),
    ],
    [
      "缺少恶魔",
      基础席位.map((seat) => ({ ...seat, characterType: "townsfolk" })),
    ],
    [
      "非旅行者不足三人",
      [
        { seatId: "seat-demon", order: 1, characterType: "demon" },
        { seatId: "seat-a", order: 2, characterType: "townsfolk" },
        { seatId: "seat-traveler", order: 3, characterType: "traveler" },
      ],
    ],
  ])("%s 的开局被拒绝且不产生事件", (_名称, seats) => {
    const 引擎 = 创建引擎();
    初始化(引擎);

    const 回执 = 开始(引擎, seats);

    expect(回执).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_SETUP" },
      revisionBefore: 1,
      revisionAfter: 1,
    });
    expect(引擎.getEvents()).toHaveLength(1);
  });

  test("非控制主体不能开局或推进阶段", () => {
    const 引擎 = 创建引擎();
    初始化(引擎);

    expect(
      开始(引擎, 基础席位, {
        commandId: "command-start-seat",
        actor: { kind: "seat", id: "seat-a" },
      }),
    ).toMatchObject({
      status: "rejected",
      error: { code: "ACTOR_NOT_AUTHORIZED" },
    });

    开始(引擎);
    expect(
      推进(引擎, "command-advance-agent", {
        actor: { kind: "agent", id: "agent-a" },
      }),
    ).toMatchObject({
      status: "rejected",
      error: { code: "ACTOR_NOT_AUTHORIZED" },
    });
  });

  test("首夜、白天与其他夜晚按固定序列维护编号", () => {
    const 引擎 = 创建并开始();

    推进(引擎, "command-first-night-to-day");
    expect(引擎.getState()).toMatchObject({
      phase: "day",
      dayNumber: 1,
      nightNumber: 1,
    });
    推进(引擎, "command-day-to-night");
    expect(引擎.getState()).toMatchObject({
      phase: "night",
      dayNumber: 1,
      nightNumber: 2,
    });
    推进(引擎, "command-night-to-day");
    expect(引擎.getState()).toMatchObject({
      phase: "day",
      dayNumber: 2,
      nightNumber: 2,
      executionToday: null,
    });
    expect(
      引擎
        .getEvents()
        .filter(({ type }) => type === EVENT_TYPES.PHASE_ADVANCED)
        .map(({ payload }) => payload),
    ).toEqual([
      {
        from: "first-night",
        to: "day",
        dayNumber: 1,
        nightNumber: 1,
        reason: "manual",
        ruleSourceId: BASIC_RULE_SOURCES.PHASE,
      },
      {
        from: "day",
        to: "night",
        dayNumber: 1,
        nightNumber: 2,
        reason: "manual",
        ruleSourceId: BASIC_RULE_SOURCES.PHASE,
      },
      {
        from: "night",
        to: "day",
        dayNumber: 2,
        nightNumber: 2,
        reason: "manual",
        ruleSourceId: BASIC_RULE_SOURCES.PHASE,
      },
    ]);
  });

  test("系统主体可以推进，准备阶段不能推进", () => {
    const 准备引擎 = 创建引擎();
    初始化(准备引擎);
    expect(推进(准备引擎, "command-advance-setup")).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_GAME_PHASE" },
    });

    const 引擎 = 创建并开始();
    const 回执 = 推进(引擎, "command-advance-system", { actor: SYSTEM });
    expect(回执.status).toBe("accepted");
    expect(引擎.getState().phase).toBe("day");
  });

  test("普通死亡与复活记录来源并保持互斥状态", () => {
    const 引擎 = 创建并开始();
    const 死亡回执 = 死亡(引擎, "seat-a", "command-kill-a");
    expect(死亡回执).toMatchObject({
      status: "accepted",
      revisionAfter: 3,
    });
    expect(引擎.getState().seats[1].alive).toBe(false);
    expect(引擎.getEvents()[2]).toMatchObject({
      type: EVENT_TYPES.PLAYER_DIED,
      payload: {
        seatId: "seat-a",
        causeId: "test-ability",
        sourceId: "role-test",
        ruleSourceId: BASIC_RULE_SOURCES.LIFE,
      },
    });

    expect(死亡(引擎, "seat-a", "command-kill-a-again")).toMatchObject({
      status: "rejected",
      error: { code: "PLAYER_ALREADY_DEAD" },
    });

    const 复活回执 = 复活(引擎, "seat-a", "command-revive-a");
    expect(复活回执.status).toBe("accepted");
    expect(引擎.getState().seats[1].alive).toBe(true);
    expect(引擎.getEvents().at(-1)).toMatchObject({
      type: EVENT_TYPES.PLAYER_REVIVED,
      payload: {
        seatId: "seat-a",
        causeId: "test-resurrection",
        sourceId: "role-test",
        ruleSourceId: BASIC_RULE_SOURCES.LIFE,
      },
    });
    expect(复活(引擎, "seat-a", "command-revive-a-again")).toMatchObject({
      status: "rejected",
      error: { code: "PLAYER_ALREADY_ALIVE" },
    });
  });

  test("未知席位和非控制主体不能改变生死", () => {
    const 引擎 = 创建并开始();
    expect(死亡(引擎, "seat-missing", "command-kill-missing")).toMatchObject({
      status: "rejected",
      error: { code: "SEAT_NOT_FOUND" },
    });
    expect(
      死亡(引擎, "seat-a", "command-kill-seat-actor", {
        actor: { kind: "seat", id: "seat-a" },
      }),
    ).toMatchObject({
      status: "rejected",
      error: { code: "ACTOR_NOT_AUTHORIZED" },
    });
  });

  test("最后一名存活恶魔死亡时善良立即获胜", () => {
    const 引擎 = 创建并开始();

    const 回执 = 死亡(引擎, "seat-demon", "command-kill-demon");

    expect(回执).toMatchObject({
      status: "accepted",
      revisionBefore: 2,
      revisionAfter: 4,
    });
    expect(
      引擎
        .getEvents()
        .slice(-2)
        .map(({ type }) => type),
    ).toEqual([EVENT_TYPES.PLAYER_DIED, EVENT_TYPES.GAME_ENDED]);
    expect(引擎.getState()).toMatchObject({
      lifecycle: "ended",
      phase: "ended",
      winner: {
        alignment: "good",
        reason: "all-demons-dead",
        decidedAtRevision: 4,
      },
    });
    expect(推进(引擎, "command-after-ended")).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_GAME_PHASE" },
    });
  });

  test("非旅行者仅剩两名且恶魔存活时邪恶获胜", () => {
    const 引擎 = 创建并开始();
    死亡(引擎, "seat-a", "command-kill-a");
    死亡(引擎, "seat-b", "command-kill-b");

    const 回执 = 死亡(引擎, "seat-c", "command-kill-c");

    expect(回执.revisionAfter - 回执.revisionBefore).toBe(2);
    expect(引擎.getState()).toMatchObject({
      lifecycle: "ended",
      winner: {
        alignment: "evil",
        reason: "two-alive",
      },
    });
  });

  test("旅行者不计入邪恶胜利人数且同时满足时善良优先", () => {
    const 含旅行者 = [
      { seatId: "seat-demon", order: 1, characterType: "demon" },
      { seatId: "seat-a", order: 2, characterType: "townsfolk" },
      { seatId: "seat-b", order: 3, characterType: "minion" },
      { seatId: "seat-t1", order: 4, characterType: "traveler" },
      { seatId: "seat-t2", order: 5, characterType: "traveler" },
    ];
    const 邪恶胜利引擎 = 创建并开始(含旅行者);
    死亡(邪恶胜利引擎, "seat-a", "command-kill-a");
    expect(邪恶胜利引擎.getState().winner).toMatchObject({
      alignment: "evil",
      reason: "two-alive",
    });

    const 同时满足引擎 = 创建并开始(含旅行者.slice(0, 3));
    死亡(同时满足引擎, "seat-demon", "command-kill-demon");
    expect(同时满足引擎.getState().winner).toMatchObject({
      alignment: "good",
      reason: "all-demons-dead",
    });
  });

  test("处决存活目标原子记录处决、死亡并进入夜晚", () => {
    const 引擎 = 创建并开始();
    推进(引擎, "command-to-day");
    选为处决候选(引擎, "seat-a", "execute-a");
    const 处决前修订 = 引擎.getState().revision;

    const 回执 = 处决(引擎, "seat-a", "command-execute-a");

    expect(回执).toMatchObject({
      revisionBefore: 处决前修订,
      revisionAfter: 处决前修订 + 3,
      status: "accepted",
    });
    expect(
      引擎
        .getEvents()
        .slice(-3)
        .map(({ type }) => type),
    ).toEqual([
      EVENT_TYPES.PLAYER_EXECUTED,
      EVENT_TYPES.PLAYER_DIED,
      EVENT_TYPES.PHASE_ADVANCED,
    ]);
    expect(引擎.getState()).toMatchObject({
      phase: "night",
      dayNumber: 1,
      nightNumber: 2,
      executionToday: { dayNumber: 1, seatId: "seat-a", died: true },
    });
    expect(引擎.getEvents().at(-1).payload).toMatchObject({
      reason: "execution",
      ruleSourceId: BASIC_RULE_SOURCES.EXECUTION,
    });
  });

  test("处决已死亡目标不产生第二个死亡事件但仍进入夜晚", () => {
    const 引擎 = 创建并开始();
    死亡(引擎, "seat-a", "command-kill-a-before-day");
    推进(引擎, "command-to-day-after-death");
    选为处决候选(引擎, "seat-a", "execute-dead-a");
    const 事件数 = 引擎.getEvents().length;

    const 回执 = 处决(引擎, "seat-a", "command-execute-dead-a");

    expect(回执.revisionAfter - 回执.revisionBefore).toBe(2);
    expect(
      引擎
        .getEvents()
        .slice(事件数)
        .map(({ type }) => type),
    ).toEqual([EVENT_TYPES.PLAYER_EXECUTED, EVENT_TYPES.PHASE_ADVANCED]);
    expect(引擎.getState().executionToday).toEqual({
      dayNumber: 1,
      seatId: "seat-a",
      died: false,
    });
  });

  test("处决致胜时结束对局而不进入夜晚", () => {
    const 引擎 = 创建并开始();
    推进(引擎, "command-to-day");
    选为处决候选(引擎, "seat-demon", "execute-demon");

    处决(引擎, "seat-demon", "command-execute-demon");

    expect(
      引擎
        .getEvents()
        .slice(-3)
        .map(({ type }) => type),
    ).toEqual([
      EVENT_TYPES.PLAYER_EXECUTED,
      EVENT_TYPES.PLAYER_DIED,
      EVENT_TYPES.GAME_ENDED,
    ]);
    expect(引擎.getState()).toMatchObject({
      phase: "ended",
      winner: { alignment: "good", reason: "all-demons-dead" },
      executionToday: {
        dayNumber: 1,
        seatId: "seat-demon",
        died: true,
      },
    });
  });

  test("只有白天可以处决且不能由负载指定阶段或胜方", () => {
    const 引擎 = 创建并开始();
    expect(处决(引擎, "seat-a", "command-execute-at-night")).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_GAME_PHASE" },
    });

    推进(引擎, "command-to-day");
    const 命令 = createResolveExecutionCommand({
      commandId: "command-execute-extra-field",
      gameId: GAME_ID,
      expectedRevision: 引擎.getState().revision,
      actor: HOST,
      seatId: "seat-a",
    });
    expect(() =>
      引擎.dispatch({
        ...命令,
        payload: { ...命令.payload, winner: "evil" },
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_COMMAND_PAYLOAD" }));
  });

  test("命令构造器生成严格版本化类型且不保留输入引用", () => {
    const seats = 基础席位.map((seat) => ({ ...seat }));
    const 命令 = createStartGameCommand({
      commandId: "command-builder-start",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      seats,
    });
    seats[0].characterType = "townsfolk";

    expect(命令).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      type: COMMAND_TYPES.GAME_START,
      payload: { seats: expect.any(Array) },
    });
    expect(命令.payload.seats[0]).toMatchObject({ characterType: "demon" });
    expect(Object.isFrozen(命令)).toBe(true);
    expect(Object.isFrozen(命令.payload.seats[0])).toBe(true);
  });
});
