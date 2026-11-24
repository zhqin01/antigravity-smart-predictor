/**
 * Antigravity Smart Predictor - Runtime Input Predictor & Ghost Text Overlay (v1.1.0)
 * 专为 VS Code Antigravity 聊天输入框 (Lexical / Textarea / ContentEditable) 打造的高效输入预测与补全引擎
 * 支持浮动候选胶囊 + 幽灵文本双重呈现，Tab ⇥ 或点击一键采纳，支持 Gemini & DeepSeek 双通道
 */
(function initAntigravitySmartPredictor() {
  'use strict';

  let currentTargetInput = null;
  let activeSuggestion = null;
  let debounceTimer = null;
  let isComposing = false;

  const API_PORT = 23948;

  /**
   * 精准解析输入框根节点
   * Antigravity 使用 Meta Lexical 富文本框架 (div[contenteditable="true"][data-lexical-editor="true"])
   * 用户打字时事件 target 可能是其内部子 span 或 p，需向上追溯到根可编辑容器
   */
  function getChatInputElement(el) {
    if (!el) return null;
    if (el.id === 'agy-ghost-overlay' || el.id === 'agy-predictor-chip' || el.closest?.('#agy-context-popover') || el.closest?.('#agy-ghost-overlay') || el.closest?.('#agy-predictor-chip')) {
      return null;
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el;
    }
    if (el.getAttribute && (el.getAttribute('data-lexical-editor') === 'true' || el.getAttribute('contenteditable') === 'true')) {
      return el;
    }
    if (el.closest) {
      const lexicalRoot = el.closest('[data-lexical-editor="true"]');
      if (lexicalRoot) return lexicalRoot;
      const editableRoot = el.closest('[contenteditable="true"]');
      if (editableRoot) return editableRoot;
      const textboxRoot = el.closest('[role="textbox"]');
      if (textboxRoot) return textboxRoot;
    }
    if (el.isContentEditable) return el;
    return null;
  }

  function getInputValue(inputEl) {
    if (!inputEl) return '';
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      return inputEl.value || '';
    }
    // Lexical / contenteditable：提取整段文本并去除末尾多余换行
    const text = inputEl.innerText || inputEl.textContent || '';
    return text.replace(/\r?\n$/, '');
  }

  function ensureGhostOverlay() {
    let overlay = document.getElementById('agy-ghost-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'agy-ghost-overlay';
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '99998';
      overlay.style.overflow = 'hidden';
      overlay.style.boxSizing = 'border-box';
      overlay.style.display = 'none';
      overlay.style.whiteSpace = 'pre-wrap';
      overlay.style.wordBreak = 'break-word';
      overlay.style.overflowWrap = 'break-word';
      overlay.style.background = 'transparent';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function ensureFloatingChip() {
    let chip = document.getElementById('agy-predictor-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'agy-predictor-chip';
      chip.style.position = 'fixed';
      chip.style.zIndex = '999999';
      chip.style.display = 'none';
      chip.style.cursor = 'pointer';
      chip.style.userSelect = 'none';
      chip.style.transition = 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)';
      document.body.appendChild(chip);

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (activeSuggestion && activeSuggestion.isConfigPrompt) {
          fetch(`http://127.0.0.1:${API_PORT}/action/configure_key`).catch(() => {});
          hideGhostText();
          return;
        }
        if (currentTargetInput && activeSuggestion) {
          acceptPrediction(currentTargetInput);
        }
      });
      chip.addEventListener('mouseenter', () => {
        chip.style.transform = 'translateY(-1px)';
        chip.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.45)';
      });
      chip.addEventListener('mouseleave', () => {
        chip.style.transform = 'translateY(0)';
        chip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.45)';
      });
    }
    return chip;
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

  function syncFloatingChipPosition(inputEl, chip) {
    if (!inputEl || !chip) return;
    const rect = inputEl.getBoundingClientRect();
    const windowWidth = document.documentElement.clientWidth || window.innerWidth;
    const windowHeight = window.innerHeight;

    const chipWidth = chip.offsetWidth || 320;
    let targetLeft = rect.left;
    if (targetLeft + chipWidth > windowWidth - 12) {
      targetLeft = windowWidth - chipWidth - 12;
    }
    targetLeft = Math.max(10, targetLeft);

    const bottomOffset = windowHeight - rect.top + 6;
    chip.style.left = Math.round(targetLeft) + 'px';
    chip.style.bottom = Math.round(bottomOffset) + 'px';
  }

  function hideGhostText() {
    const overlay = document.getElementById('agy-ghost-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
    const chip = document.getElementById('agy-predictor-chip');
    if (chip) {
      chip.style.display = 'none';
    }
    activeSuggestion = null;
  }

  function showGhostText(inputEl, typedText, suggestionText) {
    if (!inputEl || !suggestionText) {
      hideGhostText();
      return;
    }

    // 1. 渲染输入框正上方浮动候选胶囊 (100% 显眼可见，不被任何样式遮挡)
    const chip = ensureFloatingChip();
    chip.style.background = '#181e29';
    chip.style.border = '1px solid rgba(59, 130, 246, 0.5)';
    chip.style.borderRadius = '8px';
    chip.style.padding = '5px 10px';
    chip.style.color = '#f8fafc';
    chip.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    chip.style.fontSize = '11.5px';
    chip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.45)';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '7px';
    chip.style.maxWidth = Math.min(540, (window.innerWidth || 800) - 24) + 'px';

    chip.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; color: #60a5fa; font-weight: 600; font-size: 11px; flex-shrink: 0;">
        <span>✨</span>
        <span>预测</span>
      </span>
      <span style="color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; flex: 1; min-width: 0;">
        ${escapeHtml(suggestionText)}
      </span>
      <span style="display: inline-flex; align-items: center; padding: 1px 6px; font-size: 10px; font-family: monospace; background: rgba(59, 130, 246, 0.22); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 4px; color: #93c5fd; flex-shrink: 0; line-height: 1.2;">
        Tab ⇥
      </span>
    `;
    chip.style.display = 'inline-flex';
    syncFloatingChipPosition(inputEl, chip);

    // 2. 尝试渲染输入框内 Ghost Text 幽灵文本覆盖层
    try {
      const overlay = ensureGhostOverlay();
      syncOverlayPosition(inputEl, overlay);
      overlay.innerHTML = `
        <span style="color: transparent; opacity: 0; user-select: none;">${escapeHtml(typedText)}</span><span style="color: rgba(148, 163, 184, 0.65); font-style: normal; user-select: none;">${escapeHtml(suggestionText)}</span>
      `;
      overlay.style.display = 'block';
    } catch (e) {}

    activeSuggestion = {
      prefix: typedText,
      suffix: suggestionText,
      fullText: typedText + suggestionText,
      isConfigPrompt: false
    };
  }

  function showConfigurePromptChip(inputEl, provider) {
    if (!inputEl) return;
    const chip = ensureFloatingChip();
    const providerTitle = provider === 'deepseek' ? 'DeepSeek' : 'Google Gemini';

    chip.style.background = '#1a1f2c';
    chip.style.border = '1px solid rgba(234, 179, 8, 0.55)';
    chip.style.borderRadius = '8px';
    chip.style.padding = '5px 11px';
    chip.style.color = '#fef08a';
    chip.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    chip.style.fontSize = '11.5px';
    chip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5)';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '7px';
    chip.style.maxWidth = Math.min(540, (window.innerWidth || 800) - 24) + 'px';

    chip.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; color: #facc15; font-weight: 600; font-size: 11px; flex-shrink: 0;">
        <span>✨</span>
        <span>智能预测</span>
      </span>
      <span style="color: #e2e8f0; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        点击配置 <strong style="color: #60a5fa;">${providerTitle} Key</strong> 开启 AI 自由预测
      </span>
      <span style="display: inline-flex; align-items: center; padding: 2px 7px; font-size: 10.5px; background: #2563eb; border-radius: 4px; color: #ffffff; font-weight: 500; flex-shrink: 0;">
        去配置 ⚙️
      </span>
    `;

    chip.style.display = 'inline-flex';
    syncFloatingChipPosition(inputEl, chip);

    activeSuggestion = {
      isConfigPrompt: true,
      provider: provider
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
    if (!inputEl || isComposing) return;
    const fullText = getInputValue(inputEl);
    const prefix = fullText.trim();

    if (prefix.length === 0) {
      hideGhostText();
      return;
    }

    const url = `http://127.0.0.1:${API_PORT}/predict?prefix=${encodeURIComponent(prefix)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        const currentText = getInputValue(inputEl).trim();
        if (currentText !== prefix) return;

        currentTargetInput = inputEl;

        if (data && data.suggestion) {
          showGhostText(inputEl, fullText, data.suggestion);
        } else if (data && data.hasKey === false && prefix.length >= 2) {
          showConfigurePromptChip(inputEl, data.provider || 'gemini');
        } else {
          hideGhostText();
        }
      })
      .catch(() => {
        hideGhostText();
      });
  }

  function acceptPrediction(inputEl) {
    if (!activeSuggestion || !inputEl || activeSuggestion.isConfigPrompt) return;
    const full = activeSuggestion.fullText;
    const acceptedSuffix = activeSuggestion.suffix;
    const acceptedPrefix = activeSuggestion.prefix;

    inputEl.focus();

    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        inputEl.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(inputEl, full);
      } else {
        inputEl.value = full;
      }
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      inputEl.selectionStart = inputEl.selectionEnd = full.length;
    } else {
      // Lexical / contenteditable 处理：
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}

      // 通过 document.execCommand 插入，与 Lexical 核心编辑状态完美融合
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, acceptedSuffix);
      } catch (e) {}

      if (!inserted) {
        try {
          const ev = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: acceptedSuffix
          });
          inputEl.dispatchEvent(ev);
        } catch (e) {}
      }
    }

    hideGhostText();

    // 上报采纳习惯
    try {
      fetch(`http://127.0.0.1:${API_PORT}/record_accepted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: acceptedPrefix, suffix: acceptedSuffix })
      }).catch(() => {});
    } catch (e) {}
  }

  function handleInputDebounced(inputEl) {
    hideGhostText();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queryPrediction(inputEl);
    }, 280);
  }

  // ================= 全局事件捕获与委托机制 =================

  document.addEventListener('compositionstart', (e) => {
    const inputEl = getChatInputElement(e.target);
    if (inputEl) {
      isComposing = true;
      hideGhostText();
    }
  }, true);

  document.addEventListener('compositionend', (e) => {
    const inputEl = getChatInputElement(e.target);
    if (inputEl) {
      isComposing = false;
      currentTargetInput = inputEl;
      handleInputDebounced(inputEl);
    }
  }, true);

  document.addEventListener('input', (e) => {
    const inputEl = getChatInputElement(e.target);
    if (inputEl) {
      currentTargetInput = inputEl;
      if (!isComposing) {
        handleInputDebounced(inputEl);
      }
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (activeSuggestion && currentTargetInput) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (activeSuggestion.isConfigPrompt) {
          fetch(`http://127.0.0.1:${API_PORT}/action/configure_key`).catch(() => {});
          hideGhostText();
        } else {
          acceptPrediction(currentTargetInput);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideGhostText();
        return;
      }

      if (e.key === 'ArrowRight' && !activeSuggestion.isConfigPrompt) {
        const cursor = (currentTargetInput.tagName === 'TEXTAREA' || currentTargetInput.tagName === 'INPUT')
          ? currentTargetInput.selectionStart
          : getInputValue(currentTargetInput).length;
        if (cursor >= getInputValue(currentTargetInput).length) {
          e.preventDefault();
          e.stopPropagation();
          acceptPrediction(currentTargetInput);
          return;
        }
      }

      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
        hideGhostText();
      }
    }
  }, true);

  document.addEventListener('scroll', (e) => {
    if (currentTargetInput && activeSuggestion) {
      const chip = document.getElementById('agy-predictor-chip');
      if (chip) syncFloatingChipPosition(currentTargetInput, chip);
      const overlay = document.getElementById('agy-ghost-overlay');
      if (overlay) syncOverlayPosition(currentTargetInput, overlay);
    }
  }, true);

  window.addEventListener('resize', () => {
    if (currentTargetInput && activeSuggestion) {
      const chip = document.getElementById('agy-predictor-chip');
      if (chip) syncFloatingChipPosition(currentTargetInput, chip);
      const overlay = document.getElementById('agy-ghost-overlay');
      if (overlay) syncOverlayPosition(currentTargetInput, overlay);
    }
  });

  document.addEventListener('click', (e) => {
    const chip = document.getElementById('agy-predictor-chip');
    if (activeSuggestion && (!chip || !chip.contains(e.target)) && (!currentTargetInput || !currentTargetInput.contains(e.target))) {
      hideGhostText();
    }
  });

  console.log('[Antigravity Smart Predictor] 全局智能预测引擎 v1.1.0 已激活 (端口: ' + API_PORT + ')');
})();
