// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.4.3
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

        let parsed = null;
        try {
            parsed = new URL(value, location.href);
        } catch (e) {}

        if (
            isMangaPage &&
            parsed &&
            parsed.pathname === '/decode.php' &&
            isSameSite(parsed.href)
        ) {
            const child = nativeOpen.call(window, url, target, features);
            if (!child) return child;

            const firstUrl = parsed.href;
            let advanced = false;

            const advanceToViewer = function () {
                if (advanced) return;

                try {
                    if (child.closed) return;
                } catch (e) {
                    return;
                }

                try {
                    const childUrl = new URL(child.location.href, location.href);
                    if (/\/pdf\/view332\/web\/viewer\.html$/.test(childUrl.pathname)) {
                        advanced = true;
                        return;
                    }
                } catch (e) {}

                let nextValue = firstUrl;
                try {
                    const select = document.querySelector('select.vi13');
                    if (select && select.value) {
                        nextValue = new URL(select.value, location.href).href;
                    }
                } catch (e) {}

                advanced = true;
                try {
                    child.location.replace(nextValue);
                } catch (e) {
                    try {
                        child.location.href = nextValue;
                    } catch (_) {}
                }
            };

            setTimeout(advanceToViewer, 300);
            return child;
        }

        if (url && isSameSite(url)) {
            return nativeOpen.call(window, url, target, features);
        }

        return null;
    };

    document.addEventListener('click', function (event) {
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
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
        if (!(form instanceof HTMLFormElement) || form.target !== '_blank') return;

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
