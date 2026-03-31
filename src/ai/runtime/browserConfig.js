const CONFIG_KEY = "__blood_on_clocktower_ai_browser_config__";
export const SERVER_DEFAULT_VALUE = "__SERVER_DEFAULT__";

let cachedDefaults = null;

const getStaticDefaultConfig = () => ({
  apiKey: SERVER_DEFAULT_VALUE,
  baseURL: "",
  model: "",
  provider: "ark",
});

const getNodeDefaultConfig = () => ({
  apiKey: process.env.API_KEY || "",
  baseURL: process.env.BASE_URL || "",
  model: process.env.MODEL || "",
  provider: (process.env.LLM_PROVIDER || "ark").toLowerCase(),
});

const getStoredConfig = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getBrowserConfig = () => {
  if (typeof window === "undefined") {
    return getNodeDefaultConfig();
  }
  return {
    ...(cachedDefaults || getStaticDefaultConfig()),
    ...getStoredConfig(),
  };
};

export const saveBrowserConfig = (nextConfig) => {
  if (typeof window === "undefined") return getNodeDefaultConfig();
  const config = {
    ...getBrowserConfig(),
    ...nextConfig,
  };
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
};

export const hydrateBrowserConfigDefaults = async () => {
  if (typeof window === "undefined") {
    return getNodeDefaultConfig();
  }
  try {
    const response = await fetch("/api/ai/browser-defaults");
    if (!response.ok) {
      return getBrowserConfig();
    }
    cachedDefaults = {
      ...getStaticDefaultConfig(),
      ...(await response.json()),
    };
    return getBrowserConfig();
  } catch {
    return getBrowserConfig();
  }
};
