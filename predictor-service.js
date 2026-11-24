const https = require('https');

/**
 * 智能输入预测网络服务
 * 支持 Google Gemini API 与 DeepSeek API 极速流式补全
 */
class PredictorService {
  constructor() {
    this.cache = new Map();
    this.currentAbortController = null;
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
    s = s.replace(/^(补全内容[：:]|续写[：:]|建议[：:])/g, '').trim();
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

  callGemini(prefix, apiKey, model = 'gemini-2.0-flash', signal) {
    return new Promise((resolve, reject) => {
      const targetModel = model || 'gemini-2.0-flash';
      const prompt = `你是一个AI代码助手输入框的光标续写预测引擎。
用户正在向AI输入指令，当前光标前的未写完文字是：
"${prefix}"

请直接给出紧接着该文字后面最自然、最高频的后续补全文字。
严格约束规则：
1. 绝对不要重复用户已输入的文字！
2. 绝对不要包含任何解释、说明、标点引号、Markdown代码块或思考过程。
3. 直接输出续写的纯文本内容，长度控制在 4 到 25 个汉字以内。`;

      const payload = JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 35,
          temperature: 0.2,
          topP: 0.8
        }
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${targetModel}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 2000
      };

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
    });
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
        timeout: 2000
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
