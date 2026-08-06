// AgentNet DOWNLOAD menu on the landing stack card.
// The panel is appended to <body>, not the card: .rd-proj clips overflow and
// its hover transform would turn position:fixed into position:absolute.
(function () {
    var CLI_CMD = "npm i -g @iqlabs-official/agentnet-cli";
    var VSCODE_URL = "https://marketplace.visualstudio.com/items?itemName=iqlabs.agentnet-vscode";
    var ITEMS = [
        { label: "CLI", sub: "NPM GLOBAL INSTALL", action: "cli" },
        { label: "ANDROID APK", sub: "SIDELOAD BEFORE THE PLAY STORE LAUNCH", href: "https://github.com/IQCoreTeam/AgentNet/releases/tag/android-latest" },
        { label: "VS CODE", sub: "MARKETPLACE EXTENSION", href: VSCODE_URL },
        { label: "SEEKER", sub: "SOLANA DAPP STORE", href: "/agentnet/seeker/" }
    ];

    var menuEl = null;

    function close() {
        if (menuEl) { menuEl.remove(); menuEl = null; }
    }

    function buildMenu() {
        var m = document.createElement("div");
        m.style.cssText = "position:fixed;z-index:60;min-width:250px;border:1px solid #e8e4d6;border-radius:6px;background:rgba(20,19,16,.97);backdrop-filter:blur(6px);padding:6px 0;font-family:'Kode Mono',monospace;color:#e8e4d6;box-shadow:0 14px 32px rgba(0,0,0,.5)";
        ITEMS.forEach(function (it) {
            var a = document.createElement("a");
            a.style.cssText = "display:block;padding:9px 16px;cursor:pointer;color:#e8e4d6;text-decoration:none";
            a.innerHTML = '<div style="font:700 10px \'Kode Mono\',monospace;letter-spacing:.14em">' + it.label +
                ' →</div><div style="font:500 8.5px \'Kode Mono\',monospace;letter-spacing:.1em;opacity:.55;margin-top:3px">' + it.sub + "</div>";
            a.onmouseenter = function () { a.style.background = "rgba(232,228,214,.08)"; };
            a.onmouseleave = function () { a.style.background = "none"; };
            if (it.href) {
                a.href = it.href;
                a.target = "_blank";
                a.onclick = close;
            } else {
                a.onclick = function () { close(); openCliPopup(); };
            }
            m.appendChild(a);
        });
        return m;
    }

    function toggle(anchor) {
        if (menuEl) { close(); return; }
        menuEl = buildMenu();
        document.body.appendChild(menuEl);
        var r = anchor.getBoundingClientRect();
        var mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        var left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
        var top = r.bottom + 8;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 8);
        menuEl.style.left = left + "px";
        menuEl.style.top = top + "px";
    }

    function openCliPopup() {
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
        overlay.innerHTML =
            '<div style="border:1px solid #e8e4d6;border-radius:8px;background:rgba(20,19,16,.97);backdrop-filter:blur(6px);padding:22px 24px;max-width:440px;width:100%;color:#e8e4d6;font-family:\'Kode Mono\',monospace">' +
            '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font:700 11px \'Kode Mono\',monospace;letter-spacing:.18em">AGENTNET CLI</span>' +
            '<a data-cli-close style="cursor:pointer;font:700 12px \'Kode Mono\',monospace;color:#e8e4d6">[X]</a></div>' +
            '<p style="margin:14px 0 0;font:500 10.5px/1.9 \'Kode Mono\',monospace;opacity:.7">Type this in your terminal:</p>' +
            '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
            '<code style="flex:1;border:1px solid rgba(232,228,214,.6);border-radius:4px;padding:11px 12px;font:600 10.5px \'Kode Mono\',monospace;word-break:break-all;user-select:all">' + CLI_CMD + "</code>" +
            '<a data-cli-copy style="cursor:pointer;border:1px solid #e8e4d6;border-radius:4px;padding:11px 14px;font:700 10px \'Kode Mono\',monospace;letter-spacing:.1em;color:#e8e4d6;white-space:nowrap">COPY</a></div>' +
            "</div>";
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
        overlay.querySelector("[data-cli-close]").onclick = function () { overlay.remove(); };
        var copyBtn = overlay.querySelector("[data-cli-copy]");
        copyBtn.onclick = function () {
            navigator.clipboard.writeText(CLI_CMD).then(function () {
                copyBtn.textContent = "COPIED";
                setTimeout(function () { copyBtn.textContent = "COPY"; }, 1500);
            });
        };
        document.body.appendChild(overlay);
    }

    document.addEventListener("click", function (e) {
        if (menuEl && !menuEl.contains(e.target) && !e.target.closest("[data-agentnet-download]")) close();
    });
    window.addEventListener("scroll", close, true);

    // openCli / vscodeUrl are reused by the standalone Seeker page (/agentnet/seeker/),
    // so the "type this in your terminal" popup has a single source of truth.
    window.agentnetDownload = { toggle: toggle, openCli: openCliPopup, vscodeUrl: VSCODE_URL };
})();
