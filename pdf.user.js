// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.5.9
// @description  外部ポップアップ防止・1クリックPDF表示・PDFビューアの巻変更広告を防止
// @namespace    https://github.com/takeshi46/pdf
// @homepageURL  https://github.com/takeshi46/Userscripts
// @downloadURL  https://raw.githubusercontent.com/takeshi46/Userscripts/main/pdf.user.js
// @updateURL    https://raw.githubusercontent.com/takeshi46/Userscripts/main/pdf.user.js
// @match        *://pdftoshokan.com/*
// @match        *://*.pdftoshokan.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function pageMain() {
        'use strict';

        if (window.__pdfAdguardMain) {
            return;
        }
        window.__pdfAdguardMain = true;

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

        // Proxy, not a plain function: the site checks Function.prototype.toString.call(window.open)
        // for "[native code]" and shows the volume-change ad whenever it has been replaced.
        window.open = new Proxy(nativeOpen, {
            apply: function (target, thisArg, args) {
                const url = args[0];
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
                    return Reflect.apply(target, window, args);
                }

                return null;
            }
        });

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
            function getStorageKeys() {
                const raw = navigator.userAgent + navigator.language;
                let hash = 0;

                for (let i = 0; i < raw.length; i++) {
                    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
                    hash |= 0;
                }

                // site renamed the key from viewad_ to v2_; keep both fresh
                return ['viewad_' + Math.abs(hash), 'v2_' + Math.abs(hash)];
            }

            const storageKeys = getStorageKeys();

            function refreshAdTimer() {
                try {
                    const now = String(Date.now());
                    storageKeys.forEach(function (key) { localStorage.setItem(key, now); });
                } catch (e) {}
            }

            refreshAdTimer();
            setInterval(refreshAdTimer, 60000);
            // Background tabs get frozen (no timers): also refresh right before any interaction
            // and on resume, so the site's "120s since last ad" check in the volume menu never trips.
            ['pointerdown', 'touchstart', 'click', 'keydown', 'visibilitychange', 'focus', 'pageshow', 'resume']
                .forEach(function (type) {
                    window.addEventListener(type, refreshAdTimer, true);
                });
        }
    }

    // Empty shells left behind when AdGuard blocks the ads (list grid cells, banner containers).
    const adStyle = document.createElement('style');
    adStyle.textContent =
        '#ad-container,#ad-containerx,#ad-container1,iframe.ads-iframe,iframe#myIframe,iframe#myIframe2{display:none!important}' +
        '.post:has(>iframe.ads-iframe),.post:has(>iframe#myIframe),.post:has(>iframe#myIframe2){display:none!important}';
    (document.head || document.documentElement).appendChild(adStyle);

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
