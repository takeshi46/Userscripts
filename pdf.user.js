// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.5.1
// @description  外部ポップアップ防止・1クリックPDF表示・PDFビューアの巻変更広告を防止
// @namespace    https://github.com/takeshi46/pdf
// @homepageURL  https://github.com/takeshi46/pdf
// @downloadURL  https://raw.githubusercontent.com/takeshi46/pdf/main/pdf.user.js
// @updateURL    https://raw.githubusercontent.com/takeshi46/pdf/main/pdf.user.js
// @match        *://pdftoshokan.com/*
// @match        *://*.pdftoshokan.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function pageMain() {
        'use strict';

        if (window.__pdfAdguardMainV148) {
            return;
        }
        window.__pdfAdguardMainV148 = true;

        const nativeOpen = window.open;
        const isMangaPage = /\/manga\//.test(location.pathname);

        const isSameSite = function (value) {
            if (!value) return false;
            try {
                const url = new URL(value, location.href);
                return url.hostname === 'pdftoshokan.com' || url.hostname.endsWith('.pdftoshokan.com');
            } catch (e) {
                return false;
            }
        };

        window.open = function (url, target, features) {
            let value = '';
            try {
                value = String(url || '');
            } catch (e) {}

            if (
                isMangaPage &&
                (value === 'window.location.href' || value.endsWith('/manga/window.location.href'))
            ) {
                return null;
            }

            if (url && isSameSite(url)) {
                return nativeOpen.call(window, url, target, features);
            }

            return null;
        };

        if (isMangaPage) {
            const readerHandlers = new WeakMap();

            const bindReaderButton = function (button) {
                if (
                    !button ||
                    readerHandlers.has(button) ||
                    button.value !== 'Click here to read'
                ) {
                    return;
                }

                const handler = function () {
                    const select = document.querySelector('select.vi13');
                    if (!select || !select.value) {
                        return false;
                    }

                    const firstUrl = new URL(select.value, location.href).href;
                    const child = nativeOpen.call(window, 'about:blank', '_blank');
                    if (!child) {
                        return false;
                    }

                    let retryCount = 0;
                    const retryDelays = [1500, 3000, 5000, 8000, 10000, 15000];

                    const showStatus = function (message) {
                        try {
                            const doc = child.document;
                            doc.open();
                            doc.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF</title><style>body{margin:0;background:#fff;color:#222;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}.box{padding:32px;font-size:20px;line-height:1.7}.spin{font-size:36px;margin-bottom:12px}</style><div class="box"><div class="spin">…</div><div id="msg"></div></div>');
                            const msg = doc.getElementById('msg');
                            if (msg) msg.textContent = message;
                            doc.close();
                        } catch (e) {}
                    };

                    const navigateChild = function (url) {
                        try {
                            child.location.replace(url);
                        } catch (e) {
                            try {
                                child.location.href = url;
                            } catch (_) {}
                        }
                    };

                    const extractViewerUrl = function (text, baseUrl) {
                        if (!text) return '';
                        const match = String(text).match(/(?:https?:\/\/[^"'<>\s]+|\/[^"'<>\s]+)\/pdf\/view332\/web\/viewer\.html\?file=[^"'<>\s]+/i);
                        if (!match) return '';
                        try {
                            return new URL(match[0].replace(/&amp;/g, '&'), baseUrl).href;
                        } catch (e) {
                            return '';
                        }
                    };

                    const tryDecode = async function () {
                        try {
                            if (child.closed) return;
                        } catch (e) {
                            return;
                        }

                        showStatus(retryCount === 0 ? 'PDFを準備しています…' : 'PDFを準備しています… 再試行中');

                        try {
                            const response = await fetch(firstUrl, {
                                credentials: 'include',
                                cache: 'no-store',
                                redirect: 'follow'
                            });

                            if (response.status === 429) {
                                if (retryCount < retryDelays.length) {
                                    const delay = retryDelays[retryCount++];
                                    setTimeout(tryDecode, delay);
                                } else {
                                    showStatus('アクセスが混み合っています。少し時間を空けてから、もう一度お試しください。');
                                }
                                return;
                            }

                            const finalUrl = response.url || firstUrl;
                            if (/\/pdf\/view332\/web\/viewer\.html(?:\?|$)/.test(finalUrl)) {
                                navigateChild(finalUrl);
                                return;
                            }

                            const html = await response.text();

                            let nextUrl = firstUrl;
                            try {
                                const currentSelect = document.querySelector('select.vi13');
                                if (currentSelect && currentSelect.value) {
                                    nextUrl = new URL(currentSelect.value, location.href).href;
                                }
                            } catch (e) {}

                            if (nextUrl !== firstUrl) {
                                navigateChild(nextUrl);
                                return;
                            }

                            const viewerUrl = extractViewerUrl(html, finalUrl);
                            if (viewerUrl) {
                                navigateChild(viewerUrl);
                                return;
                            }

                            try {
                                const doc = child.document;
                                doc.open();
                                doc.write('<base href="' + finalUrl.replace(/"/g, '&quot;') + '">' + html);
                                doc.close();
                            } catch (e) {
                                navigateChild(finalUrl);
                            }
                        } catch (e) {
                            if (retryCount < retryDelays.length) {
                                const delay = retryDelays[retryCount++];
                                setTimeout(tryDecode, delay);
                            } else {
                                showStatus('PDFの準備に失敗しました。少し時間を空けてから、もう一度お試しください。');
                            }
                        }
                    };

                    showStatus('PDFを準備しています…');
                    tryDecode();
                    return false;
                };

                readerHandlers.set(button, handler);
                button.onclick = handler;
            };

            const bindReaderButtons = function () {
                document.querySelectorAll('input.vi12').forEach(bindReaderButton);
            };

            const startObserver = function () {
                bindReaderButtons();

                const root = document.documentElement;
                if (!root) return;

                const observer = new MutationObserver(bindReaderButtons);
                observer.observe(root, {
                    childList: true,
                    subtree: true
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startObserver, { once: true });
            } else {
                startObserver();
            }
            document.addEventListener('click', function (event) {
                const target = event.target;
                const button = target && typeof target.closest === 'function'
                    ? target.closest('input.vi12')
                    : null;

                if (!button || button.value !== 'Click here to read') return;

                let handler = readerHandlers.get(button);
                if (!handler) {
                    bindReaderButton(button);
                    handler = readerHandlers.get(button);
                }

                if (!handler) return;

                event.preventDefault();
                event.stopImmediatePropagation();
                handler();
            }, true);
        }

        document.addEventListener('click', function (event) {
            const target = event.target;
            const anchor = target && typeof target.closest === 'function'
                ? target.closest('a[href]')
                : null;

            if (!anchor || anchor.target !== '_blank') return;

            const href = anchor.getAttribute('href');
            if (isSameSite(href)) {
                anchor.target = '_self';
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        document.addEventListener('submit', function (event) {
            const form = event.target;
            if (!form || String(form.tagName || '').toUpperCase() !== 'FORM' || form.target !== '_blank') {
                return;
            }

            if (isSameSite(form.action)) {
                form.target = '_self';
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        if (/\/pdf\/view332\/web\//.test(location.pathname)) {
            function getStorageKey() {
                const raw = navigator.userAgent + navigator.language;
                let hash = 0;

                for (let i = 0; i < raw.length; i++) {
                    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
                    hash |= 0;
                }

                return 'viewad_' + Math.abs(hash);
            }

            const storageKey = getStorageKey();

            function refreshAdTimer() {
                try {
                    localStorage.setItem(storageKey, String(Date.now()));
                } catch (e) {}
            }

            refreshAdTimer();
            setInterval(refreshAdTimer, 60000);
        }
    }

    const inject = function () {
        const root = document.documentElement || document.head;
        if (!root) {
            return false;
        }

        const script = document.createElement('script');
        script.textContent = '(' + pageMain.toString() + ')();';
        root.appendChild(script);
        script.remove();
        return true;
    };

    if (!inject()) {
        const observer = new MutationObserver(function () {
            if (inject()) {
                observer.disconnect();
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });
    }
})();





