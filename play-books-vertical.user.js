// ==UserScript==
// @name         Google Play Books 上下スクロール
// @namespace    local.playbooks.vertical
// @homepageURL  https://github.com/takeshi46/userscripts
// @downloadURL  https://raw.githubusercontent.com/takeshi46/userscripts/main/play-books-vertical.user.js
// @updateURL    https://raw.githubusercontent.com/takeshi46/userscripts/main/play-books-vertical.user.js
// @version      1.2.0
// @description  本文を横書きにして、現在位置から上下スクロールで読みます。ルビ対応。
// @match        https://books.googleusercontent.com/books/reader/frame*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('pbv-toggle')) return;
  const style = document.createElement('style');
  style.textContent = `
    #pbv-toggle { position:fixed;right:16px;top:64px;z-index:2147483647;
      padding:9px 14px;border:1px solid #888;border-radius:8px;background:#fff;
      color:#222;cursor:pointer;font:14px sans-serif; }
    #pbv-view { position:fixed;inset:56px 0 0;z-index:2147483646;
      overflow:auto;background:#fff;overscroll-behavior:contain;overflow-anchor:none; }
    #pbv-view[hidden] { display:none!important; }
    #pbv-pages { padding:0 28px;margin:auto;width:min(900px,100%);box-sizing:border-box;
      display:flex;flex-direction:column;align-items:center;gap:0; }
    #pbv-pages > .pbv-sheet { flex:none;position:relative;display:block;
      overflow:hidden;background:transparent; }
    #pbv-pages > .pbv-horizontal { width:min(900px,100%)!important;height:auto!important;
      box-sizing:border-box;padding:0;direction:ltr!important; }
    #pbv-pages .pbv-horizontal, #pbv-pages .pbv-horizontal * {
      writing-mode:horizontal-tb!important;-webkit-writing-mode:horizontal-tb!important;
      text-orientation:mixed!important; }
    #pbv-pages .pbv-horizontal reader-rendered-page,
    #pbv-pages .pbv-horizontal div, #pbv-pages .pbv-horizontal p {
      display:block!important;position:static!important;transform:none!important;
      width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;
      max-width:none!important;max-height:none!important;overflow:visible!important;
      columns:auto!important;float:none!important;clip:auto!important;clip-path:none!important;
      text-align:start!important;white-space:normal!important;line-height:1.9!important; }
    #pbv-pages .pbv-horizontal div { margin:0!important;padding:0!important; }
    #pbv-pages .pbv-horizontal p { margin:0 0 0.7em!important;padding:0!important;
      text-indent:0!important;overflow-wrap:anywhere; }
    #pbv-pages .pbv-horizontal p:has(>br:only-child) { display:none!important; }
    #pbv-pages .pbv-horizontal .gb-segment { font-size:18px!important; }
    #pbv-pages .pbv-horizontal [style*="display:none"],
    #pbv-pages .pbv-horizontal [style*="display: none"] { display:none!important; }
    #pbv-pages .pbv-horizontal img { max-width:100%;height:auto; }
    #pbv-more, #pbv-prev { display:block;margin:16px auto 32px;padding:12px 24px;
      font:16px sans-serif;cursor:pointer; }
    #pbv-prev { margin-top:52px; }
  `;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.id = 'pbv-toggle';
  toggle.textContent = '上下スクロール';
  toggle.setAttribute('aria-pressed', 'false');
  const view = document.createElement('section');
  view.id = 'pbv-view';
  view.hidden = true;
  view.setAttribute('aria-label', '上下スクロール読書');
  const pages = document.createElement('div');
  pages.id = 'pbv-pages';
  const more = document.createElement('button');
  more.id = 'pbv-more';
  more.textContent = '次のページを追加';
  const prev = document.createElement('button');
  prev.id = 'pbv-prev';
  prev.textContent = '前のページを追加';
  view.append(prev, pages, more);
  document.body.append(toggle, view);
  let active = false, busy = false, timeout, debounce, direction = 1, lastSignature = '', lastScroll = 0;
  const seen = new Set();

  function shown() {
    return [...document.querySelectorAll('reader-pages reader-page.shown')]
      .filter(p => p.classList.contains('-gb-loaded') && p.querySelector('reader-rendered-page'));
  }
  function resize() {
    for (const sheet of pages.children) {
      sheet.style.zoom = sheet.classList.contains('pbv-horizontal') ? '1'
        : String(Math.min(1, (view.clientWidth - 32) / Number(sheet.dataset.width)));
    }
  }
  function append() {
    if (!active) return;
    const height = view.scrollHeight, top = view.scrollTop;
    const visible = shown();
    const signature = visible.map(p => p.id).join('|');
    let added = false;
    // ponytail: 保持ページ数に比例してメモリを使う。長時間読む場合は表示を一度閉じて再開。
    for (const source of visible) {
      if (seen.has(source.id)) continue;
      const rect = source.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const sheet = source.cloneNode(true);
      sheet.classList.remove('shown');
      sheet.classList.add('pbv-sheet');
      if (source.classList.contains('text-mode')) sheet.classList.add('pbv-horizontal');
      sheet.dataset.width = String(rect.width);
      sheet.dataset.page = source.id;
      const segment = source.querySelector('.gb-segment');
      sheet.dataset.continues = String(/\+[1-9]\d*$/.test(segment?.getAttribute('ocean-position') || ''));
      sheet.style.cssText = `width:${rect.width}px;height:${rect.height}px;direction:${getComputedStyle(source).direction}`;
      for (const el of [sheet, ...sheet.querySelectorAll('[id]')]) el.removeAttribute('id');
      sheet.querySelectorAll('reader-page-overlay, reader-icon-overlay, script').forEach(el => el.remove());
      const after = [...pages.children].find(p => p.dataset.page.localeCompare(source.id, undefined, { numeric: true }) > 0);
      pages.insertBefore(sheet, after || null);
      seen.add(source.id);
      added = true;
    }
    if (added) {
      // Googleが示す段落途中のオフセットがある場合だけ、前ページの段落につなぐ。
      const sheets = [...pages.children];
      for (let i = 1; i < sheets.length; i++) {
        const current = sheets[i];
        if (current.dataset.continues !== 'true' || current.dataset.joined) continue;
        const paragraphs = p => [...p.querySelectorAll('p')].filter(el => el.textContent.trim());
        const left = sheets.slice(0, i).flatMap(paragraphs).at(-1), right = paragraphs(current)[0];
        if (left && right) {
          left.append(...right.childNodes);
          right.remove();
          current.dataset.joined = 'true';
        }
      }
      clearTimeout(timeout);
      busy = false;
      prev.disabled = more.disabled = false;
      prev.textContent = '前のページを追加';
      more.textContent = '次のページを追加';
      resize();
      if (direction === -1) view.scrollTop = top + view.scrollHeight - height;
      lastScroll = view.scrollTop;
    } else if (busy && signature && signature !== lastSignature) {
      step();
    }
  }
  function finish(message) {
    clearTimeout(timeout);
    busy = false;
    prev.disabled = more.disabled = false;
    (direction === -1 ? prev : more).textContent = message;
  }
  function step() {
    const label = direction === -1 ? '前のページ' : '次のページ';
    const english = direction === -1 ? 'Previous page' : 'Next page';
    const button = document.querySelector(`reader-app button[aria-label="${label}"], reader-app button[aria-label="${english}"]`);
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
      finish(`${label}がありません／通常表示で確認`);
      return;
    }
    lastSignature = shown().map(p => p.id).join('|');
    clearTimeout(timeout);
    // ponytail: 方向を反転すると既読範囲を標準ボタンでたどる。広範囲の移動が遅い場合はスライダーでの移動に変更。
    button.click();
    timeout = setTimeout(() => finish('追加できませんでした。再試行'), 10000);
  }
  function load(value) {
    if (!active || busy) return;
    direction = value;
    busy = true;
    prev.disabled = more.disabled = true;
    (direction === -1 ? prev : more).textContent = '読み込み中…';
    step();
  }
  toggle.addEventListener('click', () => {
    active = !active;
    view.hidden = !active;
    toggle.textContent = active ? '通常表示に戻す' : '上下スクロール';
    toggle.setAttribute('aria-pressed', String(active));
    clearTimeout(timeout);
    busy = false;
    prev.disabled = more.disabled = false;
    if (active) {
      pages.replaceChildren();
      seen.clear();
      direction = 1;
      prev.textContent = '前のページを追加';
      more.textContent = '次のページを追加';
      append();
      view.scrollTop = 0;
      lastScroll = 0;
      if (!seen.size) more.textContent = '本文の読み込みを待っています…';
    }
  });
  more.addEventListener('click', () => load(1));
  prev.addEventListener('click', () => load(-1));
  view.addEventListener('scroll', () => {
    const delta = view.scrollTop - lastScroll;
    lastScroll = view.scrollTop;
    if (delta < 0 && view.scrollTop < 180) load(-1);
    else if (delta > 0 && view.scrollHeight - view.scrollTop - view.clientHeight < 180) load(1);
  }, { passive: true });
  // リーダーの仮想ページ更新だけを監視し、自分が追加したページは監視しない。
  function watch() {
    const reader = document.querySelector('reader-pages');
    if (!reader) return false;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(append, 350);
    }).observe(reader, { childList: true, subtree: true, attributes: true, characterData: true });
    return true;
  }
  if (!watch()) {
    const startup = new MutationObserver(() => {
      if (watch()) { startup.disconnect(); append(); }
    });
    startup.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('resize', resize);
})();

