import { notifyChatSubscribers } from "../../chat/api";

const state = () => ({
  messages: [],
});

const buildMessage = ({
  rootState,
  text,
  from,
  scope,
  fromPlayerId,
  target,
}) => {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    from,
    scope,
    ts: Date.now(),
    fromPlayerId,
    target,
  };
  if (from === "player" && fromPlayerId) {
    const players = rootState.players.players;
    const index = players.findIndex((player) => player.id === fromPlayerId);
    if (index >= 0) {
      const player = players[index];
      message.fromSeat = index + 1;
      if (player.name) {
        message.fromName = player.name;
      }
    }
  }
  return message;
};

const normalizeTarget = ({ rootState, target }) => {
  if (rootState.session.isSpectator) {
    return { type: "direct", playerId: "host" };
  }
  if (!target || target.type === "broadcast") {
    return { type: "broadcast" };
  }
  if (target.type === "direct") {
    return target;
  }
  return { type: "broadcast" };
};

const mutations = {
  addMessage(state, message) {
    state.messages.push(message);
  },
  clear(state) {
    state.messages = [];
  },
  sendToSocket() {},
};

const actions = {
  receive({ commit, rootState }, payload) {
    const message = buildMessage({
      rootState,
      text: payload.text,
      from: payload.from,
      scope: payload.scope,
      fromPlayerId: payload.fromPlayerId,
    });
    commit("addMessage", message);
    notifyChatSubscribers(message);
  },
  send({ commit, rootState }, { target, text, source }) {
    const from =
      source === "ai"
        ? "ai"
        : rootState.session.isSpectator
        ? "player"
        : "host";
    const normalizedTarget = normalizeTarget({ rootState, target });
    const scope = normalizedTarget.type === "direct" ? "direct" : "broadcast";
    const fromPlayerId = rootState.session.isSpectator
      ? rootState.session.playerId
      : undefined;
    const message = buildMessage({
      rootState,
      text,
      from,
      scope,
      fromPlayerId,
      target: normalizedTarget,
    });
    commit("addMessage", message);
    notifyChatSubscribers(message);
    commit("sendToSocket", message);
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
};
