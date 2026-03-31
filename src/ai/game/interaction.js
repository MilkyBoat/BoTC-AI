const { record } = require("../common/record");

function askInCli(promptText) {
  const nodeRequire = new Function("return require")();
  const readline = nodeRequire("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

class Interaction {
  broadcast(text) {
    record("event", text);
  }

  send(seat, message) {
    record("event", `座位${seat} 私密: ${message}`);
  }

  async questionAny(prompt) {
    record("prompt", prompt);
    if (typeof window !== "undefined") {
      console.log(`[ai:interaction:any] ${prompt}`);
      return { seat: 0, text: "" };
    }
    const line = await askInCli("文本> ");
    const trimmed = String(line || "").trim();
    let seat = 0;
    let text = trimmed;
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (match) {
      seat = parseInt(match[1], 10);
      text = match[2];
    }
    return { seat, text };
  }

  async questionForSeat(seat, prompt) {
    record("prompt", `座位${seat}: ${prompt}`);
    if (typeof window !== "undefined") {
      console.log(`[ai:interaction:${seat}] ${prompt}`);
      return { seat, text: "" };
    }
    const line = await askInCli("文本> ");
    return { seat, text: String(line || "") };
  }
}

module.exports = { Interaction };
