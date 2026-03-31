import { getBrowserStorytellerRuntime } from "../../ai/runtime/browserStorytellerRuntime";

const state = () => ({
  status: "idle",
  lastStartIntentAt: null,
  startedAt: null,
  stoppedAt: null,
  instanceId: null,
  runtimeMode: "",
  interactionSubscriptions: 0,
  logCount: 0,
  lastError: "",
});

const mutations = {
  registerStartIntent(state) {
    state.lastStartIntentAt = Date.now();
  },
  setStatus(state, status) {
    state.status = status;
  },
  setRunning(
    state,
    { startedAt, instanceId, mode, interactionSubscriptions, logCount },
  ) {
    state.status = "running";
    state.startedAt = startedAt;
    state.stoppedAt = null;
    state.instanceId = instanceId;
    state.runtimeMode = mode || "";
    state.interactionSubscriptions = Number(interactionSubscriptions || 0);
    state.logCount = Number(logCount || 0);
    state.lastError = "";
  },
  setStopped(state, { stoppedAt, mode, interactionSubscriptions, logCount }) {
    state.status = "stopped";
    state.startedAt = null;
    state.stoppedAt = stoppedAt;
    state.instanceId = null;
    state.runtimeMode = mode || state.runtimeMode;
    state.interactionSubscriptions = Number(interactionSubscriptions || 0);
    state.logCount = Number(logCount || 0);
    state.lastError = "";
  },
  setError(state, message) {
    state.status = "error";
    state.lastError = message;
  },
  clearError(state) {
    state.lastError = "";
  },
};

const actions = {
  async requestStart({ commit, state }) {
    if (state.status === "starting" || state.status === "running") return;
    commit("registerStartIntent");
    commit("clearError");
    commit("setStatus", "starting");
    try {
      const runtime = getBrowserStorytellerRuntime();
      const result = await runtime.start();
      if (result && result.cancelled) {
        commit("setStopped", {
          stoppedAt: result.stoppedAt || Date.now(),
        });
        return;
      }
      commit("setRunning", result);
    } catch (error) {
      const message = String((error && error.message) || error || "启动失败");
      commit("setError", message);
    }
  },
  async requestStop({ commit, state }) {
    if (state.status !== "starting" && state.status !== "running") return;
    try {
      const runtime = getBrowserStorytellerRuntime();
      const result = await runtime.stop();
      commit("setStopped", result);
    } catch (error) {
      const message = String((error && error.message) || error || "停止失败");
      commit("setError", message);
    }
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
};
