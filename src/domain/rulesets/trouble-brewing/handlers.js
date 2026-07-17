import {
  canMonkProtect,
  countChefEvilPairs,
  countEmpathEvilNeighbors,
  createPoisonTransition,
  createSpyGrimoire,
  findImpSuccessorCandidates,
  isTroubleBrewingRoleEffective,
  resolveFortuneTellerAnswer,
  resolveSlayerShot,
  resolveTroubleBrewingDeath,
  resolveTroubleBrewingRegistration,
  validatePairInformation,
  validateRoleReveal,
  virginExecutesNominator,
} from "./rules";
import {
  TROUBLE_BREWING_ROLE_BY_ID,
  TROUBLE_BREWING_ROLE_CATALOG,
} from "./catalog";
import { TROUBLE_BREWING_EVENT_TYPES } from "./events";
import {
  buildDeathOutcomeEvents,
  buildExecutionEvents,
  roleSource,
} from "./resolution";

const emptyPlan = (consumeUse = false, overrides = {}) => ({
  events: [],
  ongoingEffects: [],
  delayedEffects: [],
  adjudicationTask: null,
  consumeUse,
  ...overrides,
});

const seatExists = (state, seatId) =>
  state.seats.some(({ seatId: id }) => id === seatId);
const inputError = (message, details) => ({
  code: "INVALID_ABILITY_INPUT",
  message,
  ...(details === undefined ? {} : { details }),
});
const adjudicationError = (message, details) => ({
  code: "INVALID_ADJUDICATION_RESULT",
  message,
  ...(details === undefined ? {} : { details }),
});

const validateTargets = ({ state, input }) => {
  if (input.targetSeatId === undefined && input.targetSeatIds === undefined) {
    return null;
  }
  const targetSeatIds = input.targetSeatIds ?? [input.targetSeatId];
  return targetSeatIds.every((seatId) => seatExists(state, seatId))
    ? null
    : inputError("能力目标必须是当前对局中的席位");
};

const informationTask = (
  state,
  roleId,
  trigger,
  input,
  { intoxicated = false, consumeUse = false } = {},
) => {
  const targets =
    input.targetSeatIds ??
    (input.targetSeatId === undefined ? [] : [input.targetSeatId]);
  const targetSuffix = targets.length > 0 ? `:${targets.join(":")}` : "";
  return emptyPlan(consumeUse, {
    adjudicationTask: {
      taskId: `task-${trigger.triggerId}`,
      kind: `tb.${roleId}.${
        intoxicated ? "misinformation" : "information"
      }${targetSuffix}`,
      summary: intoxicated
        ? `为${TROUBLE_BREWING_ROLE_BY_ID.get(roleId).name}选择格式合法的信息`
        : `结算${TROUBLE_BREWING_ROLE_BY_ID.get(roleId).name}的受约束信息`,
      candidateSeatIds: state.seats.map(({ seatId }) => seatId),
    },
  });
};

const taskContext = (task) => {
  const [base, ...targetSeatIds] = task.kind.split(":");
  const match = /^tb\.([a-z]+)\.(information|misinformation)$/.exec(base);
  return match
    ? {
        roleId: match[1],
        intoxicated: match[2] === "misinformation",
        targetSeatIds,
      }
    : null;
};

const validRegistrationMap = (state, registrations = {}) =>
  registrations &&
  typeof registrations === "object" &&
  !Array.isArray(registrations) &&
  Object.entries(registrations).every(([seatId, registeredAs]) => {
    const seat = state.seats.find(({ seatId: id }) => id === seatId);
    return (
      seat &&
      typeof registeredAs === "string" &&
      resolveTroubleBrewingRegistration({
        actualRoleId: seat.actualRoleId,
        actualAlignment: seat.alignment,
        actualCharacterType: seat.characterType,
        dead: !seat.alive,
        registeredAs,
      }).allowed
    );
  });

const validMisinformationFormat = (state, context, result) => {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return false;
  if (["washerwoman", "librarian", "investigator"].includes(context.roleId)) {
    return (
      Array.isArray(result.seatIds) &&
      result.seatIds.every((seatId) => seatExists(state, seatId)) &&
      (result.shownRoleId === null ||
        TROUBLE_BREWING_ROLE_BY_ID.has(result.shownRoleId))
    );
  }
  if (["chef", "empath"].includes(context.roleId)) {
    return Number.isInteger(result.number) && result.number >= 0;
  }
  if (context.roleId === "fortuneteller")
    return typeof result.answer === "boolean";
  if (["undertaker", "ravenkeeper"].includes(context.roleId)) {
    return TROUBLE_BREWING_ROLE_BY_ID.has(result.shownRoleId);
  }
  return (
    context.roleId === "spy" &&
    result.grimoire &&
    typeof result.grimoire === "object"
  );
};

const validEffectiveInformation = (state, instance, context, result) => {
  if (!validRegistrationMap(state, result.registrations ?? {})) return false;
  const registrations = result.registrations ?? {};
  if (["washerwoman", "librarian", "investigator"].includes(context.roleId)) {
    return validatePairInformation(state, {
      roleId: context.roleId,
      shownRoleId: result.shownRoleId,
      seatIds: result.seatIds,
      registrations,
    });
  }
  if (context.roleId === "chef") {
    return result.number === countChefEvilPairs(state, registrations);
  }
  if (context.roleId === "empath") {
    return (
      result.number ===
      countEmpathEvilNeighbors(state, instance.ownerSeatId, registrations)
    );
  }
  if (context.roleId === "fortuneteller") {
    return (
      result.answer ===
      resolveFortuneTellerAnswer(state, context.targetSeatIds, registrations)
    );
  }
  if (context.roleId === "undertaker") {
    return (
      state.executionToday?.died === true &&
      validateRoleReveal(state, {
        targetSeatId: state.executionToday.seatId,
        shownRoleId: result.shownRoleId,
        registrations,
      })
    );
  }
  if (context.roleId === "ravenkeeper") {
    return validateRoleReveal(state, {
      targetSeatId: context.targetSeatIds[0],
      shownRoleId: result.shownRoleId,
      registrations,
    });
  }
  return false;
};

const registrationEvents = (state, roleId, taskId, registrations = {}) =>
  Object.entries(registrations).map(([targetSeatId, registeredAs], index) => ({
    type: TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
    payload: {
      recordId: `registration-${taskId}-${index + 1}`,
      detectorRoleId: roleId,
      targetSeatId,
      registeredAs,
      ruleSourceIds: [
        roleSource(roleId),
        roleSource(
          state.seats.find(({ seatId }) => seatId === targetSeatId)
            .actualRoleId,
        ),
      ].sort(),
    },
  }));

const createInformationHandler = (roleId, { consumeUse = false } = {}) => ({
  validateInput: validateTargets,
  resolve: ({ state, trigger, input }) =>
    roleId === "spy"
      ? emptyPlan(consumeUse, {
          events: [
            {
              type: TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
              payload: {
                recordId: `information-${trigger.triggerId}`,
                recipientSeatId: state.abilityInstances.find(
                  ({ instanceId }) => instanceId === trigger.abilityInstanceId,
                ).ownerSeatId,
                roleId,
                kind: "grimoire",
                content: { grimoire: createSpyGrimoire(state) },
                ruleSourceIds: [roleSource(roleId)],
              },
            },
          ],
        })
      : informationTask(state, roleId, trigger, input, { consumeUse }),
  createIntoxicatedAdjudication: ({ state, trigger, input }) =>
    informationTask(state, roleId, trigger, input, {
      intoxicated: true,
      consumeUse,
    }),
  validateAdjudication: ({ state, instance, task, result }) => {
    const context = taskContext(task);
    if (!context || context.roleId !== roleId) {
      return adjudicationError("裁量任务与能力角色不匹配");
    }
    const valid = context.intoxicated
      ? validMisinformationFormat(state, context, result)
      : validEffectiveInformation(state, instance, context, result);
    return valid
      ? null
      : adjudicationError("信息裁量不在固定规则允许的候选集合中");
  },
  resolveAdjudication: ({ state, instance, task, result }) =>
    emptyPlan(consumeUse, {
      events: [
        ...registrationEvents(
          state,
          roleId,
          task.taskId,
          result.registrations ?? {},
        ),
        {
          type: TROUBLE_BREWING_EVENT_TYPES.INFORMATION_DELIVERED,
          payload: {
            recordId: `information-${task.taskId}`,
            recipientSeatId: instance.ownerSeatId,
            roleId,
            kind: task.kind.includes("misinformation")
              ? "misinformation"
              : "role-information",
            content: result,
            ruleSourceIds: [roleSource(roleId)],
          },
        },
      ],
    }),
});

const monkHandler = {
  validateInput: ({ state, instance, input }) =>
    !seatExists(state, input.targetSeatId) ||
    !canMonkProtect(state, instance.ownerSeatId, input.targetSeatId)
      ? inputError("僧侣必须选择一个不是自己的有效席位")
      : null,
  resolve: ({ trigger, input }) =>
    emptyPlan(false, {
      ongoingEffects: [
        {
          effectId: `effect-monk-${trigger.triggerId}`,
          effectType: "tb.monk-protection",
          targetIds: [input.targetSeatId],
          endEventTypes: ["phase.advanced"],
        },
      ],
    }),
};

const poisonerHandler = {
  validateInput: validateTargets,
  resolve: ({ state, instance, input }) => {
    const transition = createPoisonTransition(state, {
      poisonerSeatId: instance.ownerSeatId,
      abilityInstanceId: instance.instanceId,
      targetSeatId: input.targetSeatId,
    });
    return emptyPlan(false, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.CONDITION_CHANGED,
          payload: {
            ...transition,
            ruleSourceIds: [roleSource("poisoner")],
          },
        },
      ],
    });
  },
};

const butlerHandler = {
  validateInput: ({ state, instance, input }) => {
    const target = state.seats.find(
      ({ seatId }) => seatId === input.targetSeatId,
    );
    return !target?.alive || target.seatId === instance.ownerSeatId
      ? inputError("管家必须选择一名存活且不是自己的主人")
      : null;
  },
  resolve: ({ instance, input }) =>
    emptyPlan(false, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.MARKER_CHANGED,
          payload: {
            recordId: `butler-master-${instance.instanceId}`,
            markerType: "butler-master",
            ownerSeatId: instance.ownerSeatId,
            targetSeatId: input.targetSeatId,
            active: true,
            ruleSourceIds: [roleSource("butler")],
          },
        },
      ],
    }),
};

const actionEvent = (basis, actorSeatId, targetSeatId, result) => ({
  type: TROUBLE_BREWING_EVENT_TYPES.ACTION_RECORDED,
  payload: {
    recordId: `slayer-action-${basis}`,
    type: "slayer-shot",
    actorSeatId,
    targetSeatIds: [targetSeatId],
    result,
    ruleSourceIds: [roleSource("slayer")],
  },
});

const slayerEvents = (state, instance, basis, targetSeatId, registeredAs) => {
  const outcome = resolveSlayerShot(state, {
    slayerSeatId: instance.ownerSeatId,
    targetSeatId,
    registeredAs,
  });
  return [
    actionEvent(
      basis,
      instance.ownerSeatId,
      targetSeatId,
      outcome.died ? "target-died" : "no-death",
    ),
    ...(outcome.died
      ? buildDeathOutcomeEvents(state, outcome, {
          basis,
          sourceRoleId: "slayer",
          causeId: "tb.slayer",
        })
      : []),
  ];
};

const slayerHandler = {
  validateInput: validateTargets,
  resolve: ({ state, instance, trigger, input }) => {
    const target = state.seats.find(
      ({ seatId }) => seatId === input.targetSeatId,
    );
    if (target.actualRoleId === "recluse") {
      return emptyPlan(true, {
        adjudicationTask: {
          taskId: `task-${trigger.triggerId}`,
          kind: `tb.slayer.registration:${target.seatId}`,
          summary: "决定陌客是否在本次猎手能力中登记为恶魔",
          candidateSeatIds: [target.seatId],
        },
      });
    }
    return emptyPlan(true, {
      events: slayerEvents(state, instance, trigger.triggerId, target.seatId),
    });
  },
  resolveSuppressed: ({ instance, trigger, input }) =>
    emptyPlan(true, {
      events: [
        actionEvent(
          trigger.triggerId,
          instance.ownerSeatId,
          input.targetSeatId,
          "no-death",
        ),
      ],
    }),
  validateAdjudication: ({ state, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
    const valid =
      target?.actualRoleId === "recluse" &&
      ["recluse", "demon"].includes(result.registeredAs);
    return valid ? null : adjudicationError("猎手对陌客的登记裁量无效");
  },
  resolveAdjudication: ({ state, instance, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    return emptyPlan(true, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
          payload: {
            recordId: `registration-${task.taskId}`,
            detectorRoleId: "slayer",
            targetSeatId,
            registeredAs: result.registeredAs,
            ruleSourceIds: [roleSource("recluse"), roleSource("slayer")].sort(),
          },
        },
        ...slayerEvents(
          state,
          instance,
          task.taskId,
          targetSeatId,
          result.registeredAs,
        ),
      ],
    });
  },
};

const impTask = (state, trigger, targetSeatId, candidateSeatIds, summary) =>
  emptyPlan(false, {
    adjudicationTask: {
      taskId: `task-${trigger.triggerId}`,
      kind: `tb.imp.death:${targetSeatId}`,
      summary,
      candidateSeatIds,
    },
  });

const impOutcomeEvents = (
  state,
  instance,
  basis,
  targetSeatId,
  result = {},
) => {
  const outcome = resolveTroubleBrewingDeath(state, {
    targetSeatId,
    sourceRoleId: "imp",
    sourceSeatId: instance.ownerSeatId,
    causeId: "tb.imp",
    redirectSeatId: result.redirectSeatId ?? null,
    successorSeatId: result.successorSeatId ?? null,
  });
  return buildDeathOutcomeEvents(state, outcome, {
    basis,
    sourceRoleId: "imp",
    causeId: "tb.imp",
  });
};

const impHandler = {
  validateInput: validateTargets,
  resolve: ({ state, instance, trigger, input }) => {
    const target = state.seats.find(
      ({ seatId }) => seatId === input.targetSeatId,
    );
    if (
      target.actualRoleId === "mayor" &&
      isTroubleBrewingRoleEffective(state, target.seatId, "mayor") &&
      canImpHarmSeatForHandler(state, target.seatId)
    ) {
      return impTask(
        state,
        trigger,
        target.seatId,
        state.seats
          .filter(({ seatId }) => seatId !== target.seatId)
          .map(({ seatId }) => seatId),
        "决定镇长是否把本次夜间死亡转移给另一名玩家",
      );
    }
    if (target.seatId === instance.ownerSeatId) {
      const candidates = findImpSuccessorCandidates(state, target.seatId);
      if (candidates.length > 1) {
        return impTask(
          state,
          trigger,
          target.seatId,
          candidates,
          "选择继承小恶魔角色的存活爪牙",
        );
      }
    }
    return emptyPlan(false, {
      events: impOutcomeEvents(
        state,
        instance,
        trigger.triggerId,
        target.seatId,
      ),
    });
  },
  validateAdjudication: ({ state, instance, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
    if (!target) return adjudicationError("小恶魔裁量目标不存在");
    if (target.actualRoleId === "mayor") {
      return result.redirectSeatId === null ||
        state.seats.some(
          ({ seatId }) =>
            seatId === result.redirectSeatId && seatId !== targetSeatId,
        )
        ? null
        : adjudicationError("镇长转移目标无效");
    }
    const candidates = findImpSuccessorCandidates(state, instance.ownerSeatId);
    return candidates.includes(result.successorSeatId)
      ? null
      : adjudicationError("小恶魔继任者不在合法存活爪牙集合中");
  },
  resolveAdjudication: ({ state, instance, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    return emptyPlan(false, {
      events: impOutcomeEvents(
        state,
        instance,
        task.taskId,
        targetSeatId,
        result,
      ),
    });
  },
};

// 避免在处理器中把“镇长是否需要裁量”与最终死亡计算拆成两套规则。
const canImpHarmSeatForHandler = (state, targetSeatId) => {
  const outcome = resolveTroubleBrewingDeath(state, {
    targetSeatId,
    sourceRoleId: "imp",
    causeId: "tb.imp",
  });
  return outcome.died;
};

const virginHandler = {
  resolve: ({ state, instance, trigger }) => {
    const nomination = state.activeNomination;
    if (!nomination || nomination.nomineeSeatId !== instance.ownerSeatId) {
      return emptyPlan(true);
    }
    const nominator = state.seats.find(
      ({ seatId }) => seatId === nomination.nominatorSeatId,
    );
    if (nominator.actualRoleId === "spy") {
      return emptyPlan(true, {
        adjudicationTask: {
          taskId: `task-${trigger.triggerId}`,
          kind: `tb.virgin.registration:${nominator.seatId}`,
          summary: "决定间谍是否在本次贞洁者能力中登记为镇民",
          candidateSeatIds: [nominator.seatId],
        },
      });
    }
    return emptyPlan(true, {
      events: virginExecutesNominator(state, {
        virginSeatId: instance.ownerSeatId,
        nominatorSeatId: nominator.seatId,
      })
        ? buildExecutionEvents(state, nominator.seatId, {
            basis: trigger.triggerId,
            sourceRoleId: "virgin",
            causeId: "tb.virgin",
          })
        : [],
    });
  },
  validateAdjudication: ({ state, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    const target = state.seats.find(({ seatId }) => seatId === targetSeatId);
    return target?.actualRoleId === "spy" &&
      ["spy", "townsfolk"].includes(result.registeredAs)
      ? null
      : adjudicationError("贞洁者对间谍的登记裁量无效");
  },
  resolveAdjudication: ({ state, trigger, task, result }) => {
    const targetSeatId = task.kind.split(":")[1];
    const executes = result.registeredAs === "townsfolk";
    return emptyPlan(true, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.REGISTRATION_RECORDED,
          payload: {
            recordId: `registration-${task.taskId}`,
            detectorRoleId: "virgin",
            targetSeatId,
            registeredAs: result.registeredAs,
            ruleSourceIds: [roleSource("spy"), roleSource("virgin")].sort(),
          },
        },
        ...(executes
          ? buildExecutionEvents(state, targetSeatId, {
              basis: trigger.triggerId,
              sourceRoleId: "virgin",
              causeId: "tb.virgin",
            })
          : []),
      ],
    });
  },
};

const saintHandler = {
  resolve: () =>
    emptyPlan(false, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.GAME_ENDED,
          payload: {
            alignment: "evil",
            reason: "saint-executed",
            ruleSourceIds: [roleSource("saint")],
          },
        },
      ],
    }),
  resolveSuppressed: ({ state, trigger }) =>
    emptyPlan(false, {
      events: [
        {
          type: TROUBLE_BREWING_EVENT_TYPES.EXECUTION_COMPLETED,
          payload: {
            targetSeatId: state.executionToday.seatId,
            sourceEventId: trigger.sourceEventId,
            ruleSourceIds: [roleSource("saint")],
          },
        },
      ],
    }),
};

const noopHandler = { resolve: () => emptyPlan(false) };

export const createTroubleBrewingHandlers = () => {
  const informationRoles = new Set([
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortuneteller",
    "undertaker",
    "ravenkeeper",
    "spy",
  ]);
  return Object.fromEntries(
    TROUBLE_BREWING_ROLE_CATALOG.map(({ id }) => {
      let handler = noopHandler;
      if (informationRoles.has(id)) {
        handler = createInformationHandler(id, {
          consumeUse: id === "ravenkeeper",
        });
      }
      if (id === "monk") handler = monkHandler;
      if (id === "poisoner") handler = poisonerHandler;
      if (id === "butler") handler = butlerHandler;
      if (id === "slayer") handler = slayerHandler;
      if (id === "imp") handler = impHandler;
      if (id === "virgin") handler = virginHandler;
      if (id === "saint") handler = saintHandler;
      return [`tb.${id}.handler`, handler];
    }),
  );
};
