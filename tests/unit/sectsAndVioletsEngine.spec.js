import {
  createCancelAbilityTriggerCommand,
  createResolveAbilityAdjudicationCommand,
  createResolveAbilityTriggerCommand,
} from "@/domain/abilities";
import {
  createAdvancePhaseCommand,
  createKillPlayerCommand,
} from "@/domain/rules";
import {
  createCloseVoteCommand,
  createOpenNominationCommand,
  createOpenVoteCommand,
  createRecordVoteCommand,
  createResolveExecutionCommand,
} from "@/domain/protocol";
import {
  createSectsAndVioletsDomainProtocol,
  createSectsAndVioletsGameCommand,
  createSectsAndVioletsStartCommand,
  restoreSectsAndVioletsDomainProtocol,
} from "@/domain/rulesets/sects-and-violets";

const HOST = Object.freeze({ kind: "host", id: "host-snv-engine" });
const assignments = [
  "clockmaker",
  "dreamer",
  "snakecharmer",
  "mathematician",
  "mutant",
  "sweetheart",
  "witch",
  "fanggu",
].map((actualRoleId, index) => ({
  seatId: `seat-${index + 1}`,
  order: index + 1,
  actualRoleId,
  perceivedRoleId: actualRoleId,
  roleInstanceId: `role-${index + 1}`,
}));

const start = () => {
  let sequence = 0;
  const gameId = "game-snv-engine";
  const engine = createSectsAndVioletsDomainProtocol({
    gameId,
    clock: () => "2026-07-17T12:00:00.000Z",
    idFactory: (kind) => `${kind}-snv-engine-${++sequence}`,
  });
  engine.dispatch(
    createSectsAndVioletsGameCommand({
      commandId: "create-snv-engine",
      gameId,
      expectedRevision: 0,
      actor: HOST,
      seed: "snv-engine-seed",
    }),
  );
  engine.dispatch(
    createSectsAndVioletsStartCommand({
      commandId: "start-snv-engine",
      gameId,
      expectedRevision: 1,
      actor: HOST,
      assignments,
      demonBluffs: ["seamstress", "barber", "juggler"],
    }),
  );
  return { engine, gameId };
};

const startRoles = (roleIds, suffix, setupOptions = {}) => {
  let sequence = 0;
  const gameId = `game-snv-${suffix}`;
  const roleAssignments = roleIds.map((actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));
  const engine = createSectsAndVioletsDomainProtocol({
    gameId,
    clock: () => "2026-07-17T12:00:00.000Z",
    idFactory: (kind) => `${kind}-${suffix}-${++sequence}`,
  });
  engine.dispatch(
    createSectsAndVioletsGameCommand({
      commandId: `create-${suffix}`,
      gameId,
      expectedRevision: 0,
      actor: HOST,
      seed: `seed-${suffix}`,
    }),
  );
  engine.dispatch(
    createSectsAndVioletsStartCommand({
      commandId: `start-${suffix}`,
      gameId,
      expectedRevision: 1,
      actor: HOST,
      assignments: roleAssignments,
      demonBluffs: ["seamstress", "barber", "juggler"],
      ...setupOptions,
    }),
  );
  return { engine, gameId };
};

const common = (game, commandId, actor = HOST) => ({
  commandId,
  gameId: game.gameId,
  expectedRevision: game.engine.getState().revision,
  actor,
});
const currentTrigger = (game) =>
  game.engine
    .getState()
    .abilityTriggers.find(({ status }) => status === "pending");
const resolveCurrent = (game, commandId, actor, input) =>
  game.engine.dispatch(
    createResolveAbilityTriggerCommand({
      ...common(game, commandId, actor),
      triggerId: currentTrigger(game).triggerId,
      input,
    }),
  );
const cancelCurrent = (game, commandId) =>
  game.engine.dispatch(
    createCancelAbilityTriggerCommand({
      ...common(game, commandId),
      triggerId: currentTrigger(game).triggerId,
      reason: "phase-ended",
    }),
  );
const cancelAll = (game, prefix) => {
  let index = 0;
  while (currentTrigger(game)) {
    cancelCurrent(game, `${prefix}-${++index}`);
  }
};
const nominateAndVote = (
  game,
  { nominationId, nominatorSeatId, nomineeSeatId, supporterSeatIds },
) => {
  game.engine.dispatch(
    createOpenNominationCommand({
      ...common(game, `open-${nominationId}`, {
        kind: "seat",
        id: nominatorSeatId,
      }),
      nominationId,
      nominatorSeatId,
      nomineeSeatId,
    }),
  );
  game.engine.dispatch(
    createOpenVoteCommand({
      ...common(game, `vote-${nominationId}`),
      nominationId,
    }),
  );
  const supporters = new Set(supporterSeatIds);
  while (game.engine.getState().activeNomination.stage !== "ready-to-close") {
    const active = game.engine.getState().activeNomination;
    const voterSeatId = active.votingOrder[active.currentVoterIndex];
    game.engine.dispatch(
      createRecordVoteCommand({
        ...common(game, `record-${nominationId}-${voterSeatId}`),
        nominationId,
        voterSeatId,
        support: supporters.has(voterSeatId),
      }),
    );
  }
  game.engine.dispatch(
    createCloseVoteCommand({
      ...common(game, `close-${nominationId}`),
      nominationId,
    }),
  );
};

describe("M1-R9《梦殒春宵》能力框架集成", () => {
  test("信息裁量受真相约束并只投递给所有者", () => {
    const game = start();
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "snv.snakecharmer.first-night",
    );
    resolveCurrent(
      game,
      "snake-miss",
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-2" },
    );
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "snv.witch.first-night",
    );
    resolveCurrent(
      game,
      "witch-curse",
      { kind: "seat", id: "seat-7" },
      { targetSeatId: "seat-4" },
    );
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "snv.clockmaker.first-night",
    );
    resolveCurrent(game, "clockmaker-request", HOST, {});
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    expect(
      game.engine.dispatch(
        createResolveAbilityAdjudicationCommand({
          ...common(game, "clockmaker-wrong"),
          taskId: task.taskId,
          result: { number: 2 },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_ADJUDICATION_RESULT" },
    });
    game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        ...common(game, "clockmaker-correct"),
        taskId: task.taskId,
        result: { number: 1 },
      }),
    );
    expect(
      game.engine.getState().sectsAndViolets.information.at(-1),
    ).toMatchObject({
      content: {
        recipientSeatId: "seat-1",
        sourceRoleId: "clockmaker",
        delivered: { number: 1 },
      },
    });
  });

  test("舞蛇人选中恶魔时原子交换角色、阵营、能力实例并中毒", () => {
    const game = start();
    resolveCurrent(
      game,
      "snake-hit",
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-8" },
    );
    const state = game.engine.getState();
    expect(state.seats[2]).toMatchObject({
      actualRoleId: "fanggu",
      alignment: "evil",
    });
    expect(state.seats[7]).toMatchObject({
      actualRoleId: "snakecharmer",
      alignment: "good",
    });
    expect(state.sectsAndViolets.markers).toContainEqual(
      expect.objectContaining({
        type: "poisoned",
        content: expect.objectContaining({ targetSeatIds: ["seat-8"] }),
      }),
    );
    expect(
      state.abilityInstances.filter(
        ({ ownerSeatId }) => ownerSeatId === "seat-3",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "replaced" }),
        expect.objectContaining({
          definitionId: "snv.fanggu.ability",
          status: "active",
        }),
      ]),
    );
  });

  test("方古首次攻击外来者跳转且事件流可重放", () => {
    const game = start();
    cancelCurrent(game, "cancel-snake");
    cancelCurrent(game, "cancel-witch");
    cancelCurrent(game, "cancel-clockmaker");
    cancelCurrent(game, "cancel-dreamer");
    cancelCurrent(game, "cancel-math");
    game.engine.dispatch(createAdvancePhaseCommand(common(game, "to-day")));
    cancelAll(game, "cancel-day");
    game.engine.dispatch(createAdvancePhaseCommand(common(game, "to-night")));
    while (
      currentTrigger(game)?.definitionTriggerId !== "snv.fanggu.other-night"
    ) {
      cancelCurrent(game, `cancel-${game.engine.getState().revision}`);
    }
    resolveCurrent(
      game,
      "fang-gu-jump",
      { kind: "seat", id: "seat-8" },
      { targetSeatId: "seat-5" },
    );
    const state = game.engine.getState();
    expect(state.seats[7].alive).toBe(false);
    expect(state.seats[4]).toMatchObject({
      alive: true,
      actualRoleId: "fanggu",
      alignment: "evil",
    });
    expect(state.sectsAndViolets.fangGuJumpUsed).toBe(true);
    expect(
      restoreSectsAndVioletsDomainProtocol(
        game.engine.exportEventStream(),
      ).getState(),
    ).toEqual(state);
  });

  test("涡流在白天无人被处决时立即以特殊原因结束对局", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "flowergirl",
        "mutant",
        "witch",
        "vortox",
      ],
      "vortox-no-execution",
    );
    cancelAll(game, "cancel-first");
    game.engine.dispatch(createAdvancePhaseCommand(common(game, "to-day")));
    game.engine.dispatch(
      createAdvancePhaseCommand(common(game, "no-execution")),
    );
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: { alignment: "evil", reason: "vortox-no-execution" },
    });
  });

  test("呆瓜死亡只产生自己的一次触发，选择邪恶玩家后结束对局", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "flowergirl",
        "klutz",
        "witch",
        "vortox",
      ],
      "klutz-death",
    );
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-klutz"),
        seatId: "seat-6",
        causeId: "snv.vortox",
        sourceId: "zh-wiki-role-vortox",
      }),
    );
    expect(
      game.engine
        .getState()
        .abilityTriggers.filter(({ status }) => status === "pending")
        .map(({ definitionTriggerId }) => definitionTriggerId),
    ).toContain("snv.klutz.domain-event");
    while (
      currentTrigger(game)?.definitionTriggerId !== "snv.klutz.domain-event"
    ) {
      cancelCurrent(
        game,
        `cancel-before-klutz-${game.engine.getState().revision}`,
      );
    }
    resolveCurrent(
      game,
      "klutz-chooses-evil",
      { kind: "seat", id: "seat-6" },
      { targetSeatId: "seat-7" },
    );
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: { alignment: "evil", reason: "klutz-evil-chosen" },
    });
  });

  test("心上人死亡只产生一次裁量任务并持久记录醉酒目标", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "flowergirl",
        "sweetheart",
        "witch",
        "vortox",
      ],
      "sweetheart-death",
    );
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-sweetheart"),
        seatId: "seat-6",
        causeId: "snv.vortox",
        sourceId: "zh-wiki-role-vortox",
      }),
    );
    while (
      currentTrigger(game)?.definitionTriggerId !==
      "snv.sweetheart.domain-event"
    ) {
      cancelCurrent(
        game,
        `cancel-before-sweetheart-${game.engine.getState().revision}`,
      );
    }
    resolveCurrent(game, "sweetheart-task", HOST, {});
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        ...common(game, "sweetheart-drunk"),
        taskId: task.taskId,
        result: { drunkSeatId: "seat-2" },
      }),
    );
    expect(game.engine.getState().sectsAndViolets.markers).toContainEqual(
      expect.objectContaining({
        type: "drunk",
        content: expect.objectContaining({
          targetSeatIds: ["seat-2"],
          persistent: true,
        }),
      }),
    );
  });

  test("女巫诅咒者在四人以上存活时提名会死亡，提名仍然成立", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "flowergirl",
        "mutant",
        "witch",
        "vortox",
      ],
      "witch-nomination",
    );
    cancelCurrent(game, "cancel-snake");
    resolveCurrent(
      game,
      "witch-curse-clockmaker",
      { kind: "seat", id: "seat-7" },
      { targetSeatId: "seat-1" },
    );
    cancelAll(game, "cancel-first-rest");
    game.engine.dispatch(
      createAdvancePhaseCommand(common(game, "witch-to-day")),
    );
    const nomination = game.engine.dispatch(
      createOpenNominationCommand({
        ...common(game, "cursed-nominates", { kind: "seat", id: "seat-1" }),
        nominationId: "nomination-witch-test",
        nominatorSeatId: "seat-1",
        nomineeSeatId: "seat-2",
      }),
    );
    expect(nomination.status).toBe("accepted");
    expect(game.engine.getState()).toMatchObject({
      activeNomination: { nominatorSeatId: "seat-1", nomineeSeatId: "seat-2" },
    });
    expect(game.engine.getState().seats[0]).toMatchObject({
      seatId: "seat-1",
      alive: false,
    });
    expect(
      game.engine.getState().sectsAndViolets.deathHistory.at(-1).content,
    ).toMatchObject({
      targetSeatId: "seat-1",
      causeId: "snv.witch",
      actuallyDied: true,
    });
  });

  test("亡骨魔杀死爪牙后保留能力，且只从直接相邻镇民中裁量一人中毒", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "flowergirl",
        "towncrier",
        "witch",
        "vigormortis",
      ],
      "vigormortis-minion",
    );
    cancelAll(game, "cancel-vigor-first");
    game.engine.dispatch(
      createAdvancePhaseCommand(common(game, "vigor-to-day")),
    );
    game.engine.dispatch(
      createAdvancePhaseCommand(common(game, "vigor-to-night")),
    );
    cancelCurrent(game, "cancel-vigor-snake");
    cancelCurrent(game, "cancel-vigor-witch");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "snv.vigormortis.other-night",
    );
    resolveCurrent(
      game,
      "vigor-kills-witch",
      { kind: "seat", id: "seat-8" },
      { targetSeatId: "seat-7" },
    );
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    expect(task.candidateSeatIds).toEqual(["seat-6"]);
    game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        ...common(game, "vigor-poisons-neighbor"),
        taskId: task.taskId,
        result: { poisonedSeatId: "seat-6" },
      }),
    );
    expect(game.engine.getState().sectsAndViolets.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "vigormortis-retains-ability",
          content: expect.objectContaining({ targetSeatIds: ["seat-7"] }),
        }),
        expect.objectContaining({
          type: "vigormortis-poisoned",
          content: expect.objectContaining({ targetSeatIds: ["seat-6"] }),
        }),
      ]),
    );
  });

  test("镜像双子两人存活时阻止恶魔死亡带来的善良胜利，镜像双子死后重新结算", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "mutant",
        "sweetheart",
        "eviltwin",
        "fanggu",
      ],
      "evil-twin-prevents-good",
      { evilTwinSeatId: "seat-7", goodTwinSeatId: "seat-1" },
    );
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-demon-with-twins-alive"),
        seatId: "seat-8",
        causeId: "test",
        sourceId: "zh-wiki-role-eviltwin",
      }),
    );
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "running",
      winner: null,
    });
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-evil-twin"),
        seatId: "seat-7",
        causeId: "test",
        sourceId: "zh-wiki-role-eviltwin",
      }),
    );
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: { alignment: "good", reason: "all-demons-dead" },
    });
  });

  test("善良双子被实际处决死亡时立即进入镜像双子邪恶胜利", () => {
    const game = startRoles(
      [
        "clockmaker",
        "dreamer",
        "snakecharmer",
        "mathematician",
        "mutant",
        "sweetheart",
        "eviltwin",
        "fanggu",
      ],
      "evil-twin-execution",
      { evilTwinSeatId: "seat-7", goodTwinSeatId: "seat-1" },
    );
    cancelAll(game, "cancel-twin-first");
    game.engine.dispatch(
      createAdvancePhaseCommand(common(game, "twin-to-day")),
    );
    cancelAll(game, "cancel-twin-day-trigger");
    nominateAndVote(game, {
      nominationId: "nomination-good-twin",
      nominatorSeatId: "seat-2",
      nomineeSeatId: "seat-1",
      supporterSeatIds: ["seat-1", "seat-2", "seat-3", "seat-4"],
    });
    game.engine.dispatch(
      createResolveExecutionCommand({
        ...common(game, "execute-good-twin"),
        seatId: "seat-1",
      }),
    );
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      executionToday: { seatId: "seat-1", died: true },
      winner: {
        alignment: "evil",
        reason: "evil-twin-good-twin-executed",
      },
    });
  });
});
