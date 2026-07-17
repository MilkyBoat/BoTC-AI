import { cloneAndFreezeJson } from "../../protocol/immutable";
import {
  BAD_MOON_RISING_PACKAGE_ID,
  BAD_MOON_RISING_PACKAGE_VERSION,
  BAD_MOON_RISING_ROLE_BY_ID,
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

const 建立随机数 = (seed) => {
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

const 按类型选择 = (type, count, random, excluded = new Set()) =>
  洗牌(
    Array.from(BAD_MOON_RISING_ROLE_BY_ID.values()).filter(
      ({ id, characterType }) => characterType === type && !excluded.has(id),
    ),
    random,
  )
    .slice(0, count)
    .map(({ id }) => id);

export const deriveBadMoonRisingCounts = (
  playerCount,
  { hasGodfather = false, godfatherDelta = 0 } = {},
) => {
  const base = 标准数量[playerCount];
  if (!base) throw new Error("《黯月初升》标准开局只支持 5 至 15 名非旅行者");
  if (
    (!hasGodfather && godfatherDelta !== 0) ||
    (hasGodfather && ![-1, 1].includes(godfatherDelta))
  ) {
    throw new Error("教父在场时必须且只能选择 -1 或 +1 外来者调整");
  }
  const [townsfolk, outsider, minion, demon] = base;
  if (outsider + godfatherDelta < 0 || townsfolk - godfatherDelta < 0) {
    throw new Error("当前人数无法应用教父的外来者数量调整");
  }
  return Object.freeze({
    townsfolk: townsfolk - godfatherDelta,
    outsider: outsider + godfatherDelta,
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
      const role = BAD_MOON_RISING_ROLE_BY_ID.get(actualRoleId);
      if (role) counts[role.characterType] += 1;
      return counts;
    },
    { townsfolk: 0, outsider: 0, minion: 0, demon: 0 },
  );

const 数量一致 = (left, right) =>
  ["townsfolk", "outsider", "minion", "demon"].every(
    (key) => left[key] === right[key],
  );

const 验证角色列表 = (roles, expectedLength, actualRoleIds) =>
  Array.isArray(roles) &&
  roles.length === expectedLength &&
  new Set(roles).size === roles.length &&
  roles.every((roleId) => {
    const role = BAD_MOON_RISING_ROLE_BY_ID.get(roleId);
    return role?.alignment === "good" && !actualRoleIds.has(roleId);
  });

export const validateBadMoonRisingSetup = ({
  assignments,
  godfatherDelta = 0,
  grandchildSeatId = null,
  demonBluffs = [],
  lunaticMinionSeatIds = [],
  lunaticBluffs = [],
} = {}) => {
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
  const errors = [];
  const seatIds = new Set();
  const actualRoleIds = new Set();
  assignments.forEach((assignment, index) => {
    const role = BAD_MOON_RISING_ROLE_BY_ID.get(assignment.actualRoleId);
    const perceived = BAD_MOON_RISING_ROLE_BY_ID.get(
      assignment.perceivedRoleId,
    );
    if (
      !role ||
      !稳定Id.test(assignment.seatId ?? "") ||
      !稳定Id.test(assignment.roleInstanceId ?? "") ||
      assignment.order !== index + 1 ||
      seatIds.has(assignment.seatId)
    ) {
      errors.push(错误("INVALID_ASSIGNMENT", "座位、顺序、角色或实例无效"));
    }
    if (actualRoleIds.has(assignment.actualRoleId)) {
      errors.push(错误("DUPLICATE_ROLE", "《黯月初升》实际角色不得重复"));
    }
    if (
      (assignment.actualRoleId === "lunatic" &&
        perceived?.characterType !== "demon") ||
      (assignment.actualRoleId !== "lunatic" &&
        assignment.perceivedRoleId !== assignment.actualRoleId)
    ) {
      errors.push(
        错误("INVALID_ROLE_PERCEPTION", "只有疯子可以感知为一个恶魔角色"),
      );
    }
    seatIds.add(assignment.seatId);
    actualRoleIds.add(assignment.actualRoleId);
  });

  let expected = null;
  try {
    expected = deriveBadMoonRisingCounts(assignments.length, {
      hasGodfather: actualRoleIds.has("godfather"),
      godfatherDelta,
    });
  } catch (error) {
    errors.push(错误("INVALID_GODFATHER_DELTA", error.message));
  }
  if (expected && !数量一致(角色计数(assignments), expected)) {
    errors.push(错误("INVALID_ROLE_COUNTS", "角色类型数量与设置调整不一致"));
  }

  const grandchild = assignments.find(
    ({ seatId }) => seatId === grandchildSeatId,
  );
  if (
    (actualRoleIds.has("grandmother") &&
      (!grandchild ||
        grandchild.actualRoleId === "grandmother" ||
        BAD_MOON_RISING_ROLE_BY_ID.get(grandchild.actualRoleId)?.alignment !==
          "good")) ||
    (!actualRoleIds.has("grandmother") && grandchildSeatId !== null)
  ) {
    errors.push(错误("INVALID_GRANDCHILD", "祖母必须绑定另一名善良孙子"));
  }

  const expectsTeamInfo = assignments.length >= 7;
  if (!验证角色列表(demonBluffs, expectsTeamInfo ? 3 : 0, actualRoleIds)) {
    errors.push(错误("INVALID_DEMON_BLUFFS", "恶魔伪装角色无效"));
  }
  const lunatic = assignments.find(
    ({ actualRoleId }) => actualRoleId === "lunatic",
  );
  const expectedMinions = expected?.minion ?? 0;
  if (
    lunatic &&
    expectsTeamInfo &&
    (!验证角色列表(lunaticBluffs, 3, new Set()) ||
      lunaticMinionSeatIds.length !== expectedMinions ||
      new Set(lunaticMinionSeatIds).size !== lunaticMinionSeatIds.length ||
      lunaticMinionSeatIds.some((seatId) => !seatIds.has(seatId)))
  ) {
    errors.push(错误("INVALID_LUNATIC_INFORMATION", "疯子首夜伪信息无效"));
  }
  if (
    (!lunatic || !expectsTeamInfo) &&
    (lunaticMinionSeatIds.length !== 0 || lunaticBluffs.length !== 0)
  ) {
    errors.push(
      错误("INVALID_LUNATIC_INFORMATION", "当前对局不得提供疯子伪信息"),
    );
  }
  return { valid: errors.length === 0, errors };
};

export const buildBadMoonRisingSeatInputs = (assignments) =>
  assignments.map((assignment) => {
    const role = BAD_MOON_RISING_ROLE_BY_ID.get(assignment.actualRoleId);
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

export const createBadMoonRisingAbilityInstances = (assignments) => ({
  instances: assignments.map((assignment) => ({
    instanceId: `bmr-ability-${assignment.roleInstanceId}`,
    definitionId: `bmr.${assignment.actualRoleId}.ability`,
    ownerSeatId: assignment.seatId,
    sourceRoleId: `bmr.${assignment.actualRoleId}`,
    sourceRoleInstanceId: assignment.roleInstanceId,
  })),
  initialConditions: [],
});

export const createInitialBadMoonRisingState = ({
  assignments,
  godfatherDelta = 0,
  grandchildSeatId = null,
  demonBluffs = [],
  lunaticMinionSeatIds = [],
  lunaticBluffs = [],
}) =>
  cloneAndFreezeJson({
    packageId: BAD_MOON_RISING_PACKAGE_ID,
    version: BAD_MOON_RISING_PACKAGE_VERSION,
    setup: {
      godfatherDelta,
      grandchildSeatId,
      demonBluffs,
      evilTeamSeatIds: assignments
        .filter(({ actualRoleId }) =>
          ["minion", "demon"].includes(
            BAD_MOON_RISING_ROLE_BY_ID.get(actualRoleId).characterType,
          ),
        )
        .map(({ seatId }) => seatId),
      lunaticSeatId:
        assignments.find(({ actualRoleId }) => actualRoleId === "lunatic")
          ?.seatId ?? null,
      lunaticMinionSeatIds,
      lunaticBluffs,
    },
    information: [],
    markers: [],
    deathHistory: [],
    resurrectionHistory: [],
    publicActions: [],
    mastermindContinuation: {
      active: false,
      demonSeatId: null,
      startedDayNumber: null,
    },
  });

export const generateBadMoonRisingSetup = ({
  playerCount,
  seed,
  seatIds,
} = {}) => {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("生成《黯月初升》开局必须提供非空固定种子");
  }
  const random = 建立随机数(seed);
  const base = deriveBadMoonRisingCounts(playerCount);
  const minions = 按类型选择("minion", base.minion, random);
  const hasGodfather = minions.includes("godfather");
  const baseOutsiders = 标准数量[playerCount][1];
  const godfatherDelta = hasGodfather
    ? baseOutsiders === 0
      ? 1
      : random() < 0.5
      ? -1
      : 1
    : 0;
  const counts = deriveBadMoonRisingCounts(playerCount, {
    hasGodfather,
    godfatherDelta,
  });
  const roles = 洗牌(
    [
      ...按类型选择("townsfolk", counts.townsfolk, random),
      ...按类型选择("outsider", counts.outsider, random),
      ...minions,
      ...按类型选择("demon", 1, random),
    ],
    random,
  );
  const resolvedSeatIds =
    seatIds ?? roles.map((_, index) => `seat-${index + 1}`);
  const actualSet = new Set(roles);
  const demonPerceptions = Array.from(BAD_MOON_RISING_ROLE_BY_ID.values())
    .filter(({ characterType }) => characterType === "demon")
    .map(({ id }) => id);
  const assignments = roles.map((actualRoleId, index) => ({
    seatId: resolvedSeatIds[index],
    order: index + 1,
    actualRoleId,
    perceivedRoleId:
      actualRoleId === "lunatic"
        ? demonPerceptions[Math.floor(random() * demonPerceptions.length)]
        : actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));
  const goodAbsent = 洗牌(
    Array.from(BAD_MOON_RISING_ROLE_BY_ID.values())
      .filter(({ id, alignment }) => alignment === "good" && !actualSet.has(id))
      .map(({ id }) => id),
    random,
  );
  const grandmother = assignments.find(
    ({ actualRoleId }) => actualRoleId === "grandmother",
  );
  const grandchildSeatId = grandmother
    ? 洗牌(
        assignments.filter(
          ({ seatId, actualRoleId }) =>
            seatId !== grandmother.seatId &&
            BAD_MOON_RISING_ROLE_BY_ID.get(actualRoleId).alignment === "good",
        ),
        random,
      )[0].seatId
    : null;
  const lunatic = assignments.find(
    ({ actualRoleId }) => actualRoleId === "lunatic",
  );
  const setup = {
    assignments,
    godfatherDelta,
    grandchildSeatId,
    demonBluffs: playerCount >= 7 ? goodAbsent.slice(0, 3) : [],
    lunaticMinionSeatIds:
      lunatic && playerCount >= 7
        ? 洗牌(assignments, random)
            .slice(0, counts.minion)
            .map(({ seatId }) => seatId)
        : [],
    lunaticBluffs: lunatic && playerCount >= 7 ? goodAbsent.slice(3, 6) : [],
  };
  const validation = validateBadMoonRisingSetup(setup);
  if (!validation.valid) {
    throw new Error(
      `固定种子未能生成合法开局：${validation.errors[0].message}`,
    );
  }
  return cloneAndFreezeJson(setup);
};
