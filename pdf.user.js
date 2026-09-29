// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.5.3
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
            // The site strips N junk chars after "token=" from every option value on the first
            // click (N = numeric option attribute, name randomised per page load). Do that here
            // and open the clean decode URL directly, once, as a real top-level navigation.
            const junkAttrName = function () {
                for (const s of document.scripts) {
                    const m = /randAttr\s*=\s*["']([^"']+)["']/.exec(s.textContent);
                    if (m) return m[1];
                }
                return '';
            };

            const cleanValue = function (option, attr) {
                if (option.dataset.pdfClean) return option.dataset.pdfClean;
                const value = option.value;
                const at = value.indexOf('token=');
                let clean = value;
                if (at !== -1) {
                    const len = parseInt(option.getAttribute(attr), 10) || 3;
                    clean = value.slice(0, at + 6) + value.slice(at + 6 + len);
                }
                option.dataset.pdfClean = clean;
                return clean;
            };

            const onReaderClick = function (event) {
                event.stopImmediatePropagation();
                const select = document.querySelector('select.vi13');
                if (!select) return;
                const attr = junkAttrName();
                const options = Array.from(select.options);
                options.forEach(function (o) { cleanValue(o, attr); });
                const selected = options[select.selectedIndex];
                if (!selected) return;
                window.open(new URL(cleanValue(selected, attr), location.href).href, '_blank');
            };

            const bound = new WeakSet();
            const bindReaderButtons = function () {
                document.querySelectorAll('input.vi12').forEach(function (button) {
                    if (bound.has(button)) return;
                    bound.add(button);
                    // Listener sits on the button itself (capture on target fires before the site's
                    // handlers): AdGuard Popup Blocker rejects window.open from document/window listeners.
                    button.addEventListener('click', onReaderClick, true);
                });
            };

            const startObserver = function () {
                bindReaderButtons();
                const root = document.documentElement;
                if (!root) return;
                new MutationObserver(bindReaderButtons).observe(root, { childList: true, subtree: true });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startObserver, { once: true });
            } else {
                startObserver();
            }
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
