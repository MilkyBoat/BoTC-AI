const stableId = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};

export const BAD_MOON_RISING_EVENT_TYPES = Object.freeze({
  ACTION_RECORDED: "bmr.action-recorded",
  ABILITY_USE_CONSUMED: "bmr.ability-use-consumed",
  ALIGNMENT_CHANGED: "bmr.alignment-changed",
  DEATH_RECORDED: "bmr.death-recorded",
  GAME_ENDED: "bmr.game-ended",
  INFORMATION_DELIVERED: "bmr.information-delivered",
  MASTERMIND_ACTIVATED: "bmr.mastermind-activated",
  MARKER_CHANGED: "bmr.marker-changed",
  PLAYER_EXECUTED: "bmr.player-executed",
  PLAYER_REVIVED: "bmr.player-revived",
});

export const BAD_MOON_RISING_EVENT_TYPE_LIST = Object.freeze(
  Object.values(BAD_MOON_RISING_EVENT_TYPES).sort(),
);

export const BAD_MOON_RISING_EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.ACTION_RECORDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "actionType",
        "actorSeatId",
        "targetSeatIds",
        "result",
        "public",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        actionType: stableId,
        actorSeatId: stableId,
        targetSeatIds: {
          type: "array",
          maxItems: 3,
          items: stableId,
        },
        result: stableId,
        public: { type: "boolean" },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => ({
      ...state,
      badMoonRising: {
        ...state.badMoonRising,
        publicActions: event.payload.public
          ? [
              ...state.badMoonRising.publicActions,
              {
                recordId: event.payload.recordId,
                type: event.payload.actionType,
                content: {
                  actorSeatId: event.payload.actorSeatId,
                  targetSeatIds: event.payload.targetSeatIds,
                  result: event.payload.result,
                  ruleSourceIds: event.payload.ruleSourceIds,
                },
              },
            ]
          : state.badMoonRising.publicActions,
      },
    }),
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.ABILITY_USE_CONSUMED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["abilityInstanceId", "reason", "ruleSourceIds"],
      properties: {
        abilityInstanceId: stableId,
        reason: stableId,
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => ({
      ...state,
      abilityInstances: state.abilityInstances.map((instance) =>
        instance.instanceId === event.payload.abilityInstanceId
          ? { ...instance, usesConsumed: instance.usesConsumed + 1 }
          : instance,
      ),
    }),
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.ALIGNMENT_CHANGED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["recordId", "seatId", "from", "to", "reason", "ruleSourceIds"],
      properties: {
        recordId: stableId,
        seatId: stableId,
        from: { enum: ["good", "evil"] },
        to: { enum: ["good", "evil"] },
        reason: stableId,
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.seatId,
      );
      if (!target || target.alignment !== event.payload.from) {
        throw new Error("阵营变化事件与当前席位事实不一致");
      }
      return {
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === target.seatId
            ? { ...seat, alignment: event.payload.to }
            : seat,
        ),
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.GAME_ENDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["alignment", "reason", "ruleSourceIds"],
      properties: {
        alignment: { enum: ["good", "evil"] },
        reason: {
          enum: [
            "all-demons-dead",
            "two-alive",
            "mastermind-good-executed",
            "mastermind-no-good-executed",
          ],
        },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => ({
      ...state,
      lifecycle: "ended",
      phase: "ended",
      winner: {
        alignment: event.payload.alignment,
        reason: event.payload.reason,
        decidedAtRevision: event.sequence,
      },
      seats: state.seats.map((seat) =>
        seat.seatId === state.badMoonRising.mastermindContinuation.demonSeatId
          ? { ...seat, secretlyAlive: false }
          : seat,
      ),
      activeNomination: null,
      activeExile: null,
      nominationsToday: [],
      highestNominationVotes: 0,
      executionCandidate: null,
      exilesToday: [],
      badMoonRising: {
        ...state.badMoonRising,
        mastermindContinuation: {
          ...state.badMoonRising.mastermindContinuation,
          active: false,
        },
      },
      abilityTriggers: state.abilityTriggers.map((trigger) =>
        ["pending", "waiting-adjudication"].includes(trigger.status)
          ? {
              ...trigger,
              status: "cancelled",
              cancellationReason: "phase-ended",
              completedAtRevision: event.sequence,
            }
          : trigger,
      ),
      adjudicationTasks: state.adjudicationTasks.map((task) =>
        task.status === "pending"
          ? {
              ...task,
              status: "cancelled",
              cancellationReason: "phase-ended",
              completedAtRevision: event.sequence,
            }
          : task,
      ),
    }),
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.MARKER_CHANGED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "markerType",
        "ownerSeatId",
        "targetSeatIds",
        "remainingPhaseTransitions",
        "active",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        markerType: stableId,
        ownerSeatId: stableId,
        targetSeatIds: {
          type: "array",
          maxItems: 15,
          items: stableId,
        },
        remainingPhaseTransitions: {
          anyOf: [
            { type: "null" },
            { type: "integer", minimum: 0, maximum: 12 },
          ],
        },
        active: { type: "boolean" },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      const marker = {
        recordId: event.payload.recordId,
        type: event.payload.markerType,
        content: {
          ownerSeatId: event.payload.ownerSeatId,
          targetSeatIds: event.payload.targetSeatIds,
          remainingPhaseTransitions: event.payload.remainingPhaseTransitions,
          active: event.payload.active,
          ruleSourceIds: event.payload.ruleSourceIds,
        },
      };
      return {
        ...state,
        badMoonRising: {
          ...state.badMoonRising,
          markers: [
            ...state.badMoonRising.markers.filter(
              ({ recordId }) => recordId !== marker.recordId,
            ),
            marker,
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.DEATH_RECORDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "targetSeatId",
        "causeId",
        "actuallyDied",
        "publiclyDead",
        "zombuulFirstDeath",
        "preventedBy",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        targetSeatId: stableId,
        causeId: stableId,
        actuallyDied: { type: "boolean" },
        publiclyDead: { type: "boolean" },
        zombuulFirstDeath: { type: "boolean" },
        preventedBy: {
          anyOf: [{ type: "null" }, stableId],
        },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      if (!state.badMoonRising) {
        throw new Error("《黯月初升》死亡事件缺少剧本状态");
      }
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.targetSeatId,
      );
      if (!target) throw new Error("《黯月初升》死亡记录目标不存在");
      const updateSecretLife =
        event.payload.zombuulFirstDeath ||
        (event.payload.actuallyDied && target.secretlyAlive);
      return {
        ...state,
        seats:
          updateSecretLife || event.payload.actuallyDied
            ? state.seats.map((seat) =>
                seat.seatId === target.seatId
                  ? {
                      ...seat,
                      alive: false,
                      deadVoteAvailable: true,
                      secretlyAlive: event.payload.zombuulFirstDeath,
                    }
                  : seat,
              )
            : state.seats,
        badMoonRising: {
          ...state.badMoonRising,
          deathHistory: [
            ...state.badMoonRising.deathHistory,
            {
              recordId: event.payload.recordId,
              type: "death-outcome",
              content: {
                targetSeatId: event.payload.targetSeatId,
                causeId: event.payload.causeId,
                actuallyDied: event.payload.actuallyDied,
                publiclyDead: event.payload.publiclyDead,
                zombuulFirstDeath: event.payload.zombuulFirstDeath,
                preventedBy: event.payload.preventedBy,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.INFORMATION_DELIVERED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "recipientSeatId",
        "sourceRoleId",
        "result",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        recipientSeatId: stableId,
        sourceRoleId: stableId,
        result: { type: "object" },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      if (!state.badMoonRising) {
        throw new Error("《黯月初升》信息事件缺少剧本状态");
      }
      return {
        ...state,
        badMoonRising: {
          ...state.badMoonRising,
          information: [
            ...state.badMoonRising.information,
            {
              recordId: event.payload.recordId,
              type: "private-role-information",
              content: {
                recipientSeatId: event.payload.recipientSeatId,
                sourceRoleId: event.payload.sourceRoleId,
                result: event.payload.result,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.MASTERMIND_ACTIVATED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["demonSeatId", "dayNumber", "ruleSourceIds"],
      properties: {
        demonSeatId: stableId,
        dayNumber: { type: "integer", minimum: 1 },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      const demon = state.seats.find(
        ({ seatId }) => seatId === event.payload.demonSeatId,
      );
      if (
        !demon ||
        demon.alive ||
        demon.characterType !== "demon" ||
        state.badMoonRising.mastermindContinuation.active
      ) {
        throw new Error("主谋延长日的恶魔死亡事实无效");
      }
      return {
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === demon.seatId
            ? { ...seat, secretlyAlive: true }
            : seat,
        ),
        badMoonRising: {
          ...state.badMoonRising,
          mastermindContinuation: {
            active: true,
            demonSeatId: demon.seatId,
            startedDayNumber: event.payload.dayNumber,
          },
        },
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.PLAYER_EXECUTED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "targetSeatId",
        "dayNumber",
        "died",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        targetSeatId: stableId,
        dayNumber: { type: "integer", minimum: 1 },
        died: { type: "boolean" },
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.targetSeatId,
      );
      if (
        state.lifecycle !== "running" ||
        state.phase !== "day" ||
        state.activeNomination !== null ||
        state.activeExile !== null ||
        state.executionToday !== null ||
        state.executionCandidate?.seatId !== target?.seatId ||
        event.payload.dayNumber !== state.dayNumber
      ) {
        throw new Error("《黯月初升》处决事实与当前白天不一致");
      }
      return {
        ...state,
        executionCandidate: null,
        executionToday: {
          dayNumber: state.dayNumber,
          seatId: target.seatId,
          died: event.payload.died,
        },
        badMoonRising: {
          ...state.badMoonRising,
          publicActions: [
            ...state.badMoonRising.publicActions,
            {
              recordId: event.payload.recordId,
              type: "execution",
              content: {
                targetSeatId: target.seatId,
                dayNumber: event.payload.dayNumber,
                died: event.payload.died,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: BAD_MOON_RISING_EVENT_TYPES.PLAYER_REVIVED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "targetSeatId",
        "newRoleInstanceId",
        "newAbilityInstanceId",
        "causeId",
        "sourceRoleId",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        targetSeatId: stableId,
        newRoleInstanceId: stableId,
        newAbilityInstanceId: stableId,
        causeId: stableId,
        sourceRoleId: stableId,
        ruleSourceIds: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: stableId,
        },
      },
    },
    reduce: (state, event) => {
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.targetSeatId,
      );
      if (!target || target.alive || target.secretlyAlive) {
        throw new Error("《黯月初升》复活目标必须是真正死亡玩家");
      }
      const endedInstanceIds = new Set(
        state.abilityInstances
          .filter(
            ({ ownerSeatId, status }) =>
              ownerSeatId === target.seatId && status === "active",
          )
          .map(({ instanceId }) => instanceId),
      );
      const sourceEnded = (record) =>
        endedInstanceIds.has(record.abilityInstanceId);
      return {
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === target.seatId
            ? {
                ...seat,
                alive: true,
                secretlyAlive: false,
                deadVoteAvailable: false,
                roleInstanceId: event.payload.newRoleInstanceId,
              }
            : seat,
        ),
        abilityInstances: [
          ...state.abilityInstances.map((instance) =>
            endedInstanceIds.has(instance.instanceId)
              ? {
                  ...instance,
                  status: "replaced",
                  endedAtRevision: event.sequence,
                }
              : instance,
          ),
          {
            instanceId: event.payload.newAbilityInstanceId,
            definitionId: `bmr.${target.actualRoleId}.ability`,
            ownerSeatId: target.seatId,
            sourceRoleId: `bmr.${target.actualRoleId}`,
            sourceRoleInstanceId: event.payload.newRoleInstanceId,
            status: "active",
            usesConsumed: 0,
            createdAtRevision: event.sequence,
            endedAtRevision: null,
          },
        ],
        abilityConditions: state.abilityConditions.map((condition) =>
          endedInstanceIds.has(condition.sourceAbilityInstanceId) &&
          condition.status === "active"
            ? {
                ...condition,
                status: "cleared",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : condition,
        ),
        abilityTriggers: state.abilityTriggers.map((trigger) =>
          sourceEnded(trigger) &&
          ["pending", "waiting-adjudication"].includes(trigger.status)
            ? {
                ...trigger,
                status: "cancelled",
                cancellationReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : trigger,
        ),
        ongoingAbilityEffects: state.ongoingAbilityEffects.map((effect) =>
          sourceEnded(effect) && effect.status === "active"
            ? {
                ...effect,
                status: "ended",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : effect,
        ),
        delayedAbilityEffects: state.delayedAbilityEffects.map((effect) =>
          sourceEnded(effect) && effect.status === "pending"
            ? {
                ...effect,
                status: "cancelled",
                completionReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : effect,
        ),
        adjudicationTasks: state.adjudicationTasks.map((task) =>
          sourceEnded(task) && task.status === "pending"
            ? {
                ...task,
                status: "cancelled",
                cancellationReason: "role-changed",
                completedAtRevision: event.sequence,
              }
            : task,
        ),
        badMoonRising: {
          ...state.badMoonRising,
          resurrectionHistory: [
            ...state.badMoonRising.resurrectionHistory,
            {
              recordId: event.payload.recordId,
              type: "resurrection",
              content: {
                targetSeatId: target.seatId,
                causeId: event.payload.causeId,
                sourceRoleId: event.payload.sourceRoleId,
                previousRoleInstanceId: target.roleInstanceId,
                newRoleInstanceId: event.payload.newRoleInstanceId,
                newAbilityInstanceId: event.payload.newAbilityInstanceId,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
]);
