// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.4.6
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
        const boundButtons = new WeakSet();

        const bindReaderButton = function (button) {
            if (
                !button ||
                boundButtons.has(button) ||
                button.value !== 'Click here to read' ||
                !String(button.getAttribute('onclick') || '').includes('clickBtn1')
            ) {
                return;
            }

            boundButtons.add(button);

            // Attach directly to the button in capture phase. Document-level
            // popup blockers have already run by the time this executes, while
            // the site's inline onclick has not run yet.
            button.addEventListener('click', function () {
                const beforeOpen = window.open;

                const patchedOpen = function (url, target, features) {
                    if (window.open === patchedOpen) {
                        window.open = beforeOpen;
                    }

                    let parsed = null;
                    try {
                        parsed = new URL(String(url || ''), location.href);
                    } catch (e) {}

                    if (
                        !parsed ||
                        parsed.pathname !== '/decode.php' ||
                        !isSameSite(parsed.href)
                    ) {
                        return beforeOpen.apply(this, arguments);
                    }

                    const child = beforeOpen.call(window, url, target, features);
                    if (!child) {
                        return child;
                    }

                    const firstUrl = parsed.href;
                    let finished = false;
                    let attempts = 0;

                    const advanceWhenReady = function () {
                        if (finished) return;

                        try {
                            if (child.closed) {
                                finished = true;
                                return;
                            }
                        } catch (e) {
                            finished = true;
                            return;
                        }

                        try {
                            const childUrl = new URL(child.location.href, location.href);
                            if (/\/pdf\/view332\/web\/viewer\.html$/.test(childUrl.pathname)) {
                                finished = true;
                                return;
                            }
                        } catch (e) {}

                        let nextUrl = firstUrl;
                        try {
                            const select = document.querySelector('select.vi13');
                            if (select && select.value) {
                                nextUrl = new URL(select.value, location.href).href;
                            }
                        } catch (e) {}

                        if (nextUrl !== firstUrl) {
                            finished = true;
                            try {
                                child.location.replace(nextUrl);
                            } catch (e) {
                                try {
                                    child.location.href = nextUrl;
                                } catch (_) {}
                            }
                            return;
                        }

                        attempts++;
                        if (attempts < 200) {
                            setTimeout(advanceWhenReady, 25);
                        }
                    };

                    setTimeout(advanceWhenReady, 25);
                    return child;
                };

                window.open = patchedOpen;

                setTimeout(function () {
                    if (window.open === patchedOpen) {
                        window.open = beforeOpen;
                    }
                }, 0);
            }, true);
        };

        const bindReaderButtons = function () {
            document.querySelectorAll('input.vi12').forEach(bindReaderButton);
        };

        document.addEventListener('DOMContentLoaded', bindReaderButtons, { once: true });

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
})();
