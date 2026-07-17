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
  createBadMoonRisingDomainProtocol,
  createBadMoonRisingGameCommand,
  createBadMoonRisingStartCommand,
} from "@/domain/rulesets/bad-moon-rising";

const HOST = Object.freeze({ kind: "host", id: "host-bmr-engine" });

const dependencies = () => {
  let sequence = 0;
  return {
    clock: () => "2026-07-17T22:00:00.000Z",
    idFactory: (kind) => `${kind}-bmr-engine-${++sequence}`,
  };
};

const start = (roleIds, suffix) => {
  const gameId = `game-bmr-engine-${suffix}`;
  const assignments = roleIds.map((actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));
  const engine = createBadMoonRisingDomainProtocol({
    gameId,
    ...dependencies(),
  });
  engine.dispatch(
    createBadMoonRisingGameCommand({
      commandId: `create-${suffix}`,
      gameId,
      expectedRevision: 0,
      actor: HOST,
      seed: `seed-${suffix}`,
    }),
  );
  engine.dispatch(
    createBadMoonRisingStartCommand({
      commandId: `start-${suffix}`,
      gameId,
      expectedRevision: 1,
      actor: HOST,
      assignments,
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
  let trigger = currentTrigger(game);
  while (trigger) {
    cancelCurrent(game, `${prefix}-${++index}`);
    trigger = currentTrigger(game);
  }
};

const resolveCurrent = (game, commandId, actor, input) =>
  game.engine.dispatch(
    createResolveAbilityTriggerCommand({
      ...common(game, commandId, actor),
      triggerId: currentTrigger(game).triggerId,
      input,
    }),
  );

const advance = (game, commandId) =>
  game.engine.dispatch(createAdvancePhaseCommand(common(game, commandId)));

describe("M1-R8《黯月初升》能力框架集成", () => {
  test("首夜按水手、侍臣、魔鬼代言人、普卡、侍女顺序建立受约束效果和信息", () => {
    const game = start(
      ["pukka", "devilsadvocate", "sailor", "courtier", "chambermaid"],
      "first-night",
    );
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.sailor.first-night",
    );
    resolveCurrent(
      game,
      "resolve-sailor",
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-4" },
    );
    const task = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        ...common(game, "adjudicate-sailor"),
        taskId: task.taskId,
        result: { drunkSeatId: "seat-4" },
      }),
    );
    expect(
      game.engine
        .getState()
        .badMoonRising.markers.filter(({ content }) => content.active),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "death-protection",
          content: expect.objectContaining({ targetSeatIds: ["seat-3"] }),
        }),
        expect.objectContaining({
          type: "drunk",
          content: expect.objectContaining({ targetSeatIds: ["seat-4"] }),
        }),
      ]),
    );

    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.courtier.first-night",
    );
    cancelCurrent(game, "skip-courtier");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.devilsadvocate.first-night",
    );
    resolveCurrent(
      game,
      "protect-execution",
      { kind: "seat", id: "seat-2" },
      { targetSeatId: "seat-1" },
    );
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.pukka.first-night",
    );
    resolveCurrent(
      game,
      "poison-first",
      { kind: "seat", id: "seat-1" },
      { targetSeatId: "seat-5" },
    );
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.chambermaid.first-night",
    );
    resolveCurrent(game, "ask-chambermaid", HOST, {
      targetSeatIds: ["seat-2", "seat-4"],
    });
    const chambermaidTask = game.engine
      .getState()
      .adjudicationTasks.find(({ status }) => status === "pending");
    game.engine.dispatch(
      createResolveAbilityAdjudicationCommand({
        ...common(game, "answer-chambermaid"),
        taskId: chambermaidTask.taskId,
        result: { number: 1 },
      }),
    );
    expect(
      game.engine.getState().badMoonRising.information.at(-1),
    ).toMatchObject({
      content: {
        recipientSeatId: "seat-5",
        sourceRoleId: "chambermaid",
        result: { kind: "wake-count", number: 1 },
      },
    });
  });

  test("赌徒猜错死亡，刺客随后穿透弄臣且分别记录来源和用量", () => {
    const game = start(
      ["pukka", "assassin", "gambler", "sailor", "fool"],
      "killers",
    );
    cancelAll(game, "cancel-first");
    advance(game, "to-day");
    advance(game, "to-night");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.sailor.other-night",
    );
    cancelCurrent(game, "cancel-sailor");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.gambler.other-night",
    );
    resolveCurrent(
      game,
      "gambler-wrong",
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-2", guessedRoleId: "fool" },
    );
    expect(game.engine.getState().seats[2].alive).toBe(false);
    expect(
      game.engine.getState().badMoonRising.deathHistory.at(-1).content,
    ).toMatchObject({ targetSeatId: "seat-3", causeId: "bmr.gambler" });

    cancelCurrent(game, "cancel-pukka");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.assassin.other-night",
    );
    resolveCurrent(
      game,
      "assassin-fool",
      { kind: "seat", id: "seat-2" },
      { targetSeatId: "seat-5" },
    );
    const state = game.engine.getState();
    expect(state.seats[4].alive).toBe(false);
    expect(
      state.abilityInstances.find(
        ({ definitionId }) => definitionId === "bmr.assassin.ability",
      ).usesConsumed,
    ).toBe(1);
    expect(
      state.abilityInstances.find(
        ({ definitionId }) => definitionId === "bmr.fool.ability",
      ).usesConsumed,
    ).toBe(0);
  });

  test("教授通过夜间能力复活镇民并建立新实例", () => {
    const game = start(
      ["pukka", "assassin", "professor", "gambler", "fool"],
      "professor",
    );
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-gambler"),
        seatId: "seat-4",
        causeId: "bmr.pukka",
        sourceId: "bmr.pukka",
      }),
    );
    cancelAll(game, "cancel-first");
    advance(game, "to-day");
    advance(game, "to-night");
    cancelCurrent(game, "cancel-pukka");
    cancelCurrent(game, "cancel-assassin");
    expect(currentTrigger(game).definitionTriggerId).toBe(
      "bmr.professor.other-night",
    );
    resolveCurrent(
      game,
      "professor-revive",
      { kind: "seat", id: "seat-3" },
      { targetSeatId: "seat-4" },
    );
    const state = game.engine.getState();
    expect(state.seats[3]).toMatchObject({
      alive: true,
      roleInstanceId: expect.stringMatching(
        /^role-trigger-[a-f0-9]{64}-seat-4$/,
      ),
    });
    expect(
      state.abilityInstances.filter(
        ({ ownerSeatId }) => ownerSeatId === "seat-4",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "replaced" }),
        expect.objectContaining({ status: "active", usesConsumed: 0 }),
      ]),
    );
  });
});
