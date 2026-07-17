import {
  PARTICIPANT_VIEW_VERSION,
  createParticipantViewService,
} from "@/domain/views";
import {
  TEST_CREDENTIALS,
  createDomainEventFixture,
  createParticipantViewSourceFixture,
  resolveTestPrincipal,
} from "../fixtures/participantViewSource";

const 创建服务 = () =>
  createParticipantViewService({ resolvePrincipal: resolveTestPrincipal });

const 创建源 = () => {
  const 源 = createParticipantViewSourceFixture();
  源.schemaVersion = PARTICIPANT_VIEW_VERSION;
  源.seats.forEach((seat) => {
    seat.publicState.deadVoteAvailable = !seat.publicState.alive;
  });
  return 源;
};

const 投影 = (type, payload, credential = TEST_CREDENTIALS.public, source) =>
  创建服务().projectEvent(
    source ?? 创建源(),
    createDomainEventFixture({ type, payload }),
    credential,
  );

describe("M1-R5 提名投票权限视图", () => {
  test("参与者视图 0.2.0 公开死亡票状态", () => {
    expect(PARTICIPANT_VIEW_VERSION).toBe("0.2.0");
    const 公开 = 创建服务().createSnapshot(创建源(), TEST_CREDENTIALS.public);

    expect(公开.seats).toEqual([
      expect.objectContaining({
        seatId: "seat-a",
        publicState: expect.objectContaining({ deadVoteAvailable: false }),
      }),
      expect.objectContaining({
        seatId: "seat-b",
        publicState: expect.objectContaining({ deadVoteAvailable: true }),
      }),
      expect.objectContaining({
        seatId: "seat-c",
        publicState: expect.objectContaining({ deadVoteAvailable: false }),
      }),
    ]);
  });

  test("提名和投票窗口只投影公开流程字段", () => {
    const 提名 = 投影("nomination.opened", {
      nominationId: "nomination-view",
      dayNumber: 1,
      nominatorSeatId: "seat-a",
      nomineeSeatId: "seat-b",
      ruleSourceId: "zh-wiki-ability-nomination",
    });
    expect(提名).toEqual({
      schemaVersion: PARTICIPANT_VIEW_VERSION,
      viewType: "public",
      type: "nomination.opened",
      payload: {
        nominationId: "nomination-view",
        dayNumber: 1,
        nominatorSeatId: "seat-a",
        nomineeSeatId: "seat-b",
      },
    });

    const 窗口 = 投影("vote.opened", {
      nominationId: "nomination-view",
      nomineeSeatId: "seat-b",
      votingOrder: ["seat-c", "seat-a", "seat-b"],
      threshold: 2,
      ruleSourceId: "zh-wiki-ability-vote",
    });
    expect(窗口.payload).toEqual({
      nominationId: "nomination-view",
      nomineeSeatId: "seat-b",
      votingOrder: ["seat-c", "seat-a", "seat-b"],
      threshold: 2,
    });
    expect(JSON.stringify([提名, 窗口])).not.toMatch(
      /actor|causationId|eventId|recordedAt|ruleSourceId/,
    );
  });

  test("公开逐票事实可见，旁观关闭明细时返回 null", () => {
    const payload = {
      nominationId: "nomination-view",
      voterSeatId: "seat-a",
      support: true,
      usedDeadVote: false,
      ruleSourceId: "zh-wiki-ability-vote",
    };
    expect(投影("vote.recorded", payload)).toMatchObject({
      type: "vote.recorded",
      payload: {
        nominationId: "nomination-view",
        voterSeatId: "seat-a",
        support: true,
        usedDeadVote: false,
      },
    });

    const 源 = 创建源();
    源.observerPolicy.includeVoteDetails = false;
    expect(
      投影("vote.recorded", payload, TEST_CREDENTIALS.observer, 源),
    ).toBeNull();
  });

  test("投票结果对旁观者隐藏席位明细但保留真实总数与候选", () => {
    const payload = {
      nominationId: "nomination-view",
      nomineeSeatId: "seat-b",
      total: 2,
      threshold: 2,
      voterSeatIds: ["seat-a", "seat-b"],
      result: "candidate",
      highestVotes: 2,
      executionCandidateSeatId: "seat-b",
      ruleSourceId: "zh-wiki-ability-vote",
    };
    expect(投影("vote.closed", payload).payload).toEqual({
      nominationId: "nomination-view",
      nomineeSeatId: "seat-b",
      total: 2,
      threshold: 2,
      voterSeatIds: ["seat-a", "seat-b"],
      result: "candidate",
      highestVotes: 2,
      executionCandidateSeatId: "seat-b",
    });

    const 源 = 创建源();
    源.observerPolicy.includeVoteDetails = false;
    const 旁观 = 投影("vote.closed", payload, TEST_CREDENTIALS.observer, 源);
    expect(旁观.type).toBe("observer.vote-closed");
    expect(旁观.payload).toEqual({
      nominationId: "nomination-view",
      nomineeSeatId: "seat-b",
      total: 2,
      threshold: 2,
      result: "candidate",
      highestVotes: 2,
      executionCandidateSeatId: "seat-b",
    });
  });

  test("流放提议、逐席支持和结果使用公开安全投影", () => {
    expect(
      投影("exile.opened", {
        exileId: "exile-view",
        dayNumber: 1,
        proposerSeatId: "seat-a",
        travelerSeatId: "seat-b",
        ruleSourceId: "zh-wiki-glossary",
      }),
    ).toMatchObject({
      type: "exile.opened",
      payload: {
        exileId: "exile-view",
        proposerSeatId: "seat-a",
        travelerSeatId: "seat-b",
      },
    });
    expect(
      投影("exile.support-set", {
        exileId: "exile-view",
        supporterSeatId: "seat-c",
        support: true,
        ruleSourceId: "zh-wiki-glossary",
      }),
    ).toMatchObject({
      type: "exile.support-set",
      payload: {
        exileId: "exile-view",
        supporterSeatId: "seat-c",
        support: true,
      },
    });
    expect(
      投影("exile.closed", {
        exileId: "exile-view",
        travelerSeatId: "seat-b",
        total: 2,
        threshold: 2,
        supporterSeatIds: ["seat-a", "seat-c"],
        succeeded: true,
        ruleSourceId: "zh-wiki-glossary",
      }),
    ).toMatchObject({
      type: "exile.closed",
      payload: {
        exileId: "exile-view",
        travelerSeatId: "seat-b",
        total: 2,
        threshold: 2,
        succeeded: true,
      },
    });
  });

  test("新领域事件中的失效席位引用继续失败关闭", () => {
    expect(() =>
      投影("nomination.opened", {
        nominationId: "nomination-broken",
        dayNumber: 1,
        nominatorSeatId: "seat-missing",
        nomineeSeatId: "seat-b",
        ruleSourceId: "zh-wiki-ability-nomination",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_EVENT_PAYLOAD" }));
  });
});
