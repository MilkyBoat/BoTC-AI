function prompt(question) {
  if (typeof window !== "undefined") {
    console.log(`[ai:prompt] ${question}`);
    return Promise.resolve("");
  }

  const nodeRequire = new Function("return require")();
  const readline = nodeRequire("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

module.exports = { prompt };
