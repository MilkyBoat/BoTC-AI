import {
  SECTS_AND_VIOLETS_ROLE_BY_ID,
  SECTS_AND_VIOLETS_ROLE_CATALOG,
} from "./catalog";
import { BASIC_RULE_SOURCES, determineBasicWinner } from "../../rules/basic";
import { SECTS_AND_VIOLETS_EVENT_TYPES } from "./events";
import {
  countMathematicianAbnormalities,
  getNoDashiiPoisonedTownsfolk,
  isSectsAndVioletsRoleEffective,
  resolveBarberSwap,
  resolveBooleanInformation,
  resolveClockmakerDistance,
  resolveDreamerInformation,
  resolveEvilTwinOutcome,
  resolveFangGuAttack,
  resolveJugglerGuesses,
  resolveKlutzChoice,
  resolveMadnessAdjudication,
  resolveOracleCount,
  resolvePithagChange,
  resolveSageInformation,
  resolveSeamstressChoice,
  resolveSnakeCharmerChoice,
  resolveVigormortisKill,
} from "./rules";

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
const vortoxActive = (state) => {
  const vortox = state.seats.find(
    ({ actualRoleId }) => actualRoleId === "vortox",
  );
  return Boolean(
    vortox && isSectsAndVioletsRoleEffective(state, vortox.seatId, "vortox"),
  );
};

const actionEvent = (
  roleId,
  basis,
  actorSeatId,
  targetSeatIds,
  result,
  isPublic = false,
) => ({
  type: SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
  payload: {
    recordId: `action-${basis}`,
    actionType: `snv.${roleId}`,
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
  { active = true, persistent = false } = {},
) => ({
  type: SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  payload: {
    recordId: `marker-${String(basis).slice(-48)}-${markerType}-${ownerSeatId}`,
    markerType,
    ownerSeatId,
    targetSeatIds,
    active,
    persistent,
    ruleSourceIds: [source(roleId)],
  },
});

const clearMarkerEvent = (roleId, marker) => ({
  type: SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
  payload: {
    recordId: marker.recordId,
    markerType: marker.type,
    ownerSeatId: marker.content.ownerSeatId,
    targetSeatIds: marker.content.targetSeatIds,
    active: false,
    persistent: marker.content.persistent,
    ruleSourceIds: [source(roleId)],
  },
});

const ownerJustDied = (state, ownerSeatId, { demonOnly = false } = {}) => {
  const latest = state.sectsAndViolets?.deathHistory?.at(-1)?.content;
  return Boolean(
    latest?.actuallyDied &&
      latest.targetSeatId === ownerSeatId &&
      (!demonOnly ||
        /^snv\.(fanggu|vigormortis|nodashii|vortox)$/.test(latest.causeId)),
  );
};

const informationEvent = (
  roleId,
  task,
  recipientSeatId,
  truth,
  delivered,
  constrained,
  truthful = !constrained,
) => ({
  type: SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED,
  payload: {
    recordId: `information-${task.taskId}`,
    recipientSeatId,
    sourceRoleId: roleId,
    truth,
    delivered,
    truthful,
    vortoxConstrained: constrained,
    ruleSourceIds: [source(roleId)],
  },
});

const targetValidation = ({ state, input }) =>
  input.targetSeatId && seat(state, input.targetSeatId)
    ? null
    : inputError("能力必须选择当前对局中的一个席位");

const informationTask = (
  state,
  roleId,
  trigger,
  input,
  intoxicated = false,
) => {
  const targetSeatIds =
    input.targetSeatIds ??
    (input.targetSeatId === undefined ? [] : [input.targetSeatId]);
  return emptyPlan(!intoxicated && ["seamstress", "artist"].includes(roleId), {
    adjudicationTask: {
      taskId: `task-${trigger.triggerId}`,
      kind: `snv.${roleId}.${intoxicated ? "misinformation" : "information"}`,
      summary: intoxicated
        ? `为${
            SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId).name
          }选择格式合法的任意信息`
        : `结算${SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId).name}的受约束信息`,
      candidateSeatIds:
        targetSeatIds.length > 0
          ? targetSeatIds
          : state.seats.map(({ seatId }) => seatId),
    },
  });
};

const informationContext = (task) => {
  const match = /^snv\.([a-z]+)\.(information|misinformation)$/.exec(task.kind);
  return match
    ? { roleId: match[1], intoxicated: match[2] === "misinformation" }
    : null;
};

const validInformationFormat = (roleId, result) => {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return false;
  if (["clockmaker", "mathematician", "oracle", "juggler"].includes(roleId)) {
    return Number.isInteger(result.number) && result.number >= 0;
  }
  if (["flowergirl", "towncrier", "seamstress", "artist"].includes(roleId)) {
    return typeof result.delivered === "boolean";
  }
  if (roleId === "dreamer") {
    return (
      Array.isArray(result.shownRoleIds) &&
      result.shownRoleIds.length === 2 &&
      result.shownRoleIds.every((roleId) =>
        SECTS_AND_VIOLETS_ROLE_BY_ID.has(roleId),
      )
    );
  }
  if (roleId === "savant") {
    return (
      Array.isArray(result.statements) &&
      result.statements.length === 2 &&
      result.statements.every(
        ({ text, truth }) =>
          typeof text === "string" && typeof truth === "boolean",
      )
    );
  }
  return (
    roleId === "sage" &&
    Array.isArray(result.candidateSeatIds) &&
    result.candidateSeatIds.length === 2
  );
};

const hasDemonVotedToday = (state) =>
  (state.nominationsToday ?? []).some(({ votes = [] }) =>
    votes.some((vote) => {
      const voter = seat(state, vote.seatId ?? vote.voterSeatId);
      return vote.supports !== false && voter?.characterType === "demon";
    }),
  );
const hasMinionNominatedToday = (state) =>
  (state.nominationsToday ?? []).some(
    ({ nominatorSeatId }) =>
      seat(state, nominatorSeatId)?.characterType === "minion",
  );

const validateEffectiveInformation = (
  state,
  instance,
  task,
  roleId,
  result,
) => {
  if (!validInformationFormat(roleId, result)) return false;
  const constrained = vortoxActive(state);
  if (roleId === "clockmaker") {
    const truth = resolveClockmakerDistance(state, result.registrations ?? {});
    return constrained ? result.number !== truth : result.number === truth;
  }
  if (roleId === "mathematician") {
    const truth = countMathematicianAbnormalities(
      (state.sectsAndViolets?.abilityAbnormalities ?? []).map(
        ({ content }) => content,
      ),
      instance.ownerSeatId,
    );
    return constrained ? result.number !== truth : result.number === truth;
  }
  if (roleId === "oracle") {
    const truth = resolveOracleCount(state, result.registrations ?? {});
    return constrained ? result.number !== truth : result.number === truth;
  }
  if (roleId === "juggler") {
    try {
      const truth = resolveJugglerGuesses(
        state,
        result.guesses ?? [],
        result.registrations ?? {},
      ).correct;
      return constrained ? result.number !== truth : result.number === truth;
    } catch (_error) {
      return false;
    }
  }
  if (roleId === "dreamer") {
    try {
      resolveDreamerInformation(
        state,
        instance.ownerSeatId,
        task.candidateSeatIds[0],
        result.shownRoleIds,
        { vortoxActive: constrained },
      );
      return true;
    } catch (_error) {
      return false;
    }
  }
  if (roleId === "seamstress") {
    try {
      const truth = resolveSeamstressChoice(
        state,
        instance.ownerSeatId,
        task.candidateSeatIds,
      ).sameAlignment;
      resolveBooleanInformation({
        truth,
        delivered: result.delivered,
        vortoxActive: constrained,
      });
      return true;
    } catch (_error) {
      return false;
    }
  }
  if (["flowergirl", "towncrier"].includes(roleId)) {
    const truth =
      roleId === "flowergirl"
        ? hasDemonVotedToday(state)
        : hasMinionNominatedToday(state);
    try {
      resolveBooleanInformation({
        truth,
        delivered: result.delivered,
        vortoxActive: constrained,
      });
      return true;
    } catch (_error) {
      return false;
    }
  }
  if (roleId === "artist") {
    return (
      typeof result.truth === "boolean" &&
      (() => {
        try {
          resolveBooleanInformation({
            truth: result.truth,
            delivered: result.delivered,
            vortoxActive: constrained,
          });
          return true;
        } catch (_error) {
          return false;
        }
      })()
    );
  }
  if (roleId === "savant") {
    const truths = result.statements.filter(({ truth }) => truth).length;
    return constrained ? truths !== 1 : truths === 1;
  }
  if (roleId === "sage") {
    try {
      resolveSageInformation(
        state,
        instance.ownerSeatId,
        result.demonSeatId,
        result.candidateSeatIds,
        { vortoxActive: constrained },
      );
      return true;
    } catch (_error) {
      return false;
    }
  }
  return false;
};

const truthAndDelivery = (state, instance, task, roleId, result) => {
  const constrained = vortoxActive(state);
  if (["clockmaker", "mathematician", "oracle", "juggler"].includes(roleId)) {
    let truth;
    if (roleId === "clockmaker")
      truth = resolveClockmakerDistance(state, result.registrations ?? {});
    if (roleId === "mathematician") {
      truth = countMathematicianAbnormalities(
        (state.sectsAndViolets?.abilityAbnormalities ?? []).map(
          ({ content }) => content,
        ),
        instance.ownerSeatId,
      );
    }
    if (roleId === "oracle")
      truth = resolveOracleCount(state, result.registrations ?? {});
    if (roleId === "juggler") {
      truth = resolveJugglerGuesses(
        state,
        result.guesses ?? [],
        result.registrations ?? {},
      ).correct;
    }
    return [{ number: truth }, { number: result.number }, constrained];
  }
  if (["flowergirl", "towncrier", "seamstress", "artist"].includes(roleId)) {
    let truth = result.truth;
    if (roleId === "flowergirl") truth = hasDemonVotedToday(state);
    if (roleId === "towncrier") truth = hasMinionNominatedToday(state);
    if (roleId === "seamstress") {
      truth = resolveSeamstressChoice(
        state,
        instance.ownerSeatId,
        task.candidateSeatIds,
      ).sameAlignment;
    }
    return [{ answer: truth }, { answer: result.delivered }, constrained];
  }
  if (roleId === "dreamer") {
    return [
      { actualRoleId: seat(state, task.candidateSeatIds[0]).actualRoleId },
      { shownRoleIds: result.shownRoleIds },
      constrained,
    ];
  }
  if (roleId === "savant") {
    return [
      { trueStatementCount: 1 },
      { statements: result.statements.map(({ text }) => text) },
      constrained,
    ];
  }
  return [
    { demonSeatId: result.demonSeatId },
    { candidateSeatIds: result.candidateSeatIds },
    constrained,
  ];
};

const createInformationHandler = (
  roleId,
  { validateInput = () => null } = {},
) => ({
  validateInput,
  resolve: ({ state, trigger, input }) =>
    informationTask(state, roleId, trigger, input),
  createIntoxicatedAdjudication: ({ state, trigger, input }) =>
    informationTask(state, roleId, trigger, input, true),
  validateAdjudication: ({ state, instance, task, result }) => {
    const context = informationContext(task);
    if (!context || context.roleId !== roleId) {
      return adjudicationError("裁量任务与角色不匹配");
    }
    const valid = context.intoxicated
      ? validInformationFormat(roleId, result)
      : validateEffectiveInformation(state, instance, task, roleId, result);
    return valid
      ? null
      : adjudicationError("信息裁量不在固定规则允许的候选集中");
  },
  resolveAdjudication: ({ state, instance, task, result }) => {
    const context = informationContext(task);
    const [truth, delivered, constrained] = context.intoxicated
      ? [{ unavailable: true }, { ...result }, false]
      : truthAndDelivery(state, instance, task, roleId, result);
    return emptyPlan(false, {
      events: [
        informationEvent(
          roleId,
          task,
          instance.ownerSeatId,
          truth,
          delivered,
          constrained,
          context.intoxicated ? false : !constrained,
        ),
      ],
    });
  },
});

const snakeCharmerHandler = {
  validateInput: ({ state, input }) =>
    seat(state, input.targetSeatId)?.alive
      ? null
      : inputError("舞蛇人必须选择一名存活玩家"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolveSnakeCharmerChoice(
      state,
      instance.ownerSeatId,
      input.targetSeatId,
    );
    if (!outcome.swapped) {
      return emptyPlan(false, {
        events: [
          actionEvent(
            "snakecharmer",
            trigger.triggerId,
            instance.ownerSeatId,
            [input.targetSeatId],
            { swapped: false },
          ),
        ],
      });
    }
    return emptyPlan(false, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTERS_SWAPPED,
          payload: {
            recordId: `swap-${trigger.triggerId}`,
            seatIds: [instance.ownerSeatId, input.targetSeatId],
            newRoleInstanceIds: [
              `role-${trigger.triggerId}-demon`,
              `role-${trigger.triggerId}-snakecharmer`,
            ],
            newAbilityInstanceIds: [
              `ability-${trigger.triggerId}-demon`,
              `ability-${trigger.triggerId}-snakecharmer`,
            ],
            swapAlignments: true,
            reason: "snakecharmer-hit-demon",
            ruleSourceIds: [source("snakecharmer")],
          },
        },
        markerEvent(
          "snakecharmer",
          trigger.triggerId,
          instance.ownerSeatId,
          "poisoned",
          [input.targetSeatId],
          { persistent: true },
        ),
      ],
    });
  },
};

const philosopherHandler = {
  validateInput: ({ input }) => {
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(input.roleId);
    return role?.alignment === "good"
      ? null
      : inputError("哲学家必须选择一个善良角色能力");
  },
  resolve: ({ state, instance, trigger, input }) => {
    const inPlay = state.seats.find(
      ({ actualRoleId }) => actualRoleId === input.roleId,
    );
    return emptyPlan(true, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.PHILOSOPHER_ABILITY_GAINED,
          payload: {
            recordId: `philosopher-${trigger.triggerId}`,
            seatId: instance.ownerSeatId,
            roleId: input.roleId,
            abilityInstanceId: `ability-${trigger.triggerId}-gained`,
            sourceRoleInstanceId: instance.sourceRoleInstanceId,
            drunkSeatId: inPlay?.seatId ?? null,
            ruleSourceIds: [source("philosopher")],
          },
        },
      ],
    });
  },
};

const madnessHandler = (roleId) => ({
  validateInput: ({ state, instance, input }) => {
    if (roleId === "cerenovus" && !seat(state, input.targetSeatId)?.alive) {
      return inputError("洗脑师必须选择一名存活玩家");
    }
    if (
      roleId === "cerenovus" &&
      input.ruling === undefined &&
      !SECTS_AND_VIOLETS_ROLE_BY_ID.has(input.roleId)
    ) {
      return inputError("洗脑师必须选择一个角色作为疯狂声称目标");
    }
    if (
      input.ruling !== undefined &&
      (roleId === "mutant" ? instance.ownerSeatId : input.targetSeatId) ===
        undefined
    ) {
      return inputError("疯狂裁量缺少目标");
    }
    return null;
  },
  resolve: ({ instance, trigger, input }) => {
    const targetSeatId =
      roleId === "mutant" ? instance.ownerSeatId : input.targetSeatId;
    if (input.ruling === undefined) {
      return emptyPlan(false, {
        events: [
          markerEvent(
            roleId,
            trigger.triggerId,
            instance.ownerSeatId,
            "madness",
            [targetSeatId],
            { persistent: false },
          ),
          ...(roleId === "cerenovus"
            ? [
                actionEvent(
                  roleId,
                  trigger.triggerId,
                  instance.ownerSeatId,
                  [targetSeatId],
                  { claimedRoleId: input.roleId },
                ),
              ]
            : []),
        ],
      });
    }
    const outcome = resolveMadnessAdjudication({
      sourceRoleId: roleId,
      targetSeatId,
      ruling: input.ruling,
      execute: input.execute ?? false,
      evidenceSummary: input.evidenceSummary ?? "",
    });
    return emptyPlan(false, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.MADNESS_RULING_RECORDED,
          payload: {
            recordId: `madness-${trigger.triggerId}`,
            sourceRoleId: roleId,
            targetSeatId,
            ruling: outcome.ruling,
            executionRequested: outcome.executionRequested,
            evidenceSummary: outcome.evidenceSummary,
            ruleSourceIds: [source(roleId)],
          },
        },
        ...(outcome.executionRequested
          ? [
              {
                type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
                payload: {
                  recordId: `death-${trigger.triggerId}`,
                  targetSeatId,
                  causeId: `snv.${roleId}.madness`,
                  actuallyDied: true,
                  retainsAbilityAfterDeath: false,
                  poisonedSeatIds: [],
                  ruleSourceIds: [source(roleId)],
                },
              },
            ]
          : []),
      ],
    });
  },
});

const barberHandler = {
  validateInput: ({ state, instance, input }) => {
    if (!ownerJustDied(state, instance.ownerSeatId)) {
      return inputError("理发师只能结算导致自己死亡的那次触发");
    }
    try {
      resolveBarberSwap(state, input.targetSeatIds);
      return null;
    } catch (error) {
      return inputError(error.message);
    }
  },
  resolve: ({ state, instance, trigger, input }) => {
    const [leftId, rightId] = input.targetSeatIds;
    const left = seat(state, leftId);
    const right = seat(state, rightId);
    return emptyPlan(false, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTERS_SWAPPED,
          payload: {
            recordId: `swap-${trigger.triggerId}`,
            seatIds: input.targetSeatIds,
            newRoleInstanceIds: [
              `role-${trigger.triggerId}-${right.actualRoleId}`,
              `role-${trigger.triggerId}-${left.actualRoleId}`,
            ],
            newAbilityInstanceIds: [
              `ability-${trigger.triggerId}-${right.actualRoleId}`,
              `ability-${trigger.triggerId}-${left.actualRoleId}`,
            ],
            swapAlignments: false,
            reason: "barber-demon-choice",
            ruleSourceIds: [source("barber")],
          },
        },
        actionEvent(
          "barber",
          trigger.triggerId,
          instance.ownerSeatId,
          input.targetSeatIds,
          { swapped: true },
        ),
      ],
    });
  },
};

const klutzHandler = {
  validateInput: (context) =>
    ownerJustDied(context.state, context.instance.ownerSeatId)
      ? targetValidation(context)
      : inputError("呆瓜只能结算导致自己死亡的那次触发"),
  resolve: ({ state, instance, trigger, input }) => {
    let outcome;
    try {
      outcome = resolveKlutzChoice(
        state,
        instance.ownerSeatId,
        input.targetSeatId,
      );
    } catch (error) {
      return emptyPlan(false, { error: inputError(error.message) });
    }
    return emptyPlan(false, {
      events: [
        actionEvent(
          "klutz",
          trigger.triggerId,
          instance.ownerSeatId,
          [input.targetSeatId],
          { chosen: true },
          true,
        ),
        ...(outcome.winner
          ? [
              {
                type: SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
                payload: {
                  alignment: "evil",
                  reason: "klutz-evil-chosen",
                  ruleSourceIds: [source("klutz")],
                },
              },
            ]
          : []),
      ],
    });
  },
};

const evilTwinHandler = {
  resolve: ({ state, instance, trigger }) => {
    const goodTwinSeatId = state.sectsAndViolets.setup.goodTwinSeatId;
    return emptyPlan(false, {
      events: [
        markerEvent(
          "eviltwin",
          trigger.triggerId,
          instance.ownerSeatId,
          "evil-twin-pair",
          [goodTwinSeatId],
          { persistent: true },
        ),
      ],
    });
  },
};

const witchHandler = {
  validateInput: targetValidation,
  resolve: ({ state, instance, trigger, input }) => {
    const previous = state.sectsAndViolets.markers.find(
      ({ type, content }) =>
        type === "witch-cursed" &&
        content.ownerSeatId === instance.ownerSeatId &&
        content.active,
    );
    return emptyPlan(false, {
      events: [
        ...(previous ? [clearMarkerEvent("witch", previous)] : []),
        markerEvent(
          "witch",
          trigger.triggerId,
          instance.ownerSeatId,
          "witch-cursed",
          [input.targetSeatId],
        ),
      ],
    });
  },
};

const pithagHandler = {
  validateInput: ({ state, input }) =>
    seat(state, input.targetSeatId) &&
    SECTS_AND_VIOLETS_ROLE_BY_ID.has(input.roleId)
      ? null
      : inputError("麻脸巫婆必须选择合法玩家与角色"),
  resolve: ({ state, instance, trigger, input }) => {
    const outcome = resolvePithagChange(
      state,
      input.targetSeatId,
      input.roleId,
    );
    if (!outcome.changed) {
      return emptyPlan(false, {
        events: [
          actionEvent(
            "pithag",
            trigger.triggerId,
            instance.ownerSeatId,
            [input.targetSeatId],
            { changed: false, requestedRoleId: input.roleId },
          ),
        ],
      });
    }
    return emptyPlan(false, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTER_CHANGED,
          payload: {
            recordId: `change-${trigger.triggerId}`,
            seatId: input.targetSeatId,
            newRoleId: input.roleId,
            newRoleInstanceId: `role-${trigger.triggerId}-${input.roleId}`,
            newAbilityInstanceId: `ability-${trigger.triggerId}-${input.roleId}`,
            preserveAlignment: true,
            reason: "pithag-created-character",
            ruleSourceIds: [source("pithag")],
          },
        },
        ...(outcome.createsDemon
          ? [
              markerEvent(
                "pithag",
                trigger.triggerId,
                instance.ownerSeatId,
                "demon-created-death-balance-pending",
                [input.targetSeatId],
              ),
            ]
          : []),
      ],
      ...(outcome.createsDemon
        ? {
            adjudicationTask: {
              taskId: `task-${trigger.triggerId}-demon-balance`,
              kind: "snv.pithag.demon-created-death-balance",
              summary: "新恶魔产生时由说书人选择是否当夜使玩家死亡",
              candidateSeatIds: state.seats
                .filter(({ alive }) => alive)
                .map(({ seatId }) => seatId),
            },
          }
        : {}),
    });
  },
  validateAdjudication: ({ task, result }) =>
    Array.isArray(result.deathSeatIds) &&
    new Set(result.deathSeatIds).size === result.deathSeatIds.length &&
    result.deathSeatIds.every((seatId) =>
      task.candidateSeatIds.includes(seatId),
    )
      ? null
      : adjudicationError("麻脸巫婆的死亡平衡必须只引用当前存活候选人"),
  resolveAdjudication: ({ state, task, result }) => {
    const deadIds = new Set(result.deathSeatIds);
    const seatsAfter = state.seats.map((seat) =>
      deadIds.has(seat.seatId) ? { ...seat, alive: false } : seat,
    );
    const winner = determineBasicWinner(seatsAfter);
    const evilTwin = seatsAfter.find(
      ({ seatId }) => seatId === state.sectsAndViolets.setup.evilTwinSeatId,
    );
    const goodTwin = seatsAfter.find(
      ({ seatId }) => seatId === state.sectsAndViolets.setup.goodTwinSeatId,
    );
    const blocksGood = resolveEvilTwinOutcome({
      evilTwinAlive: evilTwin?.alive === true,
      goodTwinAlive: goodTwin?.alive === true,
      proposedWinner: winner?.alignment ?? null,
    }).preventGoodWin;
    return emptyPlan(false, {
      events: [
        ...result.deathSeatIds.map((targetSeatId, index) => ({
          type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
          payload: {
            recordId: `death-${task.taskId}-${index + 1}`,
            targetSeatId,
            causeId: "snv.pithag.demon-created-balance",
            actuallyDied: true,
            retainsAbilityAfterDeath: false,
            poisonedSeatIds: [],
            ruleSourceIds: [source("pithag")],
          },
        })),
        ...(winner && !blocksGood
          ? [
              {
                type: SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
                payload: {
                  alignment: winner.alignment,
                  reason: winner.reason,
                  ruleSourceIds: [BASIC_RULE_SOURCES.VICTORY],
                },
              },
            ]
          : []),
      ],
    });
  },
};

const sweetheartHandler = {
  validateInput: ({ state, instance }) =>
    ownerJustDied(state, instance.ownerSeatId)
      ? null
      : inputError("心上人只能结算导致自己死亡的那次触发"),
  resolve: ({ state, instance, trigger }) =>
    emptyPlan(false, {
      adjudicationTask: {
        taskId: `task-${trigger.triggerId}-sweetheart-drunk`,
        kind: "snv.sweetheart.drunk",
        summary: "选择一名因心上人死亡而持续醉酒的玩家",
        candidateSeatIds: state.seats
          .filter(({ seatId }) => seatId !== instance.ownerSeatId)
          .map(({ seatId }) => seatId),
      },
    }),
  validateAdjudication: ({ task, result }) =>
    task.candidateSeatIds.includes(result.drunkSeatId)
      ? null
      : adjudicationError("心上人醉酒目标必须是一名其他候选玩家"),
  resolveAdjudication: ({ instance, task, result }) =>
    emptyPlan(false, {
      events: [
        markerEvent(
          "sweetheart",
          task.taskId,
          instance.ownerSeatId,
          "drunk",
          [result.drunkSeatId],
          { persistent: true },
        ),
      ],
    }),
};

const baseDemonHandler = (roleId) => ({
  validateInput: targetValidation,
  resolve: ({ state, instance, trigger, input }) => {
    const target = seat(state, input.targetSeatId);
    if (!target?.alive) return emptyPlan(false);
    if (roleId === "fanggu") {
      const outcome = resolveFangGuAttack(
        state,
        instance.ownerSeatId,
        input.targetSeatId,
      );
      if (outcome.jumps) {
        return emptyPlan(false, {
          events: [
            {
              type: SECTS_AND_VIOLETS_EVENT_TYPES.FANG_GU_JUMPED,
              payload: {
                recordId: `fang-gu-${trigger.triggerId}`,
                oldDemonSeatId: instance.ownerSeatId,
                newDemonSeatId: input.targetSeatId,
                newRoleInstanceId: `role-${trigger.triggerId}-fanggu`,
                newAbilityInstanceId: `ability-${trigger.triggerId}-fanggu`,
                ruleSourceIds: [source("fanggu")],
              },
            },
          ],
        });
      }
    }
    return emptyPlan(false, {
      events: [
        {
          type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
          payload: {
            recordId: `death-${trigger.triggerId}-${input.targetSeatId}`,
            targetSeatId: input.targetSeatId,
            causeId: `snv.${roleId}`,
            actuallyDied: true,
            retainsAbilityAfterDeath: false,
            poisonedSeatIds: [],
            ruleSourceIds: [source(roleId)],
          },
        },
        ...(roleId === "nodashii"
          ? [
              markerEvent(
                "nodashii",
                trigger.triggerId,
                instance.ownerSeatId,
                "nodashii-poisoned",
                getNoDashiiPoisonedTownsfolk(state, instance.ownerSeatId),
                { persistent: true },
              ),
            ]
          : []),
      ],
    });
  },
});

const vigormortisHandler = {
  validateInput: targetValidation,
  resolve: ({ state, trigger, input }) => {
    const outcome = resolveVigormortisKill(state, input.targetSeatId);
    const deathEvent = {
      type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
      payload: {
        recordId: `death-${trigger.triggerId}-${input.targetSeatId}`,
        targetSeatId: input.targetSeatId,
        causeId: "snv.vigormortis",
        actuallyDied: outcome.targetDies,
        retainsAbilityAfterDeath: outcome.retainsAbilityAfterDeath,
        poisonedSeatIds: [],
        ruleSourceIds: [source("vigormortis")],
      },
    };
    return emptyPlan(false, {
      events: [deathEvent],
      ...(outcome.retainsAbilityAfterDeath &&
      outcome.poisonedTownsfolkCandidates.length > 0
        ? {
            adjudicationTask: {
              taskId: `task-${trigger.triggerId}-vigormortis-poison`,
              kind: "snv.vigormortis.poison-neighbor",
              summary: "选择一名因亡骨魔杀死爪牙而中毒的邻近镇民",
              candidateSeatIds: outcome.poisonedTownsfolkCandidates,
            },
          }
        : {}),
    });
  },
  validateAdjudication: ({ task, result }) =>
    task.candidateSeatIds.includes(result.poisonedSeatId)
      ? null
      : adjudicationError("亡骨魔必须在固定邻近镇民候选中选择一人中毒"),
  resolveAdjudication: ({ instance, task, result }) =>
    emptyPlan(false, {
      events: [
        markerEvent(
          "vigormortis",
          task.taskId,
          instance.ownerSeatId,
          "vigormortis-poisoned",
          [result.poisonedSeatId],
          { persistent: true },
        ),
      ],
    }),
};

const passiveActionHandler = (roleId) => ({
  resolve: ({ instance, trigger }) =>
    emptyPlan(false, {
      events: [
        actionEvent(
          roleId,
          trigger.triggerId,
          instance.ownerSeatId,
          [],
          { registered: true },
          false,
        ),
      ],
    }),
});

const suppressUnlessRetained = (roleId, handler) => ({
  ...handler,
  resolveSuppressed: (context) => {
    const retained = (context.state.sectsAndViolets?.markers ?? []).some(
      ({ type, content }) =>
        type === "vigormortis-retains-ability" &&
        content.active &&
        content.targetSeatIds.includes(context.instance.ownerSeatId),
    );
    return retained &&
      isSectsAndVioletsRoleEffective(
        context.state,
        context.instance.ownerSeatId,
        roleId,
        { allowDead: true },
      )
      ? handler.resolve(context)
      : emptyPlan(false);
  },
});

export const createSectsAndVioletsHandlers = () => {
  const handlers = {
    clockmaker: createInformationHandler("clockmaker"),
    dreamer: createInformationHandler("dreamer", {
      validateInput: targetValidation,
    }),
    snakecharmer: snakeCharmerHandler,
    mathematician: createInformationHandler("mathematician"),
    flowergirl: createInformationHandler("flowergirl"),
    towncrier: createInformationHandler("towncrier"),
    oracle: createInformationHandler("oracle"),
    savant: createInformationHandler("savant"),
    seamstress: createInformationHandler("seamstress", {
      validateInput: ({ state, instance, input }) => {
        try {
          resolveSeamstressChoice(
            state,
            instance.ownerSeatId,
            input.targetSeatIds,
          );
          return null;
        } catch (error) {
          return inputError(error.message);
        }
      },
    }),
    philosopher: philosopherHandler,
    artist: createInformationHandler("artist"),
    juggler: createInformationHandler("juggler"),
    sage: createInformationHandler("sage", {
      validateInput: ({ state, instance }) =>
        ownerJustDied(state, instance.ownerSeatId, { demonOnly: true })
          ? null
          : inputError("贤者只能在被恶魔杀死后结算候选信息"),
    }),
    mutant: madnessHandler("mutant"),
    sweetheart: sweetheartHandler,
    barber: barberHandler,
    klutz: klutzHandler,
    eviltwin: suppressUnlessRetained("eviltwin", evilTwinHandler),
    witch: suppressUnlessRetained("witch", witchHandler),
    cerenovus: suppressUnlessRetained("cerenovus", madnessHandler("cerenovus")),
    pithag: suppressUnlessRetained("pithag", pithagHandler),
    fanggu: baseDemonHandler("fanggu"),
    vigormortis: vigormortisHandler,
    nodashii: baseDemonHandler("nodashii"),
    vortox: passiveActionHandler("vortox"),
  };
  return Object.fromEntries(
    SECTS_AND_VIOLETS_ROLE_CATALOG.map(({ id }) => [
      `snv.${id}.handler`,
      handlers[id],
    ]),
  );
};
