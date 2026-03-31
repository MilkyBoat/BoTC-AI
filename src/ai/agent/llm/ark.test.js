const { ChatArk } = require("./ark");

async function testChatArkCache() {
  console.log("开始测试 ChatArk 缓存功能...");

  // 创建 ChatArk 实例
  const chatArk = new ChatArk({
    model: process.env.MODEL || "ark",
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL,
  });

  // 测试第一轮：设置名字
  console.log("\n=== 第一轮输入：你现在名叫狗子，是一只猫 ===");
  const firstResponse = await chatArk.invoke([
    {
      role: "user",
      content: "你现在名叫狗子，是一只猫",
    },
  ]);
  console.log("API 完整返回内容：", JSON.stringify(firstResponse.raw, null, 2));
  console.log("回复内容：", firstResponse.content);

  // 测试第二轮：询问名字
  console.log("\n=== 第二轮输入：你的名字是什么 ===");
  const secondResponse = await chatArk.invoke([
    {
      role: "user",
      content: "你的名字是什么",
    },
  ]);
  console.log(
    "API 完整返回内容：",
    JSON.stringify(secondResponse.raw, null, 2),
  );
  console.log("回复内容：", secondResponse.content);

  // 验证缓存是否生效（如果有缓存，第二轮的回复应该基于第一轮的设置）
  if (secondResponse.content.includes("狗子")) {
    console.log("\n✅ 测试通过：缓存功能正常，模型记住了名字设置");
  } else {
    console.log("\n❌ 测试失败：缓存功能异常，模型没有记住名字设置");
  }
}

// 运行测试
testChatArkCache().catch(console.error);
