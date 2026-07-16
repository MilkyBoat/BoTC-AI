const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const HOST = "127.0.0.1";
const PORT = 18081;
const ORIGIN = "http://127.0.0.1:4173";
const RELAY_URL = `ws://${HOST}:${PORT}`;

const waitForOutput = (child, expected) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`等待中继启动超时：${expected}`)),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`中继提前退出，退出码 ${code}`));
    });
  });

const openSocket = (pathName, origin = ORIGIN) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`${RELAY_URL}${pathName}`, { origin });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });

const closeSocket = (socket) =>
  new Promise((resolve) => {
    if (!socket || socket.readyState === WebSocket.CLOSED) return resolve();
    socket.once("close", resolve);
    socket.close();
  });

describe("本地会话中继", () => {
  let relayProcess;

  beforeAll(async () => {
    relayProcess = spawn(process.execPath, ["server/index.js"], {
      cwd: path.resolve(__dirname, "../.."),
      env: {
        ...process.env,
        NODE_ENV: "development",
        SESSION_RELAY_HOST: HOST,
        SESSION_RELAY_PORT: String(PORT),
        SESSION_RELAY_ALLOWED_ORIGINS: ORIGIN,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForOutput(relayProcess, `ws://${HOST}:${PORT}`);
  });

  afterAll(() => {
    if (relayProcess && relayProcess.exitCode === null) relayProcess.kill();
  });

  test("只在允许的本地 Origin 间转发房间消息", async () => {
    const host = await openSocket("/safe-room/host");
    const player = await openSocket("/safe-room/player-1");
    const received = new Promise((resolve) =>
      player.once("message", (message) => resolve(message.toString())),
    );

    host.send(JSON.stringify(["probe", { local: true }]));

    await expect(received).resolves.toBe('["probe",{"local":true}]');

    await Promise.all([closeSocket(host), closeSocket(player)]);
  });

  test("拒绝未列入允许清单的 Origin", async () => {
    await expect(
      openSocket("/safe-room/intruder", "http://example.test"),
    ).rejects.toThrow();
  });
});
