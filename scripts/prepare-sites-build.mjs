import { copyFile, mkdir } from "node:fs/promises";

const workerSource = new URL("../worker/index.js", import.meta.url);
const serverDirectory = new URL("../dist/server/", import.meta.url);

async function main() {
  await mkdir(serverDirectory, { recursive: true });
  await copyFile(workerSource, new URL("index.js", serverDirectory));
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
