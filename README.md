# Antigravity 智能输入预测器 (Smart Predictor)

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/VS%20Code-%3E%3D%201.80.0-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Antigravity-1.13.0+-green.svg?style=flat-square" alt="Antigravity">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License">
</p>

> ✨ **Antigravity 也有如同 Copilot 般的对话输入预测与 Ghost Text 幽灵补全了！**  
> 专为 VS Code Antigravity AI 对话输入框打造的生产力利器。打字停顿时自动呈现暗灰色建议文本，按下 <kbd>Tab</kbd> 键一键采纳，告别重复手打复杂 Prompt 的繁琐。

---

## ✨ 核心特性

- 🧠 **Ghost Text 幽灵流式预判**：
  在 Antigravity 聊天输入框打字并稍作停顿（默认 350ms），光标后将自动渐显暗灰色的高质量提示词建议。
- ⚡ **Tab 键一键快速采纳**：
  - 按 <kbd>Tab</kbd> 或 <kbd>→</kbd>：一秒采纳整句建议并自动续上光标；
  - 按 <kbd>Esc</kbd> 或继续打字：建议瞬间隐去，绝不打扰正常输入思路。
- 🎯 **深度覆盖开发者高频指令场景**：
  内置丰富编程意图树，对开发高频动作毫秒级意图捕获：
  - **排查与报错**：`帮我排查` → `这段代码的报错原因，并给出最小改动且可运行的修复方案`
  - **单测与用例**：`编写单元测试` → `，使用常用断言库覆盖各类边界条件`
  - **优化与重构**：`重构` → `这个函数，提取可复用的子模块，降低圈复杂度`
  - **注释与文档**：`给这段代码` → `添加清晰详尽的中文函数注释与参数说明`
  - **Git 工作流**：`写一个 commit` → ` 提交信息，遵循 Conventional Commits 规范`
- 📂 **当前文件与代码语言上下文感知**：
  预测引擎自动感知你当前正在编辑的文件：
  - 打开 `HTML/CSS` 时，输入 `优化` 优先提示移动端自适应与弹性布局；
  - 打开 `TypeScript` 时，输入 `添加` 优先提示类型注解与 Interface 声明；
  - 打开 `Python` 时，输入 `优化` 优先提示列表推导式与异常捕获。
- 📈 **自适应个性化习惯沉淀**：
  内置轻量级本地学习记忆库，自动记录你采纳频率最高的私人习惯词句，越用越懂你的输入风格。
- 🚀 **极速 0 延迟，0 额外 Token 消耗**：
  本地微服务极速计算，无需繁杂配置，无需消耗宝贵的大模型 Token 额度。

---

## 📦 安装与使用

### 方式一：下载 VSIX 一键安装（推荐）

1. 下载 `antigravity-smart-predictor-1.0.0.vsix`；
2. 打开 VS Code，按下快捷键 `Ctrl + Shift + X` 打开“扩展”面板；
3. 点击扩展面板右上角的 `···`（更多操作）菜单，选择 **“从 VSIX 安装...”**（Install from VSIX...），选中本文件即可完成安装；
4. 按 `Ctrl + Shift + P` 输入 `Developer: Reload Window`（重新加载窗口）刷新生效！

> 💡 **终端快速安装命令**：
> ```bash
> code --install-extension antigravity-smart-predictor-1.0.0.vsix --force
> ```

### 方式二：从源码编译打包

```bash
cd antigravity-smart-predictor
npx @vscode/vsce package --no-git-tag-version
code --install-extension antigravity-smart-predictor-1.0.0.vsix --force
```

---

## ⚙️ 快捷指令与设置

- 点击 VS Code 底部状态栏右侧的 **`✨ 智能预测: 开`** 可一键快捷启闭。
- 按 `Ctrl + Shift + P` 输入 `Antigravity 智能预测` 可唤出：
  - `Antigravity 智能预测: 开关输入预测`
  - `Antigravity 智能预测: 清空个性化学习词库`

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
