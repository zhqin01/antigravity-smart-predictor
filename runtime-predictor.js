/**
 * Antigravity Smart Predictor - Inline Ghost Text Engine (v1.2.0)
 * 专为 VS Code Antigravity Meta Lexical 富文本聊天框定制的纯正行内幽灵文本补全引擎
 * 抛弃弹窗与浮动胶囊，直接在光标后紧随显示浅灰色续写文字，按 Tab 键一键无缝采纳
 */
(function initAntigravityInlinePredictor() {
  'use strict';

  let currentTargetInput = null;
  let activeSuggestion = null;
  let debounceTimer = null;
  let isComposing = false;
  let currentRequestId = 0;
  const localSuggestionCache = new Map();

  const API_PORT = 23948;

  /**
   * 解析 Antigravity 聊天输入框根节点 (Meta Lexical 容器)
   */
  function getChatInputElement(el) {
    if (!el) return null;
    if (el.id === 'agy-inline-ghost' || el.closest?.('#agy-context-popover') || el.closest?.('#agy-inline-ghost')) {
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
    const text = inputEl.innerText || inputEl.textContent || '';
    return text.replace(/\r?\n$/, '');
  }

  /**
   * 精确读取光标 (Caret) 在屏幕中的像素坐标与高度
   * 针对 Meta Lexical 富文本内部文本节点折叠选区深度调优
   */
  function readCaret(editor) {
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range || !range.collapsed) return null;
    if (!editor.contains(range.startContainer)) return null;

    let rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const rects = range.getClientRects();
      if (rects.length > 0) rect = rects[0];
    }

    // 折叠光标在纯文本末尾时，探针探测最后一个字符的右边缘
    if ((rect.width === 0 && rect.height === 0) || (rect.top === 0 && rect.left === 0)) {
      const node = range.startContainer;
      const offset = range.startOffset;
      if (node && node.nodeType === Node.TEXT_NODE && offset > 0) {
        try {
          const probe = document.createRange();
          probe.setStart(node, offset - 1);
          probe.setEnd(node, offset);
          const pr = probe.getBoundingClientRect();
          if (pr.width > 0 || pr.height > 0) {
            rect = { left: pr.right, top: pr.top, height: pr.height, bottom: pr.bottom };
          }
        } catch (e) {}
      }
    }

    if (!rect || (rect.left === 0 && rect.top === 0)) {
      // 兜底：若仍未探测到且为首行首字，取容器左内边距
      const edRect = editor.getBoundingClientRect();
      const style = window.getComputedStyle(editor);
      const pl = parseFloat(style.paddingLeft) || 12;
      const pt = parseFloat(style.paddingTop) || 8;
      rect = { left: edRect.left + pl, top: edRect.top + pt, height: parseFloat(style.lineHeight) || 20 };
    }

    return {
      left: rect.left,
      top: rect.top,
      height: rect.height || 20
    };
  }

  function ensureInlineGhost() {
    let ghost = document.getElementById('agy-inline-ghost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'agy-inline-ghost';
      ghost.style.position = 'fixed';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '99999';
      ghost.style.display = 'none';
      ghost.style.whiteSpace = 'nowrap';
      ghost.style.overflow = 'hidden';
      ghost.style.textOverflow = 'ellipsis';
      ghost.style.userSelect = 'none';
      ghost.style.boxSizing = 'border-box';
      document.body.appendChild(ghost);
    }
    return ghost;
  }

  function hideGhostText() {
    const ghost = document.getElementById('agy-inline-ghost');
    if (ghost) {
      ghost.style.display = 'none';
      ghost.innerHTML = '';
    }
    // 彻底清理旧版遗留的任何多余悬浮胶囊与遮罩
    const oldChip = document.getElementById('agy-predictor-chip');
    if (oldChip) oldChip.remove();
    const oldOverlay = document.getElementById('agy-ghost-overlay');
    if (oldOverlay) oldOverlay.remove();

    activeSuggestion = null;
  }

  function showGhostText(inputEl, suggestionText) {
    if (!inputEl || !suggestionText) {
      hideGhostText();
      return;
    }

    const caret = readCaret(inputEl);
    if (!caret) {
      hideGhostText();
      return;
    }

    const editorRect = inputEl.getBoundingClientRect();
    if (editorRect.width <= 0 || editorRect.height <= 0) {
      hideGhostText();
      return;
    }

    const computed = window.getComputedStyle(inputEl);
    const ghost = ensureInlineGhost();

    // 严密计算当前行剩余可用宽度，防止换行溢出
    const maxW = Math.max(30, editorRect.right - caret.left - 16);
    if (maxW < 35) {
      hideGhostText();
      return;
    }

    const h = caret.height > 0 ? caret.height : (parseFloat(computed.lineHeight) || 22);

    ghost.style.left = `${Math.round(caret.left)}px`;
    ghost.style.top = `${Math.round(caret.top)}px`;
    ghost.style.height = `${Math.round(h)}px`;
    ghost.style.lineHeight = `${Math.round(h)}px`;
    ghost.style.maxWidth = `${Math.round(maxW)}px`;
    ghost.style.fontFamily = computed.fontFamily;
    ghost.style.fontSize = computed.fontSize;
    ghost.style.fontWeight = computed.fontWeight;
    ghost.style.letterSpacing = computed.letterSpacing;
    ghost.style.display = 'inline-flex';
    ghost.style.alignItems = 'center';

    // 纯正浅灰色行内续写字 + 微型 Tab 徽标
    ghost.innerHTML = `
      <span style="color: #8b949e; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(suggestionText)}</span>
      <span style="display: inline-flex; align-items: center; margin-left: 6px; font-size: 10px; font-family: -apple-system, BlinkMacSystemFont, monospace; padding: 0 4px; height: 15px; line-height: 14px; border: 1px solid rgba(139, 148, 158, 0.4); border-radius: 3px; color: #8b949e; opacity: 0.7; flex-shrink: 0;">Tab ⇥</span>
    `;

    activeSuggestion = {
      prefix: getInputValue(inputEl),
      suffix: suggestionText,
      fullText: getInputValue(inputEl) + suggestionText
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

    const requestId = ++currentRequestId;
    const url = `http://127.0.0.1:${API_PORT}/predict?prefix=${encodeURIComponent(prefix)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (requestId !== currentRequestId) return;
        const currentText = getInputValue(inputEl).trim();
        if (currentText !== prefix) return;

        currentTargetInput = inputEl;

        if (data && data.suggestion) {
          localSuggestionCache.set(prefix.toLowerCase(), data.suggestion);
          showGhostText(inputEl, data.suggestion);
        } else {
          hideGhostText();
        }
      })
      .catch(() => {
        if (requestId === currentRequestId) {
          hideGhostText();
        }
      });
  }

  function acceptPrediction(inputEl) {
    if (!activeSuggestion || !inputEl) return;
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
      // Meta Lexical 富文本插入：
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}

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

    // 记录个性化采纳习惯
    try {
      fetch(`http://127.0.0.1:${API_PORT}/record_accepted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: acceptedPrefix, suffix: acceptedSuffix })
      }).catch(() => {});
    } catch (e) {}
  }

  function handleInput(inputEl) {
    currentTargetInput = inputEl;
    hideGhostText();

    if (debounceTimer) clearTimeout(debounceTimer);

    const text = getInputValue(inputEl);
    const prefix = text.trim();
    if (prefix.length === 0) return;

    // 1. 本地缓存秒级预览 (0ms)
    const cached = localSuggestionCache.get(prefix.toLowerCase());
    if (cached) {
      showGhostText(inputEl, cached);
    }

    // 2. 防抖 260ms 后请求云端或深层匹配
    debounceTimer = setTimeout(() => {
      queryPrediction(inputEl);
    }, 260);
  }

  function updateGhostPosition() {
    if (activeSuggestion && currentTargetInput) {
      const caret = readCaret(currentTargetInput);
      if (!caret) {
        hideGhostText();
        return;
      }
      const ghost = document.getElementById('agy-inline-ghost');
      if (ghost && ghost.style.display !== 'none') {
        const editorRect = currentTargetInput.getBoundingClientRect();
        const maxW = Math.max(30, editorRect.right - caret.left - 16);
        ghost.style.left = `${Math.round(caret.left)}px`;
        ghost.style.top = `${Math.round(caret.top)}px`;
        ghost.style.maxWidth = `${Math.round(maxW)}px`;
      }
    }
  }

  // ================= 全局事件捕获与委托 =================

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
      handleInput(inputEl);
    }
  }, true);

  document.addEventListener('input', (e) => {
    const inputEl = getChatInputElement(e.target);
    if (inputEl) {
      currentTargetInput = inputEl;
      if (!isComposing) {
        handleInput(inputEl);
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
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (r.collapsed && r.startOffset >= (r.startContainer.length || 0)) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrediction(currentTargetInput);
            return;
          }
        }
      }

      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
        hideGhostText();
      }
    }
  }, true);

  document.addEventListener('selectionchange', () => {
    if (currentTargetInput && activeSuggestion) {
      updateGhostPosition();
    }
  });

  document.addEventListener('scroll', updateGhostPosition, true);
  window.addEventListener('resize', updateGhostPosition);

  document.addEventListener('click', (e) => {
    if (activeSuggestion && (!currentTargetInput || !currentTargetInput.contains(e.target))) {
      hideGhostText();
    }
  });

  console.log('[Antigravity Inline Predictor] 行内纯正 Ghost Text 补全引擎已激活 (端口: ' + API_PORT + ')');
})();
