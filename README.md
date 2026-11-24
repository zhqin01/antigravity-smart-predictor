# Antigravity 智能输入预测器 (Smart Predictor)

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/VS%20Code-%3E%3D%201.80.0-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Antigravity-1.13.0+-green.svg?style=flat-square" alt="Antigravity">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License">
</p>

> ✨ **Antigravity 也有如同 Copilot 般的对话输入预测与 Ghost Text 幽灵补全了！**  
> 专为 VS Code Antigravity AI 对话输入框打造的生产力利器。支持 **Google Gemini (免费)** 与 **DeepSeek** 双通道云端 AI 续写，结合本地毫秒级高频开发意图树，打字停顿自动呈现候选浮动条与幽灵文本，按 <kbd>Tab</kbd> 或点击一键采纳。

---

## ✨ 核心特性

- 🤖 **Google Gemini & DeepSeek 双通道 AI 自由续写**：
  - **Google Gemini (推荐 · 完全免费)**：对接 `gemini-2.0-flash` 极速模型，可直接从 [Google AI Studio](https://aistudio.google.com/app/apikey) 免费申请 API Key，极速秒回；
  - **DeepSeek**：对接 `deepseek-chat` 模型，深度契合中文语言与编程语境。
- 🔮 **双重呈现：浮动候选条 + 输入框内幽灵文本 (Ghost Text)**：
  - **输入框上方候选条**：高亮悬浮胶囊，清楚标明预测内容与 `Tab ⇥` 采纳提示，100% 可视，点击亦可直接采纳；
  - **输入框内 Ghost Text**：在光标后呈现暗灰色的建议文本，与输入框融为一体。
- ⚡ **Tab 键一键采纳 / Esc 快捷取消**：
  - 按 <kbd>Tab</kbd> 或光标到末尾按 <kbd>→</kbd>：一秒采纳整句建议；
  - 按 <kbd>Esc</kbd> 或继续自由打字：建议瞬间隐去，绝不打扰正常思路。
- 🎯 **本地 0 延迟意图树兜底**：
  - 未配置 API Key 时，打字即显示快捷配置提示条；
  - 内置覆盖排查、单测、重构、审查、Git 等 60+ 种高频编程指令，即使断网或单字输入（如“帮”、“写”、“排查”）也能极速给出模板预测。
- 📂 **当前编辑文件与代码语言上下文感知**：
  - 自动感知当前编辑的文档类型（HTML/TS/Python 等），动态调整推荐倾向。
- 📈 **个性化习惯自动沉淀**：
  - 自动记忆你最常采纳的专属 Prompt，越用越懂你的输入习惯。

---

## 🔑 API Key 配置指引

首次使用建议配置 API Key 开启全量自由续写：

### 1. 推荐渠道：Google Gemini（完全免费）
1. 访问 [Google AI Studio (aistudio.google.com/app/apikey)](https://aistudio.google.com/app/apikey)；
2. 点击 **"Create API key"** 创建一个免费密钥；
3. 在 VS Code 中点击右下角状态栏 **`✨ 智能预测`**（或按 `Ctrl + Shift + P` 输入 `Antigravity 智能预测: 配置 Google Gemini API Key`），粘贴你的 Key 即可。

### 2. DeepSeek 渠道
1. 访问 [DeepSeek 开放平台 (platform.deepseek.com)](https://platform.deepseek.com)；
2. 在 API Keys 页面生成密钥；
3. 在 VS Code 中点击状态栏菜单选择 **`配置 DeepSeek API Key`** 粘贴即可。

> 💡 可随时在状态栏菜单中一键切换激活的 AI 通道（Gemini ⇄ DeepSeek）。

---

## 📦 安装与升级

### 方式一：下载 VSIX 一键安装（推荐）

1. 下载最新发行包 `antigravity-smart-predictor-1.1.0.vsix`；
2. 打开 VS Code，按下快捷键 `Ctrl + Shift + X` 打开“扩展”面板；
3. 点击扩展面板右上角的 `···`（更多操作）菜单，选择 **“从 VSIX 安装...”**（Install from VSIX...），选中本文件；
4. 按 `Ctrl + Shift + P` 输入 `Developer: Reload Window`（重新加载窗口）刷新生效！

> 💡 **终端快速安装命令**：
> ```bash
> code --install-extension antigravity-smart-predictor-1.1.0.vsix --force
> ```

---

## ⚙️ 快捷指令与设置

- 点击 VS Code 底部状态栏右侧的 **`✨ 智能预测: Gemini`** 可随时调出设置菜单。
- 支持的 VS Code 命令：
  - `antigravity-predictor.menu`：打开智能预测管理菜单
  - `antigravity-predictor.switchProvider`：切换 AI 通道 (Gemini / DeepSeek)
  - `antigravity-predictor.setGeminiKey`：配置 Gemini API Key
  - `antigravity-predictor.setDeepseekKey`：配置 DeepSeek API Key
  - `antigravity-predictor.toggle`：一键启闭智能预测
  - `antigravity-predictor.clearHistory`：清空个人历史词库

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
