import {
  createCancelAbilityTriggerCommand,
  createResolveAbilityAdjudicationCommand,
  createResolveAbilityTriggerCommand,
} from "@/domain/abilities";
import {
  createAdvancePhaseCommand,
  createCloseVoteCommand,
  createKillPlayerCommand,
  createOpenNominationCommand,
  createOpenVoteCommand,
  createRecordVoteCommand,
  createResolveExecutionCommand,
} from "@/domain/protocol";
import {
  createTroubleBrewingDomainProtocol,
  createTroubleBrewingGameCommand,
  createTroubleBrewingStartCommand,
} from "@/domain/rulesets/trouble-brewing";

const HOST = Object.freeze({ kind: "host", id: "host-tb-engine" });

const dependencies = () => {
  let sequence = 0;
  return {
    clock: () => "2026-07-17T21:00:00.000Z",
    idFactory: (kind) => `${kind}-tb-engine-${++sequence}`,
  };
};

const assignmentsFor = (roleIds, perceived = {}) =>
  roleIds.map((actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: perceived[actualRoleId] ?? actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));

const start = (
  roleIds,
  { perceived, redHerringSeatId = null, demonBluffs } = {},
) => {
  const gameId = `game-${roleIds.join("-")}`;
  const assignments = assignmentsFor(roleIds, perceived);
  const engine = createTroubleBrewingDomainProtocol({
    gameId,
    ...dependencies(),
  });
  engine.dispatch(
    createTroubleBrewingGameCommand({
      commandId: "command-create",
      gameId,
      expectedRevision: 0,
      actor: HOST,
      seed: "fixed-seed-tb-engine",
    }),
  );
  const receipt = engine.dispatch(
    createTroubleBrewingStartCommand({
      commandId: "command-start",
      gameId,
      expectedRevision: 1,
      actor: HOST,
      assignments,
      redHerringSeatId,
      demonBluffs:
        demonBluffs ??
        (roleIds.length >= 7
          ? ["washerwoman", "librarian", "saint"].filter(
              (roleId) => !roleIds.includes(roleId),
            )
          : []),
    }),
  );
  expect(receipt.status).toBe("accepted");
  return { engine, gameId };
};

const currentTrigger = (engine) =>
  engine.getState().abilityTriggers.find(({ status }) => status === "pending");

const cancelAll = ({ engine, gameId }) => {
  let index = 0;
  while (currentTrigger(engine)) {
    engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: `command-cancel-${++index}`,
        gameId,
        expectedRevision: engine.getState().revision,
        actor: HOST,
        triggerId: currentTrigger(engine).triggerId,
        reason: "phase-ended",
      }),
    );
  }
};

const advance = ({ engine, gameId }, commandId) =>
  engine.dispatch(
    createAdvancePhaseCommand({
      commandId,
      gameId,
      expectedRevision: engine.getState().revision,
      actor: HOST,
    }),
  );

const resolveCurrent = ({ engine, gameId }, actor, input, commandId) =>
  engine.dispatch(
    createResolveAbilityTriggerCommand({
      commandId,
      gameId,
      expectedRevision: engine.getState().revision,
      actor,
      triggerId: currentTrigger(engine).triggerId,
      input,
    }),
  );

const nominateAndVote = (
  game,
  { nominationId, nominatorSeatId, nomineeSeatId, supporterSeatIds },
) => {
  game.engine.dispatch(
    createOpenNominationCommand({
      commandId: `command-open-${nominationId}`,
      gameId: game.gameId,
      expectedRevision: game.engine.getState().revision,
      actor: { kind: "seat", id: nominatorSeatId },
      nominationId,
      nominatorSeatId,
      nomineeSeatId,
    }),
  );
  game.engine.dispatch(
    createOpenVoteCommand({
      commandId: `command-vote-${nominationId}`,
      gameId: game.gameId,
      expectedRevision: game.engine.getState().revision,
      actor: HOST,
      nominationId,
    }),
  );
  const supporters = new Set(supporterSeatIds);
  while (game.engine.getState().activeNomination.stage !== "ready-to-close") {
    const active = game.engine.getState().activeNomination;
    const voterSeatId = active.votingOrder[active.currentVoterIndex];
    game.engine.dispatch(
      createRecordVoteCommand({
        commandId: `command-vote-${nominationId}-${voterSeatId}`,
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        nominationId,
        voterSeatId,
        support: supporters.has(voterSeatId),
      }),
    );
  }
  return game.engine.dispatch(
    createCloseVoteCommand({
      commandId: `command-close-${nominationId}`,
      gameId: game.gameId,
      expectedRevision: game.engine.getState().revision,
      actor: HOST,
      nominationId,
    }),
  );
};

describe("M1-R7《暗流涌动》能力框架集成", () => {
  test("投毒者、僧侣、小恶魔按其他夜晚顺序结算，僧侣保护优先于士兵免疫", () => {
    const game = start(["imp", "poisoner", "monk", "soldier", "chef"]);
    cancelAll(game);
    advance(game, "command-to-day");
    advance(game, "command-to-night");
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.poisoner.other-night.2",
    );
    resolveCurrent(
      game,
      { kind: "seat", id: "seat-2" },
      { targetSeatId: "seat-5" },
      "command-poison",
    );
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.monk.other-night.1",
    );
    resolveCurrent(
      game,
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-4" },
      "command-protect",
    );
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.imp.other-night.1",
    );
    resolveCurrent(
      game,
      { kind: "seat", id: "seat-1" },
      { targetSeatId: "seat-4" },
      "command-imp-kill",
    );
    expect(game.engine.getState().seats[3].alive).toBe(true);
    expect(
      game.engine.getState().troubleBrewing.deathHistory.at(-1),
    ).toMatchObject({
      type: "death-prevented",
      content: { targetSeatId: "seat-4", preventedBy: "monk" },
    });
  });

  test("小恶魔自杀时红唇女郎在五人门槛上强制继任且当夜不重复行动", () => {
    const game = start(
      ["imp", "scarletwoman", "slayer", "chef", "empath", "monk", "virgin"],
      { demonBluffs: ["washerwoman", "librarian", "saint"] },
    );
    cancelAll(game);
    advance(game, "command-to-day");
    advance(game, "command-to-night");
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.monk.other-night.1",
    );
    game.engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: "command-skip-monk",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        triggerId: currentTrigger(game.engine).triggerId,
        reason: "phase-ended",
      }),
    );
    resolveCurrent(
      game,
      { kind: "seat", id: "seat-1" },
      { targetSeatId: "seat-1" },
      "command-imp-self-kill",
    );
    expect(game.engine.getState().seats[0].alive).toBe(false);
    expect(game.engine.getState().seats[1]).toMatchObject({
      alive: true,
      actualRoleId: "imp",
      characterType: "demon",
      roleInstanceId: expect.stringContaining("role-imp-seat-2"),
    });
    expect(
      game.engine
        .getState()
        .abilityTriggers.filter(
          ({ status, definitionTriggerId }) =>
            status === "pending" &&
            definitionTriggerId === "tb.imp.other-night.1",
        ),
    ).toHaveLength(0);
  });

  test("镇长三人生还且无人处决时由阶段钩子结束游戏", () => {
    const game = start(["imp", "poisoner", "mayor", "chef", "empath"]);
    cancelAll(game);
    advance(game, "command-to-day");
    for (const [index, seatId] of ["seat-4", "seat-5"].entries()) {
      const receipt = game.engine.dispatch(
        createKillPlayerCommand({
          commandId: `command-kill-${index + 1}`,
          gameId: game.gameId,
          expectedRevision: game.engine.getState().revision,
          actor: HOST,
          seatId,
          causeId: "test-death",
        }),
      );
      expect(receipt.status).toBe("accepted");
    }
    const receipt = advance(game, "command-mayor-day-end");
    expect(receipt.status).toBe("accepted");
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: {
        alignment: "good",
        reason: "mayor-three-alive-no-execution",
      },
    });
  });

  test("酒鬼运行伪装镇民交互，但只生成受约束错误信息而不获得能力", () => {
    const game = start(["imp", "baron", "drunk", "saint", "chef"], {
      perceived: { drunk: "empath" },
    });
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.chef.first-night.1",
    );
    game.engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: "command-skip-chef",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        triggerId: currentTrigger(game.engine).triggerId,
        reason: "phase-ended",
      }),
    );
    const resolution = resolveCurrent(game, HOST, {}, "command-drunk-empath");
    expect(resolution.status).toBe("accepted");
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    expect(task.kind).toContain("tb.empath.misinformation");
    const adjudication = game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        commandId: "command-drunk-info",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        taskId: task.taskId,
        result: { number: 2 },
      }),
    );
    expect(adjudication.status).toBe("accepted");
    expect(
      game.engine.getState().troubleBrewing.information.at(-1),
    ).toMatchObject({
      type: "misinformation",
      content: {
        recipientSeatId: "seat-3",
        roleId: "empath",
        content: { number: 2 },
      },
    });
  });

  test("有效厨师信息拒绝越界裁量并只接受与登记事实一致的数字", () => {
    const game = start(["imp", "poisoner", "chef", "empath", "fortuneteller"], {
      redHerringSeatId: "seat-4",
    });
    game.engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: "command-skip-poisoner",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        triggerId: currentTrigger(game.engine).triggerId,
        reason: "phase-ended",
      }),
    );
    resolveCurrent(game, HOST, {}, "command-chef-resolve");
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    const invalid = game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        commandId: "command-chef-invalid",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        taskId: task.taskId,
        result: { number: 0 },
      }),
    );
    expect(invalid).toMatchObject({
      status: "rejected",
      error: { code: "INVALID_ADJUDICATION_RESULT" },
    });
    const valid = game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        commandId: "command-chef-valid",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        taskId: task.taskId,
        result: { number: 1 },
      }),
    );
    expect(valid.status).toBe("accepted");
    expect(
      game.engine.getState().troubleBrewing.information.at(-1),
    ).toMatchObject({
      content: { roleId: "chef", content: { number: 1 } },
    });
  });

  test("贞洁者首次被镇民提名时立即处决提名者并结束当天", () => {
    const game = start(["imp", "poisoner", "virgin", "chef", "empath"]);
    cancelAll(game);
    advance(game, "command-to-day");
    const nomination = game.engine.dispatch(
      createOpenNominationCommand({
        commandId: "command-nominate-virgin",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: { kind: "seat", id: "seat-4" },
        nominationId: "nomination-virgin",
        nominatorSeatId: "seat-4",
        nomineeSeatId: "seat-3",
      }),
    );
    expect(nomination.status).toBe("accepted");
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.virgin.domain-event.1",
    );
    const resolution = resolveCurrent(game, HOST, {}, "command-virgin-resolve");
    expect(resolution.status).toBe("accepted");
    expect(game.engine.getState()).toMatchObject({
      phase: "night",
      executionToday: { seatId: "seat-4", died: true },
    });
    expect(game.engine.getState().seats[3].alive).toBe(false);
  });

  test("圣徒实际因处决死亡后通过死后触发令善良阵营失败", () => {
    const game = start(["imp", "baron", "saint", "butler", "chef"]);
    cancelAll(game);
    advance(game, "command-to-day");
    nominateAndVote(game, {
      nominationId: "nomination-saint",
      nominatorSeatId: "seat-5",
      nomineeSeatId: "seat-3",
      supporterSeatIds: ["seat-1", "seat-4", "seat-5"],
    });
    const execution = game.engine.dispatch(
      createResolveExecutionCommand({
        commandId: "command-execute-saint",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        seatId: "seat-3",
      }),
    );
    expect(execution.status).toBe("accepted");
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.saint.domain-event.1",
    );
    const resolution = resolveCurrent(game, HOST, {}, "command-saint-resolve");
    expect(resolution.status).toBe("accepted");
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: { alignment: "evil", reason: "saint-executed" },
    });
  });

  test("管家违规票仍进入票数，只在投票关闭后追加审计记录", () => {
    const game = start(["imp", "baron", "butler", "saint", "chef"]);
    game.engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: "command-skip-chef",
        gameId: game.gameId,
        expectedRevision: game.engine.getState().revision,
        actor: HOST,
        triggerId: currentTrigger(game.engine).triggerId,
        reason: "phase-ended",
      }),
    );
    expect(currentTrigger(game.engine).definitionTriggerId).toBe(
      "tb.butler.first-night.1",
    );
    resolveCurrent(
      game,
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-5" },
      "command-butler-master",
    );
    advance(game, "command-to-day");
    const receipt = nominateAndVote(game, {
      nominationId: "nomination-butler",
      nominatorSeatId: "seat-5",
      nomineeSeatId: "seat-4",
      supporterSeatIds: ["seat-1", "seat-2", "seat-3"],
    });
    expect(receipt.status).toBe("accepted");
    expect(game.engine.getState().nominationsToday[0]).toMatchObject({
      total: 3,
      voterSeatIds: ["seat-1", "seat-2", "seat-3"],
    });
    expect(game.engine.getState().troubleBrewing.butlerViolations).toHaveLength(
      1,
    );
    expect(
      game.engine.getState().troubleBrewing.butlerViolations[0],
    ).toMatchObject({
      type: "butler-vote-violation",
      content: { butlerSeatId: "seat-3", masterSeatId: "seat-5" },
    });
  });
});
