import {
  DomainProtocolError,
  PROTOCOL_VERSION,
  createDomainProtocol,
  createGameCommand,
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
  createResolveExecutionCommand,
  createRevivePlayerCommand,
  createSetExileSupportCommand,
  createStartGameCommand,
} from "@/domain/rules";

const GAME_ID = "game-m1-r5-unit";
const HOST = Object.freeze({ kind: "host", id: "host-r5" });
const SYSTEM = Object.freeze({ kind: "system", id: "system-r5" });
const OBSERVER = Object.freeze({ kind: "observer", id: "observer-r5" });
const AGENT = Object.freeze({ kind: "agent", id: "agent-r5" });
const seatActor = (seatId) => ({ kind: "seat", id: seatId });

const SEATS = Object.freeze([
  { seatId: "seat-a", order: 1, characterType: "townsfolk" },
  { seatId: "seat-b", order: 2, characterType: "outsider" },
  { seatId: "seat-c", order: 3, characterType: "minion" },
  { seatId: "seat-d", order: 4, characterType: "townsfolk" },
  { seatId: "seat-e", order: 5, characterType: "townsfolk" },
  { seatId: "seat-f", order: 6, characterType: "townsfolk" },
  { seatId: "seat-demon", order: 7, characterType: "demon" },
  { seatId: "seat-traveler", order: 8, characterType: "traveler" },
]);

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T12:00:00.000Z",
    idFactory: (kind) => `${kind}-r5-${++序号}`,
  };
};

const 通用参数 = (引擎, commandId, actor = HOST) => ({
  commandId,
  gameId: GAME_ID,
  expectedRevision: 引擎.getState()?.revision ?? 0,
  actor,
});

const 建立白天对局 = (seats = SEATS) => {
  const 引擎 = createDomainProtocol({ gameId: GAME_ID, ...创建依赖() });
  引擎.dispatch(
    createGameCommand({
      ...通用参数(引擎, "command-create"),
      seed: "seed-r5-unit",
    }),
  );
  引擎.dispatch(
    createStartGameCommand({
      ...通用参数(引擎, "command-start"),
      seats,
    }),
  );
  引擎.dispatch(
    createAdvancePhaseCommand({
      ...通用参数(引擎, "command-first-day"),
    }),
  );
  return 引擎;
};

const 捕获拒绝 = (回执, code) => {
  expect(回执).toMatchObject({
    status: "rejected",
    error: { code, message: expect.any(String) },
  });
  return 回执;
};

const 打开提名 = (
  引擎,
  {
    id = "nomination-1",
    nominator = "seat-a",
    nominee = "seat-b",
    actor = seatActor(nominator),
    commandId = `command-open-${id}`,
  } = {},
) =>
  引擎.dispatch(
    createOpenNominationCommand({
      ...通用参数(引擎, commandId, actor),
      nominationId: id,
      nominatorSeatId: nominator,
      nomineeSeatId: nominee,
    }),
  );

const 打开投票 = (
  引擎,
  id = "nomination-1",
  commandId = `command-vote-${id}`,
) =>
  引擎.dispatch(
    createOpenVoteCommand({
      ...通用参数(引擎, commandId),
      nominationId: id,
    }),
  );

const 记录当前票 = (引擎, support, { actor = HOST, commandId } = {}) => {
  const 活动 = 引擎.getState().activeNomination;
  const seatId = 活动.votingOrder[活动.currentVoterIndex];
  return 引擎.dispatch(
    createRecordVoteCommand({
      ...通用参数(
        引擎,
        commandId ?? `command-record-${活动.nominationId}-${seatId}`,
        actor,
      ),
      nominationId: 活动.nominationId,
      voterSeatId: seatId,
      support,
    }),
  );
};

const 完成投票 = (
  引擎,
  supporters,
  { id = "nomination-1", commandPrefix = id } = {},
) => {
  const 支持 = new Set(supporters);
  while (引擎.getState().activeNomination.stage !== "ready-to-close") {
    const 活动 = 引擎.getState().activeNomination;
    const seatId = 活动.votingOrder[活动.currentVoterIndex];
    记录当前票(引擎, 支持.has(seatId), {
      commandId: `command-${commandPrefix}-${seatId}`,
    });
  }
  return 引擎.dispatch(
    createCloseVoteCommand({
      ...通用参数(引擎, `command-close-${commandPrefix}`),
      nominationId: id,
    }),
  );
};

const 提名并结算 = (
  引擎,
  { id, nominator, nominee, supporters, commandPrefix = id },
) => {
  打开提名(引擎, { id, nominator, nominee });
  打开投票(引擎, id, `command-open-vote-${commandPrefix}`);
  return 完成投票(引擎, supporters, { id, commandPrefix });
};

const 打开流放 = (
  引擎,
  {
    id = "exile-1",
    proposer = "seat-a",
    traveler = "seat-traveler",
    actor = seatActor(proposer),
    commandId = `command-open-${id}`,
  } = {},
) =>
  引擎.dispatch(
    createOpenExileCommand({
      ...通用参数(引擎, commandId, actor),
      exileId: id,
      proposerSeatId: proposer,
      travelerSeatId: traveler,
    }),
  );

const 设置流放支持 = (
  引擎,
  seatId,
  support,
  { id = "exile-1", actor = seatActor(seatId), commandId } = {},
) =>
  引擎.dispatch(
    createSetExileSupportCommand({
      ...通用参数(
        引擎,
        commandId ?? `command-support-${id}-${seatId}-${support}`,
        actor,
      ),
      exileId: id,
      supporterSeatId: seatId,
      support,
    }),
  );

describe("M1-R5 提名与投票规则", () => {
  test("协议 0.3.0 初始化提名、流放和死亡票状态", () => {
    const 引擎 = 建立白天对局();

    expect(PROTOCOL_VERSION).toBe("0.3.0");
    expect(引擎.getState()).toMatchObject({
      phase: "day",
      nominationsToday: [],
      activeNomination: null,
      highestNominationVotes: 0,
      executionCandidate: null,
      exilesToday: [],
      activeExile: null,
    });
    expect(
      引擎
        .getState()
        .seats.every(({ deadVoteAvailable }) => !deadVoteAvailable),
    ).toBe(true);
  });

  test("存活席位可自我提名，死亡目标仍可被提名", () => {
    const 自提名 = 建立白天对局();
    expect(
      打开提名(自提名, {
        id: "nomination-self",
        nominee: "seat-a",
      }),
    ).toMatchObject({ status: "accepted" });

    const 提名死者 = 建立白天对局();
    提名死者.dispatch(
      createKillPlayerCommand({
        ...通用参数(提名死者, "command-kill-b"),
        seatId: "seat-b",
        causeId: "unit-death",
      }),
    );
    expect(
      打开提名(提名死者, {
        id: "nomination-dead",
        nominee: "seat-b",
      }),
    ).toMatchObject({ status: "accepted" });
  });

  test("死亡提名者、旅行者目标、主体冒用和非玩家主体失败关闭", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-a"),
        seatId: "seat-a",
        causeId: "unit-death",
      }),
    );

    捕获拒绝(
      打开提名(引擎, { id: "nomination-dead-nominator" }),
      "NOMINATOR_NOT_ALIVE",
    );
    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-traveler",
        nominator: "seat-b",
        nominee: "seat-traveler",
      }),
      "TRAVELER_CANNOT_BE_NOMINATED",
    );
    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-spoof",
        nominator: "seat-b",
        nominee: "seat-c",
        actor: seatActor("seat-c"),
      }),
      "ACTOR_SEAT_MISMATCH",
    );
    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-observer",
        nominator: "seat-b",
        nominee: "seat-c",
        actor: OBSERVER,
      }),
      "ACTOR_NOT_AUTHORIZED",
    );
    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-agent",
        nominator: "seat-b",
        nominee: "seat-c",
        actor: AGENT,
      }),
      "ACTOR_NOT_AUTHORIZED",
    );
  });

  test("每天每席只能发起一次且只能被提名一次", () => {
    const 引擎 = 建立白天对局();
    提名并结算(引擎, {
      id: "nomination-first",
      nominator: "seat-a",
      nominee: "seat-b",
      supporters: [],
    });

    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-repeat-nominator",
        nominator: "seat-a",
        nominee: "seat-c",
      }),
      "NOMINATOR_ALREADY_USED",
    );
    捕获拒绝(
      打开提名(引擎, {
        id: "nomination-repeat-nominee",
        nominator: "seat-c",
        nominee: "seat-b",
      }),
      "NOMINEE_ALREADY_NOMINATED",
    );
  });

  test("投票顺序从被提名者下一席顺时针开始并以被提名者结束", () => {
    const 引擎 = 建立白天对局();
    打开提名(引擎, {
      id: "nomination-order",
      nominator: "seat-a",
      nominee: "seat-c",
    });
    打开投票(引擎, "nomination-order");

    expect(引擎.getState().activeNomination).toMatchObject({
      stage: "voting",
      threshold: 4,
      currentVoterIndex: 0,
      votingOrder: [
        "seat-d",
        "seat-e",
        "seat-f",
        "seat-demon",
        "seat-traveler",
        "seat-a",
        "seat-b",
        "seat-c",
      ],
      decisions: [],
    });
  });

  test("越序、重复记录、窗口未完成关票和非控制主体关票均拒绝", () => {
    const 引擎 = 建立白天对局();
    打开提名(引擎, { id: "nomination-window", nominee: "seat-c" });
    打开投票(引擎, "nomination-window");

    捕获拒绝(
      引擎.dispatch(
        createRecordVoteCommand({
          ...通用参数(引擎, "command-out-of-order", seatActor("seat-e")),
          nominationId: "nomination-window",
          voterSeatId: "seat-e",
          support: true,
        }),
      ),
      "VOTER_OUT_OF_ORDER",
    );
    expect(
      记录当前票(引擎, true, { actor: seatActor("seat-d") }),
    ).toMatchObject({ status: "accepted" });
    捕获拒绝(
      引擎.dispatch(
        createRecordVoteCommand({
          ...通用参数(引擎, "command-repeat-seat", seatActor("seat-d")),
          nominationId: "nomination-window",
          voterSeatId: "seat-d",
          support: false,
        }),
      ),
      "VOTER_OUT_OF_ORDER",
    );
    捕获拒绝(
      引擎.dispatch(
        createCloseVoteCommand({
          ...通用参数(引擎, "command-close-early"),
          nominationId: "nomination-window",
        }),
      ),
      "VOTING_NOT_COMPLETE",
    );
    while (引擎.getState().activeNomination.stage !== "ready-to-close") {
      记录当前票(引擎, false);
    }
    捕获拒绝(
      引擎.dispatch(
        createCloseVoteCommand({
          ...通用参数(引擎, "command-seat-close", seatActor("seat-a")),
          nominationId: "nomination-window",
        }),
      ),
      "ACTOR_NOT_AUTHORIZED",
    );
  });

  test("死亡票被计入即消费，反对不消费且幂等重试不二次结算", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-b"),
        seatId: "seat-b",
        causeId: "unit-death",
      }),
    );
    expect(
      引擎.getState().seats.find(({ seatId }) => seatId === "seat-b"),
    ).toMatchObject({ alive: false, deadVoteAvailable: true });

    打开提名(引擎, {
      id: "nomination-dead-vote",
      nominee: "seat-c",
    });
    打开投票(引擎, "nomination-dead-vote");
    while (
      引擎.getState().activeNomination.votingOrder[
        引擎.getState().activeNomination.currentVoterIndex
      ] !== "seat-b"
    ) {
      记录当前票(引擎, false);
    }
    const 命令 = createRecordVoteCommand({
      ...通用参数(引擎, "command-dead-vote-idempotent", seatActor("seat-b")),
      nominationId: "nomination-dead-vote",
      voterSeatId: "seat-b",
      support: true,
    });
    const 首次 = 引擎.dispatch(命令);
    expect(引擎.dispatch(命令)).toEqual(首次);
    expect(
      引擎.getState().seats.find(({ seatId }) => seatId === "seat-b"),
    ).toMatchObject({ alive: false, deadVoteAvailable: false });

    while (引擎.getState().activeNomination.stage !== "ready-to-close") {
      记录当前票(引擎, false);
    }
    引擎.dispatch(
      createCloseVoteCommand({
        ...通用参数(引擎, "command-close-dead-vote"),
        nominationId: "nomination-dead-vote",
      }),
    );

    打开提名(引擎, {
      id: "nomination-no-dead-vote",
      nominator: "seat-d",
      nominee: "seat-e",
    });
    打开投票(引擎, "nomination-no-dead-vote");
    while (
      引擎.getState().activeNomination.votingOrder[
        引擎.getState().activeNomination.currentVoterIndex
      ] !== "seat-b"
    ) {
      记录当前票(引擎, false);
    }
    捕获拒绝(
      记录当前票(引擎, true, {
        actor: seatActor("seat-b"),
        commandId: "command-no-dead-vote-rejected",
      }),
      "DEAD_VOTE_UNAVAILABLE",
    );
    expect(
      记录当前票(引擎, false, {
        actor: seatActor("seat-b"),
        commandId: "command-no-dead-vote-abstain",
      }),
    ).toMatchObject({ status: "accepted" });
  });

  test("复活会清除死亡票，再次死亡重新获得一张", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-b"),
        seatId: "seat-b",
        causeId: "first-death",
      }),
    );
    引擎.dispatch(
      createRevivePlayerCommand({
        ...通用参数(引擎, "command-revive-b"),
        seatId: "seat-b",
        causeId: "revival",
      }),
    );
    expect(
      引擎.getState().seats.find(({ seatId }) => seatId === "seat-b"),
    ).toMatchObject({ alive: true, deadVoteAvailable: false });
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-b-again"),
        seatId: "seat-b",
        causeId: "second-death",
      }),
    );
    expect(
      引擎.getState().seats.find(({ seatId }) => seatId === "seat-b"),
    ).toMatchObject({ alive: false, deadVoteAvailable: true });
  });

  test("至少一票、向上取整、严格最高、平票和更高票维护唯一候选", () => {
    const 引擎 = 建立白天对局();
    提名并结算(引擎, {
      id: "nomination-three",
      nominator: "seat-a",
      nominee: "seat-b",
      supporters: ["seat-a", "seat-b", "seat-c"],
    });
    expect(引擎.getState()).toMatchObject({
      highestNominationVotes: 3,
      executionCandidate: null,
    });

    提名并结算(引擎, {
      id: "nomination-four-a",
      nominator: "seat-c",
      nominee: "seat-d",
      supporters: ["seat-a", "seat-b", "seat-c", "seat-d"],
    });
    expect(引擎.getState()).toMatchObject({
      highestNominationVotes: 4,
      executionCandidate: { seatId: "seat-d", votes: 4 },
    });

    提名并结算(引擎, {
      id: "nomination-four-b",
      nominator: "seat-e",
      nominee: "seat-f",
      supporters: ["seat-a", "seat-b", "seat-e", "seat-f"],
    });
    expect(引擎.getState()).toMatchObject({
      highestNominationVotes: 4,
      executionCandidate: null,
    });

    提名并结算(引擎, {
      id: "nomination-five",
      nominator: "seat-demon",
      nominee: "seat-a",
      supporters: ["seat-a", "seat-b", "seat-c", "seat-d", "seat-demon"],
    });
    expect(引擎.getState()).toMatchObject({
      highestNominationVotes: 5,
      executionCandidate: { seatId: "seat-a", votes: 5 },
    });
  });

  test("存活人数为奇数时门槛向上取整，旧提名不按新人数回算", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-traveler"),
        seatId: "seat-traveler",
        causeId: "unit-death",
      }),
    );
    打开提名(引擎, { id: "nomination-odd" });
    打开投票(引擎, "nomination-odd");
    expect(引擎.getState().activeNomination.threshold).toBe(4);
    完成投票(引擎, ["seat-a", "seat-b", "seat-c", "seat-d"], {
      id: "nomination-odd",
    });
    expect(引擎.getState().executionCandidate).toEqual({
      seatId: "seat-b",
      votes: 4,
    });

    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-e"),
        seatId: "seat-e",
        causeId: "between-nominations",
      }),
    );
    expect(引擎.getState().executionCandidate).toEqual({
      seatId: "seat-b",
      votes: 4,
    });
  });

  test("活动窗口冻结生死与阶段，有候选时禁止跳过或改处决目标", () => {
    const 引擎 = 建立白天对局();
    打开提名(引擎, { id: "nomination-freeze" });
    捕获拒绝(
      引擎.dispatch(
        createKillPlayerCommand({
          ...通用参数(引擎, "command-kill-during-window"),
          seatId: "seat-c",
          causeId: "forbidden-during-window",
        }),
      ),
      "ACTIVE_BALLOT_IN_PROGRESS",
    );
    捕获拒绝(
      引擎.dispatch(
        createAdvancePhaseCommand({
          ...通用参数(引擎, "command-advance-during-window"),
        }),
      ),
      "ACTIVE_BALLOT_IN_PROGRESS",
    );
    打开投票(引擎, "nomination-freeze");
    完成投票(引擎, ["seat-a", "seat-b", "seat-c", "seat-d"], {
      id: "nomination-freeze",
    });

    捕获拒绝(
      引擎.dispatch(
        createAdvancePhaseCommand({
          ...通用参数(引擎, "command-skip-candidate"),
        }),
      ),
      "EXECUTION_CANDIDATE_PENDING",
    );
    捕获拒绝(
      引擎.dispatch(
        createResolveExecutionCommand({
          ...通用参数(引擎, "command-wrong-execution"),
          seatId: "seat-c",
        }),
      ),
      "EXECUTION_CANDIDATE_MISMATCH",
    );
    expect(
      引擎.dispatch(
        createResolveExecutionCommand({
          ...通用参数(引擎, "command-candidate-execution"),
          seatId: "seat-b",
        }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(引擎.getState()).toMatchObject({
      phase: "night",
      executionToday: { seatId: "seat-b", died: true },
    });
  });

  test("没有候选时可以无人处决入夜，旅行者不能被常规处决", () => {
    const 无候选 = 建立白天对局();
    expect(
      无候选.dispatch(
        createAdvancePhaseCommand({
          ...通用参数(无候选, "command-no-execution"),
        }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(无候选.getState().phase).toBe("night");

    const 旅行者 = 建立白天对局();
    捕获拒绝(
      旅行者.dispatch(
        createResolveExecutionCommand({
          ...通用参数(旅行者, "command-execute-traveler"),
          seatId: "seat-traveler",
        }),
      ),
      "TRAVELER_CANNOT_BE_EXECUTED",
    );
  });

  test("活人和死人均可提议或支持流放，支持不消耗死亡票", () => {
    const 引擎 = 建立白天对局();
    引擎.dispatch(
      createKillPlayerCommand({
        ...通用参数(引擎, "command-kill-a"),
        seatId: "seat-a",
        causeId: "unit-death",
      }),
    );
    expect(打开流放(引擎, { proposer: "seat-a" })).toMatchObject({
      status: "accepted",
    });
    expect(
      设置流放支持(引擎, "seat-a", true, {
        commandId: "command-exile-support-yes-first",
      }),
    ).toMatchObject({
      status: "accepted",
    });
    expect(
      引擎.getState().seats.find(({ seatId }) => seatId === "seat-a"),
    ).toMatchObject({ alive: false, deadVoteAvailable: true });
    expect(
      设置流放支持(引擎, "seat-a", false, {
        commandId: "command-exile-support-no",
      }),
    ).toMatchObject({
      status: "accepted",
    });
    expect(
      设置流放支持(引擎, "seat-a", true, {
        commandId: "command-exile-support-yes-again",
      }),
    ).toMatchObject({
      status: "accepted",
    });
  });

  test("流放按全体席位过半，同一旅行者每天一次且成功后白天继续", () => {
    const 成功 = 建立白天对局();
    打开流放(成功);
    ["seat-a", "seat-b", "seat-c", "seat-d"].forEach((seatId) =>
      设置流放支持(成功, seatId, true),
    );
    const 回执 = 成功.dispatch(
      createCloseExileCommand({
        ...通用参数(成功, "command-close-exile"),
        exileId: "exile-1",
      }),
    );
    expect(回执).toMatchObject({ status: "accepted" });
    expect(成功.getState()).toMatchObject({
      phase: "day",
      activeExile: null,
      executionToday: null,
      exilesToday: [
        expect.objectContaining({
          exileId: "exile-1",
          travelerSeatId: "seat-traveler",
          threshold: 4,
          succeeded: true,
        }),
      ],
    });
    expect(
      成功.getState().seats.find(({ seatId }) => seatId === "seat-traveler"),
    ).toMatchObject({ alive: false, deadVoteAvailable: true });

    const 失败 = 建立白天对局();
    打开流放(失败);
    ["seat-a", "seat-b", "seat-c"].forEach((seatId) =>
      设置流放支持(失败, seatId, true),
    );
    失败.dispatch(
      createCloseExileCommand({
        ...通用参数(失败, "command-close-failed-exile"),
        exileId: "exile-1",
      }),
    );
    expect(失败.getState().exilesToday[0]).toMatchObject({
      threshold: 4,
      succeeded: false,
    });
    捕获拒绝(
      打开流放(失败, { id: "exile-repeat" }),
      "TRAVELER_ALREADY_PROPOSED_FOR_EXILE",
    );
  });

  test("流放不清除普通候选，不占提名和处决次数", () => {
    const 引擎 = 建立白天对局();
    提名并结算(引擎, {
      id: "nomination-before-exile",
      nominator: "seat-a",
      nominee: "seat-b",
      supporters: ["seat-a", "seat-b", "seat-c", "seat-d"],
    });
    打开流放(引擎);
    ["seat-a", "seat-b", "seat-c", "seat-d"].forEach((seatId) =>
      设置流放支持(引擎, seatId, true),
    );
    引擎.dispatch(
      createCloseExileCommand({
        ...通用参数(引擎, "command-close-exile-after-nomination"),
        exileId: "exile-1",
      }),
    );
    expect(引擎.getState()).toMatchObject({
      phase: "day",
      executionCandidate: { seatId: "seat-b", votes: 4 },
      executionToday: null,
    });
  });

  test("流放目标、同日重复目标、主体冒用与无权限主体失败关闭", () => {
    const 引擎 = 建立白天对局();
    捕获拒绝(
      打开流放(引擎, { traveler: "seat-b" }),
      "EXILE_TARGET_NOT_TRAVELER",
    );
    捕获拒绝(
      打开流放(引擎, {
        id: "exile-spoof",
        proposer: "seat-a",
        actor: seatActor("seat-b"),
      }),
      "ACTOR_SEAT_MISMATCH",
    );
    捕获拒绝(
      打开流放(引擎, { id: "exile-observer", actor: OBSERVER }),
      "ACTOR_NOT_AUTHORIZED",
    );
    expect(打开流放(引擎, { id: "exile-host", actor: HOST })).toMatchObject({
      status: "accepted",
    });
    捕获拒绝(
      设置流放支持(引擎, "seat-a", true, {
        id: "exile-host",
        actor: seatActor("seat-b"),
      }),
      "ACTOR_SEAT_MISMATCH",
    );
  });

  test("同一天不能复用流放 ID 指向另一名旅行者", () => {
    const 引擎 = 建立白天对局([
      ...SEATS,
      {
        seatId: "seat-traveler-2",
        order: 9,
        characterType: "traveler",
      },
    ]);
    打开流放(引擎, { id: "exile-reused-id" });
    引擎.dispatch(
      createCloseExileCommand({
        ...通用参数(引擎, "command-close-exile-reused-id"),
        exileId: "exile-reused-id",
      }),
    );

    捕获拒绝(
      打开流放(引擎, {
        id: "exile-reused-id",
        traveler: "seat-traveler-2",
        commandId: "command-reopen-exile-reused-id",
      }),
      "EXILE_ID_ALREADY_USED",
    );
  });

  test("系统主体可代理玩家动作并控制窗口", () => {
    const 引擎 = 建立白天对局();
    expect(
      打开提名(引擎, {
        id: "nomination-system",
        actor: SYSTEM,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      打开投票(引擎, "nomination-system", "command-system-open-vote"),
    ).toMatchObject({ status: "accepted" });
    expect(记录当前票(引擎, false, { actor: SYSTEM })).toMatchObject({
      status: "accepted",
    });
  });

  test("损坏负载与命令信封严格失败且不会占用命令 ID", () => {
    const 引擎 = 建立白天对局();
    const 命令 = createOpenNominationCommand({
      ...通用参数(引擎, "command-strict-payload"),
      nominationId: "nomination-strict",
      nominatorSeatId: "seat-a",
      nomineeSeatId: "seat-b",
    });
    const 损坏 = JSON.parse(JSON.stringify(命令));
    损坏.payload.voteWeight = 2;

    expect(() => 引擎.dispatch(损坏)).toThrow(DomainProtocolError);
    expect(引擎.dispatch(命令)).toMatchObject({ status: "accepted" });
  });
});
