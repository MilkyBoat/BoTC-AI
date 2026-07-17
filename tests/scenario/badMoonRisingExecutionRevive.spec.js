import { createCancelAbilityTriggerCommand } from "@/domain/abilities";
import {
  createAdvancePhaseCommand,
  createCloseVoteCommand,
  createKillPlayerCommand,
  createOpenNominationCommand,
  createOpenVoteCommand,
  createRecordVoteCommand,
  createResolveExecutionCommand,
  createRevivePlayerCommand,
} from "@/domain/rules";
import {
  createBadMoonRisingDomainProtocol,
  createBadMoonRisingGameCommand,
  createBadMoonRisingStartCommand,
  restoreBadMoonRisingDomainProtocol,
} from "@/domain/rulesets/bad-moon-rising";

const HOST = Object.freeze({ kind: "host", id: "host-bmr-lifecycle" });

const dependencies = () => {
  let sequence = 0;
  return {
    clock: () => "2026-07-17T20:00:00.000Z",
    idFactory: (kind) => `${kind}-bmr-lifecycle-${++sequence}`,
  };
};

const start = (roleIds, suffix) => {
  const gameId = `game-bmr-${suffix}`;
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

const common = (game, commandId) => ({
  commandId,
  gameId: game.gameId,
  expectedRevision: game.engine.getState().revision,
  actor: HOST,
});

const cancelAll = (game, prefix) => {
  let index = 0;
  let trigger = game.engine
    .getState()
    .abilityTriggers.find(({ status }) => status === "pending");
  while (trigger) {
    game.engine.dispatch(
      createCancelAbilityTriggerCommand({
        ...common(game, `${prefix}-${++index}`),
        triggerId: trigger.triggerId,
        reason: "phase-ended",
      }),
    );
    trigger = game.engine
      .getState()
      .abilityTriggers.find(({ status }) => status === "pending");
  }
};

const advance = (game, commandId) =>
  game.engine.dispatch(createAdvancePhaseCommand(common(game, commandId)));

const nominate = (game, targetSeatId, suffix) => {
  const nominationId = `nomination-${suffix}`;
  const nominatorSeatId = game.engine
    .getState()
    .seats.find(({ alive, seatId }) => alive && seatId !== targetSeatId).seatId;
  game.engine.dispatch(
    createOpenNominationCommand({
      ...common(game, `open-${suffix}`),
      nominationId,
      nominatorSeatId,
      nomineeSeatId: targetSeatId,
    }),
  );
  game.engine.dispatch(
    createOpenVoteCommand({
      ...common(game, `vote-${suffix}`),
      nominationId,
    }),
  );
  while (game.engine.getState().activeNomination.stage !== "ready-to-close") {
    const nomination = game.engine.getState().activeNomination;
    const voterSeatId = nomination.votingOrder[nomination.currentVoterIndex];
    game.engine.dispatch(
      createRecordVoteCommand({
        ...common(game, `record-${suffix}-${voterSeatId}`),
        nominationId,
        voterSeatId,
        support: true,
      }),
    );
  }
  game.engine.dispatch(
    createCloseVoteCommand({
      ...common(game, `close-${suffix}`),
      nominationId,
    }),
  );
};

const execute = (game, seatId, commandId) =>
  game.engine.dispatch(
    createResolveExecutionCommand({
      ...common(game, commandId),
      seatId,
    }),
  );

describe("M1-R8《黯月初升》处决、主谋和复活场景", () => {
  test("弄臣被处决但首次不死，处决事实成立并进入夜晚", () => {
    const game = start(
      ["pukka", "assassin", "fool", "sailor", "gambler"],
      "fool-execution",
    );
    cancelAll(game, "cancel-first-night");
    advance(game, "to-day");
    nominate(game, "seat-3", "fool");

    expect(execute(game, "seat-3", "execute-fool").status).toBe("accepted");
    expect(game.engine.getState()).toMatchObject({
      phase: "night",
      executionToday: { seatId: "seat-3", died: false },
    });
    expect(game.engine.getState().seats[2].alive).toBe(true);
    expect(game.engine.getState().abilityInstances[2].usesConsumed).toBe(1);
  });

  test("最后恶魔因处决真死时主谋追加夜日，处决善良后邪恶获胜", () => {
    const game = start(
      ["pukka", "mastermind", "fool", "sailor", "gambler"],
      "mastermind",
    );
    cancelAll(game, "cancel-first-night");
    advance(game, "to-first-day");
    nominate(game, "seat-1", "demon");
    execute(game, "seat-1", "execute-demon");

    expect(game.engine.getState()).toMatchObject({
      lifecycle: "running",
      phase: "night",
      badMoonRising: {
        mastermindContinuation: {
          active: true,
          demonSeatId: "seat-1",
          startedDayNumber: 1,
        },
      },
    });
    expect(game.engine.getState().seats[0]).toMatchObject({
      alive: false,
      secretlyAlive: true,
    });

    cancelAll(game, "cancel-extra-night");
    advance(game, "to-extra-day");
    nominate(game, "seat-3", "good");
    execute(game, "seat-3", "execute-good");
    expect(game.engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: {
        alignment: "evil",
        reason: "mastermind-good-executed",
      },
    });
    expect(game.engine.getState().seats[0].secretlyAlive).toBe(false);

    const restored = restoreBadMoonRisingDomainProtocol(
      game.engine.exportEventStream(),
      dependencies(),
    );
    expect(restored.getState()).toEqual(game.engine.getState());
  });

  test("教授或沙巴洛斯复活会建立新角色和能力实例并保留旧历史", () => {
    const game = start(
      ["pukka", "assassin", "professor", "gambler", "fool"],
      "revive",
    );
    game.engine.dispatch(
      createKillPlayerCommand({
        ...common(game, "kill-gambler"),
        seatId: "seat-4",
        causeId: "bmr.pukka",
        sourceId: "bmr.pukka",
      }),
    );
    const oldInstance = game.engine
      .getState()
      .abilityInstances.find(({ ownerSeatId }) => ownerSeatId === "seat-4");

    expect(
      game.engine.dispatch(
        createRevivePlayerCommand({
          ...common(game, "professor-revive"),
          seatId: "seat-4",
          causeId: "bmr.professor",
          sourceId: "bmr.professor",
        }),
      ).status,
    ).toBe("accepted");
    const state = game.engine.getState();
    expect(state.seats[3]).toMatchObject({
      alive: true,
      deadVoteAvailable: false,
      roleInstanceId: "role-professor-revive-seat-4",
    });
    expect(
      state.abilityInstances.find(
        ({ instanceId }) => instanceId === oldInstance.instanceId,
      ).status,
    ).toBe("replaced");
    expect(
      state.abilityInstances.find(
        ({ ownerSeatId, status }) =>
          ownerSeatId === "seat-4" && status === "active",
      ),
    ).toMatchObject({
      definitionId: "bmr.gambler.ability",
      usesConsumed: 0,
      sourceRoleInstanceId: "role-professor-revive-seat-4",
    });
    expect(state.badMoonRising.resurrectionHistory.at(-1)).toMatchObject({
      type: "resurrection",
      content: {
        targetSeatId: "seat-4",
        sourceRoleId: "professor",
      },
    });
  });
});
