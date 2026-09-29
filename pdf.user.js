// ==UserScript==
// @name         PDF 広告遷移防止 統合版
// @version      1.4.9
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
            const boundButtons = new WeakSet();

            const bindReaderButton = function (button) {
                if (
                    !button ||
                    boundButtons.has(button) ||
                    button.value !== 'Click here to read'
                ) {
                    return;
                }

                boundButtons.add(button);

                button.onclick = function () {
                    const select = document.querySelector('select.vi13');
                    if (!select || !select.value) {
                        return false;
                    }

                    const firstUrl = new URL(select.value, location.href).href;
                    const child = window.open(firstUrl, '_blank');
                    if (!child) {
                        return false;
                    }

                    let attempts = 0;
                    let retryCount = 0;
                    let retrying = false;

                    const navigateChild = function (url) {
                        try {
                            child.location.replace(url);
                        } catch (e) {
                            try {
                                child.location.href = url;
                            } catch (_) {}
                        }
                    };

                    const retryDecode = function () {
                        if (retrying || retryCount >= 3) return false;
                        retrying = true;
                        retryCount++;

                        // Remove the visible 429 page immediately, then retry after
                        // a short backoff in the same tab so no extra tabs accumulate.
                        try {
                            child.location.replace('about:blank');
                        } catch (e) {}

                        const delay = retryCount * 1500;
                        setTimeout(function () {
                            retrying = false;
                            navigateChild(firstUrl);
                        }, delay);
                        return true;
                    };

                    const advanceWhenReady = function () {
                        if (retrying) {
                            setTimeout(advanceWhenReady, 100);
                            return;
                        }

                        try {
                            if (child.closed) return;
                        } catch (e) {
                            return;
                        }

                        try {
                            const childUrl = new URL(child.location.href, location.href);
                            if (/\/pdf\/view332\/web\/viewer\.html$/.test(childUrl.pathname)) {
                                return;
                            }

                            const bodyText = child.document && child.document.body
                                ? String(child.document.body.innerText || '')
                                : '';
                            if (/HTTP\s+ERROR\s+429|Too\s+Many\s+Requests/i.test(bodyText)) {
                                if (retryDecode()) {
                                    setTimeout(advanceWhenReady, 100);
                                    return;
                                }
                            }
                        } catch (e) {}

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

                        attempts++;
                        if (attempts < 400) {
                            setTimeout(advanceWhenReady, 50);
                        }
                    };

                    setTimeout(advanceWhenReady, 50);
                    return false;
                };
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


