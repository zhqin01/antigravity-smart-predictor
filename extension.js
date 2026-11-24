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
    this.statusBarItem.command = 'antigravity-predictor.toggle';
    this.renderStatusBar();
    this.statusBarItem.show();

    // 3. 注册命令
    this.registerCommands();

    // 4. 启动本地轻量快速预测服务 (供 Webview 输入框毫秒级调用)
    this.startHttpServer();

    // 5. 自动注入/更新 Webview 运行时脚本
    this.ensureRuntimeInjected();
  }

  renderStatusBar() {
    if (this.isEnabled) {
      this.statusBarItem.text = '$(sparkle) 智能预测: 开';
      this.statusBarItem.tooltip = 'Antigravity 输入预测已开启 (点击关闭)\n在聊天框输入文字停顿，按 Tab 即可一键采纳';
    } else {
      this.statusBarItem.text = '$(circle-slash) 智能预测: 关';
      this.statusBarItem.tooltip = 'Antigravity 输入预测已暂停 (点击开启)';
    }
  }

  registerCommands() {
    this.context.subscriptions.push(
      this.statusBarItem,
      vscode.commands.registerCommand('antigravity-predictor.toggle', () => {
        this.isEnabled = !this.isEnabled;
        this.renderStatusBar();
        vscode.window.showInformationMessage(
          this.isEnabled ? '✨ Antigravity 智能输入预测已开启！' : '⏸️ Antigravity 智能输入预测已暂停。'
        );
      }),
      vscode.commands.registerCommand('antigravity-predictor.clearHistory', () => {
        this.engine.clearHistory();
        vscode.window.showInformationMessage('🧹 个性化历史学习词库已成功清空！');
      })
    );
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
      this.httpServer = http.createServer((req, res) => {
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

            const result = this.engine.predict(prefix, context);
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
