import {
  createAdvancePhaseCommand,
  createDomainProtocol,
  createGameCommand,
  createKillPlayerCommand,
  createRevivePlayerCommand,
  createStartGameCommand,
  restoreDomainProtocol,
} from "@/domain/protocol";
import {
  ROLE_ABILITY_EVENT_TYPES,
  assertRoleAbilityStateInvariants,
  createCancelAbilityAdjudicationCommand,
  createCancelAbilityEffectCommand,
  createCancelAbilityTriggerCommand,
  createReplaceAbilityInstancesCommand,
  createResolveAbilityAdjudicationCommand,
  createResolveAbilityTriggerCommand,
  createRoleAbilityFramework,
  createSetAbilityConditionCommand,
  isAbilityEffectActive,
} from "@/domain/abilities";
import {
  FICTIONAL_ABILITY_INSTANCES,
  FICTIONAL_ROLE_ABILITY_PACKAGE,
} from "../fixtures/roleAbilityPackage";

const GAME_ID = "game-m1-r6-framework";
const HOST = Object.freeze({ kind: "host", id: "host-m1-r6" });
const 席位 = Object.freeze([
  Object.freeze({ seatId: "seat-1", order: 1, characterType: "demon" }),
  Object.freeze({ seatId: "seat-2", order: 2, characterType: "townsfolk" }),
  Object.freeze({ seatId: "seat-3", order: 3, characterType: "townsfolk" }),
  Object.freeze({ seatId: "seat-4", order: 4, characterType: "outsider" }),
  Object.freeze({ seatId: "seat-5", order: 5, characterType: "minion" }),
]);

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T16:00:00.000Z",
    idFactory: (类型) => `${类型}-m1-r6-${++序号}`,
  };
};

const 创建引擎 = () =>
  createDomainProtocol({
    gameId: GAME_ID,
    rolePackage: FICTIONAL_ROLE_ABILITY_PACKAGE,
    ...创建依赖(),
  });

const 初始化并开局 = () => {
  const 引擎 = 创建引擎();
  引擎.dispatch(
    createGameCommand({
      commandId: "command-create",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      seed: "seed-m1-r6",
      rulePackage: FICTIONAL_ROLE_ABILITY_PACKAGE.identity,
    }),
  );
  引擎.dispatch(
    createStartGameCommand({
      commandId: "command-start",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      seats: 席位,
      abilityInstances: FICTIONAL_ABILITY_INSTANCES,
    }),
  );
  return 引擎;
};

const 当前修订 = (引擎) => 引擎.getState().revision;
const 当前待触发 = (引擎) =>
  引擎.getState().abilityTriggers.filter(({ status }) => status === "pending");
const 深复制 = (value) => JSON.parse(JSON.stringify(value));

const 断言拒绝 = (回执, code) => {
  expect(回执).toMatchObject({ status: "rejected", error: { code } });
};

describe("M1-R6 角色能力执行框架", () => {
  test("开局按优先级、席位和稳定 ID 建立首夜队列并连锁白天事件触发", () => {
    const 引擎 = 初始化并开局();
    expect(
      当前待触发(引擎).map(({ definitionTriggerId }) => definitionTriggerId),
    ).toEqual(["test.information-first-night", "test.primary-first-night"]);

    const 信息触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-information",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 信息触发.triggerId,
        input: {},
      }),
    );
    const 主触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-primary",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 主触发.triggerId,
        input: { recordEffects: true },
      }),
    );

    expect(
      当前待触发(引擎).map(({ definitionTriggerId }) => definitionTriggerId),
    ).toEqual(["test.follow-domain-event"]);
    expect(引擎.getState().ongoingAbilityEffects).toHaveLength(1);
    expect(引擎.getState().delayedAbilityEffects).toHaveLength(1);
    expect(
      引擎.getEvents().some(({ type }) => type === "test.ability-applied"),
    ).toBe(true);
  });

  test("醉酒抑制确定性效果但消费次数，解除后原持续效果恢复", () => {
    const 引擎 = 初始化并开局();
    const 信息触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-info-normal",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 信息触发.triggerId,
        input: {},
      }),
    );
    const 主触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-primary-effects",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 主触发.triggerId,
        input: { recordEffects: true },
      }),
    );
    const 效果 = 引擎.getState().ongoingAbilityEffects[0];
    expect(isAbilityEffectActive(引擎.getState(), 效果)).toBe(true);

    const 跟随触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-follow-before-night",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 跟随触发.triggerId,
        input: {},
      }),
    );
    引擎.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-first-night-to-day",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
      }),
    );

    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-drunk-on",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        conditionId: "condition-drunk-primary",
        seatId: "seat-2",
        conditionType: "drunk",
        sourceId: "test-condition-source",
        active: true,
      }),
    );
    expect(isAbilityEffectActive(引擎.getState(), 效果)).toBe(false);

    引擎.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-day-to-night",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
      }),
    );
    const 其他夜触发 = 当前待触发(引擎)[0];
    const 生效事件数 = 引擎
      .getEvents()
      .filter(({ type }) => type === "test.ability-applied").length;
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-primary-suppressed",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 其他夜触发.triggerId,
        input: {},
      }),
    );
    expect(
      引擎
        .getState()
        .abilityInstances.find(
          ({ instanceId }) => instanceId === "ability-instance-primary",
        ).usesConsumed,
    ).toBe(2);
    expect(
      引擎.getEvents().filter(({ type }) => type === "test.ability-applied")
        .length,
    ).toBe(生效事件数);

    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-drunk-off",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        conditionId: "condition-drunk-primary",
        seatId: "seat-2",
        conditionType: "drunk",
        sourceId: "test-condition-source",
        active: false,
      }),
    );
    expect(isAbilityEffectActive(引擎.getState(), 效果)).toBe(true);
  });

  test("死亡使普通延迟效果失败关闭，死后保留能力可结算，复活恢复同源持续效果", () => {
    const 引擎 = 初始化并开局();
    for (const [索引, 触发] of [...当前待触发(引擎)].entries()) {
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-death-setup-${索引}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input:
            触发.abilityInstanceId === "ability-instance-primary"
              ? { recordEffects: true }
              : {},
        }),
      );
    }
    while (当前待触发(引擎).length > 0) {
      const 触发 = 当前待触发(引擎)[0];
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-drain-${当前修订(引擎)}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input: {},
        }),
      );
    }
    const 效果 = 引擎.getState().ongoingAbilityEffects[0];
    引擎.dispatch(
      createKillPlayerCommand({
        commandId: "command-kill-primary-owner",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-2",
        causeId: "test-death",
        sourceId: "test-source",
      }),
    );
    expect(
      isAbilityEffectActive(
        引擎.getState(),
        效果,
        FICTIONAL_ROLE_ABILITY_PACKAGE,
      ),
    ).toBe(false);
    expect(
      当前待触发(引擎).some(
        ({ definitionTriggerId }) =>
          definitionTriggerId === "test.on-player-died",
      ),
    ).toBe(true);
    expect(
      当前待触发(引擎).some(
        ({ definitionTriggerId }) =>
          definitionTriggerId === "test.primary-delayed",
      ),
    ).toBe(false);
    expect(引擎.getState().delayedAbilityEffects[0]).toMatchObject({
      status: "cancelled",
      completionReason: "source-ineffective",
    });
    const 死亡触发 = 当前待触发(引擎).find(
      ({ definitionTriggerId }) =>
        definitionTriggerId === "test.on-player-died",
    );
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-death-retained",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 死亡触发.triggerId,
        input: {},
      }),
    );
    while (当前待触发(引擎).length > 0) {
      const 触发 = 当前待触发(引擎)[0];
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-drain-after-death-${当前修订(引擎)}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input: {},
        }),
      );
    }
    引擎.dispatch(
      createKillPlayerCommand({
        commandId: "command-kill-death-ability-owner",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-4",
        causeId: "test-retained-after-death",
        sourceId: "test-source",
      }),
    );
    const 自身死亡触发 = 当前待触发(引擎).find(
      ({ definitionTriggerId }) =>
        definitionTriggerId === "test.on-player-died",
    );
    const 自身死亡回执 = 引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-own-death-retained",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 自身死亡触发.triggerId,
        input: {},
      }),
    );
    expect(自身死亡回执.status).toBe("accepted");
    引擎.dispatch(
      createRevivePlayerCommand({
        commandId: "command-revive-primary-owner",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-2",
        causeId: "test-revive",
        sourceId: "test-source",
      }),
    );
    expect(
      isAbilityEffectActive(
        引擎.getState(),
        效果,
        FICTIONAL_ROLE_ABILITY_PACKAGE,
      ),
    ).toBe(true);
    expect(引擎.getState().ongoingAbilityEffects[0].status).toBe("active");
  });

  test("来源仍有效时延迟效果在到期领域事件后转为单一触发", () => {
    const 引擎 = 初始化并开局();
    for (const [索引, 触发] of [...当前待触发(引擎)].entries()) {
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-delayed-setup-${索引}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input:
            触发.abilityInstanceId === "ability-instance-primary"
              ? { recordEffects: true }
              : {},
        }),
      );
    }
    while (当前待触发(引擎).length > 0) {
      const 触发 = 当前待触发(引擎)[0];
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-delayed-drain-${当前修订(引擎)}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input: {},
        }),
      );
    }

    引擎.dispatch(
      createKillPlayerCommand({
        commandId: "command-kill-other-seat-for-delay",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-3",
        causeId: "test-delay-due",
        sourceId: "test-source",
      }),
    );

    expect(引擎.getState().delayedAbilityEffects[0]).toMatchObject({
      status: "triggered",
      completionReason: "triggered",
    });
    expect(
      当前待触发(引擎).filter(
        ({ definitionTriggerId }) =>
          definitionTriggerId === "test.primary-delayed",
      ),
    ).toHaveLength(1);
  });

  test("醉酒信息能力阻塞为说书人裁量，合法解决后才继续队列", () => {
    const 引擎 = 初始化并开局();
    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-information-drunk",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        conditionId: "condition-drunk-information",
        seatId: "seat-1",
        conditionType: "drunk",
        sourceId: "test-condition-source",
        active: true,
      }),
    );
    const 信息触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-information-intoxicated",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 信息触发.triggerId,
        input: {},
      }),
    );

    const 任务 = 引擎.getState().adjudicationTasks[0];
    expect(任务).toMatchObject({
      status: "pending",
      visibility: "storyteller-only",
      triggerId: 信息触发.triggerId,
    });
    expect(
      引擎
        .getState()
        .abilityTriggers.find(
          ({ triggerId }) => triggerId === 信息触发.triggerId,
        ),
    ).toMatchObject({ status: "waiting-adjudication" });

    引擎.dispatch(
      createResolveAbilityAdjudicationCommand({
        commandId: "command-resolve-adjudication",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        taskId: 任务.taskId,
        result: { seatId: "seat-2" },
      }),
    );
    expect(引擎.getState().adjudicationTasks[0].status).toBe("resolved");
    expect(
      引擎
        .getState()
        .abilityTriggers.find(
          ({ triggerId }) => triggerId === 信息触发.triggerId,
        ).status,
    ).toBe("resolved");
    expect(
      引擎
        .getEvents()
        .some(
          ({ type, payload }) =>
            type === "test.information-delivered" &&
            payload.seatId === "seat-2",
        ),
    ).toBe(true);
  });

  test("角色变化替换能力实例并永久终止旧效果，新实例产生进场触发", () => {
    const 引擎 = 初始化并开局();
    for (const [索引, 触发] of [...当前待触发(引擎)].entries()) {
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-initial-${索引}`,
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input:
            触发.abilityInstanceId === "ability-instance-primary"
              ? { recordEffects: true }
              : {},
        }),
      );
    }
    const 旧效果 = 引擎.getState().ongoingAbilityEffects[0];
    引擎.dispatch(
      createReplaceAbilityInstancesCommand({
        commandId: "command-role-change",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-2",
        sourceRoleInstanceId: "role-instance-primary-v2",
        reason: "character-change",
        newInstances: [
          {
            instanceId: "ability-instance-primary-v2",
            definitionId: "test.primary-ability",
            ownerSeatId: "seat-2",
            sourceRoleId: "test.primary-role",
            sourceRoleInstanceId: "role-instance-primary-v2",
          },
        ],
      }),
    );

    expect(
      引擎
        .getState()
        .abilityInstances.find(
          ({ instanceId }) => instanceId === "ability-instance-primary",
        ).status,
    ).toBe("replaced");
    expect(isAbilityEffectActive(引擎.getState(), 旧效果)).toBe(false);
    expect(
      当前待触发(引擎).some(
        ({ definitionTriggerId }) =>
          definitionTriggerId === "test.primary-entry",
      ),
    ).toBe(true);
  });

  test("导出恢复要求同一包且不会重新运行触发反应器", () => {
    const 引擎 = 初始化并开局();
    const 事件流 = 引擎.exportEventStream();
    const 恢复 = restoreDomainProtocol(事件流, {
      rolePackage: FICTIONAL_ROLE_ABILITY_PACKAGE,
      ...创建依赖(),
    });

    expect(恢复.getState()).toEqual(引擎.getState());
    expect(恢复.getEvents()).toEqual(引擎.getEvents());
    expect(恢复.getState().abilityTriggers).toHaveLength(2);

    expect(() => restoreDomainProtocol(事件流, 创建依赖())).toThrow(
      expect.objectContaining({
        name: "DomainProtocolError",
        code: "ROLE_PACKAGE_IDENTITY_MISMATCH",
      }),
    );
  });

  test("首夜阻塞触发未完成时不能推进阶段", () => {
    const 引擎 = 初始化并开局();
    const 回执 = 引擎.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-advance-blocked",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
      }),
    );
    expect(回执).toMatchObject({
      status: "rejected",
      error: { code: "ABILITY_QUEUE_BLOCKED" },
    });
    expect(
      引擎
        .getEvents()
        .filter(({ type }) => type === ROLE_ABILITY_EVENT_TYPES.TRIGGER_QUEUED),
    ).toHaveLength(2);
  });

  test("队首、动作主体与输入 Schema 共同限制触发结算", () => {
    const 引擎 = 初始化并开局();
    const [信息触发, 主触发] = 当前待触发(引擎);
    断言拒绝(
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: "command-non-head",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 主触发.triggerId,
          input: {},
        }),
      ),
      "ABILITY_TRIGGER_NOT_READY",
    );
    断言拒绝(
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: "command-wrong-seat-actor",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: { kind: "seat", id: "seat-2" },
          triggerId: 信息触发.triggerId,
          input: {},
        }),
      ),
      "ACTOR_NOT_AUTHORIZED",
    );
    断言拒绝(
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: "command-invalid-input",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 信息触发.triggerId,
          input: { unexpected: true },
        }),
      ),
      "INVALID_ABILITY_INPUT",
    );

    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-valid-information",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 信息触发.triggerId,
        input: {},
      }),
    );
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-valid-primary",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 主触发.triggerId,
        input: {},
      }),
    );
    const 跟随触发 = 当前待触发(引擎)[0];
    expect(
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: "command-seat-resolves-own-trigger",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: { kind: "seat", id: "seat-3" },
          triggerId: 跟随触发.triggerId,
          input: {},
        }),
      ).status,
    ).toBe("accepted");
  });

  test.each([
    "non-json",
    "top-level",
    "event",
    "ongoing",
    "delayed",
    "task",
    "usage",
  ])("非法效果计划 %s 整批失败且不污染日志", (invalidPlan) => {
    const 引擎 = 初始化并开局();
    const 信息触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: `command-invalid-plan-info-${invalidPlan}`,
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 信息触发.triggerId,
        input: {},
      }),
    );
    const revisionBefore = 当前修订(引擎);
    const eventCountBefore = 引擎.getEvents().length;
    const 主触发 = 当前待触发(引擎)[0];

    expect(() =>
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-invalid-plan-${invalidPlan}`,
          gameId: GAME_ID,
          expectedRevision: revisionBefore,
          actor: HOST,
          triggerId: 主触发.triggerId,
          input: { invalidPlan },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_ABILITY_PLAN" }));
    expect(当前修订(引擎)).toBe(revisionBefore);
    expect(引擎.getEvents()).toHaveLength(eventCountBefore);
  });

  test("触发、持续效果与延迟效果只能按封闭原因取消", () => {
    const 引擎 = 初始化并开局();
    const 信息触发 = 当前待触发(引擎)[0];
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityTriggerCommand({
          commandId: "command-skip-non-skippable",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 信息触发.triggerId,
          reason: "skipped",
        }),
      ),
      "ABILITY_TRIGGER_NOT_CANCELLABLE",
    );
    expect(
      引擎.dispatch(
        createCancelAbilityTriggerCommand({
          commandId: "command-cancel-information-trigger",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 信息触发.triggerId,
          reason: "source-invalid",
        }),
      ).status,
    ).toBe("accepted");
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityTriggerCommand({
          commandId: "command-cancel-trigger-twice",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          triggerId: 信息触发.triggerId,
          reason: "source-invalid",
        }),
      ),
      "ABILITY_TRIGGER_NOT_CANCELLABLE",
    );
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityTriggerCommand({
          commandId: "command-seat-cannot-cancel-trigger",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: { kind: "seat", id: "seat-2" },
          triggerId: 当前待触发(引擎)[0].triggerId,
          reason: "source-invalid",
        }),
      ),
      "ACTOR_NOT_AUTHORIZED",
    );

    const 主触发 = 当前待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-create-cancellable-effects",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 主触发.triggerId,
        input: { recordEffects: true },
      }),
    );
    const [持续效果] = 引擎.getState().ongoingAbilityEffects;
    const [延迟效果] = 引擎.getState().delayedAbilityEffects;
    expect(
      引擎.dispatch(
        createCancelAbilityEffectCommand({
          commandId: "command-cancel-ongoing-effect",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          effectId: 持续效果.effectId,
          effectKind: "ongoing",
          reason: "manual",
        }),
      ).status,
    ).toBe("accepted");
    expect(
      引擎.dispatch(
        createCancelAbilityEffectCommand({
          commandId: "command-cancel-delayed-effect",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          effectId: 延迟效果.effectId,
          effectKind: "delayed",
          reason: "manual",
        }),
      ).status,
    ).toBe("accepted");
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityEffectCommand({
          commandId: "command-cancel-effect-twice",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          effectId: 持续效果.effectId,
          effectKind: "ongoing",
          reason: "manual",
        }),
      ),
      "ABILITY_EFFECT_NOT_CANCELLABLE",
    );
  });

  test("裁量任务拒绝越权与非法结果，并支持显式取消", () => {
    const 引擎 = 初始化并开局();
    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-task-drunk",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        conditionId: "condition-task-drunk",
        seatId: "seat-1",
        conditionType: "drunk",
        sourceId: "test-source",
        active: true,
      }),
    );
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-create-task",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        triggerId: 当前待触发(引擎)[0].triggerId,
        input: {},
      }),
    );
    const 任务 = 引擎.getState().adjudicationTasks[0];
    断言拒绝(
      引擎.dispatch(
        createResolveAbilityAdjudicationCommand({
          commandId: "command-missing-task",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          taskId: "task-missing",
          result: {},
        }),
      ),
      "ADJUDICATION_TASK_NOT_PENDING",
    );
    断言拒绝(
      引擎.dispatch(
        createResolveAbilityAdjudicationCommand({
          commandId: "command-illegal-task-result",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          taskId: 任务.taskId,
          result: { seatId: "seat-5" },
        }),
      ),
      "INVALID_ADJUDICATION_RESULT",
    );
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityAdjudicationCommand({
          commandId: "command-seat-cannot-cancel-task",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: { kind: "seat", id: "seat-1" },
          taskId: 任务.taskId,
          reason: "host-error",
        }),
      ),
      "ACTOR_NOT_AUTHORIZED",
    );
    expect(
      引擎.dispatch(
        createCancelAbilityAdjudicationCommand({
          commandId: "command-cancel-task",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          taskId: 任务.taskId,
          reason: "host-error",
        }),
      ).status,
    ).toBe("accepted");
    断言拒绝(
      引擎.dispatch(
        createCancelAbilityAdjudicationCommand({
          commandId: "command-cancel-task-twice",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          taskId: 任务.taskId,
          reason: "host-error",
        }),
      ),
      "ADJUDICATION_TASK_NOT_PENDING",
    );
  });

  test("能力条件与实例替换校验来源，并清理旧实例产生的条件", () => {
    const 引擎 = 初始化并开局();
    断言拒绝(
      引擎.dispatch(
        createSetAbilityConditionCommand({
          commandId: "command-condition-missing-source",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          conditionId: "condition-missing-source",
          seatId: "seat-2",
          conditionType: "poisoned",
          sourceId: "test-source",
          sourceAbilityInstanceId: "ability-missing",
          active: true,
        }),
      ),
      "ABILITY_INSTANCE_NOT_FOUND",
    );
    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-condition-from-primary",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        conditionId: "condition-from-primary",
        seatId: "seat-3",
        conditionType: "poisoned",
        sourceId: "test-source",
        sourceAbilityInstanceId: "ability-instance-primary",
        active: true,
      }),
    );
    断言拒绝(
      引擎.dispatch(
        createSetAbilityConditionCommand({
          commandId: "command-condition-duplicate",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          conditionId: "condition-from-primary",
          seatId: "seat-3",
          conditionType: "poisoned",
          sourceId: "test-source",
          sourceAbilityInstanceId: "ability-instance-primary",
          active: true,
        }),
      ),
      "INVALID_ABILITY_CONDITION",
    );
    断言拒绝(
      引擎.dispatch(
        createReplaceAbilityInstancesCommand({
          commandId: "command-replace-missing-seat",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          seatId: "seat-missing",
          sourceRoleInstanceId: "role-missing",
          reason: "character-change",
          newInstances: [],
        }),
      ),
      "INVALID_GAME_PHASE",
    );
    断言拒绝(
      引擎.dispatch(
        createReplaceAbilityInstancesCommand({
          commandId: "command-replace-owner-mismatch",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          seatId: "seat-2",
          sourceRoleInstanceId: "role-v2",
          reason: "character-change",
          newInstances: [
            {
              instanceId: "ability-owner-mismatch",
              definitionId: "test.primary-ability",
              ownerSeatId: "seat-3",
              sourceRoleId: "test.primary-role",
              sourceRoleInstanceId: "role-v2",
            },
          ],
        }),
      ),
      "INVALID_ABILITY_INSTANCE",
    );
    断言拒绝(
      引擎.dispatch(
        createReplaceAbilityInstancesCommand({
          commandId: "command-replace-duplicate-instance",
          gameId: GAME_ID,
          expectedRevision: 当前修订(引擎),
          actor: HOST,
          seatId: "seat-2",
          sourceRoleInstanceId: "role-v2",
          reason: "character-change",
          newInstances: [
            {
              instanceId: "ability-instance-primary",
              definitionId: "test.primary-ability",
              ownerSeatId: "seat-2",
              sourceRoleId: "test.primary-role",
              sourceRoleInstanceId: "role-v2",
            },
          ],
        }),
      ),
      "INVALID_ABILITY_INSTANCE",
    );
    引擎.dispatch(
      createReplaceAbilityInstancesCommand({
        commandId: "command-replace-clears-condition",
        gameId: GAME_ID,
        expectedRevision: 当前修订(引擎),
        actor: HOST,
        seatId: "seat-2",
        sourceRoleInstanceId: "role-v2",
        reason: "character-change",
        newInstances: [],
      }),
    );
    expect(引擎.getState().abilityConditions[0]).toMatchObject({
      status: "cleared",
      completionReason: "role-changed",
    });
  });

  test("框架直接拒绝非运行状态、丢失实例与耗尽用量", () => {
    const 框架 = createRoleAbilityFramework(FICTIONAL_ROLE_ABILITY_PACKAGE, [
      "game.created",
      "game.started",
      "phase.advanced",
      "player.died",
    ]);
    const 定义 = 框架.commandDefinitions.find(
      ({ type }) => type === "ability.trigger.resolve",
    );
    const state = 深复制(初始化并开局().getState());
    const trigger = state.abilityTriggers[0];
    const command = createResolveAbilityTriggerCommand({
      commandId: "command-direct-guard",
      gameId: GAME_ID,
      expectedRevision: state.revision,
      actor: HOST,
      triggerId: trigger.triggerId,
      input: {},
    });
    const reject = (code, message) => ({ rejection: { code, message } });

    expect(
      定义.handle({ state: { ...state, lifecycle: "ended" }, command, reject }),
    ).toMatchObject({ rejection: { code: "INVALID_GAME_PHASE" } });
    expect(
      定义.handle({
        state: {
          ...state,
          abilityInstances: state.abilityInstances.filter(
            ({ instanceId }) => instanceId !== trigger.abilityInstanceId,
          ),
        },
        command,
        reject,
      }),
    ).toMatchObject({ rejection: { code: "ABILITY_INSTANCE_NOT_FOUND" } });
    expect(
      定义.handle({
        state: {
          ...state,
          abilityInstances: state.abilityInstances.map((instance) =>
            instance.instanceId === trigger.abilityInstanceId
              ? { ...instance, usesConsumed: 1 }
              : instance,
          ),
        },
        command,
        reject,
      }),
    ).toMatchObject({ rejection: { code: "ABILITY_USAGE_EXHAUSTED" } });
  });

  test("状态不变量拒绝重复、失效引用、乱序与终态活动任务", () => {
    expect(() =>
      assertRoleAbilityStateInvariants(null, FICTIONAL_ROLE_ABILITY_PACKAGE),
    ).not.toThrow();
    const 基线 = 深复制(初始化并开局().getState());
    const 变形 = [
      (state) => state.abilityInstances.push({ ...state.abilityInstances[0] }),
      (state) => {
        state.abilityInstances[0].sourceRoleId = "role-invalid";
      },
      (state) =>
        state.abilityConditions.push({
          conditionId: "condition-invalid",
          seatId: "seat-missing",
          conditionType: "drunk",
          sourceId: "test-source",
          status: "active",
          completionReason: null,
          createdAtRevision: 1,
          completedAtRevision: null,
        }),
      (state) => {
        state.abilityTriggers[0].priority += 1;
      },
      (state) =>
        state.adjudicationTasks.push({
          taskId: "task-resolved-invalid-trigger",
          triggerId: "trigger-missing",
          abilityInstanceId: "ability-instance-information",
          status: "resolved",
          candidateSeatIds: [],
        }),
      (state) => {
        state.ongoingAbilityEffects.push({
          effectId: "effect-invalid-trigger",
          triggerId: state.abilityTriggers[0].triggerId,
          abilityInstanceId: "ability-instance-primary",
          status: "ended",
        });
      },
      (state) => {
        [state.abilityTriggers[0], state.abilityTriggers[1]] = [
          state.abilityTriggers[1],
          state.abilityTriggers[0],
        ];
      },
      (state) => {
        state.lifecycle = "ended";
      },
    ];
    for (const 修改 of 变形) {
      const state = 深复制(基线);
      修改(state);
      expect(() =>
        assertRoleAbilityStateInvariants(state, FICTIONAL_ROLE_ABILITY_PACKAGE),
      ).toThrow(expect.objectContaining({ code: "INVARIANT_VIOLATION" }));
    }

    const 裁量引擎 = 初始化并开局();
    裁量引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-invariant-drunk",
        gameId: GAME_ID,
        expectedRevision: 当前修订(裁量引擎),
        actor: HOST,
        conditionId: "condition-invariant-drunk",
        seatId: "seat-1",
        conditionType: "drunk",
        sourceId: "test-source",
        active: true,
      }),
    );
    裁量引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-invariant-task",
        gameId: GAME_ID,
        expectedRevision: 当前修订(裁量引擎),
        actor: HOST,
        triggerId: 当前待触发(裁量引擎)[0].triggerId,
        input: {},
      }),
    );
    const 任务基线 = 深复制(裁量引擎.getState());
    const 候选失效 = 深复制(任务基线);
    候选失效.adjudicationTasks[0].candidateSeatIds.push("seat-missing");
    expect(() =>
      assertRoleAbilityStateInvariants(
        候选失效,
        FICTIONAL_ROLE_ABILITY_PACKAGE,
      ),
    ).toThrow(expect.objectContaining({ code: "INVARIANT_VIOLATION" }));
    const 任务丢失 = 深复制(任务基线);
    任务丢失.adjudicationTasks = [];
    expect(() =>
      assertRoleAbilityStateInvariants(
        任务丢失,
        FICTIONAL_ROLE_ABILITY_PACKAGE,
      ),
    ).toThrow(expect.objectContaining({ code: "INVARIANT_VIOLATION" }));
  });
});
