
require("dotenv").config();
const { prompt } = require("./utils/console");
const { record } = require("./common/record");
const { runStoryteller } = require("./runStoryteller");

async function run() {
  return runStoryteller({
    customRules: "",
    debug: true, // todo: 临时使用
    playerCount: 8,
    promptImpl: prompt,
    recordImpl: record,
  });
}

if (require.main === module) {
  run().catch((err) => {
    record("error", `运行失败: ${err && err.message}`);
  });
}

module.exports = { run };
