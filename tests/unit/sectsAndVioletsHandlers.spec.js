import { createSectsAndVioletsHandlers } from "@/domain/rulesets/sects-and-violets/handlers";
import { SECTS_AND_VIOLETS_ROLE_BY_ID } from "@/domain/rulesets/sects-and-violets";

const handlers = createSectsAndVioletsHandlers();

const stateFor = (
  roleIds,
  {
    deadSeatIds = [],
    markers = [],
    deathHistory = [],
    nominationsToday = [],
    abilityAbnormalities = [],
  } = {},
) => {
  const seats = roleIds.map((actualRoleId, index) => {
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(actualRoleId);
    return {
      seatId: `seat-${index + 1}`,
      order: index + 1,
      characterType: role.characterType,
      actualRoleId,
      perceivedRoleId: actualRoleId,
      alignment: role.alignment,
      roleInstanceId: `role-${index + 1}`,
      alive: !deadSeatIds.includes(`seat-${index + 1}`),
      deadVoteAvailable: deadSeatIds.includes(`seat-${index + 1}`),
    };
  });
  return {
    phase: "night",
    dayNumber: 2,
    nightNumber: 3,
    seats,
    nominationsToday,
    abilityConditions: [],
    abilityInstances: seats.map((seat) => ({
      instanceId: `ability-${seat.roleInstanceId}`,
      definitionId: `snv.${seat.actualRoleId}.ability`,
      ownerSeatId: seat.seatId,
      sourceRoleId: `snv.${seat.actualRoleId}`,
      sourceRoleInstanceId: seat.roleInstanceId,
      status: "active",
      usesConsumed: 0,
    })),
    sectsAndViolets: {
      setup: { goodTwinSeatId: "seat-2" },
      markers,
      deathHistory,
      abilityAbnormalities,
      information: [],
      fangGuJumpUsed: false,
    },
  };
};

const context = (state, roleId, input = {}) => {
  const owner = state.seats.find(({ actualRoleId }) => actualRoleId === roleId);
  return {
    state,
    instance: state.abilityInstances.find(
      ({ ownerSeatId }) => ownerSeatId === owner.seatId,
    ),
    trigger: {
      triggerId: `trigger-${roleId}-coverage`,
      abilityInstanceId: `ability-${owner.roleInstanceId}`,
    },
    input,
  };
};

const adjudicate = (roleId, base, input, result) => {
  const handler = handlers[`snv.${roleId}.handler`];
  const initial = handler.resolve({ ...base, input });
  const task = initial.adjudicationTask;
  expect(
    handler.validateAdjudication({
      ...base,
      task,
      result,
    }),
  ).toBeNull();
  const plan = handler.resolveAdjudication({
    ...base,
    task,
    result,
  });
  expect(plan.events).toHaveLength(1);
  return { task, plan };
};

describe("M1-R9 复杂处理器候选分支", () => {
  test("数字、布尔、角色对、陈述与贤者信息均生成受约束事件", () => {
    const state = stateFor(
      [
        "clockmaker",
        "mathematician",
        "oracle",
        "juggler",
        "dreamer",
        "seamstress",
        "flowergirl",
        "towncrier",
        "artist",
        "savant",
        "sage",
        "fanggu",
        "witch",
      ],
      {
        deadSeatIds: ["seat-11"],
        deathHistory: [
          {
            content: {
              targetSeatId: "seat-11",
              causeId: "snv.fanggu",
              actuallyDied: true,
            },
          },
        ],
        nominationsToday: [
          {
            nominatorSeatId: "seat-13",
            votes: [{ seatId: "seat-12", supports: true }],
          },
        ],
      },
    );

    adjudicate(
      "mathematician",
      context(state, "mathematician"),
      {},
      { number: 0 },
    );
    adjudicate("oracle", context(state, "oracle"), {}, { number: 0 });
    adjudicate(
      "juggler",
      context(state, "juggler"),
      {},
      {
        number: 0,
        guesses: [],
      },
    );
    adjudicate(
      "dreamer",
      context(state, "dreamer"),
      { targetSeatId: "seat-12" },
      { shownRoleIds: ["fanggu", "artist"] },
    );
    adjudicate(
      "seamstress",
      context(state, "seamstress"),
      { targetSeatIds: ["seat-1", "seat-2"] },
      { delivered: true },
    );
    adjudicate(
      "flowergirl",
      context(state, "flowergirl"),
      {},
      {
        delivered: true,
      },
    );
    adjudicate(
      "towncrier",
      context(state, "towncrier"),
      {},
      {
        delivered: true,
      },
    );
    adjudicate(
      "artist",
      context(state, "artist"),
      {},
      {
        truth: true,
        delivered: true,
      },
    );
    adjudicate(
      "savant",
      context(state, "savant"),
      {},
      {
        statements: [
          { text: "真陈述", truth: true },
          { text: "假陈述", truth: false },
        ],
      },
    );
    adjudicate(
      "sage",
      context(state, "sage"),
      {},
      {
        demonSeatId: "seat-12",
        candidateSeatIds: ["seat-12", "seat-13"],
      },
    );
  });

  test("涡流和醉酒信息分支只接受角色对应的格式与错误候选", () => {
    const state = stateFor([
      "clockmaker",
      "flowergirl",
      "savant",
      "dreamer",
      "fanggu",
      "witch",
      "vortox",
    ]);
    const clockmaker = handlers["snv.clockmaker.handler"];
    const clockContext = context(state, "clockmaker");
    const task = clockmaker.resolve(clockContext).adjudicationTask;
    expect(
      clockmaker.validateAdjudication({
        ...clockContext,
        task,
        result: { number: 2 },
      }),
    ).toBeNull();

    for (const [roleId, result] of [
      ["clockmaker", { number: 4 }],
      ["flowergirl", { delivered: false }],
      [
        "savant",
        {
          statements: [
            { text: "甲", truth: false },
            { text: "乙", truth: false },
          ],
        },
      ],
      ["dreamer", { shownRoleIds: ["artist", "witch"] }],
    ]) {
      const base = context(state, roleId);
      const handler = handlers[`snv.${roleId}.handler`];
      const input = roleId === "dreamer" ? { targetSeatId: "seat-5" } : {};
      const intoxicated = handler.createIntoxicatedAdjudication({
        ...base,
        input,
      });
      expect(
        handler.validateAdjudication({
          ...base,
          task: intoxicated.adjudicationTask,
          result,
        }),
      ).toBeNull();
      expect(
        handler.resolveAdjudication({
          ...base,
          task: intoxicated.adjudicationTask,
          result,
        }).events[0].payload.truthful,
      ).toBe(false);
    }
    expect(
      clockmaker.validateAdjudication({
        ...clockContext,
        task: { ...task, kind: "snv.oracle.information" },
        result: { number: 1 },
      }),
    ).toMatchObject({ code: "INVALID_ADJUDICATION_RESULT" });
  });

  test("哲学家、疯狂、理发师、女巫与麻脸巫婆覆盖正常和拒绝候选", () => {
    const state = stateFor(
      [
        "philosopher",
        "clockmaker",
        "mutant",
        "cerenovus",
        "barber",
        "witch",
        "pithag",
        "fanggu",
      ],
      {
        deadSeatIds: ["seat-5"],
        deathHistory: [
          {
            content: {
              targetSeatId: "seat-5",
              causeId: "snv.fanggu",
              actuallyDied: true,
            },
          },
        ],
        markers: [
          {
            recordId: "old-witch-curse",
            type: "witch-cursed",
            content: {
              ownerSeatId: "seat-6",
              targetSeatIds: ["seat-2"],
              active: true,
              persistent: false,
            },
          },
        ],
      },
    );

    const philosopher = handlers["snv.philosopher.handler"];
    const philosopherContext = context(state, "philosopher", {
      roleId: "clockmaker",
    });
    expect(philosopher.validateInput(philosopherContext)).toBeNull();
    expect(
      philosopher.resolve(philosopherContext).events[0].payload.drunkSeatId,
    ).toBe("seat-2");
    expect(
      philosopher.validateInput({
        ...philosopherContext,
        input: { roleId: "witch" },
      }),
    ).toMatchObject({ code: "INVALID_ABILITY_INPUT" });

    const cerenovus = handlers["snv.cerenovus.handler"];
    const cerenovusContext = context(state, "cerenovus", {
      targetSeatId: "seat-2",
      roleId: "artist",
    });
    expect(cerenovus.validateInput(cerenovusContext)).toBeNull();
    expect(cerenovus.resolve(cerenovusContext).events).toHaveLength(2);
    expect(
      cerenovus.resolve({
        ...cerenovusContext,
        input: {
          targetSeatId: "seat-2",
          ruling: "not-complied",
          execute: true,
          evidenceSummary: "拒绝声称",
        },
      }).events,
    ).toHaveLength(2);
    expect(
      cerenovus.validateInput({
        ...cerenovusContext,
        input: { targetSeatId: "missing", roleId: "artist" },
      }),
    ).toMatchObject({ code: "INVALID_ABILITY_INPUT" });

    const mutant = handlers["snv.mutant.handler"];
    const mutantContext = context(state, "mutant", {
      ruling: "no-ruling",
      execute: false,
    });
    expect(mutant.validateInput(mutantContext)).toBeNull();
    expect(mutant.resolve(mutantContext).events).toHaveLength(1);

    const barber = handlers["snv.barber.handler"];
    const barberContext = context(state, "barber", {
      targetSeatIds: ["seat-2", "seat-3"],
    });
    expect(barber.validateInput(barberContext)).toBeNull();
    expect(barber.resolve(barberContext).events).toHaveLength(2);
    expect(
      barber.validateInput({
        ...barberContext,
        input: { targetSeatIds: ["seat-8", "seat-2"] },
      }),
    ).toMatchObject({ code: "INVALID_ABILITY_INPUT" });

    expect(
      handlers["snv.witch.handler"].resolve(
        context(state, "witch", { targetSeatId: "seat-3" }),
      ).events,
    ).toHaveLength(2);

    const pithag = handlers["snv.pithag.handler"];
    const pithagContext = context(state, "pithag", {
      targetSeatId: "seat-2",
      roleId: "dreamer",
    });
    const demonPlan = pithag.resolve(pithagContext);
    expect(demonPlan.events[0].payload.newRoleId).toBe("dreamer");
    const existingPlan = pithag.resolve({
      ...pithagContext,
      input: { targetSeatId: "seat-2", roleId: "clockmaker" },
    });
    expect(existingPlan.events[0].payload.result.changed).toBe(false);
    const createsDemon = pithag.resolve({
      ...pithagContext,
      input: { targetSeatId: "seat-2", roleId: "vortox" },
    });
    expect(createsDemon.adjudicationTask).not.toBeNull();
    expect(
      pithag.validateAdjudication({
        task: createsDemon.adjudicationTask,
        result: { deathSeatIds: ["seat-2"] },
      }),
    ).toBeNull();
    expect(
      pithag.resolveAdjudication({
        state,
        task: createsDemon.adjudicationTask,
        result: { deathSeatIds: ["seat-2"] },
      }).events,
    ).toHaveLength(1);
  });

  test("死亡、被动与亡骨魔保留能力分支不越过固定条件", () => {
    const state = stateFor(
      ["klutz", "eviltwin", "witch", "pithag", "nodashii", "clockmaker"],
      {
        deadSeatIds: ["seat-1", "seat-3"],
        deathHistory: [
          {
            content: {
              targetSeatId: "seat-1",
              causeId: "snv.nodashii",
              actuallyDied: true,
            },
          },
        ],
        markers: [
          {
            recordId: "retained-witch",
            type: "vigormortis-retains-ability",
            content: {
              ownerSeatId: "seat-3",
              targetSeatIds: ["seat-3"],
              active: true,
              persistent: true,
            },
          },
        ],
      },
    );
    const klutz = handlers["snv.klutz.handler"];
    const klutzContext = context(state, "klutz", { targetSeatId: "seat-2" });
    expect(klutz.validateInput(klutzContext)).toBeNull();
    expect(klutz.resolve(klutzContext).events).toHaveLength(2);

    expect(
      handlers["snv.eviltwin.handler"].resolve(context(state, "eviltwin", {}))
        .events[0].payload.markerType,
    ).toBe("evil-twin-pair");
    expect(
      handlers["snv.witch.handler"].resolveSuppressed(
        context(state, "witch", { targetSeatId: "seat-6" }),
      ).events,
    ).toHaveLength(1);
    expect(
      handlers["snv.pithag.handler"].resolveSuppressed(
        context(state, "pithag", { targetSeatId: "seat-6", roleId: "artist" }),
      ).events,
    ).toHaveLength(0);

    const noDashii = handlers["snv.nodashii.handler"];
    expect(
      noDashii.resolve(context(state, "nodashii", { targetSeatId: "seat-6" }))
        .events,
    ).toHaveLength(2);
    state.seats[5].alive = false;
    expect(
      noDashii.resolve(context(state, "nodashii", { targetSeatId: "seat-6" }))
        .events,
    ).toHaveLength(0);
  });
});
