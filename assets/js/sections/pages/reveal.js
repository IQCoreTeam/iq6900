(function () {
    // CRT-flavored scroll reveal: elements fade/lift in with a brief power-on
    // flicker the first time they enter the viewport. Restraint over spectacle.
    let observer = null;

    // Selectors that should reveal on scroll. Kept to structural blocks so the
    // effect reads as deliberate, not noisy.
    const TARGETS = [
        ".lp_section .lp_tag",
        ".lp_section_title",
        ".lp_section .about_text",
        ".lp_card",
        ".lp_project_card",
        ".lp_q_block",
        ".lp_h_stat",
        ".lp_ca_block",
        ".lp_perks_list li",
        ".tk_fee_row",
        ".tk_alloc_card",
        ".tk_flywheel_step"
    ];

    function prefersReduced() {
        return window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function ensureObserver() {
        if (observer) return observer;
        observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
        return observer;
    }

    // Idempotent: only picks up NOT-yet-registered elements and adds them to the
    // single shared observer. Never disconnects, so already-observed elements
    // that haven't scrolled into view yet are preserved across re-runs.
    function init() {
        if (prefersReduced()) return; // honor accessibility setting
        var obs = ensureObserver();

        const nodes = [];
        TARGETS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                if (el.classList.contains("reveal")) return; // already registered
                el.classList.add("reveal");
                nodes.push(el);
            });
        });
        if (!nodes.length) return;

        // Stagger siblings inside the same grid/row for a cascading power-on.
        nodes.forEach(function (el) {
            const sibs = Array.prototype.slice.call(el.parentNode.children)
                .filter(function (s) { return s.classList.contains("reveal"); });
            const i = sibs.indexOf(el);
            el.style.setProperty("--reveal-delay", (Math.max(0, i) * 70) + "ms");
            obs.observe(el);
        });
    }

    window.initReveal = init;

    // ── Ticker-redesign reveal: staggered rise for [data-reveal] blocks ──
    // Progressive enhancement: elements stay visible if this never runs.
    window.initRdReveal = function (scopeSel) {
        if (!('IntersectionObserver' in window)) return;
        var root = document.querySelector(scopeSel || '#main_section');
        if (!root) return;
        var els = root.querySelectorAll('[data-reveal]');
        if (!els.length) return;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                e.target.classList.add('rd-in');
                io.unobserve(e.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        els.forEach(function (el) {
            el.style.transitionDelay = (parseInt(el.getAttribute('data-reveal'), 10) || 0) + 'ms';
            el.classList.add('rd-reveal');
            io.observe(el);
        });
    };

    // ── Scroll-spy: brighten the nav link for the section currently in view ──
    // Only one spy is active at a time; the previous window listener is removed
    // on re-init so route changes never stack handlers.
    window.initRdScrollSpy = function (linkSel) {
        // linkSel selects the anchor elements directly, so one call can cover
        // several nav groups (e.g. top bar + side rail). Multiple links may
        // point at the same section; all of them light up together.
        var items = Array.prototype.slice.call(document.querySelectorAll(linkSel))
            .map(function (a) {
                var href = a.getAttribute('href') || '';
                if (href.charAt(0) !== '#') return null;
                var s = document.getElementById(href.slice(1));
                return s ? { a: a, id: href.slice(1), s: s } : null;
            })
            .filter(Boolean);
        if (!items.length) return;

        var ticking = false, curId = null;
        function update() {
            ticking = false;
            var line = window.innerHeight * 0.3, bestId = items[0].id, bestTop = -Infinity;
            items.forEach(function (it) {
                var top = it.s.getBoundingClientRect().top;
                if (top <= line && top > bestTop) { bestTop = top; bestId = it.id; }
            });
            if (bestId !== curId) {
                curId = bestId;
                items.forEach(function (it) {
                    it.a.classList.toggle('rd-nav-active', it.id === bestId);
                });
            }
        }
        function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

        if (window.__rdSpyHandler) {
            window.removeEventListener('scroll', window.__rdSpyHandler);
            window.removeEventListener('resize', window.__rdSpyHandler);
        }
        window.__rdSpyHandler = onScroll;
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();
    };

    // Re-run when the SPA router swaps page content into its mount points,
    // so we don't have to wire initReveal() into every page module.
    function watchMounts() {
        var mounts = ["#main_section", "#menu_section"]
            .map(function (s) { return document.querySelector(s); })
            .filter(Boolean);
        if (!mounts.length || prefersReduced()) return;
        var t = null;
        var mo = new MutationObserver(function () {
            clearTimeout(t);
            t = setTimeout(init, 120); // debounce burst of DOM inserts
        });
        mounts.forEach(function (m) {
            mo.observe(m, { childList: true, subtree: true });
        });
    }

    function boot() { init(); watchMounts(); }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
