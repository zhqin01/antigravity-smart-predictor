# API Key 获取与配置指南

本文档指导你如何为 `Antigravity 智能输入预测器` 接入不同的 AI 通道。

---

## 方案 A：DeepSeek 官方 API（强烈推荐 🌟）

DeepSeek 是目前输入预测体验最好的大模型通道：国内直连延迟低（~450ms）、情商高、没有日常频控限制，并且费用极低（充值 1~2 元即可使用一年）。

1. 访问 [DeepSeek 开放平台官网](https://platform.deepseek.com/) 并注册登录。
2. 进入控制台左侧菜单中的 **API Keys**。
3. 点击 **创建 API Key**，输入名称后复制生成的 `sk-...` 密钥。
4. 打开 VS Code，按下快捷键 `Ctrl + Shift + P` $\rightarrow$ 运行：
   `Antigravity 智能预测: 配置 DeepSeek API Key`
5. 粘贴刚才复制的 Key 并回车保存。

---

## 方案 B：本地 Ollama / 通用 OpenAI 端点（零费用 · 100% 隐私）

如果你希望在完全离线或无网环境下使用，推荐本地运行 Ollama：

1. 安装 [Ollama](https://ollama.com/) 并拉取轻量代码模型：
   ```bash
   ollama run qwen2.5:latest
   ```
2. 打开 VS Code，按下 `Ctrl + Shift + P` $\rightarrow$ 运行：
   `Antigravity 智能预测: 配置通用 OpenAI / 本地端点 (Ollama / 硅基流动)`
3. 输入 Base URL：`http://localhost:11434/v1`
4. API Key：留空直接回车
5. 模型名称：输入 `qwen2.5:latest`
6. 系统将自动切换为 Custom 通道，享受零延迟本地补全。

---

## 方案 C：Google Gemini API

1. 访问 [Google AI Studio](https://aistudio.google.com/)。
2. 点击 **Get API Key** $\rightarrow$ **Create API Key**。
3. 在 VS Code 中运行 `Antigravity 智能预测: 配置 Google Gemini API Key` 并粘贴。
4. *注意：Google 免费层每日调用限制为 20 次/天，建议绑定结算账户开通轻量付费使用。*
