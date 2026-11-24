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

    // 2. 状态栏状态指示胶囊 (右侧靠左)
    this.statusBarItem = vscode.window.createStatusBarItem(
      'antigravity-predictor-item',
      vscode.StatusBarAlignment.Right,
      98
    );
    this.statusBarItem.name = 'Antigravity 智能预测';
    this.statusBarItem.command = 'antigravity-predictor.menu';
    this.renderStatusBar();
    this.statusBarItem.show();

    // 3. 注册命令与菜单
    this.registerCommands();

    // 4. 启动本地轻量快速预测服务 (供 Webview 输入框毫秒级调用)
    this.startHttpServer();

    // 5. 自动注入/更新 Webview 运行时脚本
    this.ensureRuntimeInjected();
  }

  renderStatusBar() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const provider = config.get('provider', 'gemini');
    const geminiKey = config.get('geminiApiKey', '');
    const deepseekKey = config.get('deepseekApiKey', '');
    const hasKey = (provider === 'gemini' && !!geminiKey) || (provider === 'deepseek' && !!deepseekKey);

    const providerName = provider === 'gemini' ? 'Gemini' : 'DeepSeek';

    if (this.isEnabled) {
      if (hasKey) {
        this.statusBarItem.text = `$(sparkle) 智能预测: ${providerName}`;
        this.statusBarItem.tooltip = `Antigravity 智能输入预测已就绪 (当前通道: ${providerName})\n点击打开设置菜单或切换通道`;
      } else {
        this.statusBarItem.text = `$(warning) 智能预测: 需配Key`;
        this.statusBarItem.tooltip = `Antigravity 智能预测已开启，但尚未配置 ${providerName} API Key\n点击立即配置以开启全量 AI 输入补全`;
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
      vscode.commands.registerCommand('antigravity-predictor.toggle', () => {
        this.isEnabled = !this.isEnabled;
        this.renderStatusBar();
        vscode.window.showInformationMessage(
          this.isEnabled ? '✨ Antigravity 智能输入预测已开启！' : '⏸️ Antigravity 智能输入预测已暂停。'
        );
      }),
      vscode.commands.registerCommand('antigravity-predictor.setGeminiKey', () => this.promptGeminiApiKey()),
      vscode.commands.registerCommand('antigravity-predictor.setDeepseekKey', () => this.promptDeepseekApiKey()),
      vscode.commands.registerCommand('antigravity-predictor.switchProvider', () => this.promptSwitchProvider()),
      vscode.commands.registerCommand('antigravity-predictor.clearHistory', () => {
        this.engine.clearHistory();
        vscode.window.showInformationMessage('🧹 个性化历史学习词库已成功清空！');
      })
    );
  }

  async showActionMenu() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const provider = config.get('provider', 'gemini');
    const geminiKey = config.get('geminiApiKey', '');
    const deepseekKey = config.get('deepseekApiKey', '');

    const geminiStatus = geminiKey ? '已配置 ✓' : '未配置 (免费申请)';
    const deepseekStatus = deepseekKey ? '已配置 ✓' : '未配置';

    const items = [
      {
        label: `$(symbol-event) 切换当前 AI 预测通道`,
        description: `当前激活: ${provider === 'gemini' ? 'Google Gemini' : 'DeepSeek'}`,
        action: 'switchProvider'
      },
      {
        label: `$(key) 配置 Google Gemini API Key`,
        description: `[推荐 · 完全免费] 状态: ${geminiStatus}`,
        action: 'setGemini'
      },
      {
        label: `$(key) 配置 DeepSeek API Key`,
        description: `状态: ${deepseekStatus}`,
        action: 'setDeepseek'
      },
      {
        label: this.isEnabled ? `$(circle-slash) 暂停智能预测功能` : `$(sparkle) 开启智能预测功能`,
        description: this.isEnabled ? '临时停用输入框 Ghost Text 补全' : '激活输入框智能预测',
        action: 'toggle'
      },
      {
        label: `$(trash) 清空本地历史学习短语`,
        description: '重置个人高频采纳记忆库',
        action: 'clearHistory'
      }
    ];

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Antigravity 智能输入预测设置菜单'
    });

    if (!pick) return;

    switch (pick.action) {
      case 'switchProvider':
        await this.promptSwitchProvider();
        break;
      case 'setGemini':
        await this.promptGeminiApiKey();
        break;
      case 'setDeepseek':
        await this.promptDeepseekApiKey();
        break;
      case 'toggle':
        this.isEnabled = !this.isEnabled;
        this.renderStatusBar();
        break;
      case 'clearHistory':
        this.engine.clearHistory();
        vscode.window.showInformationMessage('🧹 个人历史词库已清空');
        break;
    }
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

  async promptSwitchProvider() {
    const config = vscode.workspace.getConfiguration('antigravityPredictor');
    const current = config.get('provider', 'gemini');

    const choice = await vscode.window.showQuickPick([
      {
        label: '$(symbol-field) Google Gemini',
        description: '推荐 · aistudio.google.com 可免费申请，极速返回',
        picked: current === 'gemini',
        value: 'gemini'
      },
      {
        label: '$(symbol-field) DeepSeek',
        description: 'platform.deepseek.com，低成本高情商',
        picked: current === 'deepseek',
        value: 'deepseek'
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
              console.log('[AntigravityPredictor] 运行时预测脚本已更新至:', runtimePath);
            } else {
              fs.appendFileSync(runtimePath, '\n\n' + wrappedSnippet + '\n', 'utf8');
              console.log('[AntigravityPredictor] 运行时预测脚本已首次注入至:', runtimePath);
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
            res.end(JSON.stringify({ suggestion: null }));
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
              provider: config.get('provider', 'gemini'),
              geminiApiKey: config.get('geminiApiKey', ''),
              geminiModel: config.get('geminiModel', 'gemini-2.0-flash'),
              deepseekApiKey: config.get('deepseekApiKey', ''),
              deepseekModel: config.get('deepseekModel', 'deepseek-chat')
            };

            const result = await this.engine.predict(prefix, context, aiConfig);
            res.writeHead(200, headers);
            res.end(JSON.stringify(result || { suggestion: null }));
          } catch (e) {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ suggestion: null }));
          }
        } else if (urlStr.startsWith('/record_accepted') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.prefix && data.suffix) {
                this.engine.recordAccepted(data.prefix, data.suffix);
              }
            } catch (e) {}
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true }));
          });
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

  dispose() {
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

let predictorInstance = null;

function activate(context) {
  predictorInstance = new AntigravitySmartPredictor(context);
}

function deactivate() {
  if (predictorInstance) {
    predictorInstance.dispose();
    predictorInstance = null;
  }
}

module.exports = {
  activate,
  deactivate
};
