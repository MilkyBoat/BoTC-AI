const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const SERVER_DEFAULT_VALUE = "__SERVER_DEFAULT__";

const readJson = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = chunks.length
          ? Buffer.concat(chunks).toString("utf8")
          : "{}";
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });

const getServerDefaults = () => {
  const provider = (process.env.LLM_PROVIDER || "ark").toLowerCase();
  if (provider === "claude") {
    return {
      apiKey: SERVER_DEFAULT_VALUE,
      baseURL: process.env.CLAUDE_BASE_URL || "https://api.anthropic.com",
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      provider,
    };
  }
  return {
    apiKey: SERVER_DEFAULT_VALUE,
    baseURL: process.env.BASE_URL || "",
    model: process.env.MODEL || "",
    provider,
  };
};

const proxyRequest = async ({ body, headers, res, url }) => {
  const upstream = await fetch(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/json",
  );
  res.send(text);
};

const proxyArkResponses = async ({ apiKey, baseURL, body, res }) => {
  const client = new OpenAI({ apiKey, baseURL });
  const upstream = await client.responses.create(body);
  res.json(upstream);
};

module.exports = {
  devServer: {
    setupMiddlewares(middlewares, devServer) {
      const { app } = devServer;

      app.get("/api/ai/browser-defaults", (_req, res) => {
        res.json(getServerDefaults());
      });

      app.post("/api/ai/llm/ark/responses", async (req, res) => {
        try {
          const body = await readJson(req);
          const apiKeyHeader = String(req.headers["x-debug-api-key"] || "");
          const apiKey =
            apiKeyHeader && apiKeyHeader !== SERVER_DEFAULT_VALUE
              ? apiKeyHeader
              : process.env.API_KEY;
          const baseURL =
            String(req.headers["x-debug-base-url"] || "").trim() ||
            process.env.BASE_URL;
          if (!apiKey || !baseURL) {
            res.status(400).json({ error: "缺少 Ark 服务配置" });
            return;
          }
          await proxyArkResponses({
            apiKey,
            baseURL,
            body,
            res,
          });
        } catch (error) {
          res.status(500).json({ error: String(error.message || error) });
        }
      });

      app.post("/api/ai/llm/claude/messages", async (req, res) => {
        try {
          const body = await readJson(req);
          const apiKeyHeader = String(req.headers["x-debug-api-key"] || "");
          const apiKey =
            apiKeyHeader && apiKeyHeader !== SERVER_DEFAULT_VALUE
              ? apiKeyHeader
              : process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
          const baseURL =
            String(req.headers["x-debug-base-url"] || "").trim() ||
            process.env.CLAUDE_BASE_URL ||
            "https://api.anthropic.com";
          if (!apiKey) {
            res.status(400).json({ error: "缺少 Claude 服务配置" });
            return;
          }
          await proxyRequest({
            body,
            headers: {
              "anthropic-dangerous-direct-browser-access": "true",
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            res,
            url: `${String(baseURL).replace(/\/$/, "")}/v1/messages`,
          });
        } catch (error) {
          res.status(500).json({ error: String(error.message || error) });
        }
      });

      return middlewares;
    },
  },
};
