# 隐私与数据安全声明 (Privacy Policy)

**Antigravity 智能输入预测器 (Smart Predictor)** 高度重视开发者的代码资产与个人隐私安全。

---

### 1. 零中央服务器中转 (No Middleman Server)
- 本插件不设任何中转服务器或数据收集后端。
- 所有 AI 预测请求均由用户本地机器直接（End-to-End）发起并直连用户指定的官方服务商（如 DeepSeek 官方 API、Google Gemini 官方 API 或用户本地 Ollama 实例）。

### 2. 敏感信息自动脱敏 (Built-in Privacy Redactor)
- 插件默认内置并启用了 **本地隐私脱敏过滤器**。
- 在将用户输入文本发送到外部大模型之前，本地引擎会自动通过正则替换以下敏感数据：
  - API Key、Bearer Token、GitHub Token；
  - JWT 鉴权串；
  - 局域网与私网 IP 地址（`192.168.x.x`、`10.x.x.x`、`172.16-31.x.x`）；
  - 常见密码与连接字符串。

### 3. 数据与偏好持久化
- 用户的 API Key 严格保存在 VS Code 原生的本地用户设置（`settings.json`）中。
- 用户的个人采纳历史短语与提效统计仅持久化保存在用户家目录下的本地文件：
  `~/.gemini/antigravity/smart_predictor/`
- 用户随时可以通过控制面板中的 **清空本地历史学习词库** 命令瞬间销毁所有本地记忆。
