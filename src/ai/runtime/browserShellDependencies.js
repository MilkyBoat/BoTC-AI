import { getBrowserConfig } from "./browserConfig";
import { createBrowserDebugAdapter } from "./browserDebug";
import { clearBrowserInput, requestBrowserInput } from "./browserInput";
import { createBrowserInteraction } from "./browserInteraction";
import {
  clearBrowserRecordEntries,
  createBrowserRecord,
} from "./browserRecord";
import { browserScripts } from "./browserScriptCatalog";

const createBrowserPrompt = (recordImpl, debugAdapter) => async (question) => {
  recordImpl("prompt", question);
  console.log(`[ai:browser-prompt] ${question}`);
  debugAdapter?.recordToolCall?.({
    args: { question },
    commandType: "prompt",
    result: "等待输入",
    toolName: "browser_prompt",
  });
  const response = await requestBrowserInput({
    kind: "prompt",
    prompt: question,
    seat: 0,
  });
  return response.text;
};

const createBrowserSelectScript =
  (promptImpl, recordImpl) =>
  async () => {
    const list = browserScripts
      .map((script, index) => `${index + 1}. ${script.fileName}`)
      .join("\n");
    recordImpl("info", `可用剧本:\n${list}`);
    const answer = await promptImpl("请选择剧本编号: ");
    const index = Math.max(1, parseInt(answer, 10) || 1);
    const selected = browserScripts[index - 1] || browserScripts[0];
    recordImpl("info", `已选择剧本: ${selected.fileName}`);
    return selected.payload;
  };

export const createBrowserShellDependencies = () => {
  clearBrowserInput();
  clearBrowserRecordEntries();
  const recordImpl = createBrowserRecord();
  const debugAdapter = createBrowserDebugAdapter();
  debugAdapter.clear();
  const promptImpl = createBrowserPrompt(recordImpl, debugAdapter);
  return {
    createInteraction: () => createBrowserInteraction(),
    debugAdapter,
    llmConfig: getBrowserConfig(),
    promptImpl,
    recordImpl,
    selectScript: createBrowserSelectScript(promptImpl, recordImpl),
  };
};
