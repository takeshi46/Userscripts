// ==UserScript==
// @name         Google Play Books 上下スクロール
// @namespace    local.playbooks.vertical
// @homepageURL  https://github.com/takeshi46/Userscripts
// @downloadURL  https://raw.githubusercontent.com/takeshi46/Userscripts/main/play-books-vertical.user.js
// @updateURL    https://raw.githubusercontent.com/takeshi46/Userscripts/main/play-books-vertical.user.js
// @version      1.5.0
// @description  横書き・上下スクロールと挿絵ジャンプ。リーダーの章データから画像位置を取得。通常表示・ルビ対応。
// @match        https://books.googleusercontent.com/books/reader/frame*
// @match        https://play.google.com/books/reader*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  // 親ページだけが読書URLを操作する。iframeから渡されたURLは使用しない。
  if (location.hostname === 'play.google.com') {
    window.addEventListener('message', event => {
      const frame = document.querySelector('iframe.-gb-display');
      if (event.origin !== 'https://books.googleusercontent.com' || event.source !== frame?.contentWindow) return;
      const url = new URL(location.href), id = url.searchParams.get('id');
      if (!id) return;
      const key = `pbv-return:${id}`, modeKey = `pbv-mode:${id}`, targetKey = `pbv-target:${id}`;
      let bookmark, mode, savedIndex, landing;
      try { bookmark = JSON.parse(sessionStorage.getItem(key) || 'null'); mode = sessionStorage.getItem(modeKey) === 'true'; } catch {}
      try { landing = sessionStorage.getItem(targetKey); } catch {}
      try { savedIndex = JSON.parse(localStorage.getItem(`pbv-index:${id}`) || 'null'); } catch {}
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'pbv-context') {
        event.source.postMessage({ type: 'pbv-context', id, pg: url.searchParams.get('pg'), mode, bookmark, index: savedIndex, landing }, event.origin);
      } else if (data.type === 'pbv-landed') {
        try { sessionStorage.removeItem(targetKey); } catch {}
      } else if (data.type === 'pbv-index') {
        const merged = { images: [], ranges: [] };
        mergeIndex(merged, savedIndex); mergeIndex(merged, data.index);
        try { localStorage.setItem(`pbv-index:${id}`, JSON.stringify(merged)); } catch {}
      } else if (data.type === 'pbv-mark') {
        try { sessionStorage.setItem(key, JSON.stringify({ pg: url.searchParams.get('pg'), mode: data.mode === true })); } catch {}
        event.source.postMessage({ type: 'pbv-marked', pg: url.searchParams.get('pg') }, event.origin);
      } else if (data.type === 'pbv-goto' || data.type === 'pbv-return') {
        const pg = data.type === 'pbv-return' ? bookmark?.pg : data.pg;
        if (typeof pg !== 'string' || !/^GBS\.[A-Za-z0-9_.+-]{1,180}$/.test(pg)) return;
        try {
          if (data.type === 'pbv-goto') sessionStorage.setItem(targetKey, pg);
          else sessionStorage.removeItem(targetKey);
        } catch {}
        try { sessionStorage.setItem(modeKey, String(data.type === 'pbv-return' ? bookmark.mode : data.mode === true)); } catch {}
        url.searchParams.set('pg', pg);
        location.assign(url.href);
      }
    });
    return;
  }
  const streamed = { images: [], ranges: [] };
  let manifest, refresh = () => {};
  // 通常のリーダーが受信した章HTMLだけを読む。通信内容やアプリのコールバックは変更しない。
  const observed = new WeakSet(), add = MessagePort.prototype.addEventListener;
  function receive(event) {
    const data = event.data;
    const info = data?.manifest || data;
    if (info?.metadata?.volume_id && Array.isArray(info.segment)) manifest = info;
    if (typeof data?.content !== 'string' || data.content.length > 2000000
      || !manifest?.segment.some(s => s.label === data.current_position)) return;
    try {
      mergeIndex(streamed, contentIndex(data.content));
      refresh();
    } catch {}
  }
  function observe(port) {
    if (!observed.has(port)) {
      observed.add(port);
      add.call(port, 'message', receive);
    }
  }
  MessagePort.prototype.addEventListener = function(type, ...args) {
    if (type === 'message') observe(this);
    return add.call(this, type, ...args);
  };
  const onmessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  Object.defineProperty(MessagePort.prototype, 'onmessage', {
    ...onmessage,
    set(value) { if (value) observe(this); return onmessage.set.call(this, value); },
  });
  window.addEventListener('message', event => {
    if (event.origin === 'https://play.google.com' && event.source === window.parent) event.ports?.forEach(observe);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();

  function contentIndex(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = [...doc.querySelectorAll('[id]')].filter(a => order(a.id) !== null);
    const result = { images: [], ranges: [] };
    for (const image of doc.querySelectorAll('img, svg image')) {
      // ponytail: 元画像の縦横200px以上を対象にする。挿絵と広告画像の区別はしない。
      if (!(Number(image.getAttribute('width')) >= 200 && Number(image.getAttribute('height')) >= 200)) continue;
      const before = anchors.filter(a => a.compareDocumentPosition(image) & 4).at(-1);
      if (!before) continue;
      // Googleの文字オフセットはDOMの文字数と一致しないため、挿絵直前の正式アンカーを使う。
      result.images.push({ pg: before.id, order: order(before.id) });
    }
    if (anchors.length) result.ranges.push([order(anchors[0].id), order(anchors.at(-1).id)]);
    return result;
  }
  function order(pg) {
    const match = /^GBS\.PT(\d+)(?:[._]|$)/.exec(pg || '');
    const value = match ? Number(match[1]) : /^GBS\.PP1(?:[._]|$)/.test(pg || '') ? 0 : null;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  function mergeIndex(index, saved) {
    if (!saved) return;
    for (const item of Array.isArray(saved.images) ? saved.images : []) {
      const pg = typeof item?.pg === 'string' ? item.pg.replace(/_\d+$/, '') : null;
      if (typeof item?.pg === 'string' && /^GBS\.[A-Za-z0-9_.+-]{1,180}$/.test(item.pg)
        && Number.isSafeInteger(item.order) && item.order >= 0 && order(item.pg) === item.order
        && !index.images.some(i => i.pg.replace(/_\d+$/, '') === pg)) index.images.push({ pg, order: item.order });
    }
    for (const r of Array.isArray(saved.ranges) ? saved.ranges : []) {
      if (Array.isArray(r) && r.length === 2 && r.every(n => Number.isSafeInteger(n) && n >= 0)
        && r[0] <= r[1] && !index.ranges.some(i => i[0] === r[0] && i[1] === r[1])) index.ranges.push(r);
    }
    index.images.sort((a, b) => a.order - b.order);
    index.ranges.sort((a, b) => a[0] - b[0]);
    index.ranges = index.ranges.reduce((merged, r) => {
      const last = merged.at(-1);
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
      return merged;
    }, []);
  }
  function initialize() {
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
    #pbv-images { position:fixed;left:12px;top:64px;z-index:2147483647;
      display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100% - 160px); }
    #pbv-images[hidden] { display:none!important; }
    #pbv-images button { padding:9px;border:1px solid #888;border-radius:8px;
      background:#fff;color:#222;cursor:pointer;font:14px sans-serif; }
    #pbv-images button:disabled { opacity:0.5;cursor:default; }
    #pbv-images span { align-self:center;font:14px sans-serif; }
    #pbv-pages .pbv-horizontal svg { display:block;width:100%!important;
      height:auto!important;max-width:100%; }
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
  const imageTools = document.createElement('nav');
  imageTools.id = 'pbv-images';
  imageTools.hidden = false;
  imageTools.setAttribute('aria-label', '挿絵へ移動');
  const imagePrev = document.createElement('button'), imageNext = document.createElement('button');
  const cancel = document.createElement('button'), back = document.createElement('button');
  const status = document.createElement('span');
  imagePrev.textContent = '前の挿絵'; imageNext.textContent = '次の挿絵';
  cancel.textContent = '探索停止'; back.textContent = '元の位置へ';
  cancel.disabled = back.disabled = true;
  status.setAttribute('role', 'status');
  imageTools.append(imagePrev, imageNext, cancel, back, status);
  document.body.append(imageTools);
  let active = false, busy = false, timeout, debounce, direction = 1, lastSignature = '', lastScroll = 0;
  let seeking = false, origin = '', returnPosition;
  let context, scanStart, pendingJump, landing;
  let index = streamed;
  const seen = new Set();
  refresh = () => {
    saveIndex();
    if (!busy && (!status.textContent || status.textContent.startsWith('画像の位置を')) && index.images.length)
      status.textContent = `画像の位置を${index.images.length}件取得`;
  };
  function imageLocation(page) {
    const image = [...page.querySelectorAll('img, svg image')].find(isIllustration);
    if (!image) return null;
    const anchors = [...page.querySelectorAll('[id]')].filter(a => /^GBS\./.test(a.id)
      && (a.compareDocumentPosition(image) & 4));
    const pg = (anchors.at(-1)?.id || pageLocation(page)).replace(/_\d+$/, '');
    return order(pg) === null ? null : { pg, order: order(pg) };
  }
  function isIllustration(img) {
    const rect = img.getBoundingClientRect();
    const clip = img.closest?.('reader-rendered-page')?.getBoundingClientRect();
    if (clip) return Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left) >= 200
      && Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top) >= 200;
    return Math.max(rect.width, Number(img.getAttribute('width')) || 0, img.naturalWidth || 0) >= 200
      && Math.max(rect.height, Number(img.getAttribute('height')) || 0, img.naturalHeight || 0) >= 200;
  }
  function pageLocation(page) {
    return page.querySelector('.gb-segment')?.getAttribute('ocean-position')?.replace(/\+(\d+)$/, '_$1')
      || page.querySelector('[id^="GBS."]')?.id || '';
  }
  function saveIndex() {
    if (!context) return;
    window.parent.postMessage({ type: 'pbv-index', index }, 'https://play.google.com');
  }
  function rememberImages() {
    for (const page of document.querySelectorAll('reader-pages reader-page.-gb-loaded')) {
      const found = imageLocation(page);
      if (found && !index.images.some(item => item.pg === found.pg)) index.images.push(found);
    }
    index.images.sort((a, b) => a.order - b.order);
    saveIndex();
  }
  function directTarget(start) {
    const images = index.images.filter(item => Math.sign(item.order - start) === direction
      && index.ranges.some(([low, high]) => low <= Math.min(start, item.order) && high >= Math.max(start, item.order)));
    return direction === -1 ? images.at(-1) : images[0];
  }
  function located(page) {
    const found = imageLocation(page);
    if (found && scanStart !== null && scanStart !== undefined) {
      index.ranges.push([Math.min(scanStart, found.order), Math.max(scanStart, found.order)]);
      saveIndex();
    }
  }
  window.addEventListener('message', event => {
    if (event.origin !== 'https://play.google.com' || event.source !== window.parent) return;
    if (event.data?.type === 'pbv-marked') {
      clearTimeout(timeout);
      const begin = pendingJump;
      pendingJump = null;
      begin?.();
      return;
    }
    if (event.data?.type !== 'pbv-context') return;
    context = event.data;
    if (manifest && manifest.metadata.volume_id !== context.id) return;
    mergeIndex(index, context.index);
    rememberImages();
    if (typeof context.landing === 'string' && /^GBS\.[A-Za-z0-9_.+-]{1,180}$/.test(context.landing))
      landing = { signature: '', steps: 0 };
    if (context.bookmark) back.disabled = false;
    if (context.mode && !active) toggle.click();
    if (landing) setTimeout(append, 350);
  });
  window.parent.postMessage({ type: 'pbv-context' }, 'https://play.google.com');

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
    rememberImages();
    if (adjustLanding()) return;
    if (!active) {
      const visible = shown(), signature = visible.map(p => p.id).join('|');
      if (seeking && signature && signature !== lastSignature) {
        const target = visible.find(p => Math.sign(p.id.localeCompare(origin, undefined, { numeric: true })) === direction
          && [...p.querySelectorAll('img, svg image')].some(isIllustration));
        if (target) { located(target); finish('挿絵に移動しました'); }
        else step();
      }
      return;
    }
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
      // ponytail: 200px以上の画像を挿絵と判定。画像主体の本では各ページが対象になる。
      sheet.dataset.illustration = String([...source.querySelectorAll('img, svg image')].some(isIllustration));
      sheet.dataset.location = pageLocation(source);
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
      busy = seeking;
      prev.disabled = more.disabled = imagePrev.disabled = imageNext.disabled = busy;
      prev.textContent = '前のページを追加';
      more.textContent = '次のページを追加';
      resize();
      if (direction === -1) view.scrollTop = top + view.scrollHeight - height;
      lastScroll = view.scrollTop;
      if (seeking) {
        const target = findIllustration();
        if (target) {
          const source = visible.find(p => p.id === target.dataset.page);
          if (source) located(source);
          finish('挿絵に移動しました'); scrollToSheet(target);
        }
        else step();
      }
    } else if (busy && signature && signature !== lastSignature) {
      step();
    }
  }
  function finish(message) {
    clearTimeout(timeout);
    if (landing) {
      landing = null;
      window.parent.postMessage({ type: 'pbv-landed' }, 'https://play.google.com');
    }
    pendingJump = null;
    busy = false;
    if (seeking) status.textContent = message;
    seeking = false;
    cancel.disabled = true;
    prev.disabled = more.disabled = imagePrev.disabled = imageNext.disabled = false;
    (direction === -1 ? prev : more).textContent = message;
  }
  function adjustLanding() {
    if (!landing) return false;
    const visible = shown();
    if (!visible.length || visible.length !== document.querySelectorAll('reader-pages reader-page.shown').length) return true;
    if (visible.some(page => [...page.querySelectorAll('img, svg image')].some(isIllustration))) {
      finish('挿絵に移動しました'); status.textContent = '挿絵に移動しました'; return false;
    }
    const signature = visible.map(page => page.id).join('|');
    if (signature === landing.signature) return true;
    // アンカー直後の画像が次の見開きに送られた場合だけ、最大2回補正する。
    if (landing.steps >= 2) {
      finish('挿絵の直前に移動しました'); status.textContent = '挿絵の直前に移動しました'; return false;
    }
    landing.signature = signature; landing.steps++;
    busy = true; direction = 1;
    imagePrev.disabled = imageNext.disabled = true; cancel.disabled = false;
    status.textContent = '挿絵の表示位置を調整…';
    step();
    return true;
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
    prev.disabled = more.disabled = imagePrev.disabled = imageNext.disabled = true;
    (direction === -1 ? prev : more).textContent = '読み込み中…';
    step();
  }
  function scrollToSheet(sheet, offset = 0) {
    const relative = sheet.getBoundingClientRect().top - view.getBoundingClientRect().top;
    view.scrollTop += relative - 64 + offset;
    lastScroll = view.scrollTop;
  }
  function findIllustration() {
    const candidates = [...pages.children].filter(sheet => sheet.dataset.illustration === 'true'
      && Math.sign(sheet.dataset.page.localeCompare(origin, undefined, { numeric: true })) === direction);
    return direction === -1 ? candidates.at(-1) : candidates[0];
  }
  function jumpIllustration(value) {
    if (busy) return;
    const current = active ? [...pages.children].find(sheet => sheet.getBoundingClientRect().bottom > view.getBoundingClientRect().top + 64)
      || pages.children[0] : value === 1 ? shown().at(-1) : shown()[0];
    if (!current) { status.textContent = '本文の読み込みを待っています'; return; }
    direction = value;
    origin = active ? current.dataset.page : current.id;
    returnPosition = active ? { sheet: current, offset: view.getBoundingClientRect().top + 64 - current.getBoundingClientRect().top } : null;
    scanStart = order(active ? current.dataset.location : pageLocation(current));
    back.disabled = false;
    const begin = () => {
      const target = active ? findIllustration() : null;
      if (target) { scrollToSheet(target); status.textContent = '挿絵に移動しました'; busy = false; return; }
      const direct = context && scanStart !== null ? directTarget(scanStart) : null;
      if (direct) {
        status.textContent = '記録済みの挿絵へ直接移動…';
        window.parent.postMessage({ type: 'pbv-goto', pg: direct.pg, mode: active }, 'https://play.google.com');
        return;
      }
      seeking = busy = true;
      cancel.disabled = false;
      prev.disabled = more.disabled = imagePrev.disabled = imageNext.disabled = true;
      status.textContent = '挿絵を探しています…';
      // ponytail: 章データを受信できない範囲では、標準ページ送りで探索する。
      step();
    };
    if (context) {
      busy = true;
      pendingJump = begin;
      window.parent.postMessage({ type: 'pbv-mark', mode: active }, 'https://play.google.com');
      timeout = setTimeout(() => { pendingJump = null; finish('位置を保存できませんでした。再試行'); }, 3000);
    } else begin();
  }
  toggle.addEventListener('click', () => {
    active = !active;
    view.hidden = !active;
    toggle.textContent = active ? '通常表示に戻す' : '上下スクロール';
    toggle.setAttribute('aria-pressed', String(active));
    clearTimeout(timeout);
    busy = false;
    seeking = false;
    pendingJump = null;
    cancel.disabled = true;
    back.disabled = !context?.bookmark;
    status.textContent = '';
    prev.disabled = more.disabled = imagePrev.disabled = imageNext.disabled = false;
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
  imagePrev.addEventListener('click', () => jumpIllustration(-1));
  imageNext.addEventListener('click', () => jumpIllustration(1));
  cancel.addEventListener('click', () => finish('探索を停止しました'));
  back.addEventListener('click', () => {
    if (!returnPosition) {
      if (context) window.parent.postMessage({ type: 'pbv-return' }, 'https://play.google.com');
      return;
    }
    finish('元の位置に戻りました');
    status.textContent = '元の位置に戻りました';
    prev.textContent = '前のページを追加';
    more.textContent = '次のページを追加';
    scrollToSheet(returnPosition.sheet, returnPosition.offset);
  });
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
      // 読込完了したページだけを使い、探索中の待ち時間を短くする。
      debounce = setTimeout(append, seeking ? 100 : 350);
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
  }
})();
