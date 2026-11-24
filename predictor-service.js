const https = require('https');
const http = require('http');
const tls = require('tls');

/**
 * 智能输入预测网络服务
 * 支持 Google Gemini API (gemini-2.5-flash) 与 DeepSeek API 极速流式补全
 * 内置 HTTP CONNECT 代理自动穿透，保证国内网络环境下极速秒回
 */
class PredictorService {
  constructor() {
    this.cache = new Map();
    this.currentAbortController = null;
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
    // 去除常见的包裹引号、Markdown与前缀重复
    s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
    if (s.startsWith(prefix)) {
      s = s.substring(prefix.length).trim();
    }
    // 移除 AI 可能会带的多余解释前缀
    s = s.replace(/^(补全内容[：:]|续写[：:]|建议[：:]|下文[：:])/g, '').trim();
    return s.length > 0 ? s : null;
  }

  async predictWithAI(prefix, config) {
    const { provider, geminiApiKey, deepseekApiKey, geminiModel, deepseekModel } = config;

    // 检查缓存
    const cacheKey = `${provider}:${prefix.trim()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 中断上一次仍在途中的请求
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
        // 缓存最多 100 条
        if (this.cache.size > 100) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, cleaned);
      }
      return cleaned;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn(`[PredictorService] ${provider} 调用异常:`, err.message);
      return null;
    }
  }

  callGemini(prefix, apiKey, model = 'gemini-2.5-flash', signal) {
    return new Promise((resolve, reject) => {
      const targetModel = model || 'gemini-2.5-flash';
      const prompt = `用户在代码编辑器的AI对话框正在输入指令，前缀是：
"${prefix}"

请直接续写紧随其后的完整后续指令（长度5到20字以内）。
要求：
1. 绝对不要重复前缀！
2. 绝对不要输出任何多余的解释、标点引号或问答说明。
3. 直接输出续写文本。`;

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
        timeout: 2500
      };

      const handleResponse = (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const json = JSON.parse(data);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              resolve(text || null);
            } else {
              reject(new Error(`Gemini API HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
            }
          } catch (e) {
            reject(e);
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
            timeout: 2500
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
                    reject(new Error('AbortError'));
                  });
                }
                req.on('timeout', () => {
                  req.destroy();
                  reject(new Error('Gemini API 请求超时'));
                });
                req.on('error', reject);
                req.write(payload);
                req.end();
              });
              tlsSocket.on('error', reject);
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const json = JSON.parse(data);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve(text || null);
          } else {
            reject(new Error(`Gemini API HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy(new Error('AbortError'));
        reject(new Error('AbortError'));
      });
    }

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API 请求超时'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  }

  callDeepSeek(prefix, apiKey, model = 'deepseek-chat', signal) {
    return new Promise((resolve, reject) => {
      const targetModel = model || 'deepseek-chat';
      const payload = JSON.stringify({
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: '你是一个AI代码助手输入框续写引擎。根据用户未写完的指令输入，直接输出后续最自然、高频的补全文字。严禁重复前缀，严禁输出任何解释、说明或标点引号，直接输出纯文本，4-25字以内。'
          },
          {
            role: 'user',
            content: prefix
          }
        ],
        max_tokens: 35,
        temperature: 0.2,
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
        timeout: 2500
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
              reject(new Error(`DeepSeek API HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy(new Error('AbortError'));
          reject(new Error('AbortError'));
        });
      }

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DeepSeek API 请求超时'));
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = {
  PredictorService
};
