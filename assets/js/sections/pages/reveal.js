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
