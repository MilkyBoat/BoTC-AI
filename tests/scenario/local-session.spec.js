import Vuex from "vuex";
import { createLocalVue } from "@vue/test-utils";
import players from "@/store/modules/players";
import session from "@/store/modules/session";

const createStore = () => {
  const localVue = createLocalVue();
  localVue.use(Vuex);
  return new Vuex.Store({
    modules: {
      players,
      session,
    },
  });
};

describe("本地会话状态烟雾场景", () => {
  test("房间标识清洗、玩家加入和投票状态可在隔离 Store 中连续执行", () => {
    const store = createStore();

    store.commit("session/setSessionId", "Room #42!");
    store.commit("players/add", "Alice");
    store.commit("players/add", "Bob");
    store.commit("session/nomination", {
      nomination: [0, 1],
      votes: [false, false],
    });
    store.commit("session/vote", [1, true]);

    expect(store.state.session.sessionId).toBe("room42");
    expect(store.state.players.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(store.state.session.nomination).toEqual([0, 1]);
    expect(store.state.session.votes).toEqual([false, true]);
  });
});
