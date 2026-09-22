// Code-In v2 page module. Loads html/sections/code_in_v2.html into #main_section
// and drives it through window.iqCodein (see js/codein/browser.js). Model B:
// a deterministic burner signs the inscription, the user signs only the funding.
(function ($) {
  $.extend(true, window, { code_in_v2: CodeInV2 });

  const CAP_KB = 32; // measured 429-safe cap on a public RPC; above it, recommend own RPC / SDK

  function CodeInV2() {
    const templateUrl = "./html/sections/code_in_v2.html?ver=24";
    let provider = null;   // phantom injected provider
    let who = null;        // user pubkey (base58)
    let burner = null;     // derived once per session
    let tab = "feed";
    let kind = "text";     // active compose kind: text | ascii | image | file
    let asciiSrc = "";     // last image data URL, re-rendered when detail changes
    let asciiBody = "";    // ascii result (the inscribed body for kind=ascii)
    let uploadBody = "";   // base64 data URL for kind=image | file
    let currentSig = "";   // post shown in the view modal, for the share link
    let boardCursor = null; // gateway nextCursor for pagination
    let boardLoading = false; // guard so scroll + button don't double-fetch a page

    function init(post) {
      $.ajax({ url: templateUrl, dataType: "html", type: "get", global: false, success: (html) => {
        $("#main_section").show().empty().append($(html));
        ready(() => { wire(); if (post) openPost(post); });
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
      $("#ci2 .tab[data-kind]").on("click", function () { selectKind($(this).attr("data-kind")); });
      $("#ci2_text").on("input", refreshCost);
      $("#ci2_ascii_file").on("change", onAsciiFile);
      $("#ci2_ascii_size").on("input", reAscii);
      $("#ci2_image_file").on("change", onImageFile);
      $("#ci2_file_file").on("change", onFileFile);
      $("#ci2_view_close").on("click", () => $("#ci2_view_modal").addClass("hide"));
      $("#ci2_view_x").on("click", shareToX);
      $("#ci2_view_scan").on("click", () => $("#ci2_help_modal").removeClass("hide"));
      $("#ci2_help_close").on("click", () => $("#ci2_help_modal").addClass("hide"));
      $("#ci2_help_go").on("click", openScan);
      $("#ci2_help_copy").on("click", copyScan);
      $("#ci2_more").on("click", () => loadBoard(boardCursor));
      $("#ci2_scroll").on("scroll", onBoardScroll);
      $("#ci2_overcap").on("click", () => openCap("choice"));
      $("#ci2_bigfile").on("click", openBigFile);
      $("#ci2_big_close").on("click", () => $("#ci2_big_modal").addClass("hide"));
      $("#ci2_big_rpc").on("click", () => openCap("rpc"));
      $("#ci2_rpc_sdklink").on("click", () => openCap("sdk"));
      $("#ci2_spd_row .spd").on("click", function () { window.iqCodein.setSpeed($(this).attr("data-speed")); markSpeed(); });
      $("#ci2_rpc_link").on("click", () => openCap("rpc"));
      $("#ci2_rpc_apply").on("click", applyRpc);
      $("#ci2_cap_close").on("click", () => $("#ci2_cap_modal").addClass("hide"));
      $("#ci2_cap_pick_rpc").on("click", () => openCap("rpc"));
      $("#ci2_cap_pick_sdk").on("click", () => openCap("sdk"));
      $("#ci2_go").on("click", doInscribe);
      $("#ci2_retry").on("click", doInscribe);
      $("#ci2_close").on("click", closeModal);
      $("#ci2_again").on("click", openCompose);
      $("#ci2_view").on("click", () => { closeModal(); switchTab("feed"); });
      if (window.iqCodein.hasOwnRpc()) $("#ci2_rpc_link").text("connection: custom RPC");
      refreshCost();
      loadBoard();
    }

    async function connect() {
      if (!provider) { alert("No Solana wallet found. Install Phantom."); return; }
      const res = await provider.connect();
      who = (res?.publicKey || provider.publicKey).toString();
      $("#ci2_who").text(who.slice(0, 4) + "..." + who.slice(-4));
      // +NEW INSCRIPTION takes the connect button's place once connected.
      $("#ci2_connect").addClass("hide");
      $("#ci2_new").removeClass("hide");
      loadBoard();
    }

    function switchTab(t) {
      tab = t;
      $("#ci2_tab_feed").toggleClass("on", t === "feed");
      $("#ci2_tab_mine").toggleClass("on", t === "mine");
      $("#ci2_cap").text(t === "mine"
        ? "my inventory = your inscriptions, newest first (via gateway)"
        : "feed = the global board, newest first (via gateway)");
      loadBoard();
    }

    // before = a page cursor (from the scroll or LOAD MORE); omit it for a fresh
    // load, which clears the grid. New rows are always appended, so paging never
    // re-renders. boardLoading serializes so the scroll and button never overlap.
    async function loadBoard(before) {
      if (boardLoading) return;
      boardLoading = true;
      try {
        const grid = $("#ci2_grid");
        if (!before) { grid.empty(); $("#ci2_empty").addClass("hide"); $("#ci2_more").addClass("hide"); boardCursor = null; }
        if (tab === "mine" && !who) { $("#ci2_empty").text("connect to see yours.").removeClass("hide"); return; }
        let res = { rows: [], nextCursor: null };
        try { res = tab === "mine" ? await window.iqCodein.readMine(who, 24, before) : await window.iqCodein.readBoard(24, before); } catch (e) { /* leave empty */ }
        const items = res.rows || [];
        if (!before && !items.length) {
          // Mainnet reads go through the gateway, so an empty result is a real
          // empty board (no own-RPC needed to load it).
          $("#ci2_empty").text("nothing here yet.").removeClass("hide");
          return;
        }
        items.forEach((it) => {
          const obj = it.row || it; // board = the row itself; mine = the asset's cached row
          const sig = obj.__txSignature || it.__txSignature || it.signature || "";
          const owner = String(obj.who || "");
          const who2 = owner ? owner.slice(0, 4) + "..." + owner.slice(-4) : "";
          const card = $('<div class="rec"><div class="th"></div><div class="m"><span class="tag">' + (obj.kind || "text") + '</span> <span class="ago">' + relTime(obj.__blockTime) + '</span><div class="own">' + who2 + "</div></div></div>");
          renderThumb(card.find(".th"), obj);
          if (sig) card.css("cursor", "pointer").on("click", () => openPost(sig, obj));
          grid.append(card);
        });
        boardCursor = res.nextCursor;
        $("#ci2_more").toggleClass("hide", !boardCursor);
      } finally { boardLoading = false; }
    }

    // Relative age from the gateway's __blockTime (unix seconds), like the design.
    function relTime(bt) {
      if (!bt) return "";
      const d = Math.max(0, Math.floor(Date.now() / 1000) - bt);
      if (d < 60) return d + "s";
      if (d < 3600) return Math.floor(d / 60) + "m";
      if (d < 86400) return Math.floor(d / 3600) + "h";
      return Math.floor(d / 86400) + "d";
    }

    // Infinite scroll: pull the next page as the board area nears its bottom.
    function onBoardScroll() {
      const el = document.getElementById("ci2_scroll");
      if (!el || boardLoading || !boardCursor) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) loadBoard(boardCursor);
    }

    // Render by the data-URL mime, not the kind, so an mp3 uploaded via FILE
    // still shows an audio thumb. Only images/audio render inline (safe, no
    // script execution); other files show a tag and download in the viewer.
    function renderThumb($th, obj) {
      const body = String(obj.body || "");
      $th.removeClass("txt art");
      if (body.slice(0, 11) === "data:image/") { $th.html($("<img>").attr("src", body)); return; }
      if (body.slice(0, 11) === "data:audio/") { $th.text("|> mp3"); return; }
      if (obj.kind === "file") { $th.text("[ file ]"); return; }
      if (obj.kind === "ascii") { $th.addClass("art").text(body.slice(0, 800)); return; } // exact spacing
      $th.addClass("txt").text(body.slice(0, 140)); // text wraps within the fixed-height box
    }

    // preloaded = the row we already have from a board card (avoids a re-fetch);
    // omitted for share links, where we only have the sig.
    async function openPost(sig, preloaded) {
      currentSig = sig;
      $("#ci2_view_modal").removeClass("hide");
      $("#ci2_view_meta").text("loading...");
      $("#ci2_view_body").empty();
      let obj = preloaded || null;
      if (!obj) { try { obj = await window.iqCodein.readOne(sig); } catch (e) { /* handled below */ } }
      if (!obj) { $("#ci2_view_meta").text("could not load this post. set your own RPC and retry."); return; }
      const owner = String(obj.who || "");
      $("#ci2_view_meta").text("sig: " + sig.slice(0, 8) + "..." + sig.slice(-6) + "  ·  owner: " + (owner ? owner.slice(0, 4) + "..." + owner.slice(-4) : "unknown") + "  ·  " + (obj.kind || "text"));
      const body = String(obj.body || "");
      const $b = $("#ci2_view_body");
      if (body.slice(0, 11) === "data:image/") $b.html($("<img>").attr("src", body).css({ borderRadius: "5px" }));
      else if (body.slice(0, 11) === "data:audio/") $b.html($("<audio>").attr({ src: body, controls: true }));
      else if (obj.kind === "file") $b.html($("<a>").attr({ href: body, download: "codein-file" }).addClass("btn").text("DOWNLOAD FILE"));
      else {
        // green record body, matching the design viewer; ascii keeps pre, text wraps
        const $pre = $("<pre>").addClass("vpre").text(body);
        if (obj.kind === "ascii") $pre.css({ fontSize: "7px", lineHeight: "1" });
        else $pre.css({ whiteSpace: "pre-wrap", wordBreak: "break-word" });
        $b.html($pre);
      }
    }

    // share to X: link the gateway view page, which renders the inscription so
    // the tweet card shows it. solscan: the on-chain tx. help: the how-to popup.
    function shareToX() {
      if (!currentSig) return;
      const text = "my inscription, on-chain forever via @IQLabsOfficial code-in";
      const url = window.iqCodein.viewUrl(currentSig);
      window.open("https://x.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url), "_blank");
    }
    function openScan() { if (currentSig) window.open(window.iqCodein.solscanUrl(currentSig), "_blank"); }
    function copyScan() {
      if (!currentSig) return;
      if (navigator.clipboard) navigator.clipboard.writeText(window.iqCodein.solscanUrl(currentSig));
      const $b = $("#ci2_help_copy").text("COPIED");
      setTimeout(() => $b.text("COPY SOLSCAN LINK"), 1200);
    }

    function currentText() { return $("#ci2_text").val() || ""; }

    function selectKind(k) {
      kind = k;
      $("#ci2 .tab[data-kind]").removeClass("on");
      $('#ci2 .tab[data-kind="' + k + '"]').addClass("on");
      ["text", "ascii", "image", "file"].forEach((x) => $("#ci2_p_" + x).toggleClass("hide", x !== k));
      refreshCost();
    }

    // The row is always { kind, body, who } (fixed table schema); body carries the
    // text, the ascii art, or a base64 data URL for image/file.
    function currentPayload() {
      if (kind === "text") return { kind: "text", body: currentText() };
      if (kind === "ascii") return { kind: "ascii", body: asciiBody };
      return { kind: kind, body: uploadBody };
    }

    function onAsciiFile() {
      const f = this.files[0]; if (!f) return;
      $("#ci2_ascii_name").text(f.name);
      const r = new FileReader();
      r.onload = () => { asciiSrc = r.result; reAscii(); };
      r.readAsDataURL(f);
    }
    async function reAscii() {
      if (!asciiSrc) return;
      const step = parseInt($("#ci2_ascii_size").val(), 10) || 8;
      try { asciiBody = await window.iqCodein.toAscii(asciiSrc, step); $("#ci2_ascii_out").text(asciiBody); }
      catch (e) { $("#ci2_ascii_out").text("could not read that image."); }
      refreshCost();
    }
    function readUpload(file, done) {
      const r = new FileReader();
      r.onload = () => { uploadBody = r.result; done(); refreshCost(); };
      r.readAsDataURL(file);
    }
    function onImageFile() {
      const f = this.files[0]; if (!f) return;
      readUpload(f, () => $("#ci2_image_prev").html($("<img>").attr("src", uploadBody)));
    }
    function onFileFile() {
      const f = this.files[0]; if (!f) return;
      readUpload(f, () => {
        const $n = $("#ci2_file_name").text(f.name + "  (" + (f.size / 1024).toFixed(1) + " KB)");
        // audio uploads get a preview player so you can hear it before inscribing
        if (uploadBody.slice(0, 11) === "data:audio/") $n.append($("<audio>").attr({ src: uploadBody, controls: true }).css({ display: "block", width: "100%", marginTop: "10px" }));
      });
    }

    function refreshCost() {
      const pay = currentPayload();
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: pay.kind, body: pay.body, who: who || "" })).length;
      const est = window.iqCodein.estimateCost(bytes, { firstTime: !burner });
      $("#ci2_size").text((bytes / 1024).toFixed(1) + " KB");
      $("#ci2_chunks").text("x " + est.chunks);
      $("#ci2_total").text((est.total / 1e9).toFixed(4) + " SOL");
      // The 32KB cap only binds on the shared public RPC; a user RPC lifts it.
      const overCap = bytes / 1024 > CAP_KB && !window.iqCodein.hasOwnRpc();
      $("#ci2_overcap").toggleClass("hide", !overCap);
      // Over cap the button stays clickable but becomes the "choose RPC/SDK" CTA
      // (doInscribe routes it to the cap modal); disable only when there's nothing to write.
      $("#ci2_go").prop("disabled", !pay.body)
        .text(overCap ? "OVER 32KB - ADD RPC OR USE SDK" : "FUND + INSCRIBE / 1 SIGNATURE");
    }

    function openBigFile() { markSpeed(); $("#ci2_big_modal").removeClass("hide"); }
    function markSpeed() {
      const s = window.iqCodein.getSpeed();
      $("#ci2_spd_row .spd").each(function () { $(this).toggleClass("on", $(this).attr("data-speed") === s); });
    }

    // over-cap flow: a modal with choice -> rpc | sdk. The connection link jumps
    // straight to rpc; the disabled-looking cap CTA opens the choice.
    function openCap(view) {
      $("#ci2_cap_size").text($("#ci2_size").text());
      ["choice", "rpc", "sdk"].forEach((v) => $("#ci2_cap_" + v).toggleClass("hide", v !== view));
      if (view === "rpc") markSpeed(); // the speed chips live in the rpc view
      $("#ci2_cap_modal").removeClass("hide");
    }

    function applyRpc() {
      const url = ($("#ci2_rpc").val() || "").trim();
      if (!url) return;
      window.iqCodein.setRpc(url);
      $("#ci2_rpc_link").text("connection: custom RPC");
      $("#ci2_cap_modal").addClass("hide");
      refreshCost();
    }

    function openCompose() {
      $("#ci2_modal").removeClass("hide");
      $("#ci2_compose").removeClass("hide"); $("#ci2_progress").addClass("hide"); $("#ci2_done").addClass("hide");
      $("#ci2_win").text("code_in.exe");
      refreshCost();
    }
    function closeModal() { $("#ci2_modal").addClass("hide"); }

    async function doInscribe() {
      if (!who) { await connect(); if (!who) return; }
      const pay = currentPayload();
      if (!pay.body) return;
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: pay.kind, body: pay.body, who })).length;
      if (bytes / 1024 > CAP_KB && !window.iqCodein.hasOwnRpc()) { openCap("choice"); return; }

      $("#ci2_compose").addClass("hide"); $("#ci2_progress").removeClass("hide");
      $("#ci2_win").text("writing...");
      $("#ci2_retry").addClass("hide"); $("#ci2_log").text("");
      setBar(0, "starting");

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
        const manual = window.iqCodein.getSpeed();
        const speed = manual !== "auto" ? manual : window.iqCodein.recommendSpeed(window.iqCodein.hasOwnRpc());
        const res = await window.iqCodein.inscribe({
          connection, wallet, burner, kind: pay.kind, body: pay.body, speed,
          onProgress: (pct) => setBar(pct, "writing " + pct + "%"),
          onRetry: (n) => setBar(0, "network congestion - retrying (" + (n + 1) + "/2)"),
        });
        $("#ci2_progress").addClass("hide"); $("#ci2_done").removeClass("hide");
        $("#ci2_win").text("done.exe");
        $("#ci2_sig").text("sig: " + res.sig.slice(0, 12) + "..." + res.sig.slice(-8));
        await window.iqCodein.notify(res.sig, { kind: pay.kind, body: pay.body, who });
        loadBoard();
      } catch (e) {
        // Never show "failed": refund the burner to the wallet and say so.
        // When even the refund can't land, the funds still sit in the burner
        // and the next retry reuses them, so nothing is ever lost.
        $("#ci2_pct").text("paused - tap retry");
        $("#ci2_retry").removeClass("hide");
        let note = "";
        try {
          const back = burner ? await window.iqCodein.sweep(window.iqCodein.connect(), burner, provider.publicKey) : 0;
          if (back > 0) note = "your ~" + (back / 1e9).toFixed(4) + " SOL went back to your wallet - retry will re-fund it. ";
        } catch (_) { /* refund could not land; funds stay in the burner */ }
        if (!note) note = "your SOL is safe in your session account and is reused when you retry - nothing is lost. ";
        $("#ci2_log").text("the network was congested and this write did not finish. " + note + "(" + String((e && e.message) || e) + ")");
        console.error("[code-in] inscribe paused:", e, (e && e.logs) || "");
      }
    }

    function setBar(pct, label) { $("#ci2_bar").css("width", pct + "%"); $("#ci2_pct").text(label); }

    $.extend(this, { init });
  }

  $.code_in_v2 = new CodeInV2();
})(jQuery);
