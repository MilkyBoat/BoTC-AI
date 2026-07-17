import { cloneAndFreezeJson } from "../../protocol/immutable";
import {
  SECTS_AND_VIOLETS_PACKAGE_ID,
  SECTS_AND_VIOLETS_PACKAGE_VERSION,
  SECTS_AND_VIOLETS_ROLE_BY_ID,
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
    Array.from(SECTS_AND_VIOLETS_ROLE_BY_ID.values()).filter(
      ({ id, characterType }) => characterType === type && !excluded.has(id),
    ),
    random,
  )
    .slice(0, count)
    .map(({ id }) => id);

export const deriveSectsAndVioletsCounts = (
  playerCount,
  { hasFangGu = false, hasVigormortis = false } = {},
) => {
  const base = 标准数量[playerCount];
  if (!base) throw new Error("《梦殒春宵》标准开局只支持 5 至 15 名非旅行者");
  const delta = Number(hasFangGu) - Number(hasVigormortis);
  const [townsfolk, outsider, minion, demon] = base;
  if (outsider + delta < 0 || townsfolk - delta < 0) {
    throw new Error("当前人数无法应用方古或亡骨魔的外来者设置调整");
  }
  return Object.freeze({
    townsfolk: townsfolk - delta,
    outsider: outsider + delta,
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
      const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(actualRoleId);
      if (role) counts[role.characterType] += 1;
      return counts;
    },
    { townsfolk: 0, outsider: 0, minion: 0, demon: 0 },
  );

const 数量一致 = (left, right) =>
  ["townsfolk", "outsider", "minion", "demon"].every(
    (key) => left[key] === right[key],
  );

const 验证伪装 = (roleIds, expectedLength, actualRoleIds) =>
  Array.isArray(roleIds) &&
  roleIds.length === expectedLength &&
  new Set(roleIds).size === roleIds.length &&
  roleIds.every((roleId) => {
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(roleId);
    return role?.alignment === "good" && !actualRoleIds.has(roleId);
  });

export const validateSectsAndVioletsSetup = ({
  assignments,
  evilTwinSeatId = null,
  goodTwinSeatId = null,
  demonBluffs = [],
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
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(assignment.actualRoleId);
    if (
      !role ||
      !稳定Id.test(assignment.seatId ?? "") ||
      !稳定Id.test(assignment.roleInstanceId ?? "") ||
      assignment.order !== index + 1 ||
      assignment.perceivedRoleId !== assignment.actualRoleId ||
      seatIds.has(assignment.seatId)
    ) {
      errors.push(
        错误("INVALID_ASSIGNMENT", "座位、顺序、角色、认知或实例无效"),
      );
    }
    if (actualRoleIds.has(assignment.actualRoleId)) {
      errors.push(错误("DUPLICATE_ROLE", "《梦殒春宵》初始角色不得重复"));
    }
    seatIds.add(assignment.seatId);
    actualRoleIds.add(assignment.actualRoleId);
  });

  let expected = null;
  try {
    expected = deriveSectsAndVioletsCounts(assignments.length, {
      hasFangGu: actualRoleIds.has("fanggu"),
      hasVigormortis: actualRoleIds.has("vigormortis"),
    });
  } catch (error) {
    errors.push(错误("INVALID_SETUP_ADJUSTMENT", error.message));
  }
  if (expected && !数量一致(角色计数(assignments), expected)) {
    errors.push(错误("INVALID_ROLE_COUNTS", "角色类型数量与设置调整不一致"));
  }

  const evilTwin = assignments.find(({ seatId }) => seatId === evilTwinSeatId);
  const goodTwin = assignments.find(({ seatId }) => seatId === goodTwinSeatId);
  const hasEvilTwin = actualRoleIds.has("eviltwin");
  if (
    (hasEvilTwin &&
      (evilTwin?.actualRoleId !== "eviltwin" ||
        !goodTwin ||
        goodTwin.seatId === evilTwin.seatId ||
        SECTS_AND_VIOLETS_ROLE_BY_ID.get(goodTwin.actualRoleId)?.alignment !==
          "good")) ||
    (!hasEvilTwin && (evilTwinSeatId !== null || goodTwinSeatId !== null))
  ) {
    errors.push(
      错误("INVALID_EVIL_TWIN", "镜像双子必须绑定另一名善良对立双子"),
    );
  }

  const expectedBluffs = assignments.length >= 7 ? 3 : 0;
  if (!验证伪装(demonBluffs, expectedBluffs, actualRoleIds)) {
    errors.push(错误("INVALID_DEMON_BLUFFS", "恶魔伪装角色无效"));
  }
  return { valid: errors.length === 0, errors };
};

export const buildSectsAndVioletsSeatInputs = (assignments) =>
  assignments.map((assignment) => {
    const role = SECTS_AND_VIOLETS_ROLE_BY_ID.get(assignment.actualRoleId);
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

export const createSectsAndVioletsAbilityInstances = (assignments) => ({
  instances: assignments.map((assignment) => ({
    instanceId: `snv-ability-${assignment.roleInstanceId}`,
    definitionId: `snv.${assignment.actualRoleId}.ability`,
    ownerSeatId: assignment.seatId,
    sourceRoleId: `snv.${assignment.actualRoleId}`,
    sourceRoleInstanceId: assignment.roleInstanceId,
  })),
  initialConditions: [],
});

export const createInitialSectsAndVioletsState = ({
  assignments,
  evilTwinSeatId = null,
  goodTwinSeatId = null,
  demonBluffs = [],
}) =>
  cloneAndFreezeJson({
    packageId: SECTS_AND_VIOLETS_PACKAGE_ID,
    version: SECTS_AND_VIOLETS_PACKAGE_VERSION,
    setup: {
      fangGuDelta: assignments.some(
        ({ actualRoleId }) => actualRoleId === "fanggu",
      )
        ? 1
        : 0,
      vigormortisDelta: assignments.some(
        ({ actualRoleId }) => actualRoleId === "vigormortis",
      )
        ? -1
        : 0,
      evilTwinSeatId,
      goodTwinSeatId,
      demonBluffs,
      evilTeamSeatIds: assignments
        .filter(({ actualRoleId }) =>
          ["minion", "demon"].includes(
            SECTS_AND_VIOLETS_ROLE_BY_ID.get(actualRoleId).characterType,
          ),
        )
        .map(({ seatId }) => seatId),
    },
    information: [],
    markers: [],
    abilityAbnormalities: [],
    characterChanges: [],
    deathHistory: [],
    publicActions: [],
    madnessRulings: [],
    fangGuJumpUsed: false,
  });

export const generateSectsAndVioletsSetup = ({
  playerCount,
  seed,
  seatIds,
} = {}) => {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("生成《梦殒春宵》开局必须提供非空固定种子");
  }
  const random = 建立随机数(seed);
  const baseOutsiders = 标准数量[playerCount]?.[1];
  if (baseOutsiders === undefined) {
    throw new Error("《梦殒春宵》标准开局只支持 5 至 15 名非旅行者");
  }
  const demon = 洗牌(
    Array.from(SECTS_AND_VIOLETS_ROLE_BY_ID.values())
      .filter(
        ({ id, characterType }) =>
          characterType === "demon" &&
          !(id === "vigormortis" && baseOutsiders === 0),
      )
      .map(({ id }) => id),
    random,
  ).slice(0, 1);
  const counts = deriveSectsAndVioletsCounts(playerCount, {
    hasFangGu: demon.includes("fanggu"),
    hasVigormortis: demon.includes("vigormortis"),
  });
  const roles = 洗牌(
    [
      ...按类型选择("townsfolk", counts.townsfolk, random),
      ...按类型选择("outsider", counts.outsider, random),
      ...按类型选择("minion", counts.minion, random),
      ...demon,
    ],
    random,
  );
  const resolvedSeatIds =
    seatIds ?? roles.map((_, index) => `seat-${index + 1}`);
  const assignments = roles.map((actualRoleId, index) => ({
    seatId: resolvedSeatIds[index],
    order: index + 1,
    actualRoleId,
    perceivedRoleId: actualRoleId,
    roleInstanceId: `role-${index + 1}`,
  }));
  const actualSet = new Set(roles);
  const absentGood = 洗牌(
    Array.from(SECTS_AND_VIOLETS_ROLE_BY_ID.values())
      .filter(({ id, alignment }) => alignment === "good" && !actualSet.has(id))
      .map(({ id }) => id),
    random,
  );
  const evilTwin = assignments.find(
    ({ actualRoleId }) => actualRoleId === "eviltwin",
  );
  const goodTwin = evilTwin
    ? 洗牌(
        assignments.filter(
          ({ actualRoleId }) =>
            SECTS_AND_VIOLETS_ROLE_BY_ID.get(actualRoleId).alignment === "good",
        ),
        random,
      )[0]
    : null;
  const setup = {
    assignments,
    evilTwinSeatId: evilTwin?.seatId ?? null,
    goodTwinSeatId: goodTwin?.seatId ?? null,
    demonBluffs: playerCount >= 7 ? absentGood.slice(0, 3) : [],
  };
  const validation = validateSectsAndVioletsSetup(setup);
  if (!validation.valid) {
    throw new Error(
      `固定种子未能生成合法开局：${validation.errors[0].message}`,
    );
  }
  return cloneAndFreezeJson(setup);
};
