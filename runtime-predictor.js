/**
 * Antigravity Smart Predictor - Runtime Input Predictor & Ghost Text Overlay
 * 专为 VS Code Antigravity 聊天输入框打造的极速智能预测与 Ghost Text 补全引擎
 */
(function initAntigravitySmartPredictor() {
  'use strict';

  let activeGhostOverlay = null;
  let currentTargetInput = null;
  let activeSuggestion = null;
  let debounceTimer = null;
  let isPredicting = false;

  const API_PORT = 23948;

  function findChatInput() {
    // 优先匹配当前活跃的输入区域
    const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
    if (!inputs || inputs.length === 0) return null;

    // 排除无关的只读或隐藏文本框
    for (let i = inputs.length - 1; i >= 0; i--) {
      const el = inputs[i];
      if (el.id === 'agy-ghost-layer' || el.closest('#agy-context-popover')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) {
        return el;
      }
    }
    return null;
  }

  function getInputValue(inputEl) {
    if (!inputEl) return '';
    if (inputEl.tagName === 'TEXTAREA') {
      return inputEl.value || '';
    }
    return inputEl.innerText || inputEl.textContent || '';
  }

  function setInputValue(inputEl, newText) {
    if (!inputEl) return;
    if (inputEl.tagName === 'TEXTAREA') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(inputEl, newText);
      } else {
        inputEl.value = newText;
      }
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      // 保持光标在末尾
      inputEl.selectionStart = inputEl.selectionEnd = newText.length;
    } else {
      inputEl.textContent = newText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      // 移动光标至 contenteditable 末尾
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function ensureGhostOverlay(inputEl) {
    if (!inputEl) return null;
    let overlay = document.getElementById('agy-ghost-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'agy-ghost-overlay';
      overlay.style.position = 'absolute';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '5';
      overlay.style.overflow = 'hidden';
      overlay.style.boxSizing = 'border-box';
      overlay.style.display = 'none';
      overlay.style.whiteSpace = 'pre-wrap';
      overlay.style.wordBreak = 'break-word';
      overlay.style.overflowWrap = 'break-word';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function syncOverlayPosition(inputEl, overlay) {
    if (!inputEl || !overlay) return;
    const rect = inputEl.getBoundingClientRect();
    const style = window.getComputedStyle(inputEl);

    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.fontWeight = style.fontWeight;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.letterSpacing = style.letterSpacing;
    overlay.style.paddingTop = style.paddingTop;
    overlay.style.paddingRight = style.paddingRight;
    overlay.style.paddingBottom = style.paddingBottom;
    overlay.style.paddingLeft = style.paddingLeft;
    overlay.style.borderTopWidth = style.borderTopWidth;
    overlay.style.borderLeftWidth = style.borderLeftWidth;

    overlay.scrollTop = inputEl.scrollTop;
    overlay.scrollLeft = inputEl.scrollLeft;
  }

  function hideGhostText() {
    const overlay = document.getElementById('agy-ghost-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
    activeSuggestion = null;
  }

  function showGhostText(inputEl, typedText, suggestionText) {
    if (!inputEl || !suggestionText) {
      hideGhostText();
      return;
    }

    const overlay = ensureGhostOverlay(inputEl);
    syncOverlayPosition(inputEl, overlay);

    overlay.innerHTML = `
      <span style="color: transparent; opacity: 0; user-select: none;">${escapeHtml(typedText)}</span><span style="color: rgba(148, 163, 184, 0.72); font-style: normal; user-select: none;">${escapeHtml(suggestionText)}</span><span style="display: inline-flex; align-items: center; margin-left: 6px; padding: 1px 5px; font-size: 10px; font-family: monospace; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; color: #94a3b8; vertical-align: middle; line-height: 1.2; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">Tab ⇥</span>
    `;

    overlay.style.display = 'block';
    activeSuggestion = {
      prefix: typedText,
      suffix: suggestionText,
      fullText: typedText + suggestionText
    };
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function queryPrediction(inputEl) {
    if (!inputEl) return;
    const fullText = getInputValue(inputEl);
    const cursor = (inputEl.tagName === 'TEXTAREA') ? inputEl.selectionStart : fullText.length;

    // 仅在光标处于文字末尾或接近末尾时触发预测（保持心流体验，不干扰中间编辑）
    if (cursor < fullText.length) {
      hideGhostText();
      return;
    }

    const prefix = fullText.substring(0, cursor).trim();
    if (prefix.length === 0) {
      hideGhostText();
      return;
    }

    isPredicting = true;
    const url = `http://127.0.0.1:${API_PORT}/predict?prefix=${encodeURIComponent(prefix)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        isPredicting = false;
        // 校验输入框文字是否在此期间发生变动
        const currentText = getInputValue(inputEl).trim();
        if (currentText === prefix && data && data.suggestion) {
          showGhostText(inputEl, fullText, data.suggestion);
        } else {
          hideGhostText();
        }
      })
      .catch(() => {
        isPredicting = false;
        hideGhostText();
      });
  }

  function acceptPrediction(inputEl) {
    if (!activeSuggestion || !inputEl) return;
    const full = activeSuggestion.fullText;
    const acceptedSuffix = activeSuggestion.suffix;
    const acceptedPrefix = activeSuggestion.prefix;

    setInputValue(inputEl, full);
    hideGhostText();

    // 上报引擎记录已采纳的个性化偏好
    try {
      fetch(`http://127.0.0.1:${API_PORT}/record_accepted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: acceptedPrefix, suffix: acceptedSuffix })
      }).catch(() => {});
    } catch (e) {}
  }

  function bindInputEvents(inputEl) {
    if (!inputEl || inputEl._agyPredictorBound) return;
    inputEl._agyPredictorBound = true;
    currentTargetInput = inputEl;

    // 1. 输入防抖监听
    inputEl.addEventListener('input', () => {
      hideGhostText();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryPrediction(inputEl);
      }, 350);
    });

    // 2. 键盘控制流 (Tab 采纳, Esc 取消, 方向右键采纳)
    inputEl.addEventListener('keydown', (e) => {
      if (activeSuggestion) {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          acceptPrediction(inputEl);
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hideGhostText();
          return;
        }

        if (e.key === 'ArrowRight') {
          const cursor = (inputEl.tagName === 'TEXTAREA') ? inputEl.selectionStart : getInputValue(inputEl).length;
          if (cursor >= getInputValue(inputEl).length) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrediction(inputEl);
            return;
          }
        }

        // 按其他键时先隐藏当前建议，交给 input 防抖重查
        if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
          hideGhostText();
        }
      }
    }, true);

    // 3. 滚动与尺寸动态对齐
    inputEl.addEventListener('scroll', () => {
      const overlay = document.getElementById('agy-ghost-overlay');
      if (overlay && activeSuggestion) {
        overlay.scrollTop = inputEl.scrollTop;
        overlay.scrollLeft = inputEl.scrollLeft;
      }
    });

    inputEl.addEventListener('blur', () => {
      // 短暂延迟隐藏，允许用户点击其他辅助按钮
      setTimeout(hideGhostText, 150);
    });

    inputEl.addEventListener('focus', () => {
      if (getInputValue(inputEl).trim().length > 0) {
        queryPrediction(inputEl);
      }
    });

    console.log('[Antigravity Smart Predictor] 聊天输入框事件绑定成功');
  }

  function startSniffing() {
    const inputEl = findChatInput();
    if (inputEl) {
      bindInputEvents(inputEl);
    }
  }

  // 页面加载就绪启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSniffing);
  } else {
    startSniffing();
  }

  // DOM 动态变化监听（防止会话重载导致输入框元素重新生成）
  const observer = new MutationObserver(() => {
    const inputEl = findChatInput();
    if (inputEl && !inputEl._agyPredictorBound) {
      bindInputEvents(inputEl);
    }
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  window.addEventListener('resize', () => {
    const overlay = document.getElementById('agy-ghost-overlay');
    if (overlay && currentTargetInput && activeSuggestion) {
      syncOverlayPosition(currentTargetInput, overlay);
    }
  });

  console.log('[Antigravity Smart Predictor] 运行时插件已就绪 (端口: ' + API_PORT + ')');
})();
