import {
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  PROTOCOL_VERSION,
  createDomainProtocol,
  createGameCommand,
  createRoleAbilityPackage,
  restoreDomainProtocol,
} from "@/domain/protocol";
import {
  assertBasicStateInvariants,
  createAdvancePhaseCommand,
  createKillPlayerCommand,
  createResolveExecutionCommand,
  createStartGameCommand,
} from "@/domain/rules";

const GAME_ID = "game-m1-r7-protocol-hooks";
const HOST = Object.freeze({ kind: "host", id: "host-m1-r7" });

const 基础席位 = Object.freeze([
  {
    seatId: "seat-demon",
    order: 1,
    characterType: "demon",
    actualRoleId: "imp",
    perceivedRoleId: "imp",
    alignment: "evil",
    roleInstanceId: "role-instance-imp",
  },
  {
    seatId: "seat-townsfolk",
    order: 2,
    characterType: "townsfolk",
    actualRoleId: "washerwoman",
    perceivedRoleId: "washerwoman",
    alignment: "good",
    roleInstanceId: "role-instance-washerwoman",
  },
  {
    seatId: "seat-minion",
    order: 3,
    characterType: "minion",
    actualRoleId: "poisoner",
    perceivedRoleId: "poisoner",
    alignment: "evil",
    roleInstanceId: "role-instance-poisoner",
  },
]);

const 暗流涌动状态 = Object.freeze({
  packageId: "botc-ai.trouble-brewing",
  version: "0.1.0",
  setup: {
    redHerringSeatId: "seat-townsfolk",
    demonBluffs: ["chef", "empath", "slayer"],
    evilTeamSeatIds: ["seat-demon", "seat-minion"],
  },
  information: [],
  markers: [
    {
      recordId: "marker-red-herring",
      type: "red-herring",
      content: { seatId: "seat-townsfolk" },
    },
  ],
  deathHistory: [],
  registrationHistory: [],
  publicActions: [],
  butlerViolations: [],
});

const 创建依赖 = () => {
  let 序号 = 0;
  return {
    clock: () => "2026-07-17T16:00:00.000Z",
    idFactory: (类别) => `${类别}-m1-r7-${++序号}`,
  };
};

const 创建引擎 = (角色包 = M1_ROLE_ABILITY_FRAMEWORK_PACKAGE) =>
  createDomainProtocol({
    gameId: GAME_ID,
    rolePackage: 角色包,
    ...创建依赖(),
  });

const 初始化 = (引擎, 角色包 = M1_ROLE_ABILITY_FRAMEWORK_PACKAGE) =>
  引擎.dispatch(
    createGameCommand({
      commandId: "command-create-m1-r7",
      gameId: GAME_ID,
      expectedRevision: 0,
      actor: HOST,
      seed: "seed-m1-r7-protocol-hooks",
      rulePackage: 角色包.identity,
    }),
  );

const 开始命令 = (引擎, 覆盖 = {}) =>
  createStartGameCommand({
    commandId: "command-start-m1-r7",
    gameId: GAME_ID,
    expectedRevision: 引擎.getState().revision,
    actor: HOST,
    seats: 基础席位,
    troubleBrewing: 暗流涌动状态,
    ...覆盖,
  });

const 用钩子创建角色包 = (ruleHooks) =>
  createRoleAbilityPackage({
    manifest: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.manifest,
    ruleHooks,
  });

describe("M1-R7 在领域协议 0.6.0 下的角色包结算钩子回归", () => {
  test("协议升级为 0.6.0，普通空框架对局仍可不带剧本字段", () => {
    expect(PROTOCOL_VERSION).toBe("0.6.0");
    const 引擎 = 创建引擎();
    初始化(引擎);

    const 回执 = 引擎.dispatch(
      createStartGameCommand({
        commandId: "command-start-empty-framework",
        gameId: GAME_ID,
        expectedRevision: 1,
        actor: HOST,
        seats: 基础席位.map(({ seatId, order, characterType }) => ({
          seatId,
          order,
          characterType,
        })),
      }),
    );

    expect(回执.status).toBe("accepted");
    expect(引擎.getState()).not.toHaveProperty("troubleBrewing");
  });

  test("0.5.0 旧事件流不会被 0.6.0 静默迁移", () => {
    const 引擎 = 创建引擎();
    初始化(引擎);
    const 旧流 = JSON.parse(JSON.stringify(引擎.exportEventStream()));
    旧流.formatVersion = "0.5.0";
    旧流.protocolVersion = "0.5.0";

    expect(() =>
      restoreDomainProtocol(旧流, {
        ...创建依赖(),
        rolePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
      }),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_STREAM_FORMAT" }));
  });

  test("game.start 将严格角色真相和《暗流涌动》子状态原子写入事件与状态", () => {
    const 引擎 = 创建引擎();
    初始化(引擎);

    expect(引擎.dispatch(开始命令(引擎)).status).toBe("accepted");
    expect(引擎.getEvents().at(-1).payload).toMatchObject({
      seats: 基础席位,
      troubleBrewing: 暗流涌动状态,
    });
    expect(引擎.getState()).toMatchObject({
      seats: 基础席位,
      troubleBrewing: 暗流涌动状态,
    });
  });

  test.each([
    ["席位未知字段", (命令) => (命令.payload.seats[0].secret = true)],
    ["剧本状态未知字段", (命令) => (命令.payload.troubleBrewing.patch = {})],
    [
      "剧本记录未知字段",
      (命令) => (命令.payload.troubleBrewing.markers[0].secret = true),
    ],
    [
      "非 JSON object 记录内容",
      (命令) => (命令.payload.troubleBrewing.markers[0].content = []),
    ],
  ])("严格 Schema 拒绝%s", (_名称, 篡改) => {
    const 引擎 = 创建引擎();
    初始化(引擎);
    const 命令 = JSON.parse(JSON.stringify(开始命令(引擎)));
    篡改(命令);

    expect(() => 引擎.dispatch(命令)).toThrow(
      expect.objectContaining({ code: "INVALID_COMMAND_PAYLOAD" }),
    );
  });

  test("validateGameStart 以稳定领域错误拒绝剧本开局", () => {
    const 角色包 = 用钩子创建角色包({
      validateGameStart: () => ({
        code: "TB_INVALID_SETUP",
        message: "暗流涌动开局不受理",
        details: { reason: "fixed-test" },
      }),
    });
    const 引擎 = 创建引擎(角色包);
    初始化(引擎, 角色包);

    expect(引擎.dispatch(开始命令(引擎))).toMatchObject({
      status: "rejected",
      error: {
        code: "TB_INVALID_SETUP",
        message: "暗流涌动开局不受理",
        details: { reason: "fixed-test" },
      },
    });
  });

  test("结算钩子只读暴露，非空返回覆盖阶段、死亡和处决默认逻辑", () => {
    const 角色包 = 用钩子创建角色包({
      handlePhaseAdvance: ({ state, reject }) =>
        state.phase === "day"
          ? reject("TB_PHASE_BLOCKED", "剧本钩子暂停阶段推进")
          : null,
      handleKill: ({ reject }) =>
        reject("TB_KILL_DEFERRED", "剧本钩子接管死亡结算"),
      handleExecution: ({ reject }) =>
        reject("TB_EXECUTION_DEFERRED", "剧本钩子接管处决结算"),
    });
    expect(Object.isFrozen(角色包.ruleHooks)).toBe(true);
    expect(Object.keys(角色包.ruleHooks)).toEqual([
      "handleExecution",
      "handleKill",
      "handlePhaseAdvance",
    ]);
    const 引擎 = 创建引擎(角色包);
    初始化(引擎, 角色包);
    expect(引擎.dispatch(开始命令(引擎)).status).toBe("accepted");

    expect(
      引擎.dispatch(
        createAdvancePhaseCommand({
          commandId: "command-to-day-before-hook",
          gameId: GAME_ID,
          expectedRevision: 2,
          actor: HOST,
        }),
      ).status,
    ).toBe("accepted");
    expect(
      引擎.dispatch(
        createAdvancePhaseCommand({
          commandId: "command-hook-phase",
          gameId: GAME_ID,
          expectedRevision: 3,
          actor: HOST,
        }),
      ),
    ).toMatchObject({ error: { code: "TB_PHASE_BLOCKED" } });
    expect(
      引擎.dispatch(
        createKillPlayerCommand({
          commandId: "command-hook-kill",
          gameId: GAME_ID,
          expectedRevision: 3,
          actor: HOST,
          seatId: "seat-townsfolk",
          causeId: "test-hook",
        }),
      ),
    ).toMatchObject({ error: { code: "TB_KILL_DEFERRED" } });

    const 引擎处决 = 创建引擎(角色包);
    初始化(引擎处决, 角色包);
    expect(引擎处决.dispatch(开始命令(引擎处决)).status).toBe("accepted");
    expect(
      引擎处决.dispatch(
        createAdvancePhaseCommand({
          commandId: "command-default-phase",
          gameId: GAME_ID,
          expectedRevision: 2,
          actor: HOST,
        }),
      ).status,
    ).toBe("accepted");
    expect(
      引擎处决.dispatch(
        createResolveExecutionCommand({
          commandId: "command-hook-execution",
          gameId: GAME_ID,
          expectedRevision: 3,
          actor: HOST,
          seatId: "seat-townsfolk",
        }),
      ),
    ).toMatchObject({ error: { code: "TB_EXECUTION_DEFERRED" } });
  });

  test("未知钩子和非函数钩子在角色包加载时失败关闭", () => {
    expect(() => 用钩子创建角色包({ patchState: () => null })).toThrow(
      expect.objectContaining({ code: "INVALID_ROLE_PACKAGE_RUNTIME" }),
    );
    expect(() => 用钩子创建角色包({ handleKill: true })).toThrow(
      expect.objectContaining({ code: "INVALID_ROLE_PACKAGE_RUNTIME" }),
    );
  });

  test.each([
    ["saint-executed", "evil"],
    ["mayor-three-alive-no-execution", "good"],
  ])("基础不变量保留%s给角色包扩展继续验证", (reason, alignment) => {
    const 引擎 = 创建引擎();
    初始化(引擎);
    引擎.dispatch(
      createStartGameCommand({
        commandId: `command-start-special-${reason}`,
        gameId: GAME_ID,
        expectedRevision: 1,
        actor: HOST,
        seats: 基础席位,
      }),
    );
    const 运行状态 = JSON.parse(JSON.stringify(引擎.getState()));
    const 特殊终局 = {
      ...运行状态,
      lifecycle: "ended",
      phase: "ended",
      winner: {
        alignment,
        reason,
        decidedAtRevision: 运行状态.revision,
      },
    };

    expect(() => assertBasicStateInvariants(特殊终局)).not.toThrow();
  });

  test("特殊胜利状态通过 Schema 后仍会执行扩展不变量", () => {
    let 扩展已验证 = false;
    const 引擎 = createDomainProtocol({
      gameId: GAME_ID,
      ...创建依赖(),
      commandDefinitions: [
        {
          type: "test.special-win",
          payloadSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
          },
          handle: () => ({
            events: [{ type: "test.special-won", payload: {} }],
          }),
        },
      ],
      eventDefinitions: [
        {
          type: "test.special-won",
          payloadSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
          },
          reduce: (state, event) => ({
            ...state,
            lifecycle: "ended",
            phase: "ended",
            winner: {
              alignment: "good",
              reason: "mayor-three-alive-no-execution",
              decidedAtRevision: event.sequence,
            },
          }),
        },
      ],
      stateInvariants: [
        {
          id: "test.mayor-special-win",
          assert: (state) => {
            if (state?.winner?.reason === "mayor-three-alive-no-execution") {
              扩展已验证 = true;
            }
          },
        },
      ],
    });
    初始化(引擎);
    引擎.dispatch(
      createStartGameCommand({
        commandId: "command-start-special-extension",
        gameId: GAME_ID,
        expectedRevision: 1,
        actor: HOST,
        seats: 基础席位,
      }),
    );

    const 回执 = 引擎.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: "command-special-win",
      gameId: GAME_ID,
      expectedRevision: 2,
      actor: HOST,
      type: "test.special-win",
      payload: {},
    });

    expect(回执.status).toBe("accepted");
    expect(扩展已验证).toBe(true);
    expect(引擎.getState().winner).toEqual({
      alignment: "good",
      reason: "mayor-three-alive-no-execution",
      decidedAtRevision: 3,
    });
  });
});
