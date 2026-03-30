let store = null;
const listeners = new Set();

export const registerChatStore = (nextStore) => {
  store = nextStore;
};

export const sendChat = ({ target, text }) => {
  if (!store) return;
  store.dispatch("chat/send", { target, text, source: "ai" });
};

export const subscribeChat = (handler) => {
  listeners.add(handler);
  return () => listeners.delete(handler);
};

export const notifyChatSubscribers = (message) => {
  listeners.forEach((handler) => handler(message));
};

if (typeof window !== "undefined") {
  window.townsquareChatApi = {
    sendChat,
    subscribeChat,
  };
}
