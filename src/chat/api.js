let store = null;
const listeners = new Set();

export const registerChatStore = (nextStore) => {
  store = nextStore;
};

export const sendChat = ({ source = "ai", target, text }) => {
  if (!store) return;
  store.dispatch("chat/send", { target, text, source });
};

export const sendStorytellerChat = ({ target, text }) => {
  sendChat({ source: "storyteller", target, text });
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
    sendStorytellerChat,
    subscribeChat,
  };
}
