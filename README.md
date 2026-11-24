# Antigravity 智能输入预测器 (Smart Predictor)

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.80.0-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-v1.3.0-green.svg)](https://github.com/zhqin01/antigravity-smart-predictor)

**专为 Google Antigravity (VS Code) 对话框定制的纯正行内幽灵文本 (Inline Ghost Text) 补全引擎。**

在输入文字时，光标后紧随显示浅灰色思考续写；按 `Tab` 键一键采纳，按 `Alt + ]` 切换多候选建议，按 `Esc` 瞬间隐藏。彻底摒弃浮窗与弹窗干扰，带来如同 GitHub Copilot 般丝滑的沉浸式输入提效体验。

---

## ✨ 核心特性

- 🎯 **纯正行内幽灵文本 (Inline Ghost Text)**：三重级联物理探针精准锚定 Meta Lexical 富文本光标；触及行末时智能折行下沉排版，不挡视线、不闪烁。
- 🧠 **人类提问者视角 (Prompt Drafter)**：独创角色逆转技术，模型绝不反问、绝不解释，全心全意站在人类立场延伸提示词约束条件。
- ⚡ **多通道大模型支持**：
  - **DeepSeek 官方 API**（默认推荐）：国内直连，450ms 极速响应，超高情商，无频控焦虑。
  - **Google Gemini API**：支持 `gemini-2.5-flash`，全球开发者首选。
  - **通用 OpenAI 兼容端点 (Custom)**：无缝接入本地 **Ollama**（Qwen / Llama）、**硅基流动**、**OneAPI**、**Groq** 等。
- 🔄 **Alt + ] 多候选建议切换**：支持在模型返回的多个不同备选建议间无缝切换，按 `Tab` 一键采纳所选建议。
- 📂 **当前代码上下文感知 (Context-Aware)**：自动感知当前激活编辑器的文件名与编程语言，针对性生成专业开发提示词。
- 🩺 **一键运行环境自愈 (Doctor)**：自动检测 Google Antigravity 官方扩展版本变动，提供一键体检与自动修复补丁。
- 🛡️ **本地隐私脱敏保护 (Privacy Redactor)**：在向公网 API 发送前，自动本地遮蔽 API Key、Token、密码、私网 IP 等敏感数据。
- 📊 **提效统计看板**：本地统计展示累计提示次数、Tab 采纳率与节省敲击字符数。

---

## ⌨️ 快捷键指南

| 快捷键 | 功能动作 | 说明 |
| :--- | :--- | :--- |
| **`Tab`** | **一键采纳当前补全** | 瞬间将灰色幽灵文字插入到输入框末尾 |
| **`Alt + ]`** 或 **`Alt + ↓`** | **切换下一条候选建议** | 当存在多条备选方案时快速轮换 |
| **`Alt + [`** 或 **`Alt + ↑`** | **切换上一条候选建议** | 回到上一条备选方案 |
| **`Esc`** | **瞬间隐匿建议** | 临时关闭当前预测提示 |
| **`→` (右方向键)** | **末尾光标采纳** | 光标位于文字末尾时按右键亦可采纳 |

---

## 🚀 30 秒极速上手

1. **安装插件**：在 VS Code 扩展市场搜索安装 `antigravity-smart-predictor` 或直接加载 VSIX。
2. **配置 API Key**：
   - 按下快捷键 `Ctrl + Shift + P` 输入 `Antigravity 智能预测: 打开设置与控制菜单`；
   - 或点击底部状态栏的 `$(sparkle) 智能预测: DeepSeek`；
   - 选择 **配置 DeepSeek API Key**，输入从 [platform.deepseek.com](https://platform.deepseek.com/) 获取的密钥（充值 1 元即可使用数月）。
3. **开始体验**：
   - 打开 Antigravity 侧边栏对话框，输入 `帮我排查` 或 `你看看`；
   - 光标后立即浮现浅灰色续写，按 `Tab` 键即可一键采纳！

---

## 🩺 诊断与自愈 (Doctor)

当 Google 官方升级 Antigravity 插件时，只需按下快捷键：
`Ctrl + Shift + P` $\rightarrow$ 运行 **`Antigravity 智能预测: 检查并自愈修复运行时注入 (Doctor)`**，系统将自动检测并完成一键自愈修复。

---

## 📄 许可协议

本项目基于 [MIT License](LICENSE) 开源协议。
