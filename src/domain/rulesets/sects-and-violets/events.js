import { SECTS_AND_VIOLETS_ROLE_BY_ID } from "./catalog";

const stableId = {
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
};

const sourceIds = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: stableId,
};

export const SECTS_AND_VIOLETS_EVENT_TYPES = Object.freeze({
  ACTION_RECORDED: "snv.action-recorded",
  ABILITY_ABNORMALITY_RECORDED: "snv.ability-abnormality-recorded",
  CHARACTER_CHANGED: "snv.character-changed",
  CHARACTERS_SWAPPED: "snv.characters-swapped",
  DEATH_RECORDED: "snv.death-recorded",
  FANG_GU_JUMPED: "snv.fang-gu-jumped",
  GAME_ENDED: "snv.game-ended",
  INFORMATION_DELIVERED: "snv.information-delivered",
  MADNESS_RULING_RECORDED: "snv.madness-ruling-recorded",
  MARKER_CHANGED: "snv.marker-changed",
  PHILOSOPHER_ABILITY_GAINED: "snv.philosopher-ability-gained",
  SAGE_AWAKENED: "snv.sage-awakened",
  SWEETHEART_TRIGGERED: "snv.sweetheart-triggered",
  BARBER_TRIGGERED: "snv.barber-triggered",
  KLUTZ_TRIGGERED: "snv.klutz-triggered",
});

export const SECTS_AND_VIOLETS_EVENT_TYPE_LIST = Object.freeze(
  Object.values(SECTS_AND_VIOLETS_EVENT_TYPES).sort(),
);

const 替换能力实例 = (
  state,
  event,
  seat,
  newRoleId,
  newRoleInstanceId,
  newAbilityInstanceId,
) => {
  const endedIds = new Set(
    state.abilityInstances
      .filter(
        ({ ownerSeatId, status }) =>
          ownerSeatId === seat.seatId && status === "active",
      )
      .map(({ instanceId }) => instanceId),
  );
  const sourceEnded = ({ abilityInstanceId }) =>
    endedIds.has(abilityInstanceId);
  return {
    abilityInstances: [
      ...state.abilityInstances.map((instance) =>
        endedIds.has(instance.instanceId)
          ? {
              ...instance,
              status: "replaced",
              endedAtRevision: event.sequence,
            }
          : instance,
      ),
      {
        instanceId: newAbilityInstanceId,
        definitionId: `snv.${newRoleId}.ability`,
        ownerSeatId: seat.seatId,
        sourceRoleId: `snv.${newRoleId}`,
        sourceRoleInstanceId: newRoleInstanceId,
        status: "active",
        usesConsumed: 0,
        createdAtRevision: event.sequence,
        endedAtRevision: null,
      },
    ],
    abilityConditions: state.abilityConditions.map((condition) =>
      endedIds.has(condition.sourceAbilityInstanceId) &&
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
      sourceEnded(effect) &&
      ["pending", "waiting-source"].includes(effect.status)
        ? {
            ...effect,
            status: "cancelled",
            cancellationReason: "role-changed",
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
  };
};

const 记录角色变化 = (state, event, content) => ({
  ...state.sectsAndViolets,
  characterChanges: [
    ...state.sectsAndViolets.characterChanges,
    {
      recordId: content.recordId,
      type: content.type,
      content,
    },
  ],
});

export const SECTS_AND_VIOLETS_EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.ACTION_RECORDED,
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
          maxItems: 5,
          items: stableId,
        },
        result: { type: "object" },
        public: { type: "boolean" },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => ({
      ...state,
      sectsAndViolets: {
        ...state.sectsAndViolets,
        publicActions: event.payload.public
          ? [
              ...state.sectsAndViolets.publicActions,
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
          : state.sectsAndViolets.publicActions,
      },
    }),
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.INFORMATION_DELIVERED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "recipientSeatId",
        "sourceRoleId",
        "truth",
        "delivered",
        "truthful",
        "vortoxConstrained",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        recipientSeatId: stableId,
        sourceRoleId: stableId,
        truth: { type: "object" },
        delivered: { type: "object" },
        truthful: { type: "boolean" },
        vortoxConstrained: { type: "boolean" },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => ({
      ...state,
      sectsAndViolets: {
        ...state.sectsAndViolets,
        information: [
          ...state.sectsAndViolets.information,
          {
            recordId: event.payload.recordId,
            type: "private-role-information",
            content: {
              recipientSeatId: event.payload.recipientSeatId,
              sourceRoleId: event.payload.sourceRoleId,
              truth: event.payload.truth,
              delivered: event.payload.delivered,
              truthful: event.payload.truthful,
              vortoxConstrained: event.payload.vortoxConstrained,
              ruleSourceIds: event.payload.ruleSourceIds,
            },
          },
        ],
      },
    }),
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.MARKER_CHANGED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "markerType",
        "ownerSeatId",
        "targetSeatIds",
        "active",
        "persistent",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        markerType: stableId,
        ownerSeatId: stableId,
        targetSeatIds: { type: "array", maxItems: 15, items: stableId },
        active: { type: "boolean" },
        persistent: { type: "boolean" },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      const marker = {
        recordId: event.payload.recordId,
        type: event.payload.markerType,
        content: {
          ownerSeatId: event.payload.ownerSeatId,
          targetSeatIds: event.payload.targetSeatIds,
          active: event.payload.active,
          persistent: event.payload.persistent,
          ruleSourceIds: event.payload.ruleSourceIds,
        },
      };
      return {
        ...state,
        sectsAndViolets: {
          ...state.sectsAndViolets,
          markers: [
            ...state.sectsAndViolets.markers.filter(
              ({ recordId }) => recordId !== marker.recordId,
            ),
            marker,
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.ABILITY_ABNORMALITY_RECORDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "seatId",
        "causeRoleId",
        "reason",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        seatId: stableId,
        causeRoleId: stableId,
        reason: stableId,
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => ({
      ...state,
      sectsAndViolets: {
        ...state.sectsAndViolets,
        abilityAbnormalities: [
          ...state.sectsAndViolets.abilityAbnormalities,
          {
            recordId: event.payload.recordId,
            type: "ability-abnormality",
            content: {
              seatId: event.payload.seatId,
              causeRoleId: event.payload.causeRoleId,
              reason: event.payload.reason,
              ruleSourceIds: event.payload.ruleSourceIds,
            },
          },
        ],
      },
    }),
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTERS_SWAPPED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "seatIds",
        "newRoleInstanceIds",
        "newAbilityInstanceIds",
        "swapAlignments",
        "reason",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        seatIds: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: stableId,
        },
        newRoleInstanceIds: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: stableId,
        },
        newAbilityInstanceIds: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: stableId,
        },
        swapAlignments: { type: "boolean" },
        reason: stableId,
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      const [leftId, rightId] = event.payload.seatIds;
      const left = state.seats.find(({ seatId }) => seatId === leftId);
      const right = state.seats.find(({ seatId }) => seatId === rightId);
      if (!left || !right) throw new Error("角色交换目标不存在");
      const leftRole = SECTS_AND_VIOLETS_ROLE_BY_ID.get(right.actualRoleId);
      const rightRole = SECTS_AND_VIOLETS_ROLE_BY_ID.get(left.actualRoleId);
      const leftLifecycle = 替换能力实例(
        state,
        event,
        left,
        right.actualRoleId,
        event.payload.newRoleInstanceIds[0],
        event.payload.newAbilityInstanceIds[0],
      );
      const intermediate = { ...state, ...leftLifecycle };
      const rightLifecycle = 替换能力实例(
        intermediate,
        event,
        right,
        left.actualRoleId,
        event.payload.newRoleInstanceIds[1],
        event.payload.newAbilityInstanceIds[1],
      );
      const seats = state.seats.map((seat) => {
        if (seat.seatId === leftId) {
          return {
            ...seat,
            actualRoleId: right.actualRoleId,
            perceivedRoleId: right.actualRoleId,
            characterType: leftRole.characterType,
            alignment: event.payload.swapAlignments
              ? right.alignment
              : left.alignment,
            roleInstanceId: event.payload.newRoleInstanceIds[0],
          };
        }
        if (seat.seatId === rightId) {
          return {
            ...seat,
            actualRoleId: left.actualRoleId,
            perceivedRoleId: left.actualRoleId,
            characterType: rightRole.characterType,
            alignment: event.payload.swapAlignments
              ? left.alignment
              : right.alignment,
            roleInstanceId: event.payload.newRoleInstanceIds[1],
          };
        }
        return seat;
      });
      const content = {
        recordId: event.payload.recordId,
        type: "characters-swapped",
        seatIds: event.payload.seatIds,
        fromRoleIds: [left.actualRoleId, right.actualRoleId],
        toRoleIds: [right.actualRoleId, left.actualRoleId],
        swapAlignments: event.payload.swapAlignments,
        reason: event.payload.reason,
        ruleSourceIds: event.payload.ruleSourceIds,
      };
      return {
        ...state,
        ...rightLifecycle,
        seats,
        sectsAndViolets: 记录角色变化(state, event, content),
      };
    },
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.CHARACTER_CHANGED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "seatId",
        "newRoleId",
        "newRoleInstanceId",
        "newAbilityInstanceId",
        "preserveAlignment",
        "reason",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        seatId: stableId,
        newRoleId: stableId,
        newRoleInstanceId: stableId,
        newAbilityInstanceId: stableId,
        preserveAlignment: { type: "boolean" },
        reason: stableId,
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.seatId,
      );
      const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(event.payload.newRoleId);
      if (!target || !role) throw new Error("角色变化目标或新角色不存在");
      const lifecycle = 替换能力实例(
        state,
        event,
        target,
        role.id,
        event.payload.newRoleInstanceId,
        event.payload.newAbilityInstanceId,
      );
      const content = {
        recordId: event.payload.recordId,
        type: "character-changed",
        seatId: target.seatId,
        fromRoleId: target.actualRoleId,
        toRoleId: role.id,
        preserveAlignment: event.payload.preserveAlignment,
        reason: event.payload.reason,
        ruleSourceIds: event.payload.ruleSourceIds,
      };
      return {
        ...state,
        ...lifecycle,
        seats: state.seats.map((seat) =>
          seat.seatId === target.seatId
            ? {
                ...seat,
                actualRoleId: role.id,
                perceivedRoleId: role.id,
                characterType: role.characterType,
                alignment: event.payload.preserveAlignment
                  ? target.alignment
                  : role.alignment,
                roleInstanceId: event.payload.newRoleInstanceId,
              }
            : seat,
        ),
        sectsAndViolets: 记录角色变化(state, event, content),
      };
    },
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.DEATH_RECORDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "targetSeatId",
        "causeId",
        "actuallyDied",
        "retainsAbilityAfterDeath",
        "poisonedSeatIds",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        targetSeatId: stableId,
        causeId: stableId,
        actuallyDied: { type: "boolean" },
        retainsAbilityAfterDeath: { type: "boolean" },
        poisonedSeatIds: { type: "array", maxItems: 2, items: stableId },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.targetSeatId,
      );
      if (!target) throw new Error("《梦殒春宵》死亡目标不存在");
      const marker = event.payload.retainsAbilityAfterDeath
        ? {
            recordId: `marker-${event.payload.recordId}-retains-ability`,
            type: "vigormortis-retains-ability",
            content: {
              ownerSeatId: event.payload.targetSeatId,
              targetSeatIds: [event.payload.targetSeatId],
              active: true,
              persistent: true,
              ruleSourceIds: event.payload.ruleSourceIds,
            },
          }
        : null;
      return {
        ...state,
        seats: event.payload.actuallyDied
          ? state.seats.map((seat) =>
              seat.seatId === target.seatId
                ? { ...seat, alive: false, deadVoteAvailable: true }
                : seat,
            )
          : state.seats,
        sectsAndViolets: {
          ...state.sectsAndViolets,
          markers: marker
            ? [...state.sectsAndViolets.markers, marker]
            : state.sectsAndViolets.markers,
          deathHistory: [
            ...state.sectsAndViolets.deathHistory,
            {
              recordId: event.payload.recordId,
              type: "death-outcome",
              content: {
                targetSeatId: event.payload.targetSeatId,
                causeId: event.payload.causeId,
                actuallyDied: event.payload.actuallyDied,
                retainsAbilityAfterDeath:
                  event.payload.retainsAbilityAfterDeath,
                poisonedSeatIds: event.payload.poisonedSeatIds,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.FANG_GU_JUMPED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "oldDemonSeatId",
        "newDemonSeatId",
        "newRoleInstanceId",
        "newAbilityInstanceId",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        oldDemonSeatId: stableId,
        newDemonSeatId: stableId,
        newRoleInstanceId: stableId,
        newAbilityInstanceId: stableId,
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      if (state.sectsAndViolets.fangGuJumpUsed) {
        throw new Error("方古整局限一次跳转已经使用");
      }
      const oldDemon = state.seats.find(
        ({ seatId }) => seatId === event.payload.oldDemonSeatId,
      );
      const target = state.seats.find(
        ({ seatId }) => seatId === event.payload.newDemonSeatId,
      );
      if (
        oldDemon?.actualRoleId !== "fanggu" ||
        !oldDemon.alive ||
        target?.characterType !== "outsider" ||
        !target.alive
      ) {
        throw new Error("方古跳转事实与当前角色或生死不一致");
      }
      const lifecycle = 替换能力实例(
        state,
        event,
        target,
        "fanggu",
        event.payload.newRoleInstanceId,
        event.payload.newAbilityInstanceId,
      );
      return {
        ...state,
        ...lifecycle,
        seats: state.seats.map((seat) => {
          if (seat.seatId === oldDemon.seatId) {
            return { ...seat, alive: false, deadVoteAvailable: true };
          }
          if (seat.seatId === target.seatId) {
            return {
              ...seat,
              actualRoleId: "fanggu",
              perceivedRoleId: "fanggu",
              characterType: "demon",
              alignment: "evil",
              roleInstanceId: event.payload.newRoleInstanceId,
            };
          }
          return seat;
        }),
        sectsAndViolets: {
          ...state.sectsAndViolets,
          fangGuJumpUsed: true,
          characterChanges: [
            ...state.sectsAndViolets.characterChanges,
            {
              recordId: event.payload.recordId,
              type: "fang-gu-jumped",
              content: {
                oldDemonSeatId: oldDemon.seatId,
                newDemonSeatId: target.seatId,
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
          deathHistory: [
            ...state.sectsAndViolets.deathHistory,
            {
              recordId: `death-${event.payload.recordId}`,
              type: "death-outcome",
              content: {
                targetSeatId: oldDemon.seatId,
                causeId: "snv.fanggu-jump",
                actuallyDied: true,
                retainsAbilityAfterDeath: false,
                poisonedSeatIds: [],
                ruleSourceIds: event.payload.ruleSourceIds,
              },
            },
          ],
        },
      };
    },
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.MADNESS_RULING_RECORDED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "sourceRoleId",
        "targetSeatId",
        "ruling",
        "executionRequested",
        "evidenceSummary",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        sourceRoleId: { enum: ["mutant", "cerenovus"] },
        targetSeatId: stableId,
        ruling: { enum: ["complied", "not-complied", "no-ruling"] },
        executionRequested: { type: "boolean" },
        evidenceSummary: { type: "string", maxLength: 512 },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => ({
      ...state,
      sectsAndViolets: {
        ...state.sectsAndViolets,
        madnessRulings: [
          ...state.sectsAndViolets.madnessRulings,
          {
            recordId: event.payload.recordId,
            type: "madness-ruling",
            content: {
              sourceRoleId: event.payload.sourceRoleId,
              targetSeatId: event.payload.targetSeatId,
              ruling: event.payload.ruling,
              executionRequested: event.payload.executionRequested,
              evidenceSummary: event.payload.evidenceSummary,
              inferredIntent: false,
              ruleSourceIds: event.payload.ruleSourceIds,
            },
          },
        ],
      },
    }),
  }),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.PHILOSOPHER_ABILITY_GAINED,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordId",
        "seatId",
        "roleId",
        "abilityInstanceId",
        "sourceRoleInstanceId",
        "drunkSeatId",
        "ruleSourceIds",
      ],
      properties: {
        recordId: stableId,
        seatId: stableId,
        roleId: stableId,
        abilityInstanceId: stableId,
        sourceRoleInstanceId: stableId,
        drunkSeatId: { anyOf: [{ type: "null" }, stableId] },
        ruleSourceIds: sourceIds,
      },
    },
    reduce: (state, event) => {
      const philosopher = state.seats.find(
        ({ seatId }) => seatId === event.payload.seatId,
      );
      const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(event.payload.roleId);
      if (
        philosopher?.actualRoleId !== "philosopher" ||
        !role ||
        role.alignment !== "good" ||
        state.abilityInstances.some(
          ({ instanceId }) => instanceId === event.payload.abilityInstanceId,
        )
      ) {
        throw new Error("哲学家获得能力事件与当前状态不一致");
      }
      const gainedMarker = {
        recordId: event.payload.recordId,
        type: "philosopher-gained-ability",
        content: {
          ownerSeatId: philosopher.seatId,
          targetSeatIds: [],
          active: true,
          persistent: true,
          roleId: role.id,
          abilityInstanceId: event.payload.abilityInstanceId,
          ruleSourceIds: event.payload.ruleSourceIds,
        },
      };
      const drunkMarker = event.payload.drunkSeatId
        ? {
            recordId: `marker-${event.payload.recordId}-drunk`,
            type: "drunk",
            content: {
              ownerSeatId: philosopher.seatId,
              targetSeatIds: [event.payload.drunkSeatId],
              active: true,
              persistent: true,
              ruleSourceIds: event.payload.ruleSourceIds,
            },
          }
        : null;
      return {
        ...state,
        abilityInstances: [
          ...state.abilityInstances,
          {
            instanceId: event.payload.abilityInstanceId,
            definitionId: `snv.${role.id}.ability`,
            ownerSeatId: philosopher.seatId,
            sourceRoleId: "snv.philosopher",
            sourceRoleInstanceId: event.payload.sourceRoleInstanceId,
            status: "active",
            usesConsumed: 0,
            createdAtRevision: event.sequence,
            endedAtRevision: null,
          },
        ],
        sectsAndViolets: {
          ...state.sectsAndViolets,
          markers: [
            ...state.sectsAndViolets.markers,
            gainedMarker,
            ...(drunkMarker ? [drunkMarker] : []),
          ],
        },
      };
    },
  }),
  ...[
    SECTS_AND_VIOLETS_EVENT_TYPES.SAGE_AWAKENED,
    SECTS_AND_VIOLETS_EVENT_TYPES.SWEETHEART_TRIGGERED,
    SECTS_AND_VIOLETS_EVENT_TYPES.BARBER_TRIGGERED,
    SECTS_AND_VIOLETS_EVENT_TYPES.KLUTZ_TRIGGERED,
  ].map((type) =>
    Object.freeze({
      type,
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: ["seatId", "deathRecordId", "ruleSourceIds"],
        properties: {
          seatId: stableId,
          deathRecordId: stableId,
          ruleSourceIds: sourceIds,
        },
      },
      reduce: (state) => state,
    }),
  ),
  Object.freeze({
    type: SECTS_AND_VIOLETS_EVENT_TYPES.GAME_ENDED,
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
            "evil-twin-good-twin-executed",
            "klutz-evil-chosen",
            "vortox-no-execution",
          ],
        },
        ruleSourceIds: sourceIds,
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
      activeNomination: null,
      activeExile: null,
      nominationsToday: [],
      highestNominationVotes: 0,
      executionCandidate: null,
      exilesToday: [],
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
]);
