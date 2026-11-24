const https = require('https');
const http = require('http');
const tls = require('tls');

/**
 * 智能输入预测网络服务
 * 支持 Google Gemini API (gemini-2.5-flash) 与 DeepSeek API 极速流式补全
 * 内置 HTTP CONNECT 代理自动穿透 + 429 频控智能熔断降级
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

  cleanSuggestion(rawSuggestion, prefix) {
    if (!rawSuggestion) return null;
    let s = rawSuggestion.trim();
    if (!s || s.toUpperCase() === 'NONE' || s.toUpperCase().startsWith('NONE')) return null;
    s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
    if (s.startsWith(prefix)) {
      s = s.substring(prefix.length).trim();
    }
    s = s.replace(/^(补全内容[：:]|续写[：:]|建议[：:]|下文[：:]|回答[：:]|提示[：:])/g, '').trim();
    if (!s || s.toUpperCase() === 'NONE' || s.toUpperCase().startsWith('NONE')) return null;
    // 助手特征词拦截：如果仍然包含AI助手的反问、解释或回答语气，坚决丢弃，绝不向用户展示回答性内容
    if (/^(我需要|请提供|请先|请发|好的|你可以|建议你|作为AI|作为一个|请告诉我|请问)/.test(s)) {
      return null;
    }
    return s.length > 0 ? s : null;
  }

  async predictWithAI(prefix, config) {
    const { provider, geminiApiKey, deepseekApiKey, geminiModel, deepseekModel } = config;

    // 检查缓存
    const cacheKey = `${provider}:${prefix.trim()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 429 频控熔断保护：若正处于限制期，直接返回 null 让引擎降级本地
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
      let suggestion = null;
      if (provider === 'gemini') {
        if (!geminiApiKey) return null;
        suggestion = await this.callGemini(prefix, geminiApiKey, geminiModel, signal);
      } else if (provider === 'deepseek') {
        if (!deepseekApiKey) return null;
        suggestion = await this.callDeepSeek(prefix, deepseekApiKey, deepseekModel, signal);
      }

      const cleaned = this.cleanSuggestion(suggestion, prefix);
      if (cleaned) {
        if (this.cache.size > 100) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, cleaned);
      }
      return cleaned;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return null;
    }
  }

  callGemini(prefix, apiKey, model = 'gemini-2.5-flash', signal) {
    return new Promise((resolve, reject) => {
      const targetModel = model || 'gemini-2.5-flash';
      const prompt = `你是一个代码编辑器输入框的自动补全引擎。
【至关重要的原则】
当前文字是【用户（人类提问者）】正在草拟的内容，不是对你的提问！
你的任务是站在【用户本人】的视角，继续把用户接下来想说的话写完整。
【严苛禁令】
1. 绝对不要以 AI 助手的身份回答、反问或解释（严禁出现“我需要先看到”、“请提供”、“好的”等回答语气）！
2. 如果用户的提问已经是一个完全独立的完整指令、不需要额外补充时，直接输出：NONE
3. 续写的内容必须是用户指令的延伸约束（例如“，并给出删除理由”、“，重点分析占用内存大的”），5到15字以内。
4. 严禁重复前缀，严禁包含任何解释说明、标点引号，直接输出续写纯文本。

用户当前未写完的提问内容是："${prefix}"。请站在用户立场续写后续字句：`;

      const payload = JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 40,
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
              this.rateLimitedUntil = Date.now() + 25000; // 冷却 25 秒
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
              this.directGeminiRequest(requestOptions, payload, signal, resolve, reject);
            }
          });

          connectReq.on('timeout', () => {
            connectReq.destroy();
            this.directGeminiRequest(requestOptions, payload, signal, resolve, reject);
          });
          connectReq.on('error', () => {
            this.directGeminiRequest(requestOptions, payload, signal, resolve, reject);
          });
          connectReq.end();
          return;
        } catch (e) {
          // 降级直连
        }
      }

      this.directGeminiRequest(requestOptions, payload, signal, resolve, reject);
    });
  }

  directGeminiRequest(options, payload, signal, resolve, reject) {
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

  callDeepSeek(prefix, apiKey, model = 'deepseek-chat', signal) {
    return new Promise((resolve) => {
      const targetModel = model || 'deepseek-chat';
      const payload = JSON.stringify({
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: `你是一个代码编辑器输入框的自动补全引擎。
【至关重要的原则】
当前文字是【用户（人类提问者）】正在草拟的内容，不是对你的提问！
你的任务是站在【用户本人】的视角，继续把用户接下来想说的话写完整。
【严苛禁令】
1. 绝对不要以 AI 助手的身份回答、反问或解释（严禁出现“我需要先看到”、“请提供”、“好的”等回答语气）！
2. 如果用户的提问已经是一个完全独立的完整指令、不需要额外补充时，直接输出：NONE
3. 续写的内容必须是用户指令的延伸约束（例如“，并给出删除理由”、“，重点分析占用内存大的”），5到15字以内。
4. 严禁重复前缀，严禁包含任何解释说明、标点引号，直接输出续写纯文本。`
          },
          {
            role: 'user',
            content: `用户当前未写完的提问内容是："${prefix}"。请站在用户立场续写后续字句：`
          }
        ],
        max_tokens: 35,
        temperature: 0.1,
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
              const text = json.choices?.[0]?.message?.content;
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
    });
  }
}

module.exports = {
  PredictorService
};
