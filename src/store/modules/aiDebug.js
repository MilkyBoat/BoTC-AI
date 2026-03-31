import { getBrowserDebugSnapshot } from "../../ai/runtime/browserDebug";
import {
  getBrowserConfig,
  hydrateBrowserConfigDefaults,
  saveBrowserConfig,
} from "../../ai/runtime/browserConfig";
import {
  getBrowserInputSnapshot,
  submitBrowserInput,
} from "../../ai/runtime/browserInput";

const state = () => ({
  config: getBrowserConfig(),
  entries: [],
  inputHistory: [],
  latestState: "",
  pendingRequest: null,
  visible: true,
});

const mutations = {
  setSnapshot(state, { entries, latestState, inputHistory, pendingRequest }) {
    state.entries = Array.isArray(entries) ? entries : [];
    state.inputHistory = Array.isArray(inputHistory) ? inputHistory : [];
    state.latestState = String(latestState || "");
    state.pendingRequest = pendingRequest || null;
  },
  setConfig(state, config) {
    state.config = config;
  },
  toggleVisible(state, value) {
    state.visible = typeof value === "boolean" ? value : !state.visible;
  },
};

const actions = {
  async init({ commit, dispatch }) {
    commit("setConfig", await hydrateBrowserConfigDefaults());
    dispatch("sync");
  },
  sync({ commit }) {
    commit("setSnapshot", {
      ...getBrowserDebugSnapshot(),
      ...getBrowserInputSnapshot(),
    });
  },
  saveConfig({ commit }, nextConfig) {
    commit("setConfig", saveBrowserConfig(nextConfig));
  },
  submitInput({ dispatch }, payload) {
    submitBrowserInput(payload);
    dispatch("sync");
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
};
