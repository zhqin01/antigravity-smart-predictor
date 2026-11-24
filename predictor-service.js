const https = require('https');
const http = require('http');
const tls = require('tls');
const path = require('path');

/**
 * 智能输入预测网络服务 (v2.0.0 企业级多通道引擎)
 * 支持 Google Gemini API、DeepSeek 官方 API 及任意 OpenAI 兼容通用端点 (Ollama / 硅基流动 / OneAPI / Groq)
 * 内置上下文感知注入、自然标点符号保障、HTTP CONNECT 代理自动穿透与 429 频控熔断
 */
class PredictorService {
  constructor() {
    this.cache = new Map();
    this.currentAbortController = null;
    this.rateLimitedUntil = 0;
  }

  getProxyUrl() {
    return process.env.HTTPS_PROXY ||
           process.env.https_proxy ||
           process.env.HTTP_PROXY ||
           process.env.http_proxy ||
           process.env.ALL_PROXY ||
           process.env.all_proxy ||
           'http://127.0.0.1:6789';
  }

  /**
   * 清理与标准化建议文本，确保自然标点完整保留，剥离外层引号与助手反问腔
   */
  cleanSuggestion(rawSuggestion, prefix) {
    if (!rawSuggestion) return null;
    let s = rawSuggestion.trim();
    if (!s || s.toUpperCase() === 'NONE' || s.toUpperCase().startsWith('NONE')) return null;

    // 仅剥离外层包裹的对称引号与反引号，严禁剥离内部中文逗号、句号、问号
    s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();

    if (prefix && s.startsWith(prefix)) {
      s = s.substring(prefix.length).trim();
    }
    s = s.replace(/^(补全内容[：:]|续写[：:]|建议[：:]|下文[：:]|回答[：:]|提示[：:])/g, '').trim();
    if (!s || s.toUpperCase() === 'NONE' || s.toUpperCase().startsWith('NONE')) return null;

    // 助手特征词硬拦截：坚决丢弃反问、指令或解释语气
    if (/^(我需要|请提供|请先|请发|好的|你可以|建议你|作为AI|作为一个|请告诉我|请问)/.test(s)) {
      return null;
    }

    return s.length > 0 ? s : null;
  }

  /**
   * 构建提问者视角与上下文增强的提示词指令
   */
  buildSystemPrompt(contextInfo = {}) {
    let ctxDesc = '';
    if (contextInfo && (contextInfo.activeFile || contextInfo.languageId)) {
      const fileName = contextInfo.activeFile ? path.basename(contextInfo.activeFile) : '';
      const lang = contextInfo.languageId || '';
      ctxDesc = `\n【当前代码上下文】正在编辑的文件：${fileName} (语言: ${lang})。请优先结合该开发场景给出专业续写。`;
    }

    return `你是一个代码编辑器输入框的自动补全引擎。${ctxDesc}
【至关重要的原则】
当前文字是【用户（人类提问者）】正在草拟的内容，不是对你的提问！
你的任务是站在【用户本人】的视角，继续把用户接下来想说的话写完整。
【严苛禁令】
1. 绝对不要以 AI 助手的身份回答、反问或解释（严禁出现“我需要先看到”、“请提供”、“好的”等回答语气）！
2. 如果用户的提问已经是一个完全独立的完整指令、不需要额外补充时，直接输出：NONE
3. 续写的内容必须是用户指令的延伸约束（例如“，并给出删除理由”、“，重点分析占用内存大的”），5到18字以内。
4. 严禁重复前缀，严禁包含任何客套解释或对话引号。
5. 必须保留并正确使用自然标点符号（如逗号“，”、句号“。”、问号“？”、顿号“、”），使续写与前缀在语法与语感上无缝衔接，直接输出纯文本。`;
  }

  /**
   * 核心预测调度入口：支持 deepseek / gemini / custom(OpenAI兼容)
   */
  async predictWithAI(prefix, config, contextInfo = {}) {
    const { provider, geminiApiKey, deepseekApiKey, geminiModel, deepseekModel, customEndpoint, customApiKey, customModel } = config;

    const cacheKey = `${provider}:${prefix.trim()}:${contextInfo.languageId || ''}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (provider === 'gemini' && Date.now() < this.rateLimitedUntil) {
      return null;
    }

    // 中断上一次在途请求
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (e) {}
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      let rawResult = null;
      if (provider === 'gemini') {
        if (!geminiApiKey) return null;
        rawResult = await this.callGemini(prefix, geminiApiKey, geminiModel, contextInfo, signal);
      } else if (provider === 'deepseek') {
        if (!deepseekApiKey) return null;
        rawResult = await this.callDeepSeek(prefix, deepseekApiKey, deepseekModel, contextInfo, signal);
      } else if (provider === 'custom') {
        if (!customEndpoint) return null;
        rawResult = await this.callOpenAICompatible(prefix, customEndpoint, customApiKey, customModel, contextInfo, signal);
      }

      let candidates = [];
      if (Array.isArray(rawResult)) {
        for (const item of rawResult) {
          const c = this.cleanSuggestion(item, prefix);
          if (c && !candidates.includes(c)) candidates.push(c);
        }
      } else if (typeof rawResult === 'string') {
        const c = this.cleanSuggestion(rawResult, prefix);
        if (c) candidates.push(c);
      }

      if (candidates.length === 0) return null;

      const mainSuggestion = candidates[0];
      const resultObj = {
        suggestion: mainSuggestion,
        candidates: candidates
      };

      if (this.cache.size > 120) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, resultObj);

      return resultObj;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return null;
    }
  }

  callGemini(prefix, apiKey, model = 'gemini-2.5-flash', contextInfo = {}, signal) {
    return new Promise((resolve) => {
      const targetModel = model || 'gemini-2.5-flash';
      const prompt = `${this.buildSystemPrompt(contextInfo)}

用户当前未写完的提问内容是："${prefix}"。请站在用户立场续写后续字句（注意保留恰当标点）：`;

      const payload = JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      });

      const requestOptions = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${targetModel}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 4500
      };

      const handleResponse = (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 429) {
              this.rateLimitedUntil = Date.now() + 25000;
              resolve(null);
              return;
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const json = JSON.parse(data);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              resolve(text || null);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      };

      const proxyUrl = this.getProxyUrl();
      if (proxyUrl) {
        try {
          const pUrl = new URL(proxyUrl);
          const connectReq = http.request({
            host: pUrl.hostname,
            port: pUrl.port,
            method: 'CONNECT',
            path: 'generativelanguage.googleapis.com:443',
            timeout: 4500
          });

          connectReq.on('connect', (res, socket) => {
            if (res.statusCode === 200) {
              const tlsSocket = tls.connect({
                host: 'generativelanguage.googleapis.com',
                socket: socket,
                servername: 'generativelanguage.googleapis.com'
              }, () => {
                const req = https.request({
                  ...requestOptions,
                  createConnection: () => tlsSocket
                }, handleResponse);

                if (signal) {
                  signal.addEventListener('abort', () => {
                    req.destroy(new Error('AbortError'));
                    resolve(null);
                  });
                }
                req.on('timeout', () => {
                  req.destroy();
                  resolve(null);
                });
                req.on('error', () => resolve(null));
                req.write(payload);
                req.end();
              });
              tlsSocket.on('error', () => resolve(null));
            } else {
              this.directGeminiRequest(requestOptions, payload, signal, resolve);
            }
          });

          connectReq.on('timeout', () => {
            connectReq.destroy();
            this.directGeminiRequest(requestOptions, payload, signal, resolve);
          });
          connectReq.on('error', () => {
            this.directGeminiRequest(requestOptions, payload, signal, resolve);
          });
          connectReq.end();
          return;
        } catch (e) {}
      }

      this.directGeminiRequest(requestOptions, payload, signal, resolve);
    });
  }

  directGeminiRequest(options, payload, signal, resolve) {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            this.rateLimitedUntil = Date.now() + 25000;
            resolve(null);
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const json = JSON.parse(data);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve(text || null);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy(new Error('AbortError'));
        resolve(null);
      });
    }

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  }

  callDeepSeek(prefix, apiKey, model = 'deepseek-chat', contextInfo = {}, signal) {
    return new Promise((resolve) => {
      const targetModel = model || 'deepseek-chat';
      const payload = JSON.stringify({
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt(contextInfo)
          },
          {
            role: 'user',
            content: `用户当前未写完的提问内容是："${prefix}"。请站在用户立场续写后续字句（注意保留恰当标点）：`
          }
        ],
        max_tokens: 45,
        temperature: 0.15,
        stream: false
      });

      const options = {
        hostname: 'api.deepseek.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 4500
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const json = JSON.parse(data);
              const choices = json.choices || [];
              const list = choices.map(c => c.message?.content).filter(Boolean);
              resolve(list.length > 0 ? list : null);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy(new Error('AbortError'));
          resolve(null);
        });
      }

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.on('error', () => resolve(null));
      req.write(payload);
      req.end();
    });
  }

  /**
   * 通用 OpenAI 兼容协议客户端 (支持 Ollama / 硅基流动 / OneAPI / Groq / Kimi 等)
   */
  callOpenAICompatible(prefix, endpoint, apiKey, model = 'default', contextInfo = {}, signal) {
    return new Promise((resolve) => {
      try {
        let ep = endpoint.trim().replace(/\/+$/, '');
        if (!ep.endsWith('/chat/completions')) {
          ep = `${ep}/chat/completions`;
        }
        const parsed = new URL(ep);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const targetModel = model || 'default';
        const payload = JSON.stringify({
          model: targetModel,
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(contextInfo)
            },
            {
              role: 'user',
              content: `用户当前未写完的提问内容是："${prefix}"。请站在用户立场续写后续字句（注意保留恰当标点）：`
            }
          ],
          max_tokens: 45,
          temperature: 0.15,
          stream: false
        });

        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        };
        if (apiKey && apiKey.trim()) {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }

        const options = {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: headers,
          timeout: 4500
        };

        const req = client.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                const json = JSON.parse(data);
                const choices = json.choices || [];
                const list = choices.map(c => c.message?.content).filter(Boolean);
                resolve(list.length > 0 ? list : null);
              } else {
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          });
        });

        if (signal) {
          signal.addEventListener('abort', () => {
            req.destroy(new Error('AbortError'));
            resolve(null);
          });
        }

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.on('error', () => resolve(null));
        req.write(payload);
        req.end();
      } catch (err) {
        resolve(null);
      }
    });
  }
}

module.exports = {
  PredictorService
};
