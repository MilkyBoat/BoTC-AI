import {
  TROUBLE_BREWING_PACKAGE_ID,
  TROUBLE_BREWING_PACKAGE_VERSION,
  TROUBLE_BREWING_ROLE_BY_ID,
} from "./catalog";

const 标准数量 = Object.freeze({
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
});

const 稳定Id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const 建立确定性随机数 = (seed) => {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const 洗牌 = (items, random) => {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const 按类型选择角色 = (characterType, count, random, excluded = new Set()) =>
  洗牌(
    Array.from(TROUBLE_BREWING_ROLE_BY_ID.values()).filter(
      ({ id, characterType: type }) =>
        type === characterType && !excluded.has(id),
    ),
    random,
  )
    .slice(0, count)
    .map(({ id }) => id);

export const deriveTroubleBrewingCounts = (
  playerCount,
  { hasBaron = false } = {},
) => {
  const base = 标准数量[playerCount];
  if (!base) throw new Error("《暗流涌动》标准开局只支持 5 至 15 名非旅行者");
  const [townsfolk, outsider, minion, demon] = base;
  if (hasBaron && townsfolk < 2) {
    throw new Error("当前人数无法应用男爵的两个外来者调整");
  }
  return Object.freeze({
    townsfolk: townsfolk - (hasBaron ? 2 : 0),
    outsider: outsider + (hasBaron ? 2 : 0),
    minion,
    demon,
  });
};

const 错误 = (code, message, details) => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const 角色计数 = (assignments) =>
  assignments.reduce(
    (counts, { actualRoleId }) => {
      const role = TROUBLE_BREWING_ROLE_BY_ID.get(actualRoleId);
      if (role) counts[role.characterType] += 1;
      return counts;
    },
    { townsfolk: 0, outsider: 0, minion: 0, demon: 0 },
  );

const 同数量 = (left, right) =>
  ["townsfolk", "outsider", "minion", "demon"].every(
    (key) => left[key] === right[key],
  );

export const validateTroubleBrewingSetup = ({
  assignments,
  redHerringSeatId = null,
  demonBluffs = [],
} = {}) => {
  const errors = [];
  if (
    !Array.isArray(assignments) ||
    assignments.length < 5 ||
    assignments.length > 15
  ) {
    return {
      valid: false,
      errors: [错误("INVALID_PLAYER_COUNT", "开局人数必须为 5 至 15")],
    };
  }
  const seatIds = new Set();
  const orders = new Set();
  const actualRoleIds = new Set();
  assignments.forEach((assignment, index) => {
    const role = TROUBLE_BREWING_ROLE_BY_ID.get(assignment.actualRoleId);
    if (
      !role ||
      !稳定Id.test(assignment.seatId ?? "") ||
      !稳定Id.test(assignment.roleInstanceId ?? "") ||
      assignment.order !== index + 1 ||
      seatIds.has(assignment.seatId) ||
      orders.has(assignment.order)
    ) {
      errors.push(
        错误("INVALID_ASSIGNMENT", "座位、顺序、角色或角色实例无效", {
          seatId: assignment.seatId ?? null,
        }),
      );
    }
    if (actualRoleIds.has(assignment.actualRoleId)) {
      errors.push(
        错误("DUPLICATE_ROLE", "《暗流涌动》实际角色不得重复", {
          roleId: assignment.actualRoleId,
        }),
      );
    }
    seatIds.add(assignment.seatId);
    orders.add(assignment.order);
    actualRoleIds.add(assignment.actualRoleId);
    const perceived = TROUBLE_BREWING_ROLE_BY_ID.get(
      assignment.perceivedRoleId,
    );
    if (assignment.actualRoleId === "drunk") {
      if (
        perceived?.characterType !== "townsfolk" ||
        actualRoleIds.has(assignment.perceivedRoleId) ||
        assignments.some(
          ({ actualRoleId }) => actualRoleId === assignment.perceivedRoleId,
        )
      ) {
        errors.push(
          错误("INVALID_DRUNK_PERCEPTION", "酒鬼必须看到一个不在场镇民身份"),
        );
      }
    } else if (assignment.perceivedRoleId !== assignment.actualRoleId) {
      errors.push(
        错误("INVALID_ROLE_PERCEPTION", "非酒鬼席位的感知身份必须等于真实身份"),
      );
    }
  });

  const hasBaron = actualRoleIds.has("baron");
  const expected = deriveTroubleBrewingCounts(assignments.length, { hasBaron });
  const actual = 角色计数(assignments);
  if (!同数量(actual, expected)) {
    errors.push(
      错误("INVALID_ROLE_COUNTS", "角色类型数量与标准人数或男爵调整不一致", {
        expected,
        actual,
      }),
    );
  }

  const redHerring = assignments.find(
    ({ seatId }) => seatId === redHerringSeatId,
  );
  const hasFortuneTeller = actualRoleIds.has("fortuneteller");
  if (
    (hasFortuneTeller &&
      (!redHerring ||
        TROUBLE_BREWING_ROLE_BY_ID.get(redHerring.actualRoleId)?.alignment !==
          "good")) ||
    (!hasFortuneTeller && redHerringSeatId !== null)
  ) {
    errors.push(
      错误("INVALID_RED_HERRING", "占卜师干扰项必须是一个在场善良玩家"),
    );
  }

  const bluffRoles = demonBluffs.map((roleId) =>
    TROUBLE_BREWING_ROLE_BY_ID.get(roleId),
  );
  const expectsBluffs = assignments.length >= 7;
  if (
    !Array.isArray(demonBluffs) ||
    (expectsBluffs ? demonBluffs.length !== 3 : demonBluffs.length !== 0) ||
    new Set(demonBluffs).size !== demonBluffs.length ||
    bluffRoles.some((role) => !role || role.alignment !== "good") ||
    demonBluffs.some((roleId) => actualRoleIds.has(roleId))
  ) {
    errors.push(
      错误(
        "INVALID_DEMON_BLUFFS",
        expectsBluffs
          ? "7 人及以上必须提供三个不在场且不重复的善良角色"
          : "5/6 人局不得提供恶魔伪装角色",
      ),
    );
  }
  return { valid: errors.length === 0, errors };
};

export const generateTroubleBrewingSetup = ({
  playerCount,
  seed,
  seatIds,
} = {}) => {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("生成《暗流涌动》开局必须提供非空固定种子");
  }
  const baseCounts = deriveTroubleBrewingCounts(playerCount);
  const random = 建立确定性随机数(seed);
  const minionRoleIds = 按类型选择角色("minion", baseCounts.minion, random);
  const counts = deriveTroubleBrewingCounts(playerCount, {
    hasBaron: minionRoleIds.includes("baron"),
  });
  const actualRoleIds = 洗牌(
    [
      ...按类型选择角色("townsfolk", counts.townsfolk, random),
      ...按类型选择角色("outsider", counts.outsider, random),
      ...minionRoleIds,
      ...按类型选择角色("demon", counts.demon, random),
    ],
    random,
  );
  const resolvedSeatIds =
    seatIds === undefined
      ? actualRoleIds.map((_, index) => `seat-${index + 1}`)
      : seatIds.slice();
  if (
    resolvedSeatIds.length !== playerCount ||
    new Set(resolvedSeatIds).size !== playerCount ||
    resolvedSeatIds.some((seatId) => !稳定Id.test(seatId))
  ) {
    throw new Error("生成开局的席位 ID 必须与人数一致、唯一且格式合法");
  }
  const actualRoleIdSet = new Set(actualRoleIds);
  const assignments = actualRoleIds.map((actualRoleId, index) => ({
    seatId: resolvedSeatIds[index],
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));
  const drunk = assignments.find(
    ({ actualRoleId }) => actualRoleId === "drunk",
  );
  if (drunk) {
    drunk.perceivedRoleId = 按类型选择角色(
      "townsfolk",
      1,
      random,
      actualRoleIdSet,
    )[0];
  }
  const fortuneTeller = assignments.some(
    ({ actualRoleId }) => actualRoleId === "fortuneteller",
  );
  const goodAssignments = assignments.filter(
    ({ actualRoleId }) =>
      TROUBLE_BREWING_ROLE_BY_ID.get(actualRoleId).alignment === "good",
  );
  const redHerringSeatId = fortuneTeller
    ? goodAssignments[Math.floor(random() * goodAssignments.length)].seatId
    : null;
  const demonBluffs =
    playerCount >= 7
      ? 洗牌(
          Array.from(TROUBLE_BREWING_ROLE_BY_ID.values()).filter(
            ({ id, alignment }) =>
              alignment === "good" && !actualRoleIdSet.has(id),
          ),
          random,
        )
          .slice(0, 3)
          .map(({ id }) => id)
      : [];
  const result = {
    assignments,
    redHerringSeatId,
    demonBluffs,
  };
  const validation = validateTroubleBrewingSetup(result);
  if (!validation.valid) {
    throw new Error(
      `固定种子生成了无效开局：${validation.errors
        .map(({ code }) => code)
        .join(",")}`,
    );
  }
  return Object.freeze({
    assignments: Object.freeze(assignments.map((item) => Object.freeze(item))),
    redHerringSeatId,
    demonBluffs: Object.freeze(demonBluffs),
  });
};

export const createTroubleBrewingAbilityInstances = (assignments) => {
  const instances = [];
  const initialConditions = [];
  assignments.forEach((assignment) => {
    const effectiveRoleId =
      assignment.actualRoleId === "drunk"
        ? assignment.perceivedRoleId
        : assignment.actualRoleId;
    instances.push({
      instanceId: `ability-${assignment.roleInstanceId}`,
      definitionId: `tb.${effectiveRoleId}.ability`,
      ownerSeatId: assignment.seatId,
      sourceRoleId: `tb.${effectiveRoleId}`,
      sourceRoleInstanceId: assignment.roleInstanceId,
    });
    if (assignment.actualRoleId === "drunk") {
      initialConditions.push({
        conditionId: `condition-drunk-${assignment.roleInstanceId}`,
        seatId: assignment.seatId,
        conditionType: "drunk",
        sourceId: "tb.drunk",
        active: true,
      });
    }
  });
  return Object.freeze({
    instances: Object.freeze(instances),
    initialConditions: Object.freeze(initialConditions),
  });
};

export const buildTroubleBrewingSeatInputs = (assignments) =>
  assignments.map((assignment) => {
    const role = TROUBLE_BREWING_ROLE_BY_ID.get(assignment.actualRoleId);
    return {
      seatId: assignment.seatId,
      order: assignment.order,
      characterType: role.characterType,
      actualRoleId: assignment.actualRoleId,
      perceivedRoleId: assignment.perceivedRoleId,
      alignment: role.alignment,
      roleInstanceId: assignment.roleInstanceId,
    };
  });

export const createInitialTroubleBrewingState = ({
  assignments,
  redHerringSeatId,
  demonBluffs,
}) => ({
  packageId: TROUBLE_BREWING_PACKAGE_ID,
  version: TROUBLE_BREWING_PACKAGE_VERSION,
  setup: {
    redHerringSeatId,
    demonBluffs: demonBluffs.slice(),
    evilTeamSeatIds:
      assignments.length >= 7
        ? assignments
            .filter(({ actualRoleId }) =>
              ["poisoner", "spy", "scarletwoman", "baron", "imp"].includes(
                actualRoleId,
              ),
            )
            .map(({ seatId }) => seatId)
        : [],
  },
  information: [],
  markers: [],
  deathHistory: [],
  registrationHistory: [],
  publicActions: [],
  butlerViolations: [],
});
