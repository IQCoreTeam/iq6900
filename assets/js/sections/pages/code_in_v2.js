// Code-In v2 page module. Loads html/sections/code_in_v2.html into #main_section
// and drives it through window.iqCodein (see js/codein/browser.js). Model B:
// a deterministic burner signs the inscription, the user signs only the funding.
(function ($) {
  $.extend(true, window, { code_in_v2: CodeInV2 });

  const CAP_KB = 32; // measured 429-safe cap on a public RPC; above it, recommend own RPC / SDK
  const DERIVE_MSG =
    "IQ6900 code-in burner v1. Sign to unlock your inscription wallet. This costs nothing and never leaves your browser.";

  function CodeInV2() {
    const templateUrl = "./html/sections/code_in_v2.html?ver=1";
    let provider = null;   // phantom injected provider
    let who = null;        // user pubkey (base58)
    let burner = null;     // derived once per session
    let tab = "feed";
    let running = false;

    function init() {
      $.ajax({ url: templateUrl, dataType: "html", type: "get", global: false, success: (html) => {
        $("#main_section").show().empty().append($(html));
        ready(wire);
      }});
    }

    function ready(cb) {
      if (window.iqCodein) cb();
      else window.addEventListener("iqcodein:ready", cb, { once: true });
    }

    function wire() {
      provider = window.phantom?.solana || window.solana || null;
      $("#ci2_connect").on("click", connect);
      $("#ci2_new").on("click", openCompose);
      $("#ci2_tab_feed").on("click", () => switchTab("feed"));
      $("#ci2_tab_mine").on("click", () => switchTab("mine"));
      $("#ci2 .tab[data-kind]").on("click", function () {
        $("#ci2 .tab[data-kind]").removeClass("on"); $(this).addClass("on");
        // only text is wired in this MVP; other kinds render the same text box for now
        refreshCost();
      });
      $("#ci2_text").on("input", refreshCost);
      $("#ci2_go").on("click", doInscribe);
      $("#ci2_min").on("click", minimize);
      $("#ci2_close").on("click", () => { if (!running) closeModal(); else minimize(); });
      $("#ci2_pill").on("click", reopen);
      $("#ci2_again").on("click", openCompose);
      $("#ci2_view").on("click", () => { closeModal(); switchTab("feed"); });
      refreshCost();
      loadBoard();
    }

    async function connect() {
      if (!provider) { alert("No Solana wallet found. Install Phantom."); return; }
      const res = await provider.connect();
      who = (res?.publicKey || provider.publicKey).toString();
      $("#ci2_who").text(who.slice(0, 4) + "..." + who.slice(-4));
      $("#ci2_new").removeClass("hide");
      loadBoard();
    }

    function switchTab(t) {
      tab = t;
      $("#ci2_tab_feed").toggleClass("on", t === "feed");
      $("#ci2_tab_mine").toggleClass("on", t === "mine");
      $("#ci2_cap").text(t === "mine"
        ? "my inventory = your user_inventory PDA, full history"
        : "feed = getSignaturesForAddress(feed table), newest first");
      loadBoard();
    }

    async function loadBoard() {
      const grid = $("#ci2_grid").empty();
      if (tab === "mine" && !who) { $("#ci2_empty").text("connect to see yours.").removeClass("hide"); return; }
      $("#ci2_empty").addClass("hide");
      const account = tab === "mine" ? window.iqCodein.userInventory(who) : window.iqCodein.feedTable;
      let rows = [];
      try { rows = await window.iqCodein.readRows(account, 24); } catch (e) { /* leave empty */ }
      if (!rows.length) { $("#ci2_empty").text("nothing here yet.").removeClass("hide"); return; }
      rows.forEach((r) => {
        let obj = {}; try { obj = JSON.parse(r.row || r); } catch (e) {}
        const body = String(obj.body || "").slice(0, 90);
        const who2 = String(obj.who || "").slice(0, 4) + "..." + String(obj.who || "").slice(-4);
        grid.append($(
          '<div class="rec"><div class="th"></div><div class="m"><span>' +
          (obj.kind || "text") + "</span> &middot; " + who2 + "</div></div>"
        ).find(".th").text(body).end());
      });
    }

    function currentText() { return $("#ci2_text").val() || ""; }

    function refreshCost() {
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: "text", body: currentText(), who: who || "" })).length;
      const est = window.iqCodein.estimateCost(bytes, { firstTime: !burner });
      $("#ci2_size").text((bytes / 1024).toFixed(1) + " KB");
      $("#ci2_chunks").text("x " + est.chunks);
      $("#ci2_total").text((est.total / 1e9).toFixed(4) + " SOL");
      $("#ci2_overcap").toggleClass("hide", bytes / 1024 <= CAP_KB);
    }

    function openCompose() {
      running = false;
      $("#ci2_modal").removeClass("hide"); $("#ci2_pill").addClass("hide");
      $("#ci2_compose").removeClass("hide"); $("#ci2_progress").addClass("hide"); $("#ci2_done").addClass("hide");
      $("#ci2_win").text("code_in.exe");
      refreshCost();
    }
    function minimize() { $("#ci2_modal").addClass("hide"); if (running) $("#ci2_pill").removeClass("hide"); }
    function reopen() { $("#ci2_modal").removeClass("hide"); $("#ci2_pill").addClass("hide"); }
    function closeModal() { $("#ci2_modal").addClass("hide"); $("#ci2_pill").addClass("hide"); }

    async function doInscribe() {
      if (!who) { await connect(); if (!who) return; }
      const body = currentText();
      const bytes = new TextEncoder().encode(body).length;
      if (bytes / 1024 > CAP_KB) { alert("Over the " + CAP_KB + "KB browser cap. Add your own RPC or use the SDK."); return; }

      $("#ci2_compose").addClass("hide"); $("#ci2_progress").removeClass("hide");
      $("#ci2_win").text("writing...");
      setBar(0, "starting");
      running = true;

      try {
        if (!burner) {
          const signMessage = async (msg) => {
            const out = await provider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
            return out.signature || out;
          };
          burner = await window.iqCodein.deriveBurner(signMessage);
        }
        const wallet = { publicKey: provider.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
        const connection = window.iqCodein.connect();
        const speed = window.iqCodein.recommendSpeed(false);
        const res = await window.iqCodein.inscribe({
          connection, wallet, burner, kind: "text", body, speed,
          onProgress: (p) => setBar(p, "writing " + p + "%"),
        });
        running = false;
        $("#ci2_progress").addClass("hide"); $("#ci2_done").removeClass("hide");
        $("#ci2_win").text("done.exe");
        $("#ci2_sig").text("sig: " + res.sig.slice(0, 12) + "..." + res.sig.slice(-8));
        loadBoard();
      } catch (e) {
        running = false;
        $("#ci2_pct").text("failed: " + String(e.message || e).slice(0, 80));
      }
    }

    function setBar(pct, label) { $("#ci2_bar").css("width", pct + "%"); $("#ci2_pct").text(label); }

    $.extend(this, { init });
  }

  $.code_in_v2 = new CodeInV2();
})(jQuery);
