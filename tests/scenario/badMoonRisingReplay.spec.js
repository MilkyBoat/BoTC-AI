import { createKillPlayerCommand } from "@/domain/rules";
import {
  createBadMoonRisingDomainProtocol,
  createBadMoonRisingGameCommand,
  createBadMoonRisingStartCommand,
  restoreBadMoonRisingDomainProtocol,
} from "@/domain/rulesets/bad-moon-rising";

const host = { kind: "host", id: "host-bmr-replay" };
const assignments = ["zombuul", "assassin", "fool", "sailor", "gambler"].map(
  (actualRoleId, index) => ({
    seatId: `seat-${index + 1}`,
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }),
);

const dependencies = () => {
  let id = 0;
  return {
    clock: () => "2026-07-17T18:00:00Z",
    idFactory: (kind) => `${kind}-bmr-replay-${++id}`,
  };
};

const start = () => {
  const engine = createBadMoonRisingDomainProtocol({
    gameId: "game-bmr-replay",
    ...dependencies(),
  });
  engine.dispatch(
    createBadMoonRisingGameCommand({
      commandId: "create-bmr-replay",
      gameId: "game-bmr-replay",
      expectedRevision: 0,
      actor: host,
      seed: "bmr-replay-seed",
    }),
  );
  engine.dispatch(
    createBadMoonRisingStartCommand({
      commandId: "start-bmr-replay",
      gameId: "game-bmr-replay",
      expectedRevision: 1,
      actor: host,
      assignments,
    }),
  );
  return engine;
};

const kill = (engine, commandId, seatId, causeId, sourceId) =>
  engine.dispatch(
    createKillPlayerCommand({
      commandId,
      gameId: "game-bmr-replay",
      expectedRevision: engine.getState().revision,
      actor: host,
      seatId,
      causeId,
      sourceId,
    }),
  );

describe("M1-R8《黯月初升》死亡、免死与重放场景", () => {
  test("弄臣首次免死并消费能力，第二次死亡保留同一来源归因", () => {
    const engine = start();
    expect(
      kill(engine, "kill-fool-1", "seat-3", "bmr.pukka", "bmr.pukka").status,
    ).toBe("accepted");
    expect(engine.getState().seats[2].alive).toBe(true);
    expect(engine.getState().abilityInstances[2].usesConsumed).toBe(1);
    expect(
      engine.getState().badMoonRising.deathHistory.at(-1).content,
    ).toMatchObject({
      targetSeatId: "seat-3",
      causeId: "bmr.pukka",
      actuallyDied: false,
    });

    kill(engine, "kill-fool-2", "seat-3", "bmr.pukka", "bmr.pukka");
    expect(engine.getState().seats[2].alive).toBe(false);
    expect(
      engine.getState().badMoonRising.deathHistory.at(-1).content,
    ).toMatchObject({
      targetSeatId: "seat-3",
      actuallyDied: true,
    });
  });

  test("刺客无视弄臣免死且不消费弄臣能力", () => {
    const engine = start();
    kill(engine, "assassinate-fool", "seat-3", "bmr.assassin", "bmr.assassin");
    expect(engine.getState().seats[2].alive).toBe(false);
    expect(engine.getState().abilityInstances[2].usesConsumed).toBe(0);
  });

  test("僵怖第一次公开死亡但秘密存活，第二次真死后善良获胜", () => {
    const engine = start();
    kill(engine, "kill-zombuul-1", "seat-1", "execution", "execution");
    expect(engine.getState()).toMatchObject({ lifecycle: "running" });
    expect(engine.getState().seats[0]).toMatchObject({
      alive: false,
      secretlyAlive: true,
      deadVoteAvailable: true,
    });
    expect(
      engine.getState().badMoonRising.deathHistory.at(-1).content,
    ).toMatchObject({
      actuallyDied: false,
      publiclyDead: true,
      zombuulFirstDeath: true,
    });

    kill(engine, "kill-zombuul-2", "seat-1", "execution", "execution");
    expect(engine.getState()).toMatchObject({
      lifecycle: "ended",
      winner: { alignment: "good", reason: "all-demons-dead" },
    });
    expect(engine.getState().seats[0].secretlyAlive).toBe(false);
  });

  test("保护可形成无死亡夜，多个独立死亡仍按命令和来源稳定排序", () => {
    const protectedEngine = start();
    kill(
      protectedEngine,
      "kill-protected-fool",
      "seat-3",
      "bmr.zombuul",
      "bmr.zombuul",
    );
    expect(protectedEngine.getState().seats[2].alive).toBe(true);
    expect(
      protectedEngine.getState().badMoonRising.deathHistory.at(-1).content
        .actuallyDied,
    ).toBe(false);

    const multi = start();
    kill(multi, "multi-1", "seat-5", "bmr.shabaloth", "bmr.shabaloth");
    kill(multi, "multi-2", "seat-4", "bmr.shabaloth", "bmr.shabaloth");
    expect(
      multi
        .getState()
        .badMoonRising.deathHistory.map(({ content }) => [
          content.targetSeatId,
          content.causeId,
        ]),
    ).toEqual([
      ["seat-5", "bmr.shabaloth"],
      ["seat-4", "bmr.shabaloth"],
    ]);
  });

  test("完整事件流恢复死亡结果、僵怖秘密存活和能力用量", () => {
    const engine = start();
    kill(engine, "kill-fool-for-replay", "seat-3", "bmr.pukka", "bmr.pukka");
    kill(engine, "kill-zombuul-for-replay", "seat-1", "execution", "execution");
    const restored = restoreBadMoonRisingDomainProtocol(
      engine.exportEventStream(),
      dependencies(),
    );
    expect(restored.getState()).toEqual(engine.getState());
  });
});
