# 本地会话中继

`server/index.js` 是 townsquare 固定源码保留的 WebSocket 消息中继。M0-R4 只把它用于本地开发和自动测试；它不验证游戏规则，也不是已经完成安全评审的生产会话服务。

## 本地启动

在仓库根目录安装依赖后运行：

```bash
npm run relay:dev
```

默认监听 `ws://127.0.0.1:8081`，只允许以下本地前端 Origin：

- `http://localhost:8080`
- `http://127.0.0.1:8080`
- `http://127.0.0.1:4173`（Playwright）

前端开发模式默认连接该地址，不需要修改 `src/store/socket.js`。

## 开发配置

中继进程支持以下环境变量：

| 变量 | 开发默认值 | 说明 |
| --- | --- | --- |
| `SESSION_RELAY_HOST` | `127.0.0.1` | 监听地址；本地开发不应改成对外网卡 |
| `SESSION_RELAY_PORT` | `8081` | 监听端口，范围为 1 到 65535 |
| `SESSION_RELAY_ALLOWED_ORIGINS` | 上述三个本地 Origin | 逗号分隔的完整 Origin 清单 |

例如，前端改在 `localhost:4174` 运行时可以使用：

```bash
SESSION_RELAY_ALLOWED_ORIGINS=http://localhost:4174 npm run relay:dev
```

Origin 使用 URL 解析后精确匹配，不接受前缀或正则模糊匹配。端口占用、端口非法或允许清单为空时，中继启动失败并返回非零退出码。

## 生产边界

生产模式仍需要 HTTPS 证书、Key 和显式的 `SESSION_RELAY_ALLOWED_ORIGINS`。正式中继的部署、域名、证书、监控、权限协议和隐私评审不属于 M0-R4；在对应独立需求完成前，不应把本目录直接部署为生产服务。
