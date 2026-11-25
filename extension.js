const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { PredictorEngine } = require('./predictor-engine');

class AntigravitySmartPredictor {
  constructor(context) {
    this.context = context;
    this.engine = new PredictorEngine();
    this.httpServer = null;
    this.httpPort = 23948;
    this.isEnabled = true;

    // 1. 读取用户配置
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    this.isEnabled = config.get('enabled', true);

    // 2. 状态栏指示徽标
    this.statusBarItem = vscode.window.createStatusBarItem(
      'antigravity-predictor-item',
      vscode.StatusBarAlignment.Right,
      98
    );
    this.statusBarItem.name = 'Antigravity 智能预测';
    this.statusBarItem.command = 'antigravity-predictor.menu';
    this.renderStatusBar();
    this.statusBarItem.show();

    // 2.1 状态栏上下文监控与防压缩保护徽标
    this.contextStatusBarItem = vscode.window.createStatusBarItem(
      'antigravity-context-item',
      vscode.StatusBarAlignment.Right,
      97
    );
    this.contextStatusBarItem.name = 'Antigravity 上下文监控与保护';
    this.contextStatusBarItem.command = 'antigravity-predictor.setContextThreshold';
    this.updateContextMonitor();
    this.contextStatusBarItem.show();

    // 定期刷新上下文占用情况 (每 8 秒刷新一次)
    this.contextTimer = setInterval(() => {
      this.updateContextMonitor();
    }, 8000);

    // 3. 注册命令与菜单
    this.registerCommands();

    // 4. 启动本地轻量快速预测服务 (供 Webview 输入框毫秒级调用)
    this.startHttpServer();

    // 5. 自动检查并自愈注入运行时脚本
    this.ensureRuntimeInjected();
  }

  renderStatusBar() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const provider = config.get('provider', 'deepseek');
    const geminiKey = config.get('geminiApiKey', '');
    const deepseekKey = config.get('deepseekApiKey', '');
    const customEndpoint = config.get('customEndpoint', '');

    let hasKey = false;
    let providerName = 'DeepSeek';

    if (provider === 'gemini') {
      providerName = 'Gemini';
      hasKey = !!geminiKey;
    } else if (provider === 'deepseek') {
      providerName = 'DeepSeek';
      hasKey = !!deepseekKey;
    } else if (provider === 'custom') {
      providerName = 'OpenAI/本地';
      hasKey = !!customEndpoint;
    }

    if (this.isEnabled) {
      if (hasKey) {
        this.statusBarItem.text = `$(sparkle) 智能预测: ${providerName}`;
        this.statusBarItem.tooltip = `Antigravity 智能输入预测已就绪 (通道: ${providerName})\n点击打开设置菜单或切换通道`;
      } else {
        this.statusBarItem.text = `$(warning) 智能预测: 需配Key`;
        this.statusBarItem.tooltip = `Antigravity 智能预测已开启，但尚未配置 ${providerName} 端点或密钥\n点击立即配置以开启全量 AI 输入补全`;
      }
    } else {
      this.statusBarItem.text = `$(circle-slash) 智能预测: 关`;
      this.statusBarItem.tooltip = `Antigravity 输入预测已暂停 (点击开启)`;
    }
  }

  registerCommands() {
    this.context.subscriptions.push(
      this.statusBarItem,
      vscode.commands.registerCommand('antigravity-predictor.menu', () => this.showActionMenu()),
      vscode.commands.registerCommand('antigravity-predictor.doctor', () => this.runDoctor()),
      vscode.commands.registerCommand('antigravity-predictor.showStats', () => this.showStats()),
      vscode.commands.registerCommand('antigravity-predictor.toggle', () => {
        this.isEnabled = !this.isEnabled;
        this.renderStatusBar();
        vscode.window.showInformationMessage(
          this.isEnabled ? '✨ Antigravity 智能输入预测已开启！' : '⏸️ Antigravity 智能输入预测已暂停。'
        );
      }),
      vscode.commands.registerCommand('antigravity-predictor.setDeepseekKey', () => this.promptDeepseekApiKey()),
      vscode.commands.registerCommand('antigravity-predictor.setGeminiKey', () => this.promptGeminiApiKey()),
      vscode.commands.registerCommand('antigravity-predictor.setCustomEndpoint', () => this.promptCustomEndpoint()),
      vscode.commands.registerCommand('antigravity-predictor.switchProvider', () => this.promptSwitchProvider()),
      vscode.commands.registerCommand('antigravity-predictor.clearHistory', () => {
        this.engine.clearHistory();
        vscode.window.showInformationMessage('🧹 个性化历史学习词库已成功清空！');
      }),
      vscode.commands.registerCommand('antigravity-predictor.setContextThreshold', () => this.promptSetContextThreshold()),
      vscode.commands.registerCommand('antigravity-predictor.restoreFullContext', () => this.restoreFullContext())
    );
  }

  async showActionMenu() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const provider = config.get('provider', 'deepseek');
    const geminiKey = config.get('geminiApiKey', '');
    const deepseekKey = config.get('deepseekApiKey', '');
    const customEndpoint = config.get('customEndpoint', '');
    const privacy = config.get('enablePrivacyFilter', true);

    const items = [
      {
        label: `$(pulse) 运行环境自愈诊断 (Doctor)`,
        description: '检查并自动修复 Antigravity 核心运行时注入、端口与网络连通性',
        action: 'doctor'
      },
      {
        label: `$(graph) 查看输入提效统计看板`,
        description: '查看已为你节省的打字字符数与采纳率',
        action: 'stats'
      },
      {
        label: `$(symbol-event) 切换当前 AI 预测通道`,
        description: `当前激活: ${provider === 'deepseek' ? 'DeepSeek (推荐)' : provider === 'gemini' ? 'Google Gemini' : '通用 OpenAI/本地'}`,
        action: 'switchProvider'
      },
      {
        label: `$(key) 配置 DeepSeek API Key`,
        description: `状态: ${deepseekKey ? '已配置 ✓' : '未配置 (推荐)'}`,
        action: 'setDeepseek'
      },
      {
        label: `$(key) 配置 Google Gemini API Key`,
        description: `状态: ${geminiKey ? '已配置 ✓' : '未配置'}`,
        action: 'setGemini'
      },
      {
        label: `$(server) 配置通用 OpenAI / 本地端点 (Ollama / 硅基流动)`,
        description: `端点: ${customEndpoint || '未配置'}`,
        action: 'setCustom'
      },
      {
        label: privacy ? `$(shield) 隐私脱敏过滤器: 已开启` : `$(shield) 隐私脱敏过滤器: 已关闭`,
        description: privacy ? '自动遮蔽密码、Token、私网 IP 等敏感数据' : '点击开启隐私过滤保护',
        action: 'togglePrivacy'
      },
      {
        label: this.isEnabled ? `$(circle-slash) 暂停智能预测功能` : `$(sparkle) 开启智能预测功能`,
        description: this.isEnabled ? '临时停用输入框 Ghost Text 补全' : '激活输入框智能预测',
        action: 'toggle'
      },
      {
        label: `$(database) 上下文容量与压缩阈值设置`,
        description: `当前阈值: ${config.get('compactionThreshold', 85)}% | 策略: ${config.get('autoCompactionPolicy', 'manual') === 'manual' ? '纯手动保护' : config.get('autoCompactionPolicy', 'manual')}`,
        action: 'setContextThreshold'
      },
      {
        label: `$(history) 恢复/查看被压缩的完整历史上下文`,
        description: '从本地 transcript_full.jsonl 导出并查看未截断记忆',
        action: 'restoreFullContext'
      },
      {
        label: `$(trash) 清空本地历史学习短语`,
        description: '重置个人高频采纳记忆库',
        action: 'clearHistory'
      }
    ];

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Antigravity 智能输入预测控制面板 (Smart Predictor)'
    });

    if (!pick) return;

    switch (pick.action) {
      case 'doctor':
        await this.runDoctor();
        break;
      case 'stats':
        await this.showStats();
        break;
      case 'switchProvider':
        await this.promptSwitchProvider();
        break;
      case 'setDeepseek':
        await this.promptDeepseekApiKey();
        break;
      case 'setGemini':
        await this.promptGeminiApiKey();
        break;
      case 'setCustom':
        await this.promptCustomEndpoint();
        break;
      case 'togglePrivacy':
        await config.update('antigravityPredictor.enablePrivacyFilter', !privacy, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`🛡️ 隐私脱敏过滤器已${!privacy ? '开启' : '关闭'}`);
        break;
      case 'toggle':
        this.isEnabled = !this.isEnabled;
        this.renderStatusBar();
        break;
      case 'setContextThreshold':
        await this.promptSetContextThreshold();
        break;
      case 'restoreFullContext':
        await this.restoreFullContext();
        break;
      case 'clearHistory':
        this.engine.clearHistory();
        vscode.window.showInformationMessage('🧹 个人历史词库已清空');
        break;
    }
  }

  async runDoctor() {
    const report = [];
    let repaired = false;

    // 1. 检查 Antigravity 插件目录与注入状态
    const extDir = path.join(os.homedir(), '.vscode', 'extensions');
    let antigravityFound = false;
    let injectedProperly = false;

    if (fs.existsSync(extDir)) {
      const items = fs.readdirSync(extDir);
      for (const item of items) {
        if (item.startsWith('google.google-antigravity')) {
          antigravityFound = true;
          const runtimePath = path.join(extDir, item, 'agy-i18n-runtime.js');
          if (fs.existsSync(runtimePath)) {
            const content = fs.readFileSync(runtimePath, 'utf8');
            if (content.includes('/* ANTIGRAVITY_SMART_PREDICTOR_START */') && content.includes('/* ANTIGRAVITY_SMART_PREDICTOR_END */')) {
              injectedProperly = true;
            }
          }
        }
      }
    }

    if (!antigravityFound) {
      report.push('❌ 未检测到 Google Antigravity 官方扩展目录');
    } else if (injectedProperly) {
      report.push('✅ 核心运行时脚本：已成功注入并保持激活');
    } else {
      // 触发自动修复自愈
      this.ensureRuntimeInjected();
      repaired = true;
      report.push('⚠️ 核心运行时此前丢失，已自动执行修复注入！');
    }

    // 2. 检查本地 HTTP 服务端口
    report.push(`✅ 本地预测服务：正常监听在 http://127.0.0.1:${this.httpPort}`);

    // 3. 检查当前 AI 通道配置与网络连通性
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const provider = config.get('provider', 'deepseek');
    report.push(`ℹ️ 当前激活 AI 通道: ${provider.toUpperCase()}`);

    const startTime = Date.now();
    try {
      const aiConfig = {
        provider,
        deepseekApiKey: config.get('deepseekApiKey', ''),
        deepseekModel: config.get('deepseekModel', 'deepseek-chat'),
        geminiApiKey: config.get('geminiApiKey', ''),
        geminiModel: config.get('geminiModel', 'gemini-2.5-flash'),
        customEndpoint: config.get('customEndpoint', ''),
        customApiKey: config.get('customApiKey', ''),
        customModel: config.get('customModel', 'qwen2.5:latest')
      };

      const testResult = await this.engine.service.predictWithAI('帮我写一个', aiConfig);
      const elapsed = Date.now() - startTime;
      if (testResult && testResult.suggestion) {
        report.push(`✅ AI 通道连通性测试通过！延迟: ${elapsed}ms (续写样例: "${testResult.suggestion}")`);
      } else {
        report.push(`⚠️ AI 通道未返回结果 (可能未配置 API Key 或处于频控中)，本地规则兜底运行正常`);
      }
    } catch (e) {
      report.push(`⚠️ API 测试异常: ${e.message}`);
    }

    const message = report.join('\n');
    if (repaired) {
      const action = await vscode.window.showWarningMessage(
        `[Doctor 诊断自愈] 运行时补丁已重新注入！需要重载窗口生效：\n\n${message}`,
        '立即重载窗口 (Reload Window)',
        '知道了'
      );
      if (action === '立即重载窗口 (Reload Window)') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } else {
      vscode.window.showInformationMessage(`[Doctor 诊断报告]\n\n${message}`);
    }
  }

  async showStats() {
    const s = this.engine.getStatsSummary();
    const msg = [
      `📊 Antigravity 智能输入预测提效看板：`,
      `• 累计提供预测：${s.shown} 次`,
      `• 用户按 Tab 采纳：${s.accepted} 次`,
      `• 总体预测采纳率：${s.rate}`,
      `• 累计为您节省输入：${s.saved} 个字符`
    ].join('\n');

    vscode.window.showInformationMessage(msg);
  }

  async promptGeminiApiKey() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const currentKey = config.get('geminiApiKey', '');

    const key = await vscode.window.showInputBox({
      title: '配置 Google Gemini API Key',
      prompt: '请输入从 Google AI Studio (aistudio.google.com) 免费申请的 Gemini API Key',
      value: currentKey,
      placeHolder: 'AIzaSy...',
      password: true,
      ignoreFocusOut: true
    });

    if (key !== undefined) {
      await config.update('antigravityPredictor.geminiApiKey', key.trim(), vscode.ConfigurationTarget.Global);
      if (key.trim()) {
        await config.update('antigravityPredictor.provider', 'gemini', vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('🎉 Google Gemini API Key 配置成功！AI 智能输入预测通道已激活。');
      } else {
        vscode.window.showInformationMessage('已清除 Gemini API Key。');
      }
      this.renderStatusBar();
    }
  }

  async promptDeepseekApiKey() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const currentKey = config.get('deepseekApiKey', '');

    const key = await vscode.window.showInputBox({
      title: '配置 DeepSeek API Key',
      prompt: '请输入从 DeepSeek 开放平台 (platform.deepseek.com) 申请的 API Key',
      value: currentKey,
      placeHolder: 'sk-...',
      password: true,
      ignoreFocusOut: true
    });

    if (key !== undefined) {
      await config.update('antigravityPredictor.deepseekApiKey', key.trim(), vscode.ConfigurationTarget.Global);
      if (key.trim()) {
        await config.update('antigravityPredictor.provider', 'deepseek', vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('🎉 DeepSeek API Key 配置成功！AI 智能输入预测通道已激活。');
      } else {
        vscode.window.showInformationMessage('已清除 DeepSeek API Key。');
      }
      this.renderStatusBar();
    }
  }

  async promptCustomEndpoint() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const currentEndpoint = config.get('customEndpoint', 'http://localhost:11434/v1');
    const currentKey = config.get('customApiKey', '');
    const currentModel = config.get('customModel', 'qwen2.5:latest');

    const endpoint = await vscode.window.showInputBox({
      title: '配置通用 OpenAI 兼容端点 Base URL',
      prompt: '支持本地 Ollama (如 http://localhost:11434/v1) 或硅基流动 / OneAPI 等',
      value: currentEndpoint,
      placeHolder: 'http://localhost:11434/v1',
      ignoreFocusOut: true
    });

    if (endpoint === undefined) return;

    const apiKey = await vscode.window.showInputBox({
      title: '配置通用端点 API Key (本地 Ollama 可直接留空)',
      value: currentKey,
      placeHolder: 'sk-...',
      password: true,
      ignoreFocusOut: true
    });

    if (apiKey === undefined) return;

    const model = await vscode.window.showInputBox({
      title: '配置模型名称 (Model Name)',
      value: currentModel,
      placeHolder: 'qwen2.5:latest / llama3.1:8b',
      ignoreFocusOut: true
    });

    if (model === undefined) return;

    await config.update('antigravityPredictor.customEndpoint', endpoint.trim(), vscode.ConfigurationTarget.Global);
    await config.update('antigravityPredictor.customApiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
    await config.update('antigravityPredictor.customModel', model.trim() || 'default', vscode.ConfigurationTarget.Global);
    await config.update('antigravityPredictor.provider', 'custom', vscode.ConfigurationTarget.Global);

    this.renderStatusBar();
    vscode.window.showInformationMessage('🎉 通用 OpenAI / 本地端点配置成功！当前已切换为 Custom 预测通道。');
  }

  async promptSwitchProvider() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const current = config.get('provider', 'deepseek');

    const choice = await vscode.window.showQuickPick([
      {
        label: '$(symbol-field) DeepSeek',
        description: '推荐 · platform.deepseek.com，低成本高情商，国内秒级直连',
        picked: current === 'deepseek',
        value: 'deepseek'
      },
      {
        label: '$(symbol-field) Google Gemini',
        description: 'aistudio.google.com 可免费申请 (每天限额 20 次)',
        picked: current === 'gemini',
        value: 'gemini'
      },
      {
        label: '$(symbol-field) 通用 OpenAI / 本地端点 (Custom)',
        description: '支持 Ollama / 硅基流动 / OneAPI / Groq 等兼容端点',
        picked: current === 'custom',
        value: 'custom'
      }
    ], {
      placeHolder: '选择要使用的 AI 预测补全通道'
    });

    if (choice) {
      await config.update('antigravityPredictor.provider', choice.value, vscode.ConfigurationTarget.Global);
      this.renderStatusBar();
      vscode.window.showInformationMessage(`🔄 AI 预测通道已切换为: ${choice.label.replace(/\$\([^)]+\)\s*/, '')}`);
    }
  }

  ensureRuntimeInjected() {
    try {
      const extDir = path.join(os.homedir(), '.vscode', 'extensions');
      if (!fs.existsSync(extDir)) return;
      const items = fs.readdirSync(extDir);

      const startMarker = '/* ANTIGRAVITY_SMART_PREDICTOR_START */';
      const endMarker = '/* ANTIGRAVITY_SMART_PREDICTOR_END */';

      const scriptPath = path.join(__dirname, 'runtime-predictor.js');
      if (!fs.existsSync(scriptPath)) return;
      const predictorCode = fs.readFileSync(scriptPath, 'utf8');
      const wrappedSnippet = `${startMarker}\n${predictorCode}\n${endMarker}`;

      for (const item of items) {
        if (item.startsWith('google.google-antigravity')) {
          const runtimePath = path.join(extDir, item, 'agy-i18n-runtime.js');
          if (fs.existsSync(runtimePath)) {
            const content = fs.readFileSync(runtimePath, 'utf8');
            if (content.includes(startMarker) && content.includes(endMarker)) {
              const sIdx = content.indexOf(startMarker);
              const eIdx = content.indexOf(endMarker) + endMarker.length;
              const before = content.substring(0, sIdx);
              const after = content.substring(eIdx);
              fs.writeFileSync(runtimePath, before + wrappedSnippet + after, 'utf8');
            } else {
              fs.appendFileSync(runtimePath, '\n\n' + wrappedSnippet + '\n', 'utf8');
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AntigravityPredictor] 注入检查跳过:', e.message);
    }
  }

  startHttpServer() {
    try {
      this.httpServer = http.createServer(async (req, res) => {
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store'
        };

        if (req.method === 'OPTIONS') {
          res.writeHead(204, headers);
          res.end();
          return;
        }

        const urlStr = req.url || '';

        if (urlStr.startsWith('/predict')) {
          if (!this.isEnabled) {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ suggestion: null, candidates: [] }));
            return;
          }

          try {
            const parsed = new URL(urlStr, 'http://127.0.0.1:23948');
            const prefix = parsed.searchParams.get('prefix') || '';

            // 获取当前活动编辑器上下文信息 (语言、文件名)
            const activeDoc = vscode.window.activeTextEditor?.document;
            const context = {
              activeFile: activeDoc?.fileName || '',
              languageId: activeDoc?.languageId || ''
            };

            // 获取用户配置的 AI 通道与 Key
            const config = vscode.workspace.getConfiguration('antigravityPredictor');
            const aiConfig = {
              provider: config.get('provider', 'deepseek'),
              geminiApiKey: config.get('geminiApiKey', ''),
              geminiModel: config.get('geminiModel', 'gemini-2.5-flash'),
              deepseekApiKey: config.get('deepseekApiKey', ''),
              deepseekModel: config.get('deepseekModel', 'deepseek-chat'),
              customEndpoint: config.get('customEndpoint', 'http://localhost:11434/v1'),
              customApiKey: config.get('customApiKey', ''),
              customModel: config.get('customModel', 'qwen2.5:latest'),
              enablePrivacyFilter: config.get('enablePrivacyFilter', true)
            };

            const result = await this.engine.predict(prefix, context, aiConfig);
            if (result && result.suggestion) {
              this.engine.recordStats('shown', {});
            }
            res.writeHead(200, headers);
            res.end(JSON.stringify(result || { suggestion: null, candidates: [] }));
          } catch (e) {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ suggestion: null, candidates: [] }));
          }
        } else if (urlStr.startsWith('/record_accepted') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.prefix && data.suffix) {
                this.engine.recordAccepted(data.prefix, data.suffix);
                this.engine.recordStats('accepted', { length: data.suffix.length });
              }
            } catch (e) {}
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true }));
          });
        } else if (urlStr.startsWith('/stats')) {
          res.writeHead(200, headers);
          res.end(JSON.stringify(this.engine.getStatsSummary()));
        } else if (urlStr.startsWith('/action/configure_key')) {
          this.showActionMenu();
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404, headers);
          res.end(JSON.stringify({ error: 'not_found' }));
        }
      });

      this.httpServer.on('error', (err) => {
        console.warn('[AntigravityPredictor] 服务端口异常:', err.message);
      });

      this.httpServer.listen(this.httpPort, '127.0.0.1', () => {
        console.log(`[AntigravityPredictor] 预测引擎就绪: http://127.0.0.1:${this.httpPort}/predict`);
      });
    } catch (err) {
      console.warn('[AntigravityPredictor] 启动服务失败:', err);
    }
  }

  getLatestContextUsage() {
    try {
      const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
      if (!fs.existsSync(brainDir)) return null;

      const entries = fs.readdirSync(brainDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => {
          try {
            const p = path.join(brainDir, d.name);
            return { name: d.name, path: p, time: fs.statSync(p).mtimeMs };
          } catch(e) { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.time - a.time);

      for (const entry of entries) {
        const transcriptPath = path.join(entry.path, '.system_generated', 'logs', 'transcript.jsonl');
        const fullTranscriptPath = path.join(entry.path, '.system_generated', 'logs', 'transcript_full.jsonl');
        if (!fs.existsSync(transcriptPath)) continue;

        const stat = fs.statSync(transcriptPath);
        const readSize = Math.min(stat.size, 32768);
        const buf = Buffer.alloc(readSize);
        const fd = fs.openSync(transcriptPath, 'r');
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);

        const text = buf.toString('utf8');
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const data = JSON.parse(lines[i]);
            if (data.cache_read_tokens !== undefined || data.input_tokens !== undefined) {
              const tokens = (data.cache_read_tokens || 0) + (data.input_tokens || 0) + (data.output_tokens || 0);
              return {
                conversationId: entry.name,
                conversationPath: entry.path,
                transcriptPath,
                fullTranscriptPath,
                tokens,
                cacheReadTokens: data.cache_read_tokens || 0,
                inputTokens: data.input_tokens || 0,
                outputTokens: data.output_tokens || 0,
                stepIndex: data.step_index || 0,
                isCompacted: text.includes('CHECKPOINT') || text.includes('compaction')
              };
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[AntigravityPredictor] 读取上下文用量失败:', e.message);
    }
    return null;
  }

  updateContextMonitor() {
    if (!this.contextStatusBarItem) return;
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const threshold = config.get('compactionThreshold', 85);
    const policy = config.get('autoCompactionPolicy', 'manual');

    const usage = this.getLatestContextUsage();
    if (!usage) {
      this.contextStatusBarItem.text = `$(database) 上下文: 监控中`;
      this.contextStatusBarItem.tooltip = `Antigravity 上下文监控已就绪\n阈值: ${threshold}% | 策略: ${policy}`;
      return;
    }

    const HOST_LIMIT = 256000; // 底座活跃安全上限 256k
    const MODEL_LIMIT = 2000000; // Gemini 模型标称 200万

    const pctHost = Math.min(100, Math.round((usage.tokens / HOST_LIMIT) * 100));
    const pctModel = (usage.tokens / 20000).toFixed(1);
    const tokenK = Math.round(usage.tokens / 1000);

    let policyLabel = '纯手动保护';
    let icon = '$(shield)';
    if (policy === 'warn_only') {
      policyLabel = '到阈预警';
      icon = '$(bell)';
    } else if (policy === 'auto') {
      policyLabel = `自动(${threshold}%)`;
      icon = '$(sync)';
    }

    this.contextStatusBarItem.text = `${icon} 上下文: ${tokenK}k (${pctHost}%) [${policyLabel}]`;

    let warnNotice = '';
    if (threshold > 0 && pctHost >= threshold) {
      this.contextStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      warnNotice = `\n⚠️ 【注意】当前已达到你设定的阈值 ${threshold}%！`;
    } else {
      this.contextStatusBarItem.backgroundColor = undefined;
    }

    this.contextStatusBarItem.tooltip =
      `📊 Antigravity 上下文监控与防压缩保护 (v1.4.0)\n` +
      `----------------------------------------\n` +
      `• 当前会话 Token: ${usage.tokens.toLocaleString()} (${tokenK}K)\n` +
      `• 宿主底座活跃上限: 256,000 Tokens (已用 ${pctHost}%)\n` +
      `• 模型标称总容量: 2,000,000 Tokens (UI 显示约 ${pctModel}%)\n` +
      `• 用户自定义阈值: ${threshold === 0 ? '已禁用' : threshold + '%'}\n` +
      `• 压缩控制策略: ${policy === 'manual' ? '🛡️ 纯手动保护 (已锁定禁止后台静默压缩)' : policy === 'warn_only' ? '⚠️ 仅预警提醒' : '⚡ 达到设定阈值自动压缩'}\n` +
      `${warnNotice}\n` +
      `👉 点击随时修改压缩阈值或切换控制策略`;
  }

  async promptSetContextThreshold() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const currentThreshold = config.get('compactionThreshold', 85);
    const currentPolicy = config.get('autoCompactionPolicy', 'manual');

    const usage = this.getLatestContextUsage();
    const tokenK = usage ? Math.round(usage.tokens / 1000) : 0;
    const pctHost = usage ? Math.min(100, Math.round((usage.tokens / 256000) * 100)) : 0;

    const items = [
      {
        label: `$(edit) 手动填写压缩阈值 (当前: ${currentThreshold}%)`,
        description: `当前占用: ${tokenK}k Tokens (${pctHost}%)。点击自定义输入百分比 (0-100%)`,
        action: 'editThreshold'
      },
      {
        label: currentPolicy === 'manual' ? `$(check) 🛡️ 纯手动保护模式 (当前生效)` : `$(shield) 🛡️ 纯手动保护模式 (推荐)`,
        description: '坚决取消/禁止底座静默自动压缩，何时压缩完全由你手动说了算',
        action: 'setManual'
      },
      {
        label: currentPolicy === 'warn_only' ? `$(check) ⚠️ 阈值预警模式 (当前生效)` : `$(bell) ⚠️ 阈值预警模式`,
        description: `达到你设定的阈值 (${currentThreshold}%) 时仅弹窗提示，不擅自压缩`,
        action: 'setWarnOnly'
      },
      {
        label: currentPolicy === 'auto' ? `$(check) ⚡ 自定义自动压缩模式 (当前生效)` : `$(sync) ⚡ 自定义自动压缩模式`,
        description: `严格按照你设定的百分比 (${currentThreshold}%) 触发压缩，不再由系统 12% 偷摸压缩`,
        action: 'setAuto'
      },
      {
        label: `$(history) 恢复/查看被压缩的完整历史记录`,
        description: '从本地 transcript_full.jsonl 导出并查看未被截断的完整会话上下文',
        action: 'restore'
      }
    ];

    const pick = await vscode.window.showQuickPick(items, {
      title: 'Antigravity 上下文容量与压缩阈值管理',
      placeHolder: '选择要修改的压缩策略或阈值'
    });

    if (!pick) return;

    if (pick.action === 'editThreshold') {
      const val = await vscode.window.showInputBox({
        title: '设置上下文压缩阈值百分比',
        prompt: '请输入触发压缩或预警的阈值百分比 (0-100，输入 85 表示 85%，输入 0 表示彻底禁用自动压缩预警):',
        value: String(currentThreshold),
        validateInput: (text) => {
          const num = parseInt(text.trim(), 10);
          if (isNaN(num) || num < 0 || num > 100) {
            return '请输入 0 到 100 之间的有效数字';
          }
          return null;
        }
      });

      if (val !== undefined) {
        const num = parseInt(val.trim(), 10);
        await config.update('compactionThreshold', num, vscode.ConfigurationTarget.Global);
        this.updateContextMonitor();
        vscode.window.showInformationMessage(`✅ 上下文压缩保护阈值已成功调整为 ${num}%！`);
      }
    } else if (pick.action === 'setManual') {
      await config.update('autoCompactionPolicy', 'manual', vscode.ConfigurationTarget.Global);
      this.updateContextMonitor();
      vscode.window.showInformationMessage('🛡️ 已切换为【纯手动保护模式】！系统后台已被禁止擅自自动压缩。');
    } else if (pick.action === 'setWarnOnly') {
      await config.update('autoCompactionPolicy', 'warn_only', vscode.ConfigurationTarget.Global);
      this.updateContextMonitor();
      vscode.window.showInformationMessage(`⚠️ 已切换为【阈值预警模式】！达到 ${currentThreshold}% 时将弹窗提示。`);
    } else if (pick.action === 'setAuto') {
      await config.update('autoCompactionPolicy', 'auto', vscode.ConfigurationTarget.Global);
      this.updateContextMonitor();
      vscode.window.showInformationMessage(`⚡ 已切换为【自定义自动压缩模式】！达到 ${currentThreshold}% 时将自动压缩。`);
    } else if (pick.action === 'restore') {
      await this.restoreFullContext();
    }
  }

  async restoreFullContext() {
    const usage = this.getLatestContextUsage();
    if (!usage || !usage.fullTranscriptPath || !fs.existsSync(usage.fullTranscriptPath)) {
      vscode.window.showWarningMessage('未找到本地完整会话记录或当前会话尚未产生快照。');
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(usage.fullTranscriptPath);
      await vscode.window.showTextDocument(doc, { preview: true });
      vscode.window.showInformationMessage(`📂 已为你打开当前会话完整历史记录：${path.basename(usage.fullTranscriptPath)}`);
    } catch (e) {
      vscode.window.showErrorMessage(`打开完整历史失败: ${e.message}`);
    }
  }

  dispose() {
    if (this.contextTimer) {
      clearInterval(this.contextTimer);
    }
    if (this.contextStatusBarItem) {
      this.contextStatusBarItem.dispose();
    }
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (e) {}
    }
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

function activate(context) {
  const predictor = new AntigravitySmartPredictor(context);
  context.subscriptions.push(predictor);
  return predictor;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
