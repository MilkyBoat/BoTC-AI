import { requestBrowserInput } from "./browserInput";
import { sendStorytellerChat } from "../../chat/api";

const INTERACTION_KEY = "__blood_on_clocktower_ai_browser_interaction__";

const createInteractionStore = () => ({
  history: [],
  instance: null,
  pendingQuestion: null,
  subscriptions: 0,
});

const getInteractionStore = () => {
  const scope = globalThis;
  if (!scope[INTERACTION_KEY]) {
    scope[INTERACTION_KEY] = createInteractionStore();
  }
  return scope[INTERACTION_KEY];
};

const pushHistory = (entry) => {
  getInteractionStore().history.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    ...entry,
  });
};

export class BrowserInteraction {
  constructor(options = {}) {
    this.timeoutMs = Number(options.timeoutMs || 0);
  }

  broadcast(text) {
    pushHistory({ scope: "broadcast", text, type: "outgoing" });
    sendStorytellerChat({
      target: { type: "broadcast" },
      text,
    });
  }

  send(seat, message) {
    pushHistory({ scope: "direct", seat, text: message, type: "outgoing" });
    sendStorytellerChat({
      target: { type: "direct", seat },
      text: message,
    });
  }

  async questionAny(prompt) {
    const store = getInteractionStore();
    store.pendingQuestion = { prompt, seat: 0, ts: Date.now() };
    pushHistory({ scope: "questionAny", text: prompt, type: "prompt" });
    sendStorytellerChat({
      target: { type: "broadcast" },
      text: prompt,
    });
    const reply = await requestBrowserInput({
      kind: "questionAny",
      prompt,
      requireSeat: true,
      seat: 0,
    });
    pushHistory({
      scope: "questionAny",
      seat: reply.seat,
      text: reply.text,
      type: "reply",
    });
    return reply;
  }

  async questionForSeat(seat, prompt) {
    const store = getInteractionStore();
    store.pendingQuestion = { prompt, seat, ts: Date.now() };
    pushHistory({ scope: "questionForSeat", seat, text: prompt, type: "prompt" });
    sendStorytellerChat({
      target: { type: "direct", seat },
      text: prompt,
    });
    const reply = await requestBrowserInput({
      kind: "questionForSeat",
      prompt,
      seat,
    });
    pushHistory({
      scope: "questionForSeat",
      seat: reply.seat,
      text: reply.text,
      type: "reply",
    });
    return reply;
  }
}

export const createBrowserInteraction = (options) => {
  const store = getInteractionStore();
  if (!store.instance) {
    store.instance = new BrowserInteraction(options);
    store.subscriptions = 1;
  }
  return store.instance;
};

export const getBrowserInteractionState = () => {
  const store = getInteractionStore();
  return {
    history: store.history.slice(),
    pendingQuestion: store.pendingQuestion,
    subscriptions: store.subscriptions,
  };
};