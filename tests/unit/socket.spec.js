import socketPlugin from "@/store/socket";

jest.mock("@/config/sessionRelay", () => ({
  getSessionRelayConfig: () => ({
    available: false,
    url: "",
    message: "当前构建未配置会话中继",
  }),
}));

const createStore = (sessionId = "") => {
  const state = { session: { sessionId } };
  return {
    state,
    commit: jest.fn((type, payload) => {
      if (type === "session/setSessionId") state.session.sessionId = payload;
      if (type === "session/setRelayStatus") {
        state.session.relayStatus = payload;
      }
    }),
    subscribe: jest.fn(),
  };
};

describe("会话中继不可用时的连接保护", () => {
  const OriginalWebSocket = global.WebSocket;

  beforeEach(() => {
    window.location.hash = "";
    global.WebSocket = jest.fn();
  });

  afterEach(() => {
    global.WebSocket = OriginalWebSocket;
    window.location.hash = "";
  });

  test("清理恢复的旧会话且不创建 WebSocket", () => {
    const store = createStore("storedroom");

    socketPlugin(store);

    expect(store.state.session.relayStatus).toEqual({
      available: false,
      url: "",
      message: "当前构建未配置会话中继",
    });
    expect(store.commit).toHaveBeenCalledWith("session/setSessionId", "");
    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  test("忽略房间 Hash 且不创建 WebSocket", () => {
    window.location.hash = "#publicroom";
    const store = createStore();

    socketPlugin(store);

    expect(window.location.hash).toBe("");
    expect(global.WebSocket).not.toHaveBeenCalled();
  });
});
