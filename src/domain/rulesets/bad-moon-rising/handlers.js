import { EVENT_TYPES } from "../../protocol";
import {
  createBadMoonRisingDeathPlan,
  createBadMoonRisingRevivalPlan,
} from "./hooks";
import {
  resolveCourtierChoice,
  resolveDevilsAdvocateChoice,
  resolveExorcistChoice,
  resolveGamblerGuess,
  resolveGossipStatement,
  resolveInnkeeperChoice,
  resolveLunaticAction,
  resolveMoonchildChoice,
  resolvePoNight,
  resolveProfessorChoice,
  resolvePukkaNight,
  resolveSailorChoice,
  resolveShabalothNight,
  resolveTinkerDeath,
} from "./rules";
import {
  BAD_MOON_RISING_ROLE_BY_ID,
  BAD_MOON_RISING_ROLE_CATALOG,
} from "./catalog";
import { BAD_MOON_RISING_EVENT_TYPES } from "./events";

const emptyPlan = (consumeUse = false, overrides = {}) => ({
  events: [],
  ongoingEffects: [],
  delayedEffects: [],
  adjudicationTask: null,
  consumeUse,
  ...overrides,
});

const inputError = (message) => ({
  code: "INVALID_ABILITY_INPUT",
  message,
});
const adjudicationError = (message) => ({
  code: "INVALID_ADJUDICATION_RESULT",
  message,
});
const source = (roleId) => `zh-wiki-role-${roleId}`;
const seat = (state, seatId) =>
  state.seats.find(({ seatId: current }) => current === seatId);

const actionEvent = (
  roleId,
  basis,
  actorSeatId,
  targetSeatIds,
  result,
  isPublic = false,
) => ({
  type: BAD_MOON_RISING_EVENT_TYPES.ACTION_RECORDED,
  payload: {
    recordId: `action-${basis}`,
    actionType: `bmr.${roleId}`,
    actorSeatId,
    targetSeatIds,
    result,
    public: isPublic,
    ruleSourceIds: [source(roleId)],
  },
});

const markerEvent = (
  roleId,
  basis,
  ownerSeatId,
  markerType,
  targetSeatIds,
  remainingPhaseTransitions,
  active = true,
) => ({
  type: BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
  payload: {
    recordId: `marker-${basis}-${markerType}-${ownerSeatId}`,
    markerType,
    ownerSeatId,
    targetSeatIds,
    remainingPhaseTransitions,
    active,
    ruleSourceIds: [source(roleId)],
  },
});

const clearMarkerEvent = (roleId, marker) => ({
  type: BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
  payload: {
    recordId: marker.recordId,
    markerType: marker.type,
    ownerSeatId: marker.content.ownerSeatId,
    targetSeatIds: marker.content.targetSeatIds,
    remainingPhaseTransitions: marker.content.remainingPhaseTransitions,
    active: false,
    ruleSourceIds: [source(roleId)],
  },
});

const seatsAfterOutcome = (state, outcome) =>
  state.seats.map((current) => {
    if (current.seatId !== outcome.targetSeatId) return current;
    if (outcome.zombuulFirstDeath) {
      return { ...current, alive: false, secretlyAlive: true };
    }
    if (outcome.actuallyDied) {
      return { ...current, alive: false, secretlyAlive: false };
    }
    return current;
  });

const abilityDeathEvents = (
  state,
  { basis, targetSeatId, roleId, ignoresProtection = false },
) => {
  const plan = createBadMoonRisingDeathPlan(state, {
    basis,
    targetSeatId,
    causeId: `bmr.${roleId}`,
    sourceId: `bmr.${roleId}`,
    ignoresProtection,
  });
  const events = plan.events.filter(({ type }) =>
    [
      BAD_MOON_RISING_EVENT_TYPES.ABILITY_USE_CONSUMED,
      BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
    ].includes(type),
  );
  const terminal = plan.events.find(
    ({ type }) => type === EVENT_TYPES.GAME_ENDED,
  );
  if (terminal) {
    events.push({
      type: BAD_MOON_RISING_EVENT_TYPES.GAME_ENDED,
      payload: {
        alignment: terminal.payload.alignment,
        reason: terminal.payload.reason,
        ruleSourceIds: [source(roleId)],
      },
    });
  }
  return events;
};

const simpleTargetValidation = ({ state, input }) =>
  input.targetSeatId && seat(state, input.targetSeatId)
    ? null
    : inputError("能力必须选择当前对局中的一个席位");

const createSailorHandler = () => ({
  validateInput: ({ state, input }) =>
    seat(state, input.targetSeatId)?.alive
      ? null
      : inputError("水手必须选择自己或一名存活玩家"),
  resolve: ({ instance, trigger, input }) =>
    emptyPlan(false, {
      adjudicationTask: {
        taskId: `task-${trigger.triggerId}`,
        kind: `bmr.sailor.drunk:${instance.ownerSeatId}:${input.targetSeatId}`,
        summary: "在水手与所选玩家中决定一名醉酒者",
        candidateSeatIds: [
          ...new Set([instance.ownerSeatId, input.targetSeatId]),
        ],
      },
    }),
  validateAdjudication: ({ task, result }) =>
    task.candidateSeatIds.includes(result.drunkSeatId)
      ? null
      : adjudicationError("水手醉酒裁量必须来自两名合法候选"),
  resolveAdjudication: ({ state, instance, task, result }) => {
    const targetSeatId = task.candidateSeatIds.find(
      (seatId) => seatId !== instance.ownerSeatId,
    );
    resolveSailorChoice(
      state,
      instance.ownerSeatId,
      targetSeatId ?? instance.ownerSeatId,
      result.drunkSeatId,
    );
    return emptyPlan(false, {
      events: [
        markerEvent(
          "sailor",
          task.taskId,
          instance.ownerSeatId,
          "death-protection",
          [instance.ownerSeatId],
          2,
        ),
        markerEvent(
          "sailor",
          task.taskId,
          instance.ownerSeatId,
          "drunk",
          [result.drunkSeatId],
          2,
        ),
      ],
    });
  },
});

const chambermaidHandler = {
  validateInput: ({ state, instance, input }) =>
    Array.isArray(input.targetSeatIds) &&
    input.targetSeatIds.length === 2 &&
    new Set(input.targetSeatIds).size === 2 &&
    !input.targetSeatIds.includes(instance.ownerSeatId) &&
    input.targetSeatIds.every((seatId) => seat(state, seatId)?.alive)
      ? null
      : inputError("侍女必须选择除自己外两名不同的存活玩家"),
  resolve: ({ trigger, input }) =>
    emptyPlan(false, {
      adjudicationTask: {
        taskId: `task-${trigger.triggerId}`,
        kind: "bmr.chambermaid.information",
        summary: "结算两名目标当夜因自身能力被唤醒的人数",
        candidateSeatIds: input.targetSeatIds,
      },
    }),
  createIntoxicatedAdjudication: ({ trigger, input }) =>
    emptyPlan(false, {
      adjudicationTask: {
        taskId: `task-${trigger.triggerId}`,
        kind: "bmr.chambermaid.misinformation",
        summary: "为失效的侍女选择 0 至 2 的格式合法信息",
        candidateSeatIds: input.targetSeatIds,
      },
    }),
  validateAdjudication: ({ result }) =>
    Number.isInteger(result.number) && result.number >= 0 && result.number <= 2
      ? null
      : adjudicationError("侍女信息必须是 0 至 2 的整数"),
  resolveAdjudication: ({ instance, task, result }) =>
    emptyPlan(false, {
      events: [
        {
          type: BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED,
          payload: {
            recordId: `information-${task.taskId}`,
            recipientSeatId: instance.ownerSeatId,
            sourceRoleId: "chambermaid",
            result: {
              kind: task.kind.includes("misinformation")
                ? "misinformation"
                : "wake-count",
              number: result.number,
            },
            ruleSourceIds: [source("chambermaid")],
          },
        },
      ],
    }),
};

const exorcistHandler = {
  validateInput: simpleTargetValidation,
  resolve: ({ state, instance, trigger, input }) => {
    const previous = (state.badMoonRising.markers ?? []).find(
      ({ type, content }) =>
        type === "exorcist-target" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    const outcome = resolveExorcistChoice(
      state,
      instance.ownerSeatId,
      input.targetSeatId,
      previous?.content.targetSeatIds[0] ?? null,
    );
    return emptyPlan(false, {
      events: [
        markerEvent(
          "exorcist",
          "exorcist-current-target",
          instance.ownerSeatId,
          "exorcist-target",
          [input.targetSeatId],
          3,
        ),
        ...(outcome.preventsWake
          ? [
              markerEvent(
                "exorcist",
                trigger.triggerId,
                instance.ownerSeatId,
                "demon-wake-blocked",
                [input.targetSeatId],
                1,
              ),
            ]
          : []),
      ],
    });
  },
};

const createInnkeeperHandler = () => ({
  validateInput: ({ state, input }) =>
    Array.isArray(input.targetSeatIds) &&
    input.targetSeatIds.length === 2 &&
    new Set(input.targetSeatIds).size === 2 &&
    input.targetSeatIds.every((seatId) => seat(state, seatId)?.alive)
      ? null
      : inputError("旅店老板必须选择两名不同的存活玩家"),
  resolve: ({ trigger, input }) =>
    emptyPlan(false, {
      adjudicationTask: {
        taskId: `task-${trigger.triggerId}`,
        kind: `bmr.innkeeper.drunk:${input.targetSeatIds.join(":")}`,
        summary: "在旅店老板的两名目标中决定一名醉酒者",
        candidateSeatIds: input.targetSeatIds,
      },
    }),
  validateAdjudication: ({ task, result }) =>
    task.candidateSeatIds.includes(result.drunkSeatId)
      ? null
      : adjudicationError("旅店老板醉酒裁量必须来自两名目标"),
  resolveAdjudication: ({ state, instance, task, result }) => {
    const outcome = resolveInnkeeperChoice(
      state,
      instance.ownerSeatId,
      task.candidateSeatIds,
      result.drunkSeatId,
    );
    return emptyPlan(false, {
      events: [
        markerEvent(
          "innkeeper",
          task.taskId,
          instance.ownerSeatId,
          "death-protection",
          outcome.protectedSeatIds,
          2,
        ),
        markerEvent(
          "innkeeper",
          task.taskId,
          instance.ownerSeatId,
          "drunk",
          [result.drunkSeatId],
          2,
        ),
      ],
    });
  },
});

const gamblerHandler = {
  validateInput: ({ state, input }) =>
    seat(state, input.targetSeatId) &&
    BAD_MOON_RISING_ROLE_BY_ID.has(input.guessedRoleId)
      ? null
      : inputError("赌徒必须选择玩家并猜测规则包中的角色"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveGamblerGuess(
      state,
      instance.ownerSeatId,
      input.targetSeatId,
      input.guessedRoleId,
    );
    return emptyPlan(false, {
      events: [
        actionEvent(
          "gambler",
          trigger.triggerId,
          instance.ownerSeatId,
          [input.targetSeatId],
          outcome.correct ? "correct" : "incorrect",
        ),
        ...(outcome.gamblerDies
          ? abilityDeathEvents(state, {
              basis: trigger.triggerId,
              targetSeatId: instance.ownerSeatId,
              roleId: "gambler",
            })
          : []),
      ],
    });
  },
};

const gossipHandler = {
  validateInput: ({ state, input }) =>
    typeof input.statementId === "string" &&
    typeof input.truth === "boolean" &&
    (!input.truth || seat(state, input.targetSeatId))
      ? null
      : inputError("造谣者必须提交明确真假的公开声明和合法死亡候选"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveGossipStatement(state, instance.ownerSeatId, {
      statementId: input.statementId,
      truth: input.truth,
      targetSeatId: input.targetSeatId,
    });
    return emptyPlan(false, {
      events: [
        actionEvent(
          "gossip",
          trigger.triggerId,
          instance.ownerSeatId,
          input.targetSeatId ? [input.targetSeatId] : [],
          input.truth ? "true" : "false",
          true,
        ),
        ...(outcome.causesDeath
          ? abilityDeathEvents(state, {
              basis: trigger.triggerId,
              targetSeatId: outcome.targetSeatId,
              roleId: "gossip",
            })
          : []),
      ],
    });
  },
};

const courtierHandler = {
  validateInput: ({ input }) =>
    BAD_MOON_RISING_ROLE_BY_ID.has(input.roleId)
      ? null
      : inputError("侍臣必须选择规则包中的一个角色；不使用时请取消触发"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveCourtierChoice(
      state,
      instance.ownerSeatId,
      input.roleId,
    );
    return emptyPlan(true, {
      events: outcome.targetSeatId
        ? [
            markerEvent(
              "courtier",
              trigger.triggerId,
              instance.ownerSeatId,
              "drunk",
              [outcome.targetSeatId],
              6,
            ),
          ]
        : [],
    });
  },
};

const professorHandler = {
  validateInput: ({ state, input }) =>
    seat(state, input.targetSeatId) && !seat(state, input.targetSeatId).alive
      ? null
      : inputError("教授必须选择一名真正死亡玩家；不使用时请取消触发"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveProfessorChoice(
      state,
      instance.ownerSeatId,
      input.targetSeatId,
    );
    return emptyPlan(true, {
      events: outcome.revived
        ? createBadMoonRisingRevivalPlan(state, {
            basis: trigger.triggerId,
            targetSeatId: input.targetSeatId,
            causeId: "bmr.professor",
            sourceRoleId: "professor",
          }).events
        : [],
    });
  },
};

const moonchildHandler = {
  validateInput: ({ state, instance, input }) =>
    !seat(state, instance.ownerSeatId)?.alive &&
    seat(state, input.targetSeatId)?.alive
      ? null
      : inputError("月之子死亡后才能选择一名存活玩家"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveMoonchildChoice(
      state,
      instance.ownerSeatId,
      input.targetSeatId,
    );
    return emptyPlan(false, {
      events: [
        actionEvent(
          "moonchild",
          trigger.triggerId,
          instance.ownerSeatId,
          [input.targetSeatId],
          outcome.targetAlignmentAtChoice,
          true,
        ),
        ...(outcome.causesDeathTonight
          ? abilityDeathEvents(state, {
              basis: trigger.triggerId,
              targetSeatId: input.targetSeatId,
              roleId: "moonchild",
            })
          : []),
      ],
    });
  },
};

const tinkerHandler = {
  validateInput: ({ instance, input }) =>
    input.skip || input.targetSeatId === instance.ownerSeatId
      ? null
      : inputError("修补匠裁量只能跳过或选择修补匠本人"),
  resolve: ({ state, instance, trigger, input }) => {
    const dies =
      !input.skip &&
      resolveTinkerDeath(state, instance.ownerSeatId, {
        protectedSeatIds: [],
      });
    return emptyPlan(false, {
      events: dies
        ? abilityDeathEvents(state, {
            basis: trigger.triggerId,
            targetSeatId: instance.ownerSeatId,
            roleId: "tinker",
          })
        : [],
    });
  },
};

const devilsAdvocateHandler = {
  validateInput: ({ state, instance, input }) => {
    const previous = state.badMoonRising.markers.find(
      ({ type, content }) =>
        type === "execution-protection" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    try {
      resolveDevilsAdvocateChoice(
        state,
        input.targetSeatId,
        previous?.content.targetSeatIds[0] ?? null,
      );
      return null;
    } catch (error) {
      return inputError(error.message);
    }
  },
  resolve: ({ instance, input }) =>
    emptyPlan(false, {
      events: [
        markerEvent(
          "devilsadvocate",
          "devils-advocate-current-target",
          instance.ownerSeatId,
          "execution-protection",
          [input.targetSeatId],
          3,
        ),
      ],
    }),
};

const lunaticHandler = {
  validateInput: ({ state, input }) =>
    Array.isArray(input.targetSeatIds) &&
    input.targetSeatIds.every((seatId) => seat(state, seatId))
      ? null
      : inputError("疯子模拟行动必须引用合法席位"),
  resolve: ({ state, instance, trigger, input }) => {
    const demon = state.seats.find(
      ({ characterType }) => characterType === "demon",
    );
    const outcome = resolveLunaticAction(
      state,
      instance.ownerSeatId,
      input.targetSeatIds,
      demon.seatId,
    );
    return emptyPlan(false, {
      events: [
        {
          type: BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED,
          payload: {
            recordId: `information-${trigger.triggerId}`,
            recipientSeatId: demon.seatId,
            sourceRoleId: "lunatic",
            result: {
              kind: "lunatic-action",
              lunaticSeatId: outcome.lunaticSeatId,
              targetSeatIds: outcome.targetSeatIds,
            },
            ruleSourceIds: [source("lunatic")],
          },
        },
      ],
    });
  },
};

const demonBlocked = (state, demonSeatId) =>
  state.badMoonRising.markers.some(
    ({ type, content }) =>
      type === "demon-wake-blocked" &&
      content.active &&
      content.targetSeatIds.includes(demonSeatId),
  );

const singleKillHandler = (roleId, { consumeUse = false } = {}) => ({
  validateInput: ({ state, input }) =>
    input.skip && consumeUse
      ? inputError("限次死亡能力不使用时请取消触发")
      : input.skip || seat(state, input.targetSeatId)
      ? null
      : inputError("死亡能力必须跳过或选择合法席位"),
  resolve: ({ state, instance, trigger, input }) => {
    if (input.skip || demonBlocked(state, instance.ownerSeatId)) {
      return emptyPlan(false);
    }
    return emptyPlan(consumeUse, {
      events: abilityDeathEvents(state, {
        basis: trigger.triggerId,
        targetSeatId: input.targetSeatId,
        roleId,
        ignoresProtection: roleId === "assassin",
      }),
    });
  },
  resolveSuppressed: () => emptyPlan(consumeUse),
});

const pukkaHandler = {
  validateInput: simpleTargetValidation,
  resolve: ({ state, instance, trigger, input }) => {
    const previous = state.badMoonRising.markers.find(
      ({ type, content }) =>
        type === "pukka-poisoned" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    const previousSeatId = previous?.content.targetSeatIds[0] ?? null;
    const blocked = demonBlocked(state, instance.ownerSeatId);
    const outcome = resolvePukkaNight(state, {
      demonSeatId: instance.ownerSeatId,
      targetSeatId: input.targetSeatId,
      previousPoisonedSeatId: previousSeatId,
      demonEffective: !blocked,
    });
    const events = [];
    if (outcome.poisonedSeatId) {
      events.push(
        markerEvent(
          "pukka",
          trigger.triggerId,
          instance.ownerSeatId,
          "pukka-poisoned",
          [outcome.poisonedSeatId],
          null,
        ),
      );
    }
    if (outcome.deathAttemptSeatId) {
      events.push(
        ...abilityDeathEvents(state, {
          basis: trigger.triggerId,
          targetSeatId: outcome.deathAttemptSeatId,
          roleId: "pukka",
        }),
      );
      events.push(clearMarkerEvent("pukka", previous));
    }
    return emptyPlan(false, { events });
  },
};

const shabalothHandler = {
  validateInput: ({ state, input }) => {
    try {
      resolveShabalothNight(state, {
        targetSeatIds: input.targetSeatIds ?? [],
        previousTargetSeatIds: state.badMoonRising.markers
          .filter(
            ({ type, content }) =>
              type === "shabaloth-target" && content.active,
          )
          .flatMap(({ content }) => content.targetSeatIds),
        regurgitateSeatId: input.regurgitateSeatId ?? null,
      });
      return null;
    } catch (error) {
      return inputError(error.message);
    }
  },
  resolve: ({ state, instance, trigger, input }) => {
    if (demonBlocked(state, instance.ownerSeatId)) return emptyPlan(false);
    const previousTargetSeatIds = state.badMoonRising.markers
      .filter(
        ({ type, content }) =>
          type === "shabaloth-target" &&
          content.ownerSeatId === instance.ownerSeatId &&
          content.active,
      )
      .flatMap(({ content }) => content.targetSeatIds);
    const outcome = resolveShabalothNight(state, {
      targetSeatIds: input.targetSeatIds,
      previousTargetSeatIds,
      regurgitateSeatId: input.regurgitateSeatId ?? null,
    });
    const events = [
      markerEvent(
        "shabaloth",
        "shabaloth-previous-targets",
        instance.ownerSeatId,
        "shabaloth-target",
        outcome.deathAttemptSeatIds,
        3,
      ),
    ];
    if (outcome.reviveSeatId) {
      events.push(
        ...createBadMoonRisingRevivalPlan(state, {
          basis: trigger.triggerId,
          targetSeatId: outcome.reviveSeatId,
          causeId: "bmr.shabaloth",
          sourceRoleId: "shabaloth",
        }).events,
      );
    }
    let trialState = state;
    outcome.deathAttemptSeatIds.forEach((targetSeatId, index) => {
      const target = seat(trialState, targetSeatId);
      if (!target || (!target.alive && !target.secretlyAlive)) return;
      const deathEvents = abilityDeathEvents(trialState, {
        basis: `${trigger.triggerId}-${index + 1}`,
        targetSeatId,
        roleId: "shabaloth",
      });
      events.push(...deathEvents);
      const death = deathEvents.find(
        ({ type }) => type === BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
      );
      if (death) {
        trialState = {
          ...trialState,
          seats: seatsAfterOutcome(trialState, death.payload),
        };
      }
    });
    return emptyPlan(false, { events });
  },
};

const poHandler = {
  validateInput: ({ state, instance, input }) => {
    const charged = state.badMoonRising.markers.some(
      ({ type, content }) =>
        type === "po-charged" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    try {
      resolvePoNight(state, {
        charged,
        targetSeatIds: input.targetSeatIds ?? [],
      });
      return null;
    } catch (error) {
      return inputError(error.message);
    }
  },
  resolve: ({ state, instance, trigger, input }) => {
    if (demonBlocked(state, instance.ownerSeatId)) return emptyPlan(false);
    const chargeMarker = state.badMoonRising.markers.find(
      ({ type, content }) =>
        type === "po-charged" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    const outcome = resolvePoNight(state, {
      charged: Boolean(chargeMarker),
      targetSeatIds: input.targetSeatIds ?? [],
    });
    const events = [];
    if (outcome.charged) {
      events.push(
        markerEvent(
          "po",
          trigger.triggerId,
          instance.ownerSeatId,
          "po-charged",
          [],
          null,
        ),
      );
    } else if (chargeMarker) {
      events.push(clearMarkerEvent("po", chargeMarker));
    }
    let trialState = state;
    outcome.deathAttemptSeatIds.forEach((targetSeatId, index) => {
      const target = seat(trialState, targetSeatId);
      if (!target || (!target.alive && !target.secretlyAlive)) return;
      const deathEvents = abilityDeathEvents(trialState, {
        basis: `${trigger.triggerId}-${index + 1}`,
        targetSeatId,
        roleId: "po",
      });
      events.push(...deathEvents);
      const death = deathEvents.find(
        ({ type }) => type === BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
      );
      if (death) {
        trialState = {
          ...trialState,
          seats: seatsAfterOutcome(trialState, death.payload),
        };
      }
    });
    return emptyPlan(false, { events });
  },
};

const noopHandler = { resolve: () => emptyPlan(false) };

export const createBadMoonRisingHandlers = () =>
  Object.fromEntries(
    BAD_MOON_RISING_ROLE_CATALOG.map(({ id }) => {
      let handler = noopHandler;
      if (id === "sailor") handler = createSailorHandler();
      if (id === "chambermaid") handler = chambermaidHandler;
      if (id === "exorcist") handler = exorcistHandler;
      if (id === "innkeeper") handler = createInnkeeperHandler();
      if (id === "gambler") handler = gamblerHandler;
      if (id === "gossip") handler = gossipHandler;
      if (id === "courtier") handler = courtierHandler;
      if (id === "professor") handler = professorHandler;
      if (id === "tinker") handler = tinkerHandler;
      if (id === "moonchild") handler = moonchildHandler;
      if (id === "lunatic") handler = lunaticHandler;
      if (id === "devilsadvocate") handler = devilsAdvocateHandler;
      if (id === "assassin") {
        handler = singleKillHandler("assassin", { consumeUse: true });
      }
      if (id === "godfather") handler = singleKillHandler("godfather");
      if (id === "zombuul") handler = singleKillHandler("zombuul");
      if (id === "pukka") handler = pukkaHandler;
      if (id === "shabaloth") handler = shabalothHandler;
      if (id === "po") handler = poHandler;
      return [`bmr.${id}.handler`, handler];
    }),
  );
