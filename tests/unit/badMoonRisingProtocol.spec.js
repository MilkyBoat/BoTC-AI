import { PROTOCOL_VERSION } from "@/domain/protocol";
import {
  BAD_MOON_RISING_ROLE_PACKAGE,
  createBadMoonRisingDomainProtocol,
  createBadMoonRisingGameCommand,
  createBadMoonRisingStartCommand,
  generateBadMoonRisingSetup,
  restoreBadMoonRisingDomainProtocol,
} from "@/domain/rulesets/bad-moon-rising";

const host = { kind: "host", id: "host-1" };
const dependencies = () => {
  let id = 0;
  let time = 0;
  return {
    idFactory: (prefix) => `${prefix}-${++id}`,
    clock: () => `2026-07-17T00:00:${String(time++).padStart(2, "0")}Z`,
  };
};

const createStartedGame = () => {
  const setup = generateBadMoonRisingSetup({
    playerCount: 10,
    seed: "bmr-protocol-seed",
  });
  const engine = createBadMoonRisingDomainProtocol({
    gameId: "game-bmr",
    ...dependencies(),
  });
  engine.dispatch(
    createBadMoonRisingGameCommand({
      commandId: "create-bmr",
      gameId: "game-bmr",
      expectedRevision: 0,
      actor: host,
      seed: "bmr-protocol-seed",
    }),
  );
  engine.dispatch(
    createBadMoonRisingStartCommand({
      commandId: "start-bmr",
      gameId: "game-bmr",
      expectedRevision: engine.getState().revision,
      actor: host,
      ...setup,
    }),
  );
  return { engine, setup };
};

describe("M1-R8 领域协议 0.7.0 与《黯月初升》绑定", () => {
  test("协议升级并固定规则包身份和严格 BMR 子状态", () => {
    expect(PROTOCOL_VERSION).toBe("0.7.0");
    const { engine, setup } = createStartedGame();
    expect(engine.getState()).toMatchObject({
      lifecycle: "running",
      phase: "first-night",
      rulePackage: BAD_MOON_RISING_ROLE_PACKAGE.identity,
      badMoonRising: {
        packageId: "botc-ai.bad-moon-rising",
        version: "0.1.0",
        setup: {
          godfatherDelta: setup.godfatherDelta,
          grandchildSeatId: setup.grandchildSeatId,
        },
      },
    });
    expect(engine.getState()).not.toHaveProperty("troubleBrewing");
  });

  test("首夜队列使用包内优先级且只包含在场角色", () => {
    const { engine } = createStartedGame();
    const roleOrder = engine
      .getState()
      .abilityTriggers.filter(({ status }) => status === "pending")
      .map(({ definitionTriggerId }) => definitionTriggerId.split(".")[1]);
    const expected = [
      "lunatic",
      "sailor",
      "courtier",
      "godfather",
      "devilsadvocate",
      "pukka",
      "grandmother",
      "chambermaid",
    ].filter((roleId) =>
      engine
        .getState()
        .seats.some(({ actualRoleId }) => actualRoleId === roleId),
    );
    expect(roleOrder).toEqual(expected);
  });

  test("导出后必须用同一包恢复，BMR 状态和队列一致", () => {
    const { engine } = createStartedGame();
    const stream = engine.exportEventStream();
    const restored = restoreBadMoonRisingDomainProtocol(stream);
    expect(restored.getState()).toEqual(engine.getState());
    expect(() =>
      restoreBadMoonRisingDomainProtocol({
        ...stream,
        rulePackage: { ...stream.rulePackage, version: "0.1.1" },
      }),
    ).toThrow();
  });

  test("未知 BMR 状态字段失败关闭", () => {
    const setup = generateBadMoonRisingSetup({
      playerCount: 10,
      seed: "bmr-invalid-state",
    });
    const command = JSON.parse(
      JSON.stringify(
        createBadMoonRisingStartCommand({
          commandId: "invalid-start",
          gameId: "game-bmr",
          expectedRevision: 1,
          actor: host,
          ...setup,
        }),
      ),
    );
    command.payload.badMoonRising.patch = {};
    const engine = createBadMoonRisingDomainProtocol({
      gameId: "game-bmr",
      ...dependencies(),
    });
    engine.dispatch(
      createBadMoonRisingGameCommand({
        commandId: "create-invalid",
        gameId: "game-bmr",
        expectedRevision: 0,
        actor: host,
        seed: "bmr-invalid-state",
      }),
    );
    expect(() => engine.dispatch(command)).toThrow();
  });
});
