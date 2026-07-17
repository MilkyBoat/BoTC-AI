import { PROTOCOL_VERSION } from "@/domain/protocol";
import {
  SECTS_AND_VIOLETS_ROLE_PACKAGE,
  createSectsAndVioletsDomainProtocol,
  createSectsAndVioletsGameCommand,
  createSectsAndVioletsStartCommand,
  generateSectsAndVioletsSetup,
  restoreSectsAndVioletsDomainProtocol,
} from "@/domain/rulesets/sects-and-violets";

const host = { kind: "host", id: "host-snv" };
const dependencies = () => {
  let id = 0;
  let time = 0;
  return {
    idFactory: (prefix) => `${prefix}-snv-${++id}`,
    clock: () => `2026-07-17T10:00:${String(time++).padStart(2, "0")}Z`,
  };
};

const createStartedGame = () => {
  const setup = generateSectsAndVioletsSetup({
    playerCount: 10,
    seed: "snv-protocol-seed",
  });
  const engine = createSectsAndVioletsDomainProtocol({
    gameId: "game-snv",
    ...dependencies(),
  });
  engine.dispatch(
    createSectsAndVioletsGameCommand({
      commandId: "create-snv",
      gameId: "game-snv",
      expectedRevision: 0,
      actor: host,
      seed: "snv-protocol-seed",
    }),
  );
  engine.dispatch(
    createSectsAndVioletsStartCommand({
      commandId: "start-snv",
      gameId: "game-snv",
      expectedRevision: 1,
      actor: host,
      ...setup,
    }),
  );
  return { engine, setup };
};

describe("M1-R9 领域协议 0.7.0 与《梦殒春宵》绑定", () => {
  test("开局原子绑定严格规则包子状态", () => {
    expect(PROTOCOL_VERSION).toBe("0.7.0");
    const { engine } = createStartedGame();
    expect(engine.getState()).toMatchObject({
      lifecycle: "running",
      phase: "first-night",
      rulePackage: SECTS_AND_VIOLETS_ROLE_PACKAGE.identity,
      sectsAndViolets: {
        packageId: "botc-ai.sects-and-violets",
        version: "0.1.0",
        setup: expect.objectContaining({
          fangGuDelta: expect.any(Number),
          vigormortisDelta: expect.any(Number),
        }),
      },
    });
    expect(engine.getState()).not.toHaveProperty("troubleBrewing");
    expect(engine.getState()).not.toHaveProperty("badMoonRising");
  });

  test("首夜队列只包含在场角色并遵循固定顺序", () => {
    const { engine } = createStartedGame();
    const actual = engine
      .getState()
      .abilityTriggers.filter(({ status }) => status === "pending")
      .map(({ definitionTriggerId }) => definitionTriggerId.split(".")[1]);
    const expectedOrder = [
      "philosopher",
      "snakecharmer",
      "eviltwin",
      "witch",
      "cerenovus",
      "clockmaker",
      "dreamer",
      "seamstress",
      "mathematician",
    ];
    expect(actual).toEqual(
      expectedOrder.filter((roleId) =>
        engine
          .getState()
          .seats.some(({ actualRoleId }) => actualRoleId === roleId),
      ),
    );
  });

  test("事件流仅能使用同一规则包完整恢复", () => {
    const { engine } = createStartedGame();
    const stream = engine.exportEventStream();
    const restored = restoreSectsAndVioletsDomainProtocol(stream);
    expect(restored.getState()).toEqual(engine.getState());
    expect(() =>
      restoreSectsAndVioletsDomainProtocol({
        ...stream,
        rulePackage: { ...stream.rulePackage, version: "0.1.1" },
      }),
    ).toThrow();
  });

  test("未知 SNV 状态字段失败关闭", () => {
    const setup = generateSectsAndVioletsSetup({
      playerCount: 10,
      seed: "snv-invalid-state",
    });
    const command = JSON.parse(
      JSON.stringify(
        createSectsAndVioletsStartCommand({
          commandId: "invalid-snv-start",
          gameId: "game-invalid-snv",
          expectedRevision: 1,
          actor: host,
          ...setup,
        }),
      ),
    );
    command.payload.sectsAndViolets.patch = {};
    const engine = createSectsAndVioletsDomainProtocol({
      gameId: "game-invalid-snv",
      ...dependencies(),
    });
    engine.dispatch(
      createSectsAndVioletsGameCommand({
        commandId: "create-invalid-snv",
        gameId: "game-invalid-snv",
        expectedRevision: 0,
        actor: host,
        seed: "snv-invalid-state",
      }),
    );
    expect(() => engine.dispatch(command)).toThrow();
  });
});
