import { protocolError } from "../../protocol/errors";
import {
  TROUBLE_BREWING_PACKAGE_ID,
  TROUBLE_BREWING_PACKAGE_VERSION,
  TROUBLE_BREWING_ROLE_BY_ID,
} from "./catalog";

const fail = (message, details) => {
  throw protocolError("INVARIANT_VIOLATION", message, details);
};

const RECORD_COLLECTIONS = [
  "information",
  "markers",
  "deathHistory",
  "registrationHistory",
  "publicActions",
  "butlerViolations",
];

export const assertTroubleBrewingStateInvariants = (state) => {
  if (state === null || state.troubleBrewing === undefined) return;
  const tb = state.troubleBrewing;
  if (
    tb.packageId !== TROUBLE_BREWING_PACKAGE_ID ||
    tb.version !== TROUBLE_BREWING_PACKAGE_VERSION
  ) {
    fail("《暗流涌动》状态的规则包身份无效");
  }
  const seatIds = new Set(state.seats.map(({ seatId }) => seatId));
  state.seats.forEach((seat) => {
    const actual = TROUBLE_BREWING_ROLE_BY_ID.get(seat.actualRoleId);
    const perceived = TROUBLE_BREWING_ROLE_BY_ID.get(seat.perceivedRoleId);
    if (
      !actual ||
      !perceived ||
      actual.characterType !== seat.characterType ||
      actual.alignment !== seat.alignment ||
      (seat.actualRoleId !== "drunk" &&
        seat.perceivedRoleId !== seat.actualRoleId) ||
      (seat.actualRoleId === "drunk" && perceived.characterType !== "townsfolk")
    ) {
      fail("《暗流涌动》席位真相、感知身份、角色类型或阵营不一致", {
        seatId: seat.seatId,
      });
    }
  });
  if (
    tb.setup.redHerringSeatId !== null &&
    !seatIds.has(tb.setup.redHerringSeatId)
  ) {
    fail("占卜师干扰项引用了不存在的席位");
  }
  if (tb.setup.evilTeamSeatIds.some((seatId) => !seatIds.has(seatId))) {
    fail("邪恶方信息引用了不存在的席位");
  }
  RECORD_COLLECTIONS.forEach((collection) => {
    const ids = tb[collection].map(({ recordId }) => recordId);
    if (new Set(ids).size !== ids.length) {
      fail(`《暗流涌动》${collection} 包含重复记录 ID`);
    }
  });
  if (state.winner?.reason === "saint-executed") {
    const saintDeath = tb.deathHistory.some(
      ({ type, content }) =>
        type === "player-died" &&
        content.byExecution === true &&
        state.seats.find(({ seatId }) => seatId === content.targetSeatId)
          ?.actualRoleId === "saint",
    );
    if (!saintDeath) fail("圣徒特殊失败缺少实际处决死亡记录");
  }
  if (state.winner?.reason === "mayor-three-alive-no-execution") {
    const living = state.seats.filter(
      ({ alive, characterType }) => alive && characterType !== "traveler",
    );
    if (
      living.length !== 3 ||
      state.executionToday !== null ||
      !living.some(({ actualRoleId }) => actualRoleId === "mayor")
    ) {
      fail("镇长三人生还胜利与权威状态不一致");
    }
  }
};

export const TROUBLE_BREWING_STATE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "tb.state-invariants",
    assert: assertTroubleBrewingStateInvariants,
  }),
]);
