
const RECORD_KEY = "__blood_on_clocktower_ai_browser_record__";

const createRecordStore = () => ({
  entries: [],
});

const getRecordStore = () => {
  const scope = globalThis;
  if (!scope[RECORD_KEY]) {
    scope[RECORD_KEY] = createRecordStore();
  }
  return scope[RECORD_KEY];
};

const normalizeMessage = (payload) =>
  typeof payload === "string" ? payload : JSON.stringify(payload || {});

export const createBrowserRecord = () => (type, payload) => {
  const store = getRecordStore();
  const message = normalizeMessage(payload);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    ts: Date.now(),
    type,
  };

  store.entries.push(entry);

  const logger = type === "error" ? console.error : console.log;
  logger(`[ai:${type}] ${message}`);

  return entry;
};

export const getBrowserRecordEntries = () => getRecordStore().entries.slice();

export const clearBrowserRecordEntries = () => {
  getRecordStore().entries = [];
};