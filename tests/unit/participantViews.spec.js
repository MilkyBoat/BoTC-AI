import {
  PARTICIPANT_VIEW_VERSION,
  ParticipantViewError,
  createParticipantViewService,
} from "@/domain/views";
import {
  TEST_CREDENTIALS,
  createDomainEventFixture,
  createParticipantViewSourceFixture,
  resolveTestPrincipal,
} from "../fixtures/participantViewSource";

const 创建服务 = (覆盖 = {}) =>
  createParticipantViewService({
    resolvePrincipal: resolveTestPrincipal,
    ...覆盖,
  });

const 捕获视图错误 = (执行, code) => {
  let 捕获错误;
  try {
    执行();
  } catch (错误) {
    捕获错误 = 错误;
  }
  expect(捕获错误).toBeInstanceOf(ParticipantViewError);
  expect(捕获错误).toMatchObject({ code, message: expect.any(String) });
  return 捕获错误;
};

const 序列化 = (值) => JSON.stringify(值);

describe("M1-R3 参与者权限视图", () => {
  test("服务只公开经主体授权的快照与事件入口", () => {
    const 服务 = 创建服务();
    expect(Object.keys(服务)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(服务))).toEqual([
      "constructor",
      "createSnapshot",
      "projectEvent",
    ]);
    expect(Object.isFrozen(服务)).toBe(true);
  });

  test.each([
    [TEST_CREDENTIALS.storyteller, "storyteller"],
    [TEST_CREDENTIALS.public, "public"],
    [TEST_CREDENTIALS.seatA, "seat"],
    [TEST_CREDENTIALS.observer, "observer"],
  ])("主体凭证只能生成唯一的 %s 视图", (凭证, viewType) => {
    const 视图 = 创建服务().createSnapshot(
      createParticipantViewSourceFixture(),
      凭证,
    );
    expect(视图).toMatchObject({
      schemaVersion: PARTICIPANT_VIEW_VERSION,
      viewType,
    });
  });

  test("公开视图只包含公开对局、席位与流程记录", () => {
    const 视图 = 创建服务().createSnapshot(
      createParticipantViewSourceFixture(),
      TEST_CREDENTIALS.public,
    );

    expect(视图).toEqual({
      schemaVersion: PARTICIPANT_VIEW_VERSION,
      viewType: "public",
      game: expect.objectContaining({
        gameId: "game-m1-r3-001",
        phase: "day",
        publicSpecialRules: [expect.objectContaining({ order: 1 })],
      }),
      seats: [
        expect.objectContaining({
          seatId: "seat-a",
          order: 1,
          controllerKind: "human",
          publicState: { alive: true, publicRoleId: null },
        }),
        expect.objectContaining({ seatId: "seat-b", controllerKind: "ai" }),
        expect.objectContaining({
          seatId: "seat-c",
          controllerKind: "unassigned",
        }),
      ],
      publicRecords: expect.arrayContaining([
        expect.objectContaining({ type: "announcement" }),
        expect.objectContaining({ type: "public-message" }),
        expect.objectContaining({ type: "nomination" }),
        expect.objectContaining({ type: "vote-result" }),
      ]),
    });
    expect(序列化(视图)).not.toMatch(
      /truth|perception|legalActions|actionHistory|seatInformation|adjudication|audit/,
    );
  });

  test("席位视图只包含自己的认知、信息和动作，不推导真实身份", () => {
    const 视图 = 创建服务().createSnapshot(
      createParticipantViewSourceFixture(),
      TEST_CREDENTIALS.seatA,
    );

    expect(视图.self).toEqual({
      seatId: "seat-a",
      perceivedRoleId: "perceived-role-empath-a",
      perceivedAlignment: "good",
      knownStatuses: [
        expect.objectContaining({ text: "known-status-marker-a" }),
      ],
      legalActions: [expect.objectContaining({ actionId: "legal-action-a" })],
      actionHistory: [
        expect.objectContaining({ actionId: "history-action-a" }),
      ],
      information: [
        expect.objectContaining({ informationId: "information-a" }),
      ],
    });
    expect(序列化(视图)).not.toContain("truth-role-imp-a");
    expect(序列化(视图)).not.toContain("truth-status-poison-a");
    expect(序列化(视图)).not.toContain("private-information-marker-b");
    expect(序列化(视图)).not.toContain("history-action-marker-b");
  });

  test("说书人视图包含全部规则真相、认知、私密规则信息和裁量审计", () => {
    const 视图 = 创建服务().createSnapshot(
      createParticipantViewSourceFixture(),
      TEST_CREDENTIALS.storyteller,
    );
    const 文本 = 序列化(视图);

    expect(文本).toContain("truth-role-imp-a");
    expect(文本).toContain("perceived-role-empath-a");
    expect(文本).toContain("private-information-marker-a");
    expect(文本).toContain("private-information-marker-b");
    expect(文本).toContain("adjudication-marker");
    expect(文本).toContain("audit-marker");
    expect(视图.seats[0]).toMatchObject({
      truth: expect.any(Object),
      perception: expect.any(Object),
      information: expect.any(Array),
    });
  });

  test("席位凭证固定 seatId，调用方没有覆盖目标席位的参数", () => {
    const 服务 = 创建服务();
    const 源 = createParticipantViewSourceFixture();
    const 视图 = 服务.createSnapshot(源, TEST_CREDENTIALS.seatA, {
      seatId: "seat-b",
    });

    expect(服务.createSnapshot.length).toBe(2);
    expect(视图.self.seatId).toBe("seat-a");
    expect(序列化(视图)).not.toContain("private-information-marker-b");
  });

  test("人类与 AI 凭证控制同一席位时权限结果完全相同", () => {
    const 服务 = 创建服务();
    const 源 = createParticipantViewSourceFixture();

    expect(服务.createSnapshot(源, TEST_CREDENTIALS.seatAAi)).toEqual(
      服务.createSnapshot(源, TEST_CREDENTIALS.seatA),
    );
  });

  test.each([
    ["未知凭证", "credential-unknown", "UNKNOWN_PRINCIPAL"],
    ["不存在席位", TEST_CREDENTIALS.unknownSeat, "UNKNOWN_SEAT"],
  ])("%s 时失败关闭", (_名称, 凭证, code) => {
    捕获视图错误(
      () =>
        创建服务().createSnapshot(createParticipantViewSourceFixture(), 凭证),
      code,
    );
  });

  test.each([
    ["未知源版本", (源) => (源.schemaVersion = "9.0.0")],
    ["额外源字段", (源) => (源.credential = "secret")],
    ["重复席位", (源) => (源.seats[1].seatId = "seat-a")],
    ["重复顺序", (源) => (源.seats[1].order = 1)],
    [
      "公开记录失效引用",
      (源) => (源.publicRecords[1].senderSeatId = "missing"),
    ],
    [
      "裁量任务失效引用",
      (源) => (源.adjudicationTasks[0].candidateSeatIds = ["missing"]),
    ],
    ["未知公开记录种类", (源) => (源.publicRecords[0].type = "raw-payload")],
    ["未知旁观策略字段", (源) => (源.observerPolicy.extra = true)],
  ])("%s 时拒绝整个视图源", (_名称, 篡改) => {
    const 源 = createParticipantViewSourceFixture();
    篡改(源);
    捕获视图错误(
      () => 创建服务().createSnapshot(源, TEST_CREDENTIALS.public),
      "INVALID_VIEW_SOURCE",
    );
  });

  test("主体解析器异常不会泄露底层异常或回退公开视图", () => {
    const 错误 = 捕获视图错误(
      () =>
        创建服务({
          resolvePrincipal: () => {
            throw new Error("credential-database-secret");
          },
        }).createSnapshot(
          createParticipantViewSourceFixture(),
          "credential-broken",
        ),
      "PRINCIPAL_RESOLUTION_FAILED",
    );
    expect(序列化(错误)).not.toContain("credential-database-secret");
  });

  test.each([
    [true, true, true],
    [true, true, false],
    [true, false, true],
    [true, false, false],
    [false, true, true],
    [false, true, false],
    [false, false, true],
    [false, false, false],
  ])(
    "旁观策略 messages=%s votes=%s history=%s 只从公开视图删除",
    (includePublicMessages, includeVoteDetails, includeHistory) => {
      const 服务 = 创建服务();
      const 源 = createParticipantViewSourceFixture();
      源.observerPolicy = {
        includePublicMessages,
        includeVoteDetails,
        includeHistory,
      };
      const 公开 = 服务.createSnapshot(源, TEST_CREDENTIALS.public);
      const 旁观 = 服务.createSnapshot(源, TEST_CREDENTIALS.observer);

      expect(旁观.game).toEqual(公开.game);
      expect(旁观.seats).toEqual(公开.seats);
      旁观.publicRecords.forEach((记录) => {
        const 公开记录 = 公开.publicRecords.find(
          ({ recordId }) => recordId === 记录.recordId,
        );
        expect(公开记录).toEqual(expect.objectContaining(记录));
        expect(
          Object.keys(记录).every((字段) =>
            Object.prototype.hasOwnProperty.call(公开记录, 字段),
          ),
        ).toBe(true);
      });
      if (!includePublicMessages) {
        expect(
          旁观.publicRecords.some(({ type }) => type === "public-message"),
        ).toBe(false);
      }
      if (!includeHistory) {
        expect(旁观.publicRecords.some(({ historical }) => historical)).toBe(
          false,
        );
      }
      if (!includeVoteDetails) {
        const 投票 = 旁观.publicRecords.find(
          ({ type }) => type === "vote-result",
        );
        if (投票) expect(投票).not.toHaveProperty("voterSeatIds");
      }
    },
  );

  test("所有视图都深复制、深冻结且不共享引用", () => {
    const 源 = createParticipantViewSourceFixture();
    const 服务 = 创建服务();
    const 席位视图 = 服务.createSnapshot(源, TEST_CREDENTIALS.seatA);
    const 公开视图 = 服务.createSnapshot(源, TEST_CREDENTIALS.public);

    expect(Object.isFrozen(席位视图.self.knownStatuses[0])).toBe(true);
    expect(Object.isFrozen(公开视图.seats[0])).toBe(true);
    expect(席位视图.game).not.toBe(源.game);
    expect(席位视图.game).not.toBe(公开视图.game);
    源.game.phase = "night";
    expect(席位视图.game.phase).toBe("day");
  });

  test.each([
    [TEST_CREDENTIALS.storyteller, "game.ready"],
    [TEST_CREDENTIALS.public, "game.ready"],
    [TEST_CREDENTIALS.seatA, "game.ready"],
    [TEST_CREDENTIALS.observer, "game.ready"],
  ])("game.created 为 %s 投影最小可见事件", (凭证, type) => {
    const 事件 = createDomainEventFixture({
      type: "game.created",
      payload: {
        ruleset: createParticipantViewSourceFixture().game.ruleset,
        seed: "seed-must-not-leak",
      },
    });
    const 投影 = 创建服务().projectEvent(
      createParticipantViewSourceFixture(),
      事件,
      凭证,
    );

    expect(投影).toEqual({
      schemaVersion: PARTICIPANT_VIEW_VERSION,
      viewType: expect.any(String),
      type,
      payload: {
        gameId: "game-m1-r3-001",
        ruleset: createParticipantViewSourceFixture().game.ruleset,
      },
    });
    expect(序列化(投影)).not.toMatch(
      /eventId|sequence|causationId|recordedAt|actor|seed-must-not-leak/,
    );
  });

  test("席位私密事件只投影给目标席位和说书人，其余返回 null", () => {
    const 源 = createParticipantViewSourceFixture();
    const 事件 = createDomainEventFixture({
      type: "seat.information-delivered",
      payload: {
        seatId: "seat-a",
        kind: "action-result",
        text: "event-private-marker-a",
      },
    });
    const 服务 = 创建服务();

    expect(服务.projectEvent(源, 事件, TEST_CREDENTIALS.seatA)).toMatchObject({
      type: "seat.information-received",
      payload: { kind: "action-result", text: "event-private-marker-a" },
    });
    expect(
      服务.projectEvent(源, 事件, TEST_CREDENTIALS.storyteller),
    ).toMatchObject({
      type: "seat.information-recorded",
      payload: expect.objectContaining({ seatId: "seat-a" }),
    });
    expect(服务.projectEvent(源, 事件, TEST_CREDENTIALS.seatB)).toBeNull();
    expect(服务.projectEvent(源, 事件, TEST_CREDENTIALS.public)).toBeNull();
    expect(服务.projectEvent(源, 事件, TEST_CREDENTIALS.observer)).toBeNull();
  });

  test("旁观者公开消息和逐票明细事件服从只减策略", () => {
    const 服务 = 创建服务();
    const 源 = createParticipantViewSourceFixture();
    源.observerPolicy.includePublicMessages = false;
    源.observerPolicy.includeVoteDetails = false;

    expect(
      服务.projectEvent(
        源,
        createDomainEventFixture({
          type: "public.message-posted",
          payload: { senderSeatId: "seat-a", text: "live-message" },
        }),
        TEST_CREDENTIALS.observer,
      ),
    ).toBeNull();
    const 投票 = 服务.projectEvent(
      源,
      createDomainEventFixture({
        type: "public.vote-resolved",
        payload: {
          nomineeSeatId: "seat-b",
          total: 2,
          threshold: 2,
          voterSeatIds: ["seat-a", "seat-c"],
        },
      }),
      TEST_CREDENTIALS.observer,
    );
    expect(投票.payload).not.toHaveProperty("voterSeatIds");
  });

  test("真实身份变化和裁量请求只对说书人可见", () => {
    const 服务 = 创建服务();
    const 源 = createParticipantViewSourceFixture();
    const 凭证列表 = [
      TEST_CREDENTIALS.public,
      TEST_CREDENTIALS.seatA,
      TEST_CREDENTIALS.observer,
    ];
    const 真相事件 = createDomainEventFixture({
      type: "seat.truth-changed",
      payload: {
        seatId: "seat-a",
        roleId: "truth-event-secret-role",
        alignment: "evil",
      },
    });
    const 裁量事件 = createDomainEventFixture({
      type: "storyteller.adjudication-requested",
      payload: {
        taskId: "task-event",
        kind: "choose-player",
        summary: "adjudication-event-secret",
      },
    });

    凭证列表.forEach((凭证) => {
      expect(服务.projectEvent(源, 真相事件, 凭证)).toBeNull();
      expect(服务.projectEvent(源, 裁量事件, 凭证)).toBeNull();
    });
    expect(
      服务.projectEvent(源, 真相事件, TEST_CREDENTIALS.storyteller),
    ).toMatchObject({
      type: "seat.truth-updated",
    });
    expect(
      服务.projectEvent(源, 裁量事件, TEST_CREDENTIALS.storyteller),
    ).toMatchObject({
      type: "storyteller.adjudication-requested",
    });
  });

  test.each([
    ["未知事件类型", { type: "unknown.event" }, "UNKNOWN_EVENT_TYPE"],
    ["事件额外字段", { extra: true }, "INVALID_DOMAIN_EVENT"],
    ["跨对局事件", { gameId: "game-other" }, "GAME_ID_MISMATCH"],
    [
      "规则集漂移",
      {
        ruleset: {
          ...createParticipantViewSourceFixture().game.ruleset,
          version: "9.0.0",
        },
      },
      "RULESET_IDENTITY_MISMATCH",
    ],
  ])("%s 时事件投影失败关闭", (_名称, 覆盖, code) => {
    捕获视图错误(
      () =>
        创建服务().projectEvent(
          createParticipantViewSourceFixture(),
          { ...createDomainEventFixture(), ...覆盖 },
          TEST_CREDENTIALS.public,
        ),
      code,
    );
  });

  test("事件负载严格校验且投影结果冻结并与输入断开引用", () => {
    const 源 = createParticipantViewSourceFixture();
    const 事件 = createDomainEventFixture();
    事件.payload.unexpected = true;
    捕获视图错误(
      () => 创建服务().projectEvent(源, 事件, TEST_CREDENTIALS.public),
      "INVALID_EVENT_PAYLOAD",
    );

    delete 事件.payload.unexpected;
    const 投影 = 创建服务().projectEvent(源, 事件, TEST_CREDENTIALS.public);
    expect(Object.isFrozen(投影.payload)).toBe(true);
    expect(投影.payload).not.toBe(事件.payload);
  });
});
