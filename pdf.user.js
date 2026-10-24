// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.5.14
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
                return /^https?:$/.test(url.protocol) &&
                    (url.hostname === 'pdftoshokan.com' || url.hostname.endsWith('.pdftoshokan.com'));
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
                    // The read button still needs the site's token preparation and saved-volume
                    // handler. Let those run, then use the same tab instead of a blocked popup.
                    const destination = new URL(value, location.href);
                    if (isMangaPage && destination.pathname === '/decode.php') {
                        location.assign(destination.href);
                        return null;
                    }
                    return Reflect.apply(target, window, args);
                }

                return null;
            }
        });

        // Lists now store XOR-encoded URLs in a rotating attribute rather than href.
        // Their document click handler opens the book in a popup and redirects this tab to
        // an ad. Restore only verified book URLs before that handler can run.
        const restoreBookLink = function (anchor) {
            const config = window.HES_CONFIG;
            if (!config || typeof config.key !== 'string' || !config.key ||
                typeof config.randAttr !== 'string' || !/^[a-zA-Z][\w-]*$/.test(config.randAttr) ||
                anchor.closest('.category-11895')) return false;

            // Some injected decoy links override getAttribute with a redirecting function.
            const encoded = Element.prototype.getAttribute.call(anchor, config.randAttr);
            if (!encoded || !/^(?:[\da-f]{2})+$/i.test(encoded)) return false;
            let decoded = '';
            for (let i = 0; i < encoded.length; i += 2) {
                decoded += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^
                    config.key.charCodeAt((i / 2) % config.key.length));
            }
            if (!isSameSite(decoded)) return false;
            const url = new URL(decoded, location.href);
            if (!/^\/manga\/\d+\/?$/.test(url.pathname) || url.search || url.hash) return false;
            anchor.href = url.href;
            anchor.target = '_self';
            return true;
        };

        ['click', 'contextmenu'].forEach(function (type) {
            window.addEventListener(type, function (event) {
                const target = event.target;
                const anchor = target && typeof target.closest === 'function' ? target.closest('a') : null;
                if (!anchor || !restoreBookLink(anchor)) return;
                event.stopImmediatePropagation();
                if (type === 'click' && event.button === 0 &&
                    !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    location.assign(anchor.href);
                }
            }, true);
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

        // The site only opens its ad popup / ad redirect when its per-browser timer key is stale
        // (list click: "he", reader button: "vi12_cd_", viewer volume menu/download: "v2_" and the old
        // "viewad_"). Those window.open calls come from document-level handlers, which AdGuard Popup
        // Blocker rejects (and notifies about). Keeping the timers fresh makes the site take its
        // plain same-tab path instead, so nothing is ever blocked.
        const getStorageKeys = function () {
            const raw = navigator.userAgent + navigator.language;
            let hash = 0;

            for (let i = 0; i < raw.length; i++) {
                hash = ((hash << 5) - hash) + raw.charCodeAt(i);
                hash |= 0;
            }

            return Math.abs(hash);
        };

        const timerId = String(getStorageKeys());
        // Known timer keys: list click "he", reader button "vi12_cd_" (inline) and "vi12_d_" (sin.js),
        // viewer volume menu/download "v2_" and the older "viewad_".
        const knownKeys = ['he', 'vi12_cd_', 'vi12_d_', 'vi4', 'v2_', 'viewad_'].map(function (p) { return p + timerId; });
        knownKeys.push('hes_last_click');

        const refreshAdTimer = function () {
            try {
                const now = String(Date.now());
                knownKeys.forEach(function (key) { localStorage.setItem(key, now); });
                // The site renames its keys from time to time: also refresh any other numeric
                // timestamp stored under "<something><this browser's id>".
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.endsWith(timerId) && /^\d{10,}$/.test(localStorage.getItem(key))) {
                        localStorage.setItem(key, now);
                    }
                }
            } catch (e) {}
        };

        refreshAdTimer();
        setInterval(refreshAdTimer, 60000);
        // Background tabs get frozen (no timers): also refresh right before any interaction and on resume.
        ['pointerdown', 'touchstart', 'click', 'keydown', 'visibilitychange', 'focus', 'pageshow', 'resume']
            .forEach(function (type) {
                window.addEventListener(type, refreshAdTimer, true);
            });
    }

    // Empty shells left behind when AdGuard blocks the ads (list grid cells, banner containers).
    const adStyle = document.createElement('style');
    adStyle.textContent =
        '#ad-container,#ad-containerx,#ad-container1,iframe.ads-iframe,iframe#myIframe,iframe#myIframe2{display:none!important}' +
        ':is(.post,article):has(>iframe.ads-iframe),:is(.post,article):has(>iframe#myIframe),:is(.post,article):has(>iframe#myIframe2){display:none!important}';

    const inject = function () {
        const root = document.documentElement || document.head;
        if (!root) {
            return false;
        }
        // document-start can run before <html> exists; install the style with the script.
        (document.head || root).appendChild(adStyle);

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
