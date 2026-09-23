// Code-In v2 page module. Loads html/sections/code_in_v2.html into #main_section
// and drives it through window.iqCodein - either the solana adapter
// (js/codein/browser.js, ?menu=codein, Model B burner) or the EVM adapter
// (js/codein/evm.js, ?menu=hoodin on Robinhood Chain, Model A: the user's
// wallet signs every tx sequentially, no burner). One UI, two chains.
(function ($) {
  $.extend(true, window, { code_in_v2: CodeInV2 });

  const CAP_KB = 256; // solana: mainnet-measured on the default free RPC (publicnode): 32-512KB all landed with 0 rpc errors; 256KB ~51s is the wait we accept, above it recommend own RPC / SDK

  function CodeInV2() {
    const templateUrl = "./html/sections/code_in_v2.html?ver=31";
    let chain = "solana";  // "solana" | "evm" - set by init from the route
    const isEvm = () => chain === "evm";
    let bigAck = false;    // hoodin: user accepted the many-signatures flow
    let provider = null;   // phantom injected provider (solana only)
    let who = null;        // user pubkey (base58) / evm address
    let burner = null;     // derived once per session (solana only)
    let tab = "feed";
    let kind = "text";     // active compose kind: text | ascii | image | file
    let asciiSrc = "";     // last image data URL, re-rendered when detail changes
    let asciiBody = "";    // ascii result (the inscribed body for kind=ascii)
    let uploadBody = "";   // base64 data URL for kind=image | file
    let currentSig = "";   // post shown in the view modal, for the share link
    let boardCursor = null; // gateway nextCursor for pagination
    let boardLoading = false; // guard so scroll + button don't double-fetch a page
    let boardGen = 0;      // load generation; a fresh load supersedes in-flight ones

    function init(post, chainName) {
      chain = chainName === "evm" ? "evm" : "solana";
      who = null; burner = null; bigAck = false; // route switch = fresh wallet state
      $.ajax({ url: templateUrl, dataType: "html", type: "get", global: false, success: (html) => {
        $("#main_section").show().empty().append($(html));
        ready(() => { wire(); if (post) openPost(post); });
      }});
    }

    // Picks the route's adapter into window.iqCodein. The solana one loads with
    // the page (browser.js); the EVM one is imported on demand so codein users
    // never download ethers, mirroring iq-chan's family split.
    function ready(cb) {
      const chains = () => window.iqCodeinChains || {};
      if (isEvm()) {
        if (chains().evm) { window.iqCodein = chains().evm; cb(); return; }
        // import() in a classic script resolves against THIS script's URL, so
        // anchor the specifier to the document instead.
        import(new URL("js/codein/evm.js?v=1", document.baseURI).href)
          .then(() => { window.iqCodein = chains().evm; cb(); })
          .catch((e) => { console.error("[hood-in] adapter load failed:", e); $("#ci2_empty").text("could not load the robinhood module. refresh to retry."); });
        return;
      }
      const useSolana = () => { if (chains().solana) window.iqCodein = chains().solana; cb(); };
      if (window.iqCodein) useSolana();
      else window.addEventListener("iqcodein:ready", useSolana, { once: true });
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
      $("#ci2_ascii_size, #ci2_ascii_dist").on("input", reAscii);
      $("#ci2_image_file").on("change", onImageFile);
      $("#ci2_file_file").on("change", onFileFile);
      $("#ci2_view_close, #ci2_view_dot").on("click", () => $("#ci2_view_modal").addClass("hide"));
      $("#ci2_view_x").on("click", shareToX);
      // solana explains the chunk format first (help modal); blockscout decodes
      // EVM calldata fine, so hood jumps straight to the explorer.
      $("#ci2_view_scan").on("click", () => isEvm() ? openScan() : $("#ci2_help_modal").removeClass("hide"));
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
      if (isEvm()) applyHoodTheme();
      if (window.iqCodein.hasOwnRpc()) $("#ci2_rpc_link").text("connection: custom RPC");
      refreshCost();
      loadBoard();
    }

    // Same template, hood skin: swap the theme tokens (CSS class) and the
    // solana-specific copy. Everything structural stays shared.
    function applyHoodTheme() {
      const M = window.iqCodein.meta;
      $("#ci2").addClass("hood");
      $("#ci2_board_title").text(M.boardTitle);
      $("#ci2_win").text("hood_in.exe");
      $("#ci2_chunks_label").text("txs (each = 1 wallet signature)");
      $("#ci2_total_label").text("on-chain fee (est)");
      $("#ci2_rpc_link").text(M.connLabel);
      $("#ci2_view_scan").text(M.scanLabel);
      $("#ci2_overcap").html("over the " + M.maxSigs + " signature budget. <u>use the SDK / CLI</u>, or continue and sign each tx.");
      $("#ci2_cap_choice > p").text("this inscription needs more than " + M.maxSigs + " wallet signatures. the SDK / CLI is the steady path; you can also continue and approve each tx.");
      $("#ci2_cap_pick_rpc").addClass("hide"); // rpc does not lift the cap on evm (the wallet broadcasts)
      $("#ci2_cap_continue").removeClass("hide").on("click", () => {
        bigAck = true;
        $("#ci2_cap_modal").addClass("hide");
        refreshCost();
        doInscribe();
      });
    }

    async function connect() {
      if (isEvm()) {
        try { who = await window.iqCodein.connectWallet(); }
        catch (e) { alert(String((e && e.message) || e)); return; }
      } else {
        if (!provider) { alert("No Solana wallet found. Install Phantom."); return; }
        const res = await provider.connect();
        who = (res?.publicKey || provider.publicKey).toString();
      }
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
        ? "my inventory = your inscriptions, newest first"
        : "feed = the global board, newest first. click a post to view or share.");
      loadBoard();
    }

    // before = a page cursor (from the scroll or LOAD MORE); omit it for a fresh
    // load, which clears the grid. A fresh load supersedes any in-flight one
    // (generation token), so tab switches never get silently dropped; only
    // pagination stays serialized. Late responses from an older load are thrown
    // away instead of rendered into the wrong tab.
    async function loadBoard(before) {
      if (before && (boardLoading || !boardCursor)) return;
      const gen = ++boardGen;
      boardLoading = true;
      const grid = $("#ci2_grid");
      if (!before) {
        grid.empty(); boardCursor = null;
        $("#ci2_more").addClass("hide");
        $("#ci2_empty").text("loading...").removeClass("hide");
      }
      try {
        if (tab === "mine" && !who) { $("#ci2_empty").text("connect to see yours."); return; }
        // MY INVENTORY = the wallet-derived inventory PDA index. Burner-signed
        // posts land there too, since the code-in touches the user's PDA.
        let rows = [], cursor = null;
        if (tab === "mine") {
          let res = { rows: [] };
          try { res = await window.iqCodein.readMine(who, 50); } catch (e) { /* leave empty */ }
          rows = res.rows || [];
        } else {
          let res = { rows: [], nextCursor: null };
          try { res = await window.iqCodein.readBoard(24, before || null); } catch (e) { /* leave empty */ }
          rows = res.rows || [];
          cursor = res.nextCursor;
        }
        if (gen !== boardGen) return; // superseded mid-flight
        rows.forEach((it) => {
          const obj = it.row || it;
          const sig = obj.__txSignature || it.__txSignature || it.signature || "";
          const owner = String(obj.who || "");
          const who2 = owner ? owner.slice(0, 4) + "..." + owner.slice(-4) : "";
          const card = $('<div class="rec"><div class="th"></div><div class="m"><span class="tag">' + (obj.kind || "text") + '</span> <span class="ago">' + relTime(obj.__blockTime) + '</span><div class="own">' + who2 + "</div></div></div>");
          renderThumb(card.find(".th"), obj);
          if (sig) card.css("cursor", "pointer").on("click", () => openPost(sig, obj));
          grid.append(card);
        });
        boardCursor = cursor;
        if (grid.children().length) $("#ci2_empty").addClass("hide");
        else $("#ci2_empty").text(tab === "mine" ? "no inscriptions from this wallet yet." : "nothing here yet.").removeClass("hide");
        $("#ci2_more").toggleClass("hide", !boardCursor);
      } finally { if (gen === boardGen) boardLoading = false; }
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

    // ID3v2 metadata (title / artist / cover art) parsed client-side from the
    // audio's own bytes. Tags render via .text() and cover art becomes a Blob
    // URL gated to image/* mimes, so uploaded content still never runs as script.
    // Filename embedded in the data URL by withName() at upload time.
    function fileNameOf(body) {
      const m = /^data:[^,]*;name=([^;,]*)/.exec(body);
      try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; }
    }

    const id3Cache = new Map(); // key -> {title, artist, album, coverUrl} | null
    function id3Of(key, body) {
      if (id3Cache.has(key)) return id3Cache.get(key);
      let meta = null;
      try { meta = parseId3(body); } catch (e) { meta = null; }
      id3Cache.set(key, meta);
      return meta;
    }
    function parseId3(body) {
      const at = body.indexOf("base64,");
      if (at < 0) return null;
      const b64 = body.slice(at + 7);
      const head = Uint8Array.from(atob(b64.slice(0, 16)), c => c.charCodeAt(0));
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null; // "ID3"
      const ver = head[3];
      if (ver < 3 || ver > 4) return null;
      const tagSize = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
      const total = Math.min(tagSize + 10, Math.floor(b64.length * 3 / 4));
      const d = Uint8Array.from(atob(b64.slice(0, Math.ceil(total / 3) * 4)), c => c.charCodeAt(0));
      let p = 10;
      if (head[5] & 0x40) { // skip extended header
        p += ver === 4
          ? ((d[p] << 21) | (d[p + 1] << 14) | (d[p + 2] << 7) | d[p + 3])
          : 4 + ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]);
      }
      const out = {};
      while (p + 10 <= d.length) {
        if (d[p] === 0) break; // hit padding
        const id = String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]);
        const sz = ver === 4
          ? ((d[p + 4] << 21) | (d[p + 5] << 14) | (d[p + 6] << 7) | d[p + 7])
          : ((d[p + 4] << 24) | (d[p + 5] << 16) | (d[p + 6] << 8) | d[p + 7]);
        const start = p + 10, end = start + sz;
        if (sz <= 0 || end > d.length) break;
        if (id === "TIT2" || id === "TPE1" || id === "TALB") {
          const enc = d[start];
          const label = enc === 1 ? "utf-16" : enc === 2 ? "utf-16be" : enc === 3 ? "utf-8" : "windows-1252";
          let text = "";
          try { text = new TextDecoder(label).decode(d.subarray(start + 1, end)); } catch (e) { /* leave empty */ }
          text = text.replace(/\0+$/, "").replace(/^\0+/, "").trim();
          if (id === "TIT2") out.title = text;
          else if (id === "TPE1") out.artist = text;
          else out.album = text;
        } else if (id === "APIC" && !out.coverUrl) {
          const enc = d[start];
          let q = start + 1;
          while (q < end && d[q] !== 0) q++;
          const mime = String.fromCharCode.apply(null, d.subarray(start + 1, q));
          q += 2; // null terminator + picture type byte
          if (enc === 1 || enc === 2) { while (q + 1 < end && (d[q] !== 0 || d[q + 1] !== 0)) q += 2; q += 2; }
          else { while (q < end && d[q] !== 0) q++; q += 1; }
          if (mime.slice(0, 6) === "image/" && q < end)
            out.coverUrl = URL.createObjectURL(new Blob([d.subarray(q, end)], { type: mime }));
        }
        p = end;
      }
      return (out.title || out.artist || out.coverUrl) ? out : null;
    }

    // Render by the data-URL mime, not the kind, so an mp3 uploaded via FILE
    // still shows an audio thumb. Only images/audio render inline (safe, no
    // script execution); other files show a tag and download in the viewer.
    function renderThumb($th, obj) {
      const body = String(obj.body || "");
      $th.removeClass("txt art");
      if (body.slice(0, 11) === "data:image/") { $th.html($("<img>").attr("src", body)); return; }
      if (body.slice(0, 11) === "data:audio/") {
        const meta = id3Of(obj.__txSignature || body.length + body.slice(-24), body);
        if (meta) {
          const $tr = $("<div>").addClass("track");
          if (meta.coverUrl) $tr.append($("<img>").attr("src", meta.coverUrl));
          // ID3 title wins; the embedded filename is the fallback label
          $tr.append($("<div>").addClass("tt")
            .append($("<div>").addClass("t1").text("|> " + (meta.title || fileNameOf(body) || "mp3")))
            .append($("<div>").addClass("t2").text(meta.artist || "")));
          $th.html($tr);
        } else $th.text("|> " + (fileNameOf(body) || "mp3"));
        return;
      }
      if (obj.kind === "file") {
        const name = fileNameOf(body);
        const sub = /^data:\w+\/([\w.+-]+)/.exec(body);
        $th.addClass("txt").text(name ? "[ " + name + " ]"
          : (sub && sub[1] !== "octet-stream" ? "[ file: " + sub[1] + " ]" : "[ file ]"));
        return;
      }
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
      else if (body.slice(0, 11) === "data:audio/") {
        const meta = id3Of(sig, body) || {};
        const $w = $("<div>").addClass("vtrack");
        if (meta.coverUrl) $w.append($("<img>").attr("src", meta.coverUrl));
        const label = meta.title || fileNameOf(body); // ID3 title wins, then filename
        if (label) $w.append($("<div>").addClass("t1").text(label));
        if (meta.artist || meta.album) $w.append($("<div>").addClass("t2").text([meta.artist, meta.album].filter(Boolean).join("  ·  ")));
        $b.html($w.append($("<audio>").attr({ src: body, controls: true })));
      }
      else if (obj.kind === "file") {
        const name = fileNameOf(body);
        const $w = $("<div>").css("text-align", "center");
        if (name) $w.append($("<div>").addClass("muted").css("margin-bottom", "8px").text(name));
        $b.html($w.append($("<a>").attr({ href: body, download: name || "codein-file" }).addClass("btn").text("DOWNLOAD FILE")));
      }
      else {
        // green record body, matching the design viewer; ascii keeps pre, text wraps
        const $pre = $("<pre>").addClass("vpre").text(body);
        if (obj.kind === "ascii") $pre.css({ fontSize: "7px", lineHeight: "1" });
        else $pre.css({ whiteSpace: "pre-wrap", wordBreak: "break-word" });
        $b.html($pre);
      }
    }

    // Share the site's direct record link; opening it loads the board + viewer.
    function shareToX() {
      if (!currentSig) return;
      const text = "my inscription, on-chain forever via @IQLabsOfficial " + (isEvm() ? "hood-in on @RobinhoodChain" : "code-in");
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
      // Same knobs and ranges as the Art Generator (font 5-50, distance -50-50).
      const fontSize = Math.min(50, Math.max(5, parseInt($("#ci2_ascii_size").val(), 10) || 8));
      const density = Math.min(50, Math.max(-50, parseInt($("#ci2_ascii_dist").val(), 10) || -2));
      try { asciiBody = await window.iqCodein.toAscii(asciiSrc, fontSize, density); $("#ci2_ascii_out").text(asciiBody); }
      catch (e) { $("#ci2_ascii_out").text("could not read that image."); }
      refreshCost();
    }
    // The inscription stores only a data URL, so the picked file's name is kept
    // inside it as an RFC 2397 parameter (data:<mime>;name=<urlencoded>;base64,)
    // and read back for display and download. Old posts without it show mime only.
    function withName(dataUrl, name) {
      const at = dataUrl.indexOf(";base64,");
      if (at < 0 || !name) return dataUrl;
      return dataUrl.slice(0, at) + ";name=" + encodeURIComponent(name) + dataUrl.slice(at);
    }
    function readUpload(file, done) {
      const r = new FileReader();
      r.onload = () => { uploadBody = withName(r.result, file.name); done(); refreshCost(); };
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

    // solana caps on payload KB (public-RPC write limit, lifted by a user RPC);
    // hood caps on the wallet-popup count (25 signatures, opt-out via continue).
    function overCapNow(bytes) {
      if (isEvm()) return window.iqCodein.estimateCost(bytes).sigs > window.iqCodein.meta.maxSigs && !bigAck;
      return bytes / 1024 > CAP_KB && !window.iqCodein.hasOwnRpc();
    }

    function refreshCost() {
      const pay = currentPayload();
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: pay.kind, body: pay.body, who: who || "" })).length;
      const est = window.iqCodein.estimateCost(bytes, { firstTime: !burner });
      $("#ci2_size").text((bytes / 1024).toFixed(1) + " KB");
      $("#ci2_chunks").text(isEvm() ? "x " + est.sigs : "x " + est.chunks);
      $("#ci2_total").text(isEvm() ? est.totalLabel : (est.total / 1e9).toFixed(4) + " SOL");
      const overCap = overCapNow(bytes);
      $("#ci2_overcap").toggleClass("hide", !overCap);
      // Over cap the button stays clickable but becomes the CTA into the cap
      // modal (doInscribe routes it there); disable only when there's nothing to write.
      $("#ci2_go").prop("disabled", !pay.body)
        .text(overCap
          ? (isEvm() ? "OVER " + window.iqCodein.meta.maxSigs + " SIGNATURES - SDK OR CONTINUE" : "OVER 256KB - ADD RPC OR USE SDK")
          : (isEvm() ? "INSCRIBE / " + est.sigs + " SIGNATURES" : "FUND + INSCRIBE / 1 SIGNATURE"));
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
      $("#ci2_win").text(isEvm() ? "hood_in.exe" : "code_in.exe");
      refreshCost();
    }
    function closeModal() { $("#ci2_modal").addClass("hide"); }

    async function doInscribe() {
      if (!who) { await connect(); if (!who) return; }
      const pay = currentPayload();
      if (!pay.body) return;
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: pay.kind, body: pay.body, who })).length;
      if (overCapNow(bytes)) { openCap("choice"); return; }

      $("#ci2_compose").addClass("hide"); $("#ci2_progress").removeClass("hide");
      $("#ci2_win").text("writing...");
      $("#ci2_retry").addClass("hide"); $("#ci2_log").text("");
      setBar(0, "starting");

      try {
        let res;
        if (isEvm()) {
          // Model A: the wallet signs each tx of the linked list in order.
          // Batches sign sequentially, so the signature counter derives from
          // the batch progress the SDK reports.
          const est = window.iqCodein.estimateCost(bytes);
          setBar(0, "signature 1/" + est.sigs + " - approve in your wallet");
          res = await window.iqCodein.inscribe({
            kind: pay.kind, body: pay.body, who,
            onProgress: (pct) => {
              const batchesDone = Math.round((pct / 100) * est.chunks);
              setBar(pct, "signature " + Math.min(est.sigs, batchesDone + 1) + "/" + est.sigs + " - writing " + pct + "%");
            },
          });
        } else {
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
          res = await window.iqCodein.inscribe({
            connection, wallet, burner, kind: pay.kind, body: pay.body, speed,
            onProgress: (pct) => setBar(pct, "writing " + pct + "%"),
            onRetry: (n) => setBar(0, "network congestion - retrying (" + (n + 1) + "/2)"),
          });
        }
        $("#ci2_progress").addClass("hide"); $("#ci2_done").removeClass("hide");
        $("#ci2_win").text("done.exe");
        $("#ci2_sig").text((isEvm() ? "tx: " : "sig: ") + res.sig.slice(0, 12) + "..." + res.sig.slice(-8));
        if (isEvm()) $("#ci2_donenote").text("// the storage fee charges once, at the final step. every tx before it is gas only.");
        await window.iqCodein.notify(res.sig, { kind: pay.kind, body: pay.body, who });
        loadBoard();
      } catch (e) {
        // Never show "failed". solana: refund the burner to the wallet and say
        // so; when even the refund can't land, the funds sit in the burner and
        // the next retry reuses them. evm: the storage fee only charges at the
        // final tx, so an aborted upload cost gas pennies at most.
        $("#ci2_pct").text("paused - tap retry");
        $("#ci2_retry").removeClass("hide");
        const msg = String((e && e.message) || e);
        let note = "";
        if (isEvm()) {
          note = /user rejected|denied|4001/i.test(msg)
            ? "you canceled the signature in your wallet - tap retry when ready. "
            : "nothing but tiny gas was spent (the storage fee only charges at the final tx). retry starts a fresh write. ";
        } else {
          try {
            const back = burner ? await window.iqCodein.sweep(window.iqCodein.connect(), burner, provider.publicKey) : 0;
            if (back > 0) note = "your ~" + (back / 1e9).toFixed(4) + " SOL went back to your wallet - retry will re-fund it. ";
          } catch (_) { /* refund could not land; funds stay in the burner */ }
          if (!note) note = "your SOL is safe in your session account and is reused when you retry - nothing is lost. ";
        }
        // Blame congestion only when the error looks like congestion; anything
        // else is shown as what it is so a code bug can't hide behind "network".
        const congested = /block height|expired|429|rate.?limit|congest|timed? ?out|simulation/i.test(msg);
        const head = /user rejected|denied|4001/i.test(msg) ? ""
          : congested ? "the network was congested and this write did not finish. "
          : "this write stopped on an unexpected error. ";
        $("#ci2_log").text(head + note + (head ? "(" + msg + ")" : ""));
        console.error("[code-in] inscribe paused:", e, (e && e.logs) || "");
      }
    }

    function setBar(pct, label) { $("#ci2_bar").css("width", pct + "%"); $("#ci2_pct").text(label); }

    $.extend(this, { init });
  }

  $.code_in_v2 = new CodeInV2();
})(jQuery);
