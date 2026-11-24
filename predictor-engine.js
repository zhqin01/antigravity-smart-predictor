const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 核心意图预置词库与高频编程模板
 * 针对中文编程开发者最常用的日常 Prompt 场景深度调优
 */
const BASE_INTENTS = [
  // 1. 排查 / Bug / 报错类
  { prefix: '帮我排查', suffix: '这段代码的报错原因，并给出最小改动且可运行的修复方案' },
  { prefix: '排查', suffix: '当前实现的异常原因与潜在隐患，给出修复建议' },
  { prefix: '检查', suffix: '当前代码是否存在边界越界、空指针或未捕获的异常' },
  { prefix: '为什么', suffix: '这里会抛出异常，正确的处理方式应该是什么？' },
  { prefix: '报了这个错', suffix: '，请帮我分析根本原因并直接输出修改后的代码' },
  { prefix: '修复这个', suffix: 'Bug，确保向后兼容且不影响已有业务逻辑' },
  { prefix: '定位一下', suffix: '导致这个问题的原因，并给出针对性的解决步骤' },
  { prefix: '看看哪里有问题', suffix: '，特别是异步处理与状态同步的边界分支' },
  { prefix: '这个报错怎么解决', suffix: '？请分析错误堆栈并提供修复步骤' },

  // 2. 优化 / 重构 / 性能类
  { prefix: '优化', suffix: '这段代码的执行效率与算法复杂度，减少冗余开销' },
  { prefix: '帮我优化', suffix: '这个实现的执行性能，并保持外部调用方式不变' },
  { prefix: '重构', suffix: '这个函数，提取可复用的子模块，降低圈复杂度' },
  { prefix: '简化', suffix: '这段逻辑，遵循 YAGNI 原则，去掉过度设计' },
  { prefix: '把这段代码重构', suffix: '为结构更清晰、易读易维护的现代写法' },
  { prefix: '提速', suffix: '这个处理流程，考虑使用批处理或并行机制优化' },
  { prefix: '消除重复', suffix: '代码，抽象出通用的工具辅助函数' },
  { prefix: '提高可读性', suffix: '，重命名语义含糊的变量并理顺业务分支' },

  // 3. 编写 / 生成 / 实现类
  { prefix: '帮我写一个', suffix: '高效且具有良好类型定义的通用工具函数' },
  { prefix: '写一个', suffix: '符合最佳实践的接口与实现代码' },
  { prefix: '实现一个', suffix: '具备容错与超时控制的异步处理方法' },
  { prefix: '生成', suffix: '对应的完整实现代码，包含必要的输入参数校验' },
  { prefix: '为这个文件', suffix: '补充完善的单元测试用例，覆盖正常与异常分支' },
  { prefix: '编写单元测试', suffix: '，使用常用断言库覆盖各类边界条件' },
  { prefix: '写测试用例', suffix: '，确保核心业务逻辑测试覆盖率达标' },
  { prefix: '加一个', suffix: '防抖与节流控制，防止重复触发请求' },
  { prefix: '添加异常捕获', suffix: '与错误恢复逻辑，避免未捕获异常导致崩溃' },

  // 4. 解释 / 审查 / 梳理类
  { prefix: '解释一下', suffix: '这段核心代码的执行流程与关键设计思想' },
  { prefix: '帮我解释', suffix: '这个函数的工作机制与每一步的输入输出' },
  { prefix: '分析一下', suffix: '当前架构方案的优缺点，以及是否存在扩展瓶颈' },
  { prefix: '审查代码', suffix: '，从安全性、性能、可维护性三个维度给出评审意见' },
  { prefix: 'Code Review', suffix: '：检查当前修改是否有代码坏味道或潜在缺陷' },
  { prefix: '梳理一下', suffix: '整个数据流转链路与状态变更的触发时机' },
  { prefix: '看看这段逻辑', suffix: '是否合理，有没有考虑不周全的边缘边界' },

  // 5. 文档 / 注释 / Git 工作流
  { prefix: '给这段代码', suffix: '添加清晰详尽的中文函数注释与参数说明' },
  { prefix: '补充注释', suffix: '，特别是复杂算法与业务特殊规则处' },
  { prefix: '写一个 commit', suffix: ' 提交信息，遵循 Conventional Commits 规范' },
  { prefix: '生成 git commit', suffix: ' 说明，准确概括本次修改的核心改动点' },
  { prefix: '总结一下', suffix: '当前完成的工作要点，列出待办事项与风险项' },
  { prefix: '写一份使用说明', suffix: '，包含 API 签名、参数解释与调用示例代码' },
  { prefix: '生成接口文档', suffix: '，标明各请求字段、类型与示例返回值' },

  // 6. 常用系统与快捷指令
  { prefix: '/compact', suffix: ' 压缩当前会话上下文，释放可用空间' },
  { prefix: '压缩会话', suffix: '，清理冗余输出日志并保留核心任务记忆' },
  { prefix: '继续', suffix: '完成上一阶段未完工的部分' },
  { prefix: '就按你说的办', suffix: '，请直接开始执行并修改相应代码文件' },
  { prefix: '打包', suffix: '这个项目并生成最终可交付的发行文件' }
];

/**
 * 语言与文件上下文专属建议
 */
const CONTEXT_TEMPLATES = {
  html: [
    { prefix: '优化', suffix: '页面在移动端与不同屏幕尺寸下的响应式自适应布局' },
    { prefix: '修改样式', suffix: '，保证色彩搭配现代简约且排版无遮挡' },
    { prefix: '排查', suffix: '页面滚动条或容器溢出导致的内容截断问题' }
  ],
  css: [
    { prefix: '优化', suffix: 'Flexbox 与 Grid 布局，确保各分辨率下的弹性自适应' },
    { prefix: '调整样式', suffix: '，添加平滑的过渡动效与 Hover 微交互' }
  ],
  typescript: [
    { prefix: '添加类型', suffix: '定义，使用严谨的 Interface 与泛型约束消除 any' },
    { prefix: '重构为', suffix: '更具类型安全的泛型函数，并导出对应的 Type 定义' },
    { prefix: '排查类型报错', suffix: '，修复类型不匹配与可能的 undefined 访问' }
  ],
  javascript: [
    { prefix: '改写为', suffix: '现代 ES6+ 语法，使用 async/await 替换回调与 Promise 链' },
    { prefix: '优化内存', suffix: '占用，避免闭包泄漏与未解绑的事件监听器' }
  ],
  python: [
    { prefix: '添加', suffix: '清晰的 Type Hints 类型提示与规范的 Docstring' },
    { prefix: '优化性能', suffix: '，使用列表推导式或内置函数替换冗余循环' }
  ]
};

class PredictorEngine {
  constructor() {
    this.storageDir = path.join(os.homedir(), '.gemini', 'antigravity', 'smart_predictor');
    this.historyFile = path.join(this.storageDir, 'user_habits.json');
    this.userHabits = new Map();
    this.ensureStorage();
    this.loadUserHabits();
  }

  ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {}
  }

  loadUserHabits() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.prefix && item.suffix) {
              const key = item.prefix.trim().toLowerCase();
              this.userHabits.set(key, { suffix: item.suffix, count: item.count || 1 });
            }
          }
        }
      }
    } catch (e) {}
  }

  recordAccepted(prefix, suffix) {
    if (!prefix || !suffix) return;
    try {
      const p = prefix.trim().toLowerCase();
      const existing = this.userHabits.get(p);
      if (existing && existing.suffix === suffix) {
        existing.count += 1;
      } else {
        this.userHabits.set(p, { suffix, count: 1 });
      }

      // 持久化保存前 200 条高频短语
      const list = [];
      for (const [k, v] of this.userHabits.entries()) {
        list.push({ prefix: k, suffix: v.suffix, count: v.count });
      }
      list.sort((a, b) => b.count - a.count);
      fs.writeFileSync(this.historyFile, JSON.stringify(list.slice(0, 200), null, 2), 'utf8');
    } catch (e) {}
  }

  clearHistory() {
    this.userHabits.clear();
    try {
      if (fs.existsSync(this.historyFile)) {
        fs.unlinkSync(this.historyFile);
      }
    } catch (e) {}
  }

  /**
   * 毫秒级多重预测匹配算法
   * @param {string} rawInput 用户输入框内光标前的文字
   * @param {object} context 包含 activeFile, languageId 等上下文信息
   * @returns {object|null} { prefix, suggestion, fullText, score }
   */
  predict(rawInput, context = {}) {
    if (!rawInput) return null;
    const input = rawInput.trim();
    if (input.length === 0) return null;

    const lowerInput = input.toLowerCase();

    // 1. 优先度最高：用户历史采纳过的个性化短语 (精确匹配或最长前缀匹配)
    for (const [p, item] of this.userHabits.entries()) {
      if (lowerInput === p || (lowerInput.startsWith(p) && lowerInput.length - p.length < 4)) {
        return {
          prefix: input,
          suggestion: item.suffix,
          fullText: input + item.suffix,
          source: 'history'
        };
      }
    }

    // 2. 次高优先度：结合当前编辑的文件类型上下文
    const fileExt = (context.activeFile ? path.extname(context.activeFile).replace('.', '') : '') || context.languageId || '';
    if (fileExt && CONTEXT_TEMPLATES[fileExt]) {
      const candidates = CONTEXT_TEMPLATES[fileExt];
      for (const item of candidates) {
        if (input === item.prefix || (input.startsWith(item.prefix) && input.length - item.prefix.length < 3)) {
          return {
            prefix: input,
            suggestion: item.suffix,
            fullText: input + item.suffix,
            source: 'context'
          };
        }
      }
    }

    // 3. 通用高频意图树匹配 (支持完全匹配与末尾前缀模糊延伸)
    let bestMatch = null;
    let maxMatchLen = 0;

    for (const item of BASE_INTENTS) {
      const p = item.prefix;
      // 场景 A: 输入与预置前缀完全相同
      if (input === p) {
        return {
          prefix: input,
          suggestion: item.suffix,
          fullText: input + item.suffix,
          source: 'intent'
        };
      }

      // 场景 B: 预置前缀以用户输入为开头 (例如用户只打了 "帮我排" -> 补全 "查" + suffix)
      if (p.startsWith(input) && input.length >= 2) {
        const remainingPrefix = p.substring(input.length);
        const fullSuggestion = remainingPrefix + item.suffix;
        return {
          prefix: input,
          suggestion: fullSuggestion,
          fullText: input + fullSuggestion,
          source: 'intent'
        };
      }

      // 场景 C: 用户输入的末尾包含某个核心动作前缀 (例如 "我想让你帮我排查")
      if (input.endsWith(p) && p.length > maxMatchLen) {
        maxMatchLen = p.length;
        bestMatch = {
          prefix: input,
          suggestion: item.suffix,
          fullText: input + item.suffix,
          source: 'intent'
        };
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // 4. 常见单字/两字动词宽泛意图兜底预判
    const singleWordFallbacks = [
      { key: '帮', suggestion: '我审查并优化当前代码，并补充详尽的注释' },
      { key: '请', suggestion: '检查当前代码逻辑是否存在问题并给出修改建议' },
      { key: '写', suggestion: '一个符合业务逻辑的高效实现方案' },
      { key: '改', suggestion: '一下这段实现，提高运行效率与可维护性' },
      { key: '查', suffix: '一下当前实现的报错原因与修复方案' }
    ];

    for (const fb of singleWordFallbacks) {
      if (input === fb.key) {
        return {
          prefix: input,
          suggestion: fb.suggestion,
          fullText: input + fb.suggestion,
          source: 'fallback'
        };
      }
    }

    return null;
  }
}

module.exports = {
  PredictorEngine
};
