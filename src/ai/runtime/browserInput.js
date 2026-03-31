
const INPUT_KEY = "__blood_on_clocktower_ai_browser_input__";

const createInputStore = () => ({
  history: [],
  pendingRequest: null,
  resolver: null,
});

const getInputStore = () => {
  const scope = globalThis;
  if (!scope[INPUT_KEY]) {
    scope[INPUT_KEY] = createInputStore();
  }
  return scope[INPUT_KEY];
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const pushHistory = (entry) => {
  getInputStore().history.push({
    id: createId(),
    ts: Date.now(),
    ...entry,
  });
};

export const requestBrowserInput = ({
  kind,
  prompt,
  requireSeat = false,
  seat = 0,
}) =>
  new Promise((resolve) => {
    const store = getInputStore();
    store.pendingRequest = {
      id: createId(),
      kind,
      prompt,
      requireSeat,
      seat,
      ts: Date.now(),
    };
    store.resolver = resolve;
    pushHistory({
      kind,
      prompt,
      requireSeat,
      seat,
      type: "request",
    });
  });

export const submitBrowserInput = ({ text, seat }) => {
  const store = getInputStore();
  if (!store.pendingRequest || !store.resolver) return false;
  const pendingRequest = store.pendingRequest;
  const responseSeat = Number(seat || pendingRequest.seat || 0);
  const responseText = String(text || "");
  pushHistory({
    kind: pendingRequest.kind,
    prompt: pendingRequest.prompt,
    seat: responseSeat,
    text: responseText,
    type: "response",
  });
  const resolve = store.resolver;
  store.pendingRequest = null;
  store.resolver = null;
  resolve({
    seat: responseSeat,
    text: responseText,
  });
  return true;
};

export const getBrowserInputSnapshot = () => {
  const store = getInputStore();
  return {
    history: store.history.slice(),
    pendingRequest: store.pendingRequest,
  };
};

export const clearBrowserInput = () => {
  const store = getInputStore();
  store.history = [];
  store.pendingRequest = null;
  store.resolver = null;
};