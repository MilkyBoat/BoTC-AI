const DEBUG_KEY = "__blood_on_clocktower_ai_browser_debug__";

const createDebugStore = () => ({
  entries: [],
  latestState: "",
  promptHistory: [],
});

const getDebugStore = () => {
  const scope = globalThis;
  if (!scope[DEBUG_KEY]) {
    scope[DEBUG_KEY] = createDebugStore();
  }
  return scope[DEBUG_KEY];
};

const createEntryId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const clearBrowserDebug = () => {
  const store = getDebugStore();
  store.entries = [];
  store.latestState = "";
  store.promptHistory = [];
};

export const recordBrowserDebugEntry = (entry) => {
  const store = getDebugStore();
  store.entries.push({
    id: createEntryId(),
    ts: Date.now(),
    ...entry,
  });
};

export const setBrowserDebugState = (latestState) => {
  getDebugStore().latestState = String(latestState || "");
};

export const recordBrowserPrompt = (entry) => {
  getDebugStore().promptHistory.push({
    id: createEntryId(),
    ts: Date.now(),
    ...entry,
  });
};

export const getBrowserDebugSnapshot = () => {
  const store = getDebugStore();
  return {
    entries: store.entries.slice(),
    latestState: store.latestState,
    promptHistory: store.promptHistory.slice(),
  };
};

export const createBrowserDebugAdapter = () => ({
  clear: clearBrowserDebug,
  recordToolCall(payload) {
    recordBrowserDebugEntry(payload);
  },
  setLatestState(latestState) {
    setBrowserDebugState(latestState);
  },
});
