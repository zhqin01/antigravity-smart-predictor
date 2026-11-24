/**
 * Antigravity Smart Predictor - Runtime Input Predictor & Ghost Text Overlay (v1.0.1)
 * 专为 VS Code Antigravity 聊天输入框打造的极速智能预测与 Ghost Text 补全引擎
 * 支持输入框内光标幽灵文本 + 输入框上方高亮浮动候选条双重呈现，按 Tab 或点击一键采纳
 */
(function initAntigravitySmartPredictor() {
  'use strict';

  let currentTargetInput = null;
  let activeSuggestion = null;
  let debounceTimer = null;
  let isComposing = false;

  const API_PORT = 23948;

  function isChatInput(el) {
    if (!el) return false;
    if (el.id === 'agy-ghost-overlay' || el.id === 'agy-predictor-chip' || el.closest('#agy-context-popover')) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true')) return true;
    return false;
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
      inputEl.focus();
      inputEl.selectionStart = inputEl.selectionEnd = newText.length;
    } else {
      inputEl.textContent = newText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
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
      chip.style.zIndex = '99999';
      chip.style.display = 'none';
      chip.style.cursor = 'pointer';
      chip.style.userSelect = 'none';
      chip.style.transition = 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)';
      document.body.appendChild(chip);

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (currentTargetInput && activeSuggestion) {
          acceptPrediction(currentTargetInput);
        }
      });
      chip.addEventListener('mouseenter', () => {
        chip.style.transform = 'translateY(-1px)';
        chip.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.4)';
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

  function syncFloatingChipPosition(inputEl, chip, suggestionText) {
    if (!inputEl || !chip) return;
    const rect = inputEl.getBoundingClientRect();
    const windowWidth = document.documentElement.clientWidth || window.innerWidth;
    const windowHeight = window.innerHeight;

    chip.style.background = '#181e29';
    chip.style.border = '1px solid rgba(59, 130, 246, 0.45)';
    chip.style.borderRadius = '8px';
    chip.style.padding = '5px 10px';
    chip.style.color = '#f8fafc';
    chip.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    chip.style.fontSize = '11.5px';
    chip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.45)';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '7px';
    chip.style.maxWidth = Math.min(520, windowWidth - 24) + 'px';

    chip.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; color: #60a5fa; font-weight: 600; font-size: 11px; flex-shrink: 0;">
        <span>✨</span>
        <span>预测</span>
      </span>
      <span style="color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; flex: 1; min-width: 0;">
        ${escapeHtml(suggestionText)}
      </span>
      <span style="display: inline-flex; align-items: center; padding: 1px 6px; font-size: 10px; font-family: monospace; background: rgba(59, 130, 246, 0.18); border: 1px solid rgba(96, 165, 250, 0.35); border-radius: 4px; color: #93c5fd; flex-shrink: 0; line-height: 1.2;">
        Tab ⇥
      </span>
    `;

    // 锚定在输入框正上方
    const chipWidth = chip.offsetWidth || 300;
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

    // 1. 渲染输入框内 Ghost Text 文本叠加层
    const overlay = ensureGhostOverlay();
    syncOverlayPosition(inputEl, overlay);

    overlay.innerHTML = `
      <span style="color: transparent; opacity: 0; user-select: none;">${escapeHtml(typedText)}</span><span style="color: rgba(148, 163, 184, 0.72); font-style: normal; user-select: none;">${escapeHtml(suggestionText)}</span>
    `;
    overlay.style.display = 'block';

    // 2. 渲染输入框正上方高亮浮动候选条
    const chip = ensureFloatingChip();
    chip.style.display = 'inline-flex';
    syncFloatingChipPosition(inputEl, chip, suggestionText);

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
        // 校验输入框文字是否未被修改
        const currentText = getInputValue(inputEl).trim();
        if (currentText === prefix && data && data.suggestion) {
          currentTargetInput = inputEl;
          showGhostText(inputEl, fullText, data.suggestion);
        } else {
          hideGhostText();
        }
      })
      .catch(() => {
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

    // 上报引擎记录已采纳习惯
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

  // ================= 顶层全局事件委托机制 =================
  // 杜绝因 React 重建 DOM 或路由切换导致事件丢失

  document.addEventListener('compositionstart', (e) => {
    if (isChatInput(e.target)) {
      isComposing = true;
      hideGhostText();
    }
  }, true);

  document.addEventListener('compositionend', (e) => {
    if (isChatInput(e.target)) {
      isComposing = false;
      handleInputDebounced(e.target);
    }
  }, true);

  document.addEventListener('input', (e) => {
    if (isChatInput(e.target)) {
      currentTargetInput = e.target;
      if (!isComposing) {
        handleInputDebounced(e.target);
      }
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (activeSuggestion && currentTargetInput) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        acceptPrediction(currentTargetInput);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideGhostText();
        return;
      }

      if (e.key === 'ArrowRight') {
        const cursor = (currentTargetInput.tagName === 'TEXTAREA') ? currentTargetInput.selectionStart : getInputValue(currentTargetInput).length;
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
    if (currentTargetInput && activeSuggestion && e.target === currentTargetInput) {
      const overlay = document.getElementById('agy-ghost-overlay');
      if (overlay) {
        overlay.scrollTop = currentTargetInput.scrollTop;
        overlay.scrollLeft = currentTargetInput.scrollLeft;
      }
      const chip = document.getElementById('agy-predictor-chip');
      if (chip) {
        syncFloatingChipPosition(currentTargetInput, chip, activeSuggestion.suffix);
      }
    }
  }, true);

  window.addEventListener('resize', () => {
    if (currentTargetInput && activeSuggestion) {
      const overlay = document.getElementById('agy-ghost-overlay');
      if (overlay) syncOverlayPosition(currentTargetInput, overlay);
      const chip = document.getElementById('agy-predictor-chip');
      if (chip) syncFloatingChipPosition(currentTargetInput, chip, activeSuggestion.suffix);
    }
  });

  document.addEventListener('click', (e) => {
    const chip = document.getElementById('agy-predictor-chip');
    if (activeSuggestion && (!chip || !chip.contains(e.target)) && (!currentTargetInput || !currentTargetInput.contains(e.target))) {
      hideGhostText();
    }
  });

  console.log('[Antigravity Smart Predictor] 全局事件委托预测器已就绪 (端口: ' + API_PORT + ')');
})();
