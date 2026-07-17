import {
  createAdvancePhaseCommand,
  createDomainProtocol,
  createGameCommand,
  createStartGameCommand,
  restoreDomainProtocol,
} from "@/domain/protocol";
import {
  createReplaceAbilityInstancesCommand,
  createResolveAbilityAdjudicationCommand,
  createResolveAbilityTriggerCommand,
  createSetAbilityConditionCommand,
} from "@/domain/abilities";
import {
  FICTIONAL_ABILITY_INSTANCES,
  FICTIONAL_ROLE_ABILITY_PACKAGE,
} from "../fixtures/roleAbilityPackage";

const GAME_ID = "game-m1-r6-replay";
const HOST = { kind: "host", id: "host-m1-r6-replay" };
const 席位 = [
  { seatId: "seat-1", order: 1, characterType: "demon" },
  { seatId: "seat-2", order: 2, characterType: "townsfolk" },
  { seatId: "seat-3", order: 3, characterType: "townsfolk" },
  { seatId: "seat-4", order: 4, characterType: "outsider" },
  { seatId: "seat-5", order: 5, characterType: "minion" },
];

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T17:00:00.000Z",
    idFactory: (类型) => `${类型}-m1-r6-replay-${++序号}`,
  };
};

const 待触发 = (引擎) =>
  引擎.getState().abilityTriggers.filter(({ status }) => status === "pending");
const 修订 = (引擎) => 引擎.getState().revision;

describe("M1-R6 角色能力框架完整日志场景", () => {
  test("首夜、白天连锁、醉酒其他夜、角色变化和恢复保持完全一致", () => {
    const 引擎 = createDomainProtocol({
      gameId: GAME_ID,
      rolePackage: FICTIONAL_ROLE_ABILITY_PACKAGE,
      ...创建依赖(),
    });
    引擎.dispatch(
      createGameCommand({
        commandId: "command-create",
        gameId: GAME_ID,
        expectedRevision: 0,
        actor: HOST,
        seed: "seed-m1-r6-replay",
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

    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-information-drunk",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        conditionId: "condition-information-drunk",
        seatId: "seat-1",
        conditionType: "drunk",
        sourceId: "test-condition-source",
        active: true,
      }),
    );
    const 醉酒信息触发 = 待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-information-adjudication",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        triggerId: 醉酒信息触发.triggerId,
        input: {},
      }),
    );
    const 裁量任务 = 引擎.getState().adjudicationTasks[0];
    引擎.dispatch(
      createResolveAbilityAdjudicationCommand({
        commandId: "command-resolve-information-adjudication",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        taskId: 裁量任务.taskId,
        result: { seatId: "seat-3" },
      }),
    );

    let 次数 = 0;
    while (待触发(引擎).length > 0) {
      const 触发 = 待触发(引擎)[0];
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-first-night-${++次数}`,
          gameId: GAME_ID,
          expectedRevision: 修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input:
            触发.abilityInstanceId === "ability-instance-primary"
              ? { recordEffects: true }
              : {},
        }),
      );
    }
    引擎.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-to-day",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
      }),
    );
    引擎.dispatch(
      createReplaceAbilityInstancesCommand({
        commandId: "command-character-change",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        seatId: "seat-2",
        sourceRoleInstanceId: "role-instance-primary-replay-v2",
        reason: "character-change",
        newInstances: [
          {
            instanceId: "ability-instance-primary-replay-v2",
            definitionId: "test.primary-ability",
            ownerSeatId: "seat-2",
            sourceRoleId: "test.primary-role",
            sourceRoleInstanceId: "role-instance-primary-replay-v2",
          },
        ],
      }),
    );
    const 进场触发 = 待触发(引擎)[0];
    引擎.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-resolve-entry",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        triggerId: 进场触发.triggerId,
        input: {},
      }),
    );
    while (待触发(引擎).length > 0) {
      const 触发 = 待触发(引擎)[0];
      引擎.dispatch(
        createResolveAbilityTriggerCommand({
          commandId: `command-entry-chain-${修订(引擎)}`,
          gameId: GAME_ID,
          expectedRevision: 修订(引擎),
          actor: HOST,
          triggerId: 触发.triggerId,
          input: {},
        }),
      );
    }
    引擎.dispatch(
      createSetAbilityConditionCommand({
        commandId: "command-poisoned",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
        conditionId: "condition-primary-poisoned",
        seatId: "seat-2",
        conditionType: "poisoned",
        sourceId: "test-condition-source",
        active: true,
      }),
    );
    引擎.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-to-night",
        gameId: GAME_ID,
        expectedRevision: 修订(引擎),
        actor: HOST,
      }),
    );
    const 其他夜命令 = createResolveAbilityTriggerCommand({
      commandId: "command-other-night-suppressed",
      gameId: GAME_ID,
      expectedRevision: 修订(引擎),
      actor: HOST,
      triggerId: 待触发(引擎)[0].triggerId,
      input: {},
    });
    const 首次回执 = 引擎.dispatch(其他夜命令);
    const 重试前事件数 = 引擎.getEvents().length;
    expect(引擎.dispatch(其他夜命令)).toEqual(首次回执);
    expect(引擎.getEvents()).toHaveLength(重试前事件数);

    const 事件流 = 引擎.exportEventStream();
    const 恢复 = restoreDomainProtocol(事件流, {
      rolePackage: FICTIONAL_ROLE_ABILITY_PACKAGE,
      ...创建依赖(),
    });

    expect(恢复.getState()).toEqual(引擎.getState());
    expect(恢复.getEvents()).toEqual(引擎.getEvents());
    expect(恢复.getReceipts()).toEqual(引擎.getReceipts());
    expect(恢复.getState()).toMatchObject({
      phase: "night",
      rulePackage: FICTIONAL_ROLE_ABILITY_PACKAGE.identity,
      ongoingAbilityEffects: [
        expect.objectContaining({
          status: "ended",
          completionReason: "role-changed",
        }),
      ],
    });
    expect(恢复.getState().abilityConditions).toHaveLength(2);
    expect(
      恢复
        .getState()
        .abilityConditions.every(({ status }) => status === "active"),
    ).toBe(true);
    expect(恢复.getState().adjudicationTasks[0]).toMatchObject({
      status: "resolved",
      result: { seatId: "seat-3" },
    });
    expect(
      恢复
        .getState()
        .abilityTriggers.some(
          ({ definitionTriggerId, outcome }) =>
            definitionTriggerId === "test.primary-other-night" &&
            outcome === "suppressed",
        ),
    ).toBe(true);
  });
});
