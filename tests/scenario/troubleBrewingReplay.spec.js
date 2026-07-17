import {
  createCancelAbilityTriggerCommand,
  createResolveAbilityTriggerCommand,
} from "@/domain/abilities";
import { createAdvancePhaseCommand } from "@/domain/protocol";
import {
  createSlayerUseCommand,
  createTroubleBrewingDomainProtocol,
  createTroubleBrewingGameCommand,
  createTroubleBrewingStartCommand,
  restoreTroubleBrewingDomainProtocol,
} from "@/domain/rulesets/trouble-brewing";

const GAME_ID = "game-tb-slayer-replay";
const HOST = Object.freeze({ kind: "host", id: "host-tb" });
const assignments = [
  "imp",
  "poisoner",
  "slayer",
  "chef",
  "empath",
  "monk",
  "virgin",
].map((actualRoleId, index) => ({
  seatId: `seat-${index + 1}`,
  order: index + 1,
  actualRoleId,
  perceivedRoleId: actualRoleId,
  roleInstanceId: `role-${index + 1}`,
}));

const dependencies = () => {
  let sequence = 0;
  return {
    clock: () => "2026-07-17T20:00:00.000Z",
    idFactory: (kind) => `${kind}-tb-${++sequence}`,
  };
};

const createStartedEngine = () => {
  const engine = createTroubleBrewingDomainProtocol({
    gameId: GAME_ID,
    ...dependencies(),
  });
  engine.dispatch(
    createTroubleBrewingGameCommand({
      commandId: "command-create",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      seed: "fixed-seed-tb-replay",
    }),
  );
  const startReceipt = engine.dispatch(
    createTroubleBrewingStartCommand({
      commandId: "command-start",
      gameId: GAME_ID,
      expectedRevision: 1,
      actor: HOST,
      assignments,
      redHerringSeatId: null,
      demonBluffs: ["washerwoman", "librarian", "saint"],
    }),
  );
  expect(startReceipt.status).toBe("accepted");
  return engine;
};

const cancelPendingTriggers = (engine) => {
  let index = 0;
  let trigger = engine
    .getState()
    .abilityTriggers.find(({ status }) => status === "pending");
  while (trigger) {
    engine.dispatch(
      createCancelAbilityTriggerCommand({
        commandId: `command-cancel-${++index}`,
        gameId: GAME_ID,
        expectedRevision: engine.getState().revision,
        actor: HOST,
        triggerId: trigger.triggerId,
        reason: "phase-ended",
      }),
    );
    trigger = engine
      .getState()
      .abilityTriggers.find(({ status }) => status === "pending");
  }
};

describe("M1-R7《暗流涌动》事件重放", () => {
  test("开局写入邪恶方私密信息、固定首夜队列并可原样重放", () => {
    const engine = createStartedEngine();
    expect(
      engine
        .getState()
        .abilityTriggers.filter(({ status }) => status === "pending")
        .map(({ definitionTriggerId }) => definitionTriggerId),
    ).toEqual([
      "tb.poisoner.first-night.1",
      "tb.chef.first-night.1",
      "tb.empath.first-night.1",
    ]);
    expect(engine.getState().troubleBrewing.information).toHaveLength(2);

    const stream = engine.exportEventStream();
    const restored = restoreTroubleBrewingDomainProtocol(
      stream,
      dependencies(),
    );
    expect(restored.getState()).toEqual(engine.getState());
    expect(restored.exportEventStream()).toEqual(stream);
  });

  test("猎手公开动作经能力队列结算，射杀小恶魔后善良胜利", () => {
    const engine = createStartedEngine();
    cancelPendingTriggers(engine);
    engine.dispatch(
      createAdvancePhaseCommand({
        commandId: "command-to-day",
        gameId: GAME_ID,
        expectedRevision: engine.getState().revision,
        actor: HOST,
      }),
    );
    const useReceipt = engine.dispatch(
      createSlayerUseCommand({
        commandId: "command-slayer-use",
        gameId: GAME_ID,
        expectedRevision: engine.getState().revision,
        actor: { kind: "seat", id: "seat-3" },
        ownerSeatId: "seat-3",
        targetSeatId: "seat-1",
      }),
    );
    expect(useReceipt.status).toBe("accepted");
    const trigger = engine
      .getState()
      .abilityTriggers.find(({ status }) => status === "pending");
    const resolution = engine.dispatch(
      createResolveAbilityTriggerCommand({
        commandId: "command-slayer-resolve",
        gameId: GAME_ID,
        expectedRevision: engine.getState().revision,
        actor: { kind: "seat", id: "seat-3" },
        triggerId: trigger.triggerId,
        input: { targetSeatId: "seat-1" },
      }),
    );
    expect(resolution.status).toBe("accepted");
    expect(engine.getState()).toMatchObject({
      lifecycle: "ended",
      phase: "ended",
      winner: { alignment: "good", reason: "all-demons-dead" },
    });
    expect(engine.getState().seats[0].alive).toBe(false);
    expect(engine.getState().troubleBrewing.publicActions).toHaveLength(1);
  });
});
