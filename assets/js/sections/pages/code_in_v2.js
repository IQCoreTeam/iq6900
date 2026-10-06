// Code-In v2 page module. Loads html/sections/code_in_v2.html into #main_section
// and drives it through window.iqCodein - either the solana adapter
// (js/codein/browser.js, ?menu=codein, Model B burner) or the EVM adapter
// (js/codein/evm.js, ?menu=hoodin on Robinhood Chain, hybrid burner upload
// with wallet finalization). One UI, two chains.
(function ($) {
  $.extend(true, window, { code_in_v2: CodeInV2 });

  const CAP_KB = 256; // solana: mainnet-measured on the default free RPC (publicnode): 32-512KB all landed with 0 rpc errors; 256KB ~51s is the wait we accept, above it recommend own RPC / SDK

  function CodeInV2() {
    const templateUrl = "./html/sections/code_in_v2.html?ver=65";
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

    function init(post, chainName, opts) {
      chain = chainName === "evm" ? "evm" : "solana";
      who = null; burner = null; bigAck = false; // route switch = fresh wallet state
      // Keep the route in the URL so refreshing stays on this board instead of
      // falling back to the home page (stack cards call init() directly).
      try {
        const menu = isEvm() ? "hoodin" : "codein";
        const url = new URL(window.location.href);
        if (url.searchParams.get("menu") !== menu) {
          url.searchParams.set("menu", menu);
          url.searchParams.delete("post");
          if (post) url.searchParams.set("post", post);
          history.pushState({ menu }, "", url);
        }
      } catch (e) {}
      $.ajax({ url: templateUrl, dataType: "html", type: "get", global: false, success: (html) => {
        $("#main_section").show().empty().append($(html));
        ready(() => { wire(); if (post) openPost(post); if (opts && opts.maketoken) tkOpen(); });
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
        import(new URL("js/codein/evm.js?v=14", document.baseURI).href)
          .then(() => { window.iqCodein = chains().evm; cb(); })
          .catch((e) => { console.error("[hood-in] adapter load failed:", e); $("#ci2_empty").text("could not load the robinhood module. refresh to retry."); });
        return;
      }
      const useSolana = () => { if (chains().solana) window.iqCodein = chains().solana; cb(); };
      if (window.iqCodein) useSolana();
      else window.addEventListener("iqcodein:ready", useSolana, { once: true });
    }

    function wire() {
      // provider is resolved lazily in connect() (resolveSolanaProvider): Brave
      // grabs the generic window.solana slot early and can delay Phantom's inject,
      // so resolving once here would miss a late Phantom / mispick Brave's wallet.
      $("#ci2_connect").on("click", connect);
      $("#ci2_home_dot").on("click", () => { window.location.href = window.location.pathname; });
      // Cross-chain hop (design: header "ROBINHOOD? -> /HOODIN" / "SOLANA? -> /CODEIN").
      // init() re-renders the template, updates ?menu= and resets timers/wallet state.
      $("#ci2_xchain").text(isEvm() ? "SOLANA? → /CODEIN" : "ROBINHOOD? → /HOODIN")
        .on("click", () => init(null, isEvm() ? null : "evm"));
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
      $("#ci2_view_copy").on("click", copyLink);
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
      // chart.exe modal, opened from a markets.exe row (launch button is wired
      // in startMarkets, which also gates it coming-soon on hood).
      $("#ci2_chart_close, #ci2_chart_dot").on("click", () => $("#ci2_chart_modal").addClass("hide"));
      $("#ci2_chart_copy").on("click", copyChartMint);
      $("#ci2_tk_close").on("click", () => $("#ci2_tk_modal").addClass("hide"));
      $("#ci2_tk_continue").on("click", tkContinue);
      $("#ci2_tk_makenew").on("click", tkMakeNew);
      $("#ci2_tk_repick").on("click", () => tkShowPicker());
      $("#ci2_tk_pickimg").on("click", () => tkShowPicker("image"));
      // Fill WEBSITE with the current source's on-chain viewer link (pinned to
      // the live domain, same as the launch metadata), so the user does not
      // have to open the board and copy it. Hood-only control.
      $("#ci2_tk_onchainlink_btn").on("click", () => {
        if (!tkSrcSig) return;
        $("#ci2_tk_web").val("https://iqlabs.dev/" + new URL(window.iqCodein.viewUrl(tkSrcSig)).search);
      });
      $("#ci2_launch_after").on("click", () => {
        if (!lastInscribed) return;
        closeModal();
        tkOpen({ sig: lastInscribed.sig, body: lastInscribed.body });
      });
      $("#ci2_tk_name, #ci2_tk_symbol").on("input", tkValidate);
      $("#ci2_tk_buy").on("input", () => { $("#ci2_tk_buyshow").text((parseFloat($("#ci2_tk_buy").val()) || 0) + " SOL"); });
      $("#ci2_tk_go").on("click", doLaunch);
      $("#ci2_tk_retry").on("click", doLaunch);
      $("#ci2_tk_rw_hood").on("change", "input[type=radio]", () => {
        $("#ci2_tk_cr_fields").toggleClass("hide", $("input[name=ci2rw_hood]:checked").val() !== "creator");
        paintPicks();
      });
      $("#ci2_tk_reg_retry").on("click", tkRetryRegistry);
      if (isEvm()) applyHoodTheme();
      if (window.iqCodein.hasOwnRpc()) $("#ci2_rpc_link").text("connection: custom RPC");
      refreshCost();
      loadBoard();
      startMarkets();
    }

    // Same template, hood skin: swap the theme tokens (CSS class) and the
    // solana-specific copy. Everything structural stays shared.
    function applyHoodTheme() {
      const M = window.iqCodein.meta;
      $("#ci2").addClass("hood");
      $("#ci2_board_title").text(M.boardTitle);
      $("#ci2_page_title").text("// HOOD IN");
      $("#ci2_mk_powered").attr({ href: "https://www.ponsfamily.com", title: "token launches powered by Pons" });
      $("#ci2_mk_powered img").attr({ src: "img/pons.webp", alt: "Pons" });
      $("#ci2_prog_title").text("// WRITING TO ROBINHOOD CHAIN - keep this tab open");
      $("#ci2_win").text("hood_in.exe");
      $("#ci2_chunks_label").text("txs (each = 1 wallet signature)");
      $("#ci2_total_label").text("on-chain fee (est)");
      $("#ci2_rpc_link").text(M.connLabel);
      $("#ci2_view_scan").text(M.scanLabel);
      $("#ci2_overcap").html("over the " + M.maxSigs + " signature budget. <span style='color:#8fffb0'>easiest fix: shrink the image (convert to WebP)</span> - <u>click here for how</u>, or use the SDK / continue and sign each tx.");
      $("#ci2_cap_choice > p").text("this inscription needs more than " + M.maxSigs + " wallet signatures. shrinking the file is the easy way out; the SDK / CLI is the steady path, and you can also continue and approve each tx.");
      $("#ci2_cap_pick_rpc").addClass("hide"); // rpc does not lift the cap on evm (the wallet broadcasts)
      $("#ci2_cap_continue").removeClass("hide").on("click", () => {
        bigAck = true;
        $("#ci2_cap_modal").addClass("hide");
        refreshCost();
        doInscribe();
      });
    }

    // Resolve a Solana wallet at click time. Prefer Phantom/Backpack's own
    // handles (Brave never creates window.phantom, so window.phantom.solana is
    // always the real Phantom) over whoever claimed the generic window.solana,
    // and wait briefly for a late injection (Brave delays it).
    async function resolveSolanaProvider() {
      const pick = () => window.phantom?.solana || window.backpack || window.solana || null;
      let p = pick();
      for (let i = 0; !p && i < 20; i++) { await new Promise((r) => setTimeout(r, 100)); p = pick(); }
      return p;
    }

    async function connect() {
      if (isEvm()) {
        try { who = await window.iqCodein.connectWallet(); }
        catch (e) { alert(String((e && e.message) || e)); return; }
        // Preflight the wallet-side RPC before any signature is requested; a
        // dead saved RPC for chain 4663 fails every send with -32603.
        window.iqCodein.checkWalletRpc().then((h) => {
          if (h.ok) { $("#ci2_rpcwarn").addClass("hide"); return; }
          $("#ci2_rpcwarn").removeClass("hide").text(
            "warning: the Robinhood Chain RPC saved in your wallet is " + h.reason +
            ", so writes will fail before anything is spent. open your wallet network settings for chain 4663 and set the RPC to https://rpc.mainnet.chain.robinhood.com, then reconnect.");
        });
      } else {
        provider = await resolveSolanaProvider();
        if (!provider) { alert("No Solana wallet found. Install Phantom or Backpack.\n\nBrave users: open brave://settings/wallet and set Default cryptocurrency wallet to \"Extensions (no fallback)\" so your extension wallet is detected."); return; }
        const res = await provider.connect();
        who = (res?.publicKey || provider.publicKey).toString();
      }
      // ci2_who starts hidden (no meaningless "not connected"); reveal it with
      // the short address once a wallet is actually connected. On mobile the
      // media query keeps it hidden to save the narrow header's width.
      $("#ci2_who").text(who.slice(0, 4) + "..." + who.slice(-4)).removeClass("hide");
      // +NEW INSCRIPTION takes the connect button's place once connected.
      $("#ci2_connect").addClass("hide");
      $("#ci2_new").removeClass("hide");
      loadBoard();
    }

    function switchTab(t) {
      tab = t;
      $("#ci2_tab_feed").toggleClass("on", t === "feed");
      $("#ci2_tab_mine").toggleClass("on", t === "mine");
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
          // The gateway's POST /notify warms only a fixed set of head-page
          // limits ([50,100,20,10,5]); a just-inscribed post is prepended into
          // those cache keys so it lists in seconds. Read the feed at one of
          // them (20) so a fresh inscription shows immediately instead of
          // waiting ~30-60s for the limit's own cache to refresh. (24 was off
          // that list, which is why new posts - audio/files especially - lagged.)
          try { res = await window.iqCodein.readBoard(20, before || null); } catch (e) { /* leave empty */ }
          rows = res.rows || [];
          cursor = res.nextCursor;
        }
        if (gen !== boardGen) return; // superseded mid-flight
        rows.forEach((it) => {
          const obj = it.row || it;
          // launch registry rows (kind "token") are the on-chain index the
          // markets.exe list reads; they are not inscriptions, so they never
          // show as cards on the board itself.
          if (obj.kind === "token") return;
          const sig = obj.__txSignature || it.__txSignature || it.signature || "";
          const owner = String(obj.who || "");
          const who2 = owner ? owner.slice(0, 4) + "..." + owner.slice(-4) : "";
          const card = $('<div class="rec"><div class="th"></div><div class="m"><span class="tag"></span> <span class="ago"></span><div class="own"></div></div></div>');
          card.find(".tag").text(String(obj.kind || "text"));
          card.find(".ago").text(relTime(obj.__blockTime));
          card.find(".own").text(who2);
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
      if (obj.kind === "token") { // launched coin card: symbol + name instead of raw registry json
        let t = {}; try { t = JSON.parse(body) || {}; } catch (e) {}
        $th.addClass("txt").text("$" + (t.symbol || "?") + "  " + (t.name || "") + "\n[ launched on pump.fun ]");
        return;
      }
      $th.addClass("txt").text(body.slice(0, 140)); // text wraps within the fixed-height box
    }

    // preloaded = the row we already have from a board card (avoids a re-fetch);
    // omitted for share links, where we only have the sig.
    async function openPost(sig, preloaded) {
      currentSig = sig;
      $("#ci2_view_modal").removeClass("hide");
      $("#ci2_view_meta").text("loading...");
      $("#ci2_view_body").empty();
      $("#ci2_view_file_notice").addClass("hide");
      let obj = preloaded || null;
      if (!obj) { try { obj = await window.iqCodein.readOne(sig); } catch (e) { /* handled below */ } }
      if (!obj) { $("#ci2_view_meta").text("could not load this post. set your own RPC and retry."); return; }
      const owner = String(obj.who || "");
      $("#ci2_view_meta").text("sig: " + sig.slice(0, 8) + "..." + sig.slice(-6) + "  ·  owner: " + (owner ? owner.slice(0, 4) + "..." + owner.slice(-4) : "unknown") + "  ·  " + (obj.kind || "text"));
      const body = String(obj.body || "");
      $("#ci2_view_file_notice").toggleClass("hide", obj.kind !== "file");
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
      else if (obj.kind === "file" && body.startsWith("data:")) {
        const name = fileNameOf(body);
        const $w = $("<div>").css("text-align", "center");
        if (name) $w.append($("<div>").addClass("muted").css("margin-bottom", "8px").text(name));
        $b.html($w.append($("<a>").attr({ href: body, download: name || "codein-file" }).addClass("btn").text("DOWNLOAD FILE")));
      }
      else if (obj.kind === "token") {
        // a launch registry row: show the coin, not the raw json
        let t = {}; try { t = JSON.parse(body) || {}; } catch (e) {}
        $b.html($("<div>").css("text-align", "center")
          .append($("<div>").css({ font: "500 16px 'Kode Mono',monospace", color: "var(--hi)" }).text("$" + (t.symbol || "?") + "  " + (t.name || "")))
          .append($("<p>").addClass("muted").css({ margin: "8px 0 14px", wordBreak: "break-all" }).text(t.mint || ""))
          .append($("<div>").css({ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" })
            .append($("<a>").addClass("btn").attr({ href: window.iqCodein.market.tradeUrl(t.mint), target: "_blank", rel: "noopener" }).css("text-decoration", "none").text(window.iqCodein.market.tradeLabel))
            .append($("<button>").addClass("btn ghost").text("OPEN CHART").on("click", () => { $("#ci2_view_modal").addClass("hide"); openChart(t.mint, t); }))));
      }
      else {
        // green record body, matching the design viewer; ascii keeps pre, text wraps
        const $pre = $("<pre>").addClass("vpre").text(body);
        if (obj.kind === "ascii") $pre.css({ fontSize: "7px", lineHeight: "1" });
        else $pre.css({ whiteSpace: "pre-wrap", wordBreak: "break-word" });
        $b.html($pre);
      }
      // an on-chain image, text or ascii post can become a pump.fun token in
      // one click (solana only); text/ascii get the gateway card render. Only
      // the owner may tokenize their own post - on someone else's, the button
      // is hidden, so you can only launch what you inscribed.
      const mine = !!who && owner === who;
      const canTokenize = mine && tkUsable(obj.kind, body);
      $("#ci2_view_token").toggleClass("hide", !canTokenize).off("click");
      if (canTokenize) $("#ci2_view_token").on("click", () => {
        $("#ci2_view_modal").addClass("hide");
        tkOpen({ sig: sig, body: body });
      });
    }

    // Share the site's direct record link; opening it loads the board + viewer.
    function shareToX() {
      if (!currentSig) return;
      const text = "my inscription, on-chain forever via @IQLabsOfficial " + (isEvm() ? "hood-in on @RobinhoodApp" : "code-in");
      const url = window.iqCodein.viewUrl(currentSig);
      window.open("https://x.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url), "_blank");
    }
    // Copy the site viewer link (not the explorer link) so a post can be shared
    // as plain text anywhere, not just to X. Brief "COPIED" confirms it landed.
    function copyLink() {
      if (!currentSig) return;
      const url = window.iqCodein.viewUrl(currentSig);
      const $b = $("#ci2_view_copy"), prev = $b.text();
      const ok = () => { $b.text("COPIED"); setTimeout(() => $b.text(prev), 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => prompt("copy this link:", url));
      else prompt("copy this link:", url);
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
      const est = window.iqCodein.estimateCost(bytes);
      $("#ci2_size").text((bytes / 1024).toFixed(1) + " KB");
      $("#ci2_chunks").text(isEvm() ? "x " + est.sigs : "x " + est.chunks);
      $("#ci2_total").text(isEvm() ? est.totalLabel : (est.total / 1e9).toFixed(4) + " SOL");
      const overCap = overCapNow(bytes);
      $("#ci2_overcap").toggleClass("hide", !overCap);
      // Over cap the button stays clickable but becomes the CTA into the cap
      // modal (doInscribe routes it there); disable only when there's nothing to write.
      $("#ci2_go").prop("disabled", !pay.body)
        .text(overCap
          ? (isEvm() ? "OVER " + window.iqCodein.meta.maxSigs + " SIGNATURES - SHRINK IT, SDK OR CONTINUE" : "OVER 256KB - SHRINK THE IMAGE, RPC OR SDK")
          : (isEvm() ? "INSCRIBE / " + est.sigs + " SIGNATURES" : "FUND + INSCRIBE / 1 SIGNATURE"));
    }

    function openBigFile() {
      if (!isEvm()) markSpeed(); // the speed setting (and its adapter api) is solana-only
      // the guide's shared steps (shrink, showcase) stay; the intro, sdk link
      // and transport advice swap per chain
      $("#ci2_big_modal .bigsol").toggleClass("hide", isEvm());
      $("#ci2_big_modal .bighood").toggleClass("hide", !isEvm());
      $("#ci2_big_modal").removeClass("hide");
    }
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
        const res = await inscribeRaw({ kind: pay.kind, body: pay.body, onPct: setBar });
        $("#ci2_progress").addClass("hide"); $("#ci2_done").removeClass("hide");
        $("#ci2_win").text("done.exe");
        $("#ci2_sig").text((isEvm() ? "tx: " : "sig: ") + res.sig.slice(0, 12) + "..." + res.sig.slice(-8));
        // a fresh image/text/ascii inscription can go straight into the launcher
        lastInscribed = { body: pay.body, sig: res.sig };
        const canLaunch = tkUsable(pay.kind, pay.body);
        $("#ci2_launch_after").toggleClass("hide", !canLaunch);
        $("#ci2_view").toggleClass("ghost", canLaunch); // LAUNCH is the primary when present
        if (isEvm()) $("#ci2_donenote").text("// the storage fee charges once, at the final step. every tx before it is gas only.");
        // Fire-and-forget: warming the durable index can take ~15s on robinhood
        // (uncached cold-walk), and the done screen is already up, so do not
        // block the board refresh on it. The launcher's inventory read benefits
        // from the warm even though the board reloads immediately.
        Promise.resolve(window.iqCodein.notify(res.sig, { kind: pay.kind, body: pay.body, who })).catch(() => {});
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
            : /oversized|too large|exceeds|-32603|could not coalesce|Unexpected error/i.test(msg)
            ? "your wallet could not broadcast one of these transactions. this is usually a transient network hiccup, so retry, which re-signs only what did not land. if it keeps failing on a large file, the steady path is the SDK / CLI. nothing was spent. "
            : "nothing but tiny gas was spent (the storage fee only charges at the final tx). retry resumes from where it stopped - chunks already on chain are never re-signed. ";
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
          : /insufficient funds for rent/i.test(msg)
          ? "the write's fee cushion ran dry (congested retries each park a little rent). retry re-funds it and continues. "
          : congested ? "the network was congested and this write did not finish. "
          : "this write stopped on an unexpected error. ";
        $("#ci2_log").text(head + note + (head ? "(" + msg + ")" : ""));
        console.error("[code-in] inscribe paused:", e, (e && e.logs) || "");
      }
    }

    function setBar(pct, label) { $("#ci2_bar").css("width", pct + "%"); $("#ci2_pct").text(label); }

    // The burner is derived once per session from one wallet signature and
    // shared by inscriptions and token registry writes.
    async function ensureBurner() {
      if (burner) return burner;
      const signMessage = async (msg) => {
        const out = await provider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
        return out.signature || out;
      };
      burner = await window.iqCodein.deriveBurner(signMessage);
      return burner;
    }

    // Write one {kind, body} payload through the active adapter and return its
    // result ({sig}). The single place that builds the per-chain inscribe call,
    // shared by the compose flow and the launcher's album-art write. onPct is
    // called with (percent, label) across both chains.
    async function inscribeRaw({ kind, body, onPct }) {
      if (isEvm()) {
        return window.iqCodein.inscribe({ kind, body, who, onStatus: (pct, label) => onPct && onPct(pct, label) });
      }
      await ensureBurner();
      const wallet = { publicKey: provider.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
      const connection = window.iqCodein.connect();
      const manual = window.iqCodein.getSpeed();
      const speed = manual !== "auto" ? manual : window.iqCodein.recommendSpeed(window.iqCodein.hasOwnRpc());
      return window.iqCodein.inscribe({
        connection, wallet, burner, kind, body, speed,
        onProgress: (pct) => onPct && onPct(pct, "writing " + pct + "%"),
        onRetry: (n) => onPct && onPct(0, "network congestion - retrying (" + (n + 1) + "/2)"),
      });
    }

    // ---- make it as token (pump.fun launcher) ----
    // Seller flow: step 1 picks an inscription from the user's inventory
    // (empty inventory routes to the compose modal, whose done panel loops
    // back here); step 2 is the launch form. A coin from this board always
    // starts as an on-chain inscription: the source sig is all the launch
    // needs, since the gateway derives the coin metadata (and the image, via
    // /render/{sig}) from the registry row. No uploads, no IPFS.
    let tkSrcSig = "";       // the inscription behind the coin (the back-link)
    let tkSrcBody = "";      // its body, for the local preview only
    let tkImgSig = "";       // a separate image inscription used as the coin logo
    let tkImgBody = "";      // its body, for the local preview only
    let tkArtData = "";      // album art pulled from an audio source, inscribed at launch
    let tkPicked = null;     // picker candidate before CONTINUE
    let tkMetaSig = "";      // metadata inscription tx, kept across retries
    let tkMetaRw = "";       // rewards mode baked into that metadata (mismatch = re-inscribe)
    let tkLast = null;       // last successful launch, for the registry retry
    let lastInscribed = null;// last inscription, for the done-panel loop back

    // File/audio inscriptions are valid token SOURCES (the back-link). Registry rows are not.
    const tkUsable = (kind, body) =>
      ["image", "text", "ascii", "file"].includes(kind) && String(body || "").length > 0;
    const bodyIsImage = (body) => String(body || "").slice(0, 11) === "data:image/";
    // The coin LOGO is derived from the source: an image is its own logo (raw
    // bytes at /img), text and ascii become the terminal card at /render. Audio
    // and non-image files have no sensible card (/render would draw their raw
    // base64 as garbage), so they need a separate image inscription as the logo.
    // The picker records the source kind so the classifier works even when the
    // body is plain text (text/ascii carry no data: prefix).
    let tkSrcKind = "";
    const srcNeedsImage = (kind, body) =>
      !bodyIsImage(body) && (kind === "file" || String(body || "").slice(0, 11) === "data:audio/");
    // The coin logo url for the active adapter, or "" when a separate image pick
    // is still required (audio / non-image file with nothing chosen yet).
    const coinImageUrl = () => {
      if (bodyIsImage(tkSrcBody)) return window.iqCodein.imgUrl(tkSrcSig);
      if (srcNeedsImage(tkSrcKind, tkSrcBody)) return tkImgSig ? window.iqCodein.imgUrl(tkImgSig) : "";
      return window.iqCodein.renderUrl(tkSrcSig); // text / ascii -> terminal card
    };
    // Infer the kind for a prefill source (viewer button / fresh inscription /
    // done-loop) which carries only {sig, body}. Any non-image data: payload is
    // a file (audio included), so it routes to the image-pick path.
    const kindFromBody = (b) => {
      const s = String(b || "");
      if (s.slice(0, 11) === "data:image/") return "image";
      if (s.slice(0, 5) === "data:") return "file";
      return "text";
    };
    // A fresh source selection drops any logo image chosen for a previous one,
    // then (for audio) tries to pull the track's embedded cover.
    const tkSetSource = (sig, body, kind) => {
      tkSrcSig = sig; tkSrcBody = body || ""; tkSrcKind = kind || kindFromBody(body);
      tkImgSig = ""; tkImgBody = "";
      tkArtData = tkSrcBody.slice(0, 11) === "data:audio/" ? extractAlbumArt(tkSrcBody) : "";
    };

    // Pull an embedded cover (ID3v2 APIC, or the v2.2 PIC frame) out of an audio
    // data url. Returns an image data url, or "" when the track carries no art.
    // Pure byte parse, no deps; the tag sits at the file start so it is cheap.
    function extractAlbumArt(dataUrl) {
      try {
        const s = String(dataUrl || "");
        if (s.slice(0, 11) !== "data:audio/") return "";
        const bin = atob(s.slice(s.indexOf(",") + 1));
        const n = bin.length;
        const B = (i) => bin.charCodeAt(i) & 0xff;
        if (n < 10 || bin.slice(0, 3) !== "ID3") return "";
        const ver = B(3);
        const end = Math.min(n, 10 + (((B(6) << 21) | (B(7) << 14) | (B(8) << 7) | B(9)))); // synchsafe tag size
        const out = (mime, img) => img.length ? "data:" + mime + ";base64," + btoa(img) : "";
        const mimeOf = (m) => /png/i.test(m) ? "image/png" : /gif/i.test(m) ? "image/gif" : /webp/i.test(m) ? "image/webp" : "image/jpeg";
        let p = 10;
        if (ver === 2) { // v2.2: 3-byte id, 3-byte size; PIC = encoding(1) + 3-char fmt + type(1) + desc\0 + data
          while (p + 6 <= end) {
            const size = (B(p + 3) << 16) | (B(p + 4) << 8) | B(p + 5);
            if (size <= 0) break;
            const body = p + 6;
            if (bin.slice(p, p + 3) === "PIC") {
              let q = body + 1 + 3 + 1;
              while (q < body + size && B(q) !== 0) q++;
              return out(mimeOf(bin.slice(body + 1, body + 4)), bin.slice(q + 1, body + size));
            }
            p = body + size;
          }
          return "";
        }
        // v2.3 / v2.4: 4-byte id, 4-byte size (v2.4 synchsafe), 2-byte flags
        const u32 = (i) => (B(i) << 24) | (B(i + 1) << 16) | (B(i + 2) << 8) | B(i + 3);
        const syn = (i) => (B(i) << 21) | (B(i + 1) << 14) | (B(i + 2) << 7) | B(i + 3);
        while (p + 10 <= end) {
          const size = ver === 4 ? syn(p + 4) : u32(p + 4);
          if (size <= 0) break;
          const body = p + 10;
          if (bin.slice(p, p + 4) === "APIC") {
            const enc = B(body);
            let q = body + 1, mime = "";
            while (q < body + size && B(q) !== 0) { mime += String.fromCharCode(B(q)); q++; }
            q += 1 + 1; // mime terminator + picture type
            if (enc === 1 || enc === 2) { while (q + 1 < body + size && !(B(q) === 0 && B(q + 1) === 0)) q += 2; q += 2; }
            else { while (q < body + size && B(q) !== 0) q++; q += 1; }
            return out(mimeOf(mime), bin.slice(q, body + size));
          }
          p = body + size;
        }
        return "";
      } catch (e) { return ""; }
    }

    // Validation gate: a coin image is ready if the source resolves to one
    // synchronously, or audio art is staged to be inscribed at launch.
    const coinImageReady = () => !!coinImageUrl() || (srcNeedsImage(tkSrcKind, tkSrcBody) && !!tkArtData);

    // The launch-time resolver: returns a logo url, inscribing the staged album
    // art as its own small image first when that is the chosen source. The sig
    // is cached in tkImgSig so a RETRY never writes the art twice.
    async function resolveCoinLogo(onPct) {
      const sync = coinImageUrl();
      if (sync) return sync;
      if (srcNeedsImage(tkSrcKind, tkSrcBody) && tkArtData) {
        const res = await inscribeRaw({ kind: "image", body: tkArtData, onPct });
        tkImgSig = res.sig; tkImgBody = tkArtData;
        // Index the album-art inscription so its own viewer link loads (the
        // compose flow notifies every write; this launch-time write must too,
        // or /slice returns empty for it and the post shows "could not load").
        Promise.resolve(window.iqCodein.notify(res.sig, { kind: "image", body: tkArtData, who })).catch(() => {});
        return window.iqCodein.imgUrl(res.sig);
      }
      return "";
    }

    // One place for every launcher string that differs between the two
    // launchpads (pump.fun on solana, pons on robinhood); runs on open so the
    // same modal serves both boards.
    // Light up whichever pick card (hood rewards + buyback) holds a checked
    // radio. CSS :has() covers modern browsers; this .on class is the fallback.
    function paintPicks() {
      $("#ci2_tk_rw_hood .tk_pick").each(function () {
        $(this).toggleClass("on", !!$(this).find("input").prop("checked"));
      });
    }

    function tkChainCopy() {
      const hood = isEvm();
      $("#ci2_tk_buyrow, #ci2_tk_buymeter, #ci2_tk_rw_sol").toggleClass("hide", hood);
      $("#ci2_tk_rw_hood").toggleClass("hide", !hood);
      // the on-chain-link helper is pons-only: pump.fun renders website fine, so
      // solana needs no hint or button (solana form stays unchanged).
      $("#ci2_tk_onchainlink").toggleClass("hide", !hood);
      // fresh open: reset the hood advanced panel to its defaults (holders take
      // no cut, no creator fields, buyback on), then repaint the pick cards.
      $("input[name=ci2rw_hood][value=holders]").prop("checked", true);
      $("input[name=ci2bb_hood][value=on]").prop("checked", true);
      $("#ci2_tk_cr_fields").addClass("hide");
      paintPicks();
      $("#ci2_tk_noinv_txt").text(hood
        ? "your inventory is empty. inscribe an image or text on hood-in first (a fresh post can take a few minutes to index), then launch it as a token."
        : "your inventory is empty. put your image or text on solana first, then launch it as a token.");
      $("#ci2_tk_feelbl").text(hood ? "pons launch fee" : "platform fee");
      $("#ci2_tk_feeshow").text(hood ? "0.0005 ETH" : "0.069 SOL");
      $("#ci2_tk_feenote").text(hood
        ? "the launch fee goes to pons inside the create transaction itself: if the launch does not land, nothing is paid. recording it on the board later is a separate optional step."
        : "the fee rides inside the create transaction itself: if the launch does not land, nothing is paid. pump.fun trading fees apply to the dev buy.");
      $("#ci2_tk_permnote").text(hood
        ? "permanence: name, symbol, description and the logo url are stored on-chain in the pons launch itself, and the logo url path is your inscription's tx hash. even if this site ever disappears, everything reassembles from chain with the IQ SDK."
        : "permanence: the coin metadata is ITSELF inscribed on solana first (~0.001 SOL), and the token's uri path is that inscription's tx. even if this site ever disappears, everything reassembles from chain with the IQ SDK.");
      $("#ci2_tk_go").text(hood ? "LAUNCH ON PONS" : "INSCRIBE METADATA + LAUNCH ON PUMP.FUN");
      $("#ci2_tk_proghead").text("// LAUNCHING ON " + (hood ? "PONS" : "PUMP.FUN") + " - keep this tab open");
      $("#ci2_tk_pump").text(hood ? "VIEW ON PONS" : "VIEW ON PUMP.FUN");
      $("#ci2_tk_chart").toggleClass("hide", hood); // the chart modal opens with hood markets
    }

    function tkOpen(prefill) {
      $("#ci2_tk_modal").removeClass("hide");
      $("#ci2_tk_prog").addClass("hide"); $("#ci2_tk_done").addClass("hide");
      $("#ci2_tk_win").text("token_launch.exe");
      tkChainCopy();
      tkMetaSig = ""; // a fresh flow gets fresh metadata (retry keeps it)
      if (prefill && prefill.sig) {
        // arriving from a specific post (viewer button or a fresh inscription):
        // the source is already chosen, skip the picker
        tkSetSource(prefill.sig, prefill.body, prefill.kind);
        tkShowForm();
      } else {
        tkShowPicker();
      }
    }

    // One picker serves two jobs: mode "source" chooses the inscription behind
    // the coin (image/text/ascii/audio/file), mode "image" chooses an image
    // inscription to use as the coin logo (needed when the source is audio or a
    // non-image file, which have no sensible card render).
    async function tkShowPicker(mode) {
      mode = mode === "image" ? "image" : "source";
      $("#ci2_tk_form").addClass("hide");
      $("#ci2_tk_pick").removeClass("hide");
      $("#ci2_tk_inv").empty();
      $("#ci2_tk_noinv, #ci2_tk_onlyimg").addClass("hide");
      // the source step keeps its CONTINUE button; the image step is single-click
      $("#ci2_tk_continue").toggleClass("hide", mode === "image");
      $("#ci2_tk_makenew").toggleClass("hide", mode === "image");
      $("#ci2_tk_pick_step").text(mode === "image" ? "// PICK A COIN IMAGE" : "// STEP 1 OF 2 - PICK YOUR INSCRIPTION");
      $("#ci2_tk_inv_load").removeClass("hide").text("loading your inventory...");
      tkPicked = null;
      $("#ci2_tk_continue").prop("disabled", true).text("PICK AN INSCRIPTION TO CONTINUE");
      if (!who) { await connect(); if (!who) { $("#ci2_tk_inv_load").text("connect your wallet to see your inventory."); return; } }
      let rows = [];
      try { rows = ((await window.iqCodein.readMine(who, 50)) || {}).rows || []; } catch (e) {}
      $("#ci2_tk_inv_load").addClass("hide");
      const $inv = $("#ci2_tk_inv");
      let usable = 0;
      rows.forEach((it) => {
        const obj = it.row || it;
        const body = String(obj.body || "");
        const sig = obj.__txSignature || it.__txSignature || "";
        const kind = obj.kind || "text";
        // token rows are launched-coin registry entries, not a source you can
        // coin - hide them from the picker on both chains (the board already
        // filters them out of the feed/inventory views).
        if (kind === "token") return;
        const isImg = bodyIsImage(body);
        const $th = $('<div class="th"></div>');
        // Same rich thumb the board uses: album art + ID3 title/artist for
        // audio, filename for files, cover image for images, etc. (one source).
        renderThumb($th, obj);
        const card = $('<div class="rec"></div>').append($th)
          .append($('<div class="m"></div>').append($('<span class="tag"></span>').text(kind)));
        // image mode only lights up image inscriptions; source mode lights up any usable source
        const selectable = sig && (mode === "image" ? isImg : tkUsable(kind, body));
        if (selectable) {
          usable++;
          card.on("click", () => {
            if (mode === "image") { tkImgSig = sig; tkImgBody = body; tkShowForm(); return; }
            tkPicked = { body, sig, kind };
            $("#ci2_tk_inv .rec").removeClass("picked");
            card.addClass("picked");
            $("#ci2_tk_continue").prop("disabled", false)
              .text("CONTINUE WITH " + (isImg ? (fileNameOf(body) || "THIS IMAGE") : "THIS " + kind.toUpperCase() + (kind === "file" ? "" : " CARD")));
          });
        } else card.addClass("dim");
        $inv.append(card);
      });
      if (!usable) {
        $("#ci2_tk_noinv").removeClass("hide");
        $("#ci2_tk_noinv_txt").text(mode === "image"
          ? "you have no image inscriptions yet. inscribe an image first, then come back to pick it as the coin image."
          : $("#ci2_tk_noinv_txt").text());
      } else {
        $("#ci2_tk_onlyimg").removeClass("hide").text(mode === "image"
          ? "only image inscriptions can be a coin image. pick one."
          : "image, text, ascii, audio and file inscriptions are selectable. token registry entries are excluded.");
      }
    }

    function tkContinue() {
      if (!tkPicked) return;
      tkSetSource(tkPicked.sig, tkPicked.body, tkPicked.kind);
      tkShowForm();
    }

    // Empty inventory (or the wish for a fresh image) routes into the normal
    // compose modal on the IMAGE tab; its done panel loops back into launch.
    function tkMakeNew() {
      $("#ci2_tk_modal").addClass("hide");
      openCompose();
      selectKind("image");
    }

    function tkShowForm() {
      $("#ci2_tk_pick").addClass("hide");
      $("#ci2_tk_form").removeClass("hide");
      const needsImg = srcNeedsImage(tkSrcKind, tkSrcBody);
      // the staged album art is the default coin image for an audio source until
      // the user picks a different image inscription
      const usingArt = needsImg && !tkImgSig && !!tkArtData;
      // Preview: image source shows its own bytes; audio/file shows the picked
      // image, else the track's album art, else a prompt; text/ascii shows the
      // gateway card that becomes the coin image.
      let preview;
      if (bodyIsImage(tkSrcBody)) preview = tkSrcBody;
      else if (needsImg) preview = tkImgBody || tkArtData || "";
      else preview = window.iqCodein.renderUrl(tkSrcSig);
      $("#ci2_tk_prev").html(preview ? $("<img>").attr("src", preview) : "");
      // audio/file get an explicit coin-image control; the back-link still
      // points at the audio/file source either way.
      $("#ci2_tk_pickimg").toggleClass("hide", !needsImg)
        .text(tkImgSig || tkArtData ? "choose a different image" : "choose a coin image");
      if (usingArt) {
        $("#ci2_tk_src").text("coin image from the track's album art - it is inscribed on-chain as a small image when you launch. the coin page links back to your audio " + tkSrcSig.slice(0, 8) + "...");
      } else if (needsImg && !tkImgSig) {
        const lead = tkSrcBody.slice(0, 11) === "data:audio/" ? "this track has no embedded cover. " : "this file has no image. ";
        $("#ci2_tk_src").text(lead + "pick an image inscription as the coin image. the coin page still links back to " + tkSrcSig.slice(0, 8) + "...");
      } else {
        $("#ci2_tk_src").text("coin image from your inscription " + (needsImg ? tkImgSig : tkSrcSig).slice(0, 8) + "... - the coin page links back to the on-chain original.");
      }
      tkValidate();
    }

    function tkValidate() {
      const ok = ($("#ci2_tk_name").val() || "").trim() && ($("#ci2_tk_symbol").val() || "").trim()
        && tkSrcSig && coinImageReady();
      $("#ci2_tk_go").prop("disabled", !ok);
    }

    function setTkBar(pct, label) { $("#ci2_tk_bar").css("width", pct + "%"); $("#ci2_tk_pct").text(label); }

    async function doLaunch() {
      if (!who) { await connect(); if (!who) return; }
      const name = ($("#ci2_tk_name").val() || "").trim();
      const symbol = ($("#ci2_tk_symbol").val() || "").trim().toUpperCase();
      if (!name || !symbol || !tkSrcSig) return;

      $("#ci2_tk_form").addClass("hide"); $("#ci2_tk_prog").removeClass("hide");
      $("#ci2_tk_retry").addClass("hide"); $("#ci2_tk_log").text("");
      $("#ci2_tk_win").text("launching...");
      const hood = isEvm();
      const steps = hood
        ? ["reading launch terms from chain", "approve the transaction in your wallet", "confirming on robinhood chain"]
        : ["inscribing coin metadata on solana", "building the create transaction", "approve the transaction in your wallet", "confirming on solana"];
      setTkBar(5, steps[0]);

      // Recovery pointers ride in the description on both chains. Solana adds
      // a metadata inscription (the coin's uri path IS its tx); pons needs no
      // extra write, because name, symbol, description and logo are stored
      // on-chain in the launch itself and the logo url path IS the src tx.
      // On-chain links are immutable and public, so they must point at the live
      // site, not wherever the launcher runs: a localhost test would otherwise
      // bake a dead localhost URL into the coin's description/website forever.
      // The in-app copy-link button stays origin-relative; only this launch
      // metadata is pinned to the production domain. The adapter's viewUrl
      // owns the route params on both chains, so reuse its query string.
      const viewLink = "https://iqlabs.dev/" + new URL(window.iqCodein.viewUrl(tkSrcSig)).search;
      const userDesc = ($("#ci2_tk_desc").val() || "").trim().slice(0, 300);
      const x = ($("#ci2_tk_x").val() || "").trim();
      const web = ($("#ci2_tk_web").val() || "").trim() || viewLink;
      // The coin image: an image inscription IS its own token image (raw bytes
      // the gateway reconstructs at /img/{sig}.png); text and ascii become the
      // terminal card at /render/{sig}; audio and non-image files use a chosen
      // image inscription. When the source is audio with embedded album art and
      // nothing else was picked, that art is inscribed now as its own small
      // image (an extra on-chain write) and its /img becomes the logo. The sig
      // is cached so a RETRY never writes it twice.
      let image;
      if (!coinImageUrl() && tkArtData) setTkBar(2, "inscribing the coin image from the track art");
      try {
        image = await resolveCoinLogo((pct, label) =>
          setTkBar(2 + Math.round((pct || 0) * 0.08), label || ("inscribing the coin image " + (pct || 0) + "%")));
      } catch (e) {
        $("#ci2_tk_retry").removeClass("hide"); $("#ci2_tk_form").removeClass("hide"); $("#ci2_tk_prog").addClass("hide");
        $("#ci2_tk_log").text("could not inscribe the coin image from the track's art. retry, or choose an image instead. (" + String((e && e.message) || e) + ")");
        return;
      }
      if (!image) { $("#ci2_tk_log").text("choose a coin image first."); $("#ci2_tk_form").removeClass("hide"); $("#ci2_tk_prog").addClass("hide"); return; }
      setTkBar(10, steps[0]);
      // The recovery pointers are already on chain in the launch itself, not
      // just in this prose: socials.website below is the viewer link, and the
      // logo url path IS the src inscription tx. Solana's pump.fun page renders
      // a long description fine, so it keeps the full pointer prose.
      const fullRecovery = (userDesc ? userDesc + "\n\n" : "")
        + "on-chain original: " + viewLink
        + "\ninscription tx: " + tkSrcSig
        + "\nthis metadata is itself inscribed on solana (the uri path is its tx). if this page ever dies, everything reassembles from chain with the IQ SDK (@iqlabs-official/solana-sdk).";
      // Pons renders a coin's description ONLY when it is <=256 chars AND
      // contains NO url (measured live: every short description with an
      // http(s) link renders blank, every url-free one renders). So hood
      // strips urls from the text and never appends the viewer link here - the
      // link-back still lives on chain in socials.website + the logo tx path,
      // it just cannot ride in the description prose.
      const PONS_DESC_MAX = 256;
      const stripUrls = (s) => s.replace(/https?:\/\/\S+/gi, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      const ponsTag = "\n\nfully on-chain, reassembles via the IQ SDK";
      const cleanUser = stripUrls(userDesc);
      const hoodDesc = (cleanUser
        ? (cleanUser.length + ponsTag.length <= PONS_DESC_MAX ? cleanUser + ponsTag : cleanUser.slice(0, PONS_DESC_MAX))
        : "fully on-chain, reassembles via the IQ SDK").slice(0, PONS_DESC_MAX);
      const description = hood ? hoodDesc : fullRecovery;

      // Warm the gateway image cache now. A cold /img (or /render) reassembles
      // the inscription from chain over RPC (~25s), far longer than an
      // indexer's image-fetch timeout, so without this the coin shows no
      // image: pump.fun (and the pons site alike) gives up, caches the miss,
      // and never refetches. Firing it here (fire-and-forget) uses the whole
      // launch window so Cloudflare has a warm HIT before the first fetch.
      try { fetch(image, { mode: "no-cors" }); } catch (e) {}

      try {
        let out; // { mint, sig } on both chains; on hood, mint holds the erc20 address
        if (hood) {
          if (!window.iqPonsLaunch) await import(new URL("js/codein/pons_launch.js?v=2", document.baseURI).href);
          // Advanced options, all defaulted: HOLDERS takes no creator cut;
          // CREATOR sets a 0-10% tax to a chosen wallet (blank = the launching
          // wallet). The buyback toggle is independent. Pons stores these on
          // chain at launch.
          const creator = $("input[name=ci2rw_hood]:checked").val() === "creator";
          const crWallet = ($("#ci2_tk_crwallet").val() || "").trim();
          const res = await window.iqPonsLaunch.launch({
            signer: window.iqCodein.signer, name, symbol,
            logo: image, description,
            socials: { twitter: x, website: web },
            buybackEnabled: $("input[name=ci2bb_hood]:checked").val() === "on",
            creatorTaxBps: creator ? Math.round((parseFloat($("#ci2_tk_crfee").val()) || 0) * 100) : 0,
            creatorFeeRecipient: creator && /^0x[0-9a-fA-F]{40}$/.test(crWallet) ? crWallet : undefined,
            onStep: (label) => { const i = steps.indexOf(label); if (i >= 0) setTkBar(10 + i * 30, label); },
          });
          out = { mint: res.token, sig: res.txHash };
          tkLast = { mint: out.mint, name, symbol, src: tkSrcSig, launchSig: out.sig };
        } else {
          const rewards = $("input[name=ci2rw]:checked").val() === "creator" ? "creator" : "holders";
          const metaJson = { name: name, symbol: symbol, description: description,
            image: image, external_url: viewLink, website: web, showName: true };
          if (x) metaJson.twitter = x;
          // The same pointers again as standard Metaplex attributes: explorers
          // and wallets render these as clean key/value chips (prose in the
          // description loses its line breaks on most surfaces), and indexers
          // get the recovery coordinates machine-readable.
          metaJson.attributes = [
            { trait_type: "inscription tx", value: tkSrcSig },
            { trait_type: "inscription kind", value:
              bodyIsImage(tkSrcBody) ? "image"
              : tkSrcBody.slice(0, 11) === "data:audio/" ? "audio"
              : tkSrcKind === "file" ? "file" : "text" },
            { trait_type: "rewards", value: rewards === "creator" ? "creator" : "token holders" },
            { trait_type: "storage", value: "fully on-chain (solana code-in)" },
            { trait_type: "program", value: "9KLLchQVJpGkw4jPuUmnvqESdR7mtNCYr3qS4iQLabs" },
            { trait_type: "feed", value: "iq6900-codein-feed-v1 / global-feed" },
          ];
          metaJson.properties = { category: "image",
            files: [{ uri: image, type: "image/png" }] };
          // Step 1: inscribe the metadata JSON (reused on retry so a failed
          // create never pays for a second metadata write; switching the
          // rewards mode invalidates it so the attribute matches the coin).
          if (tkMetaSig && tkMetaRw !== rewards) tkMetaSig = "";
          if (!tkMetaSig) {
            await ensureBurner();
            const wallet = { publicKey: provider.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
            const res = await window.iqCodein.inscribeMeta({
              connection: window.iqCodein.connect(), wallet, burner, json: JSON.stringify(metaJson),
            });
            tkMetaSig = res.sig;
            tkMetaRw = rewards;
          }
          // Warm the metadata endpoint too: pump.fun fetches this uri to read
          // the coin's name/symbol/image, and a cold /token-meta reassembles
          // from chain (~25s) past pump's fetch timeout. Firing it now (the
          // create + confirm window follows) gives Cloudflare a hot HIT.
          try { fetch(window.iqCodein.metaUrl(tkMetaSig), { mode: "no-cors" }); } catch (e) {}
          setTkBar(30, steps[1]);
          out = await window.iqTokenLaunch.launch({
            provider, name, symbol,
            uri: window.iqCodein.metaUrl(tkMetaSig),
            devBuySol: parseFloat($("#ci2_tk_buy").val()) || 0,
            rewards: rewards,
            onStep: (label) => setTkBar(30 + steps.indexOf(label) * 22, label),
          });
          tkLast = { mint: out.mint, name, symbol, src: tkSrcSig, meta: tkMetaSig, launchSig: out.sig };
          tkMetaSig = ""; // consumed; the next launch inscribes fresh metadata
        }
        // The board-index write is part of the launch, not a post-step: its
        // signatures happen now, on the progress bar, so LAUNCHED only shows
        // once every signature (create + listing) has landed. The coin exists
        // regardless, so a listing failure still falls through to the done panel
        // (with a retry) rather than looking like the launch failed.
        setTkBar(96, "listing on the board - approve in your wallet");
        const listed = await tkRegistryWrite();
        setTkBar(100, "launched");
        $("#ci2_tk_prog").addClass("hide"); $("#ci2_tk_done").removeClass("hide");
        $("#ci2_tk_win").text("done.exe");
        $("#ci2_tk_mint").text((hood ? "token: " : "mint: ") + out.mint);
        $("#ci2_tk_pump").attr("href", hood
          ? "https://www.ponsfamily.com/launchpad/" + out.mint
          : "https://pump.fun/coin/" + out.mint);
        $("#ci2_tk_chart").off("click").on("click", () => { $("#ci2_tk_modal").addClass("hide"); openChart(out.mint, { symbol: symbol, name: name, src: tkSrcSig }); });
        tkShowRegistryResult(listed);
      } catch (e) {
        const msg = String((e && e.message) || e);
        $("#ci2_tk_pct").text("paused - tap retry");
        $("#ci2_tk_retry").removeClass("hide");
        $("#ci2_tk_log").text(/user rejected|denied|4001/i.test(msg)
          ? "you canceled the signature in your wallet. nothing was spent - tap retry when ready."
          : "the launch stopped before completing. nothing is charged unless the create transaction lands. (" + msg + ")");
        console.error("[make-token] launch paused:", e);
      }
    }

    // Writes the registry row - what puts the coin in markets.exe; its src field
    // is the on-chain mint -> inscription mapping (the metadata description
    // carries the same recovery pointer on chain) - and warms the gateway feed
    // index via notify so it lists in seconds instead of on the next cold read.
    // Pure: returns true if it landed, false otherwise. The coin already exists
    // either way, so callers never treat false as a launch failure.
    async function tkRegistryWrite() {
      if (!tkLast) return true;
      try {
        const body = JSON.stringify({ mint: tkLast.mint, name: tkLast.name, symbol: tkLast.symbol, src: tkLast.src, meta: tkLast.meta });
        let res;
        if (isEvm()) {
          // A tiny inline row - board-only via the wallet (no burner, no
          // inventory finalize), so it lists fast without extra machinery.
          res = await window.iqCodein.inscribeBoard({ kind: "token", body, who });
        } else {
          await ensureBurner();
          const wallet = { publicKey: provider.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
          res = await window.iqCodein.inscribe({ connection: window.iqCodein.connect(), wallet, burner, kind: "token", body, speed: "light" });
        }
        await window.iqCodein.notify(res.sig, { kind: "token", body, who });
        loadMarkets();
        return true;
      } catch (e) {
        console.error("[make-token] registry write failed:", e);
        return false;
      }
    }

    // Renders the registry outcome on the done panel - single source for both
    // the inline launch path and the manual retry button.
    function tkShowRegistryResult(ok) {
      $("#ci2_tk_regnote").text(ok
        ? "// launched and listed. it appears in markets.exe within a minute."
        : "// your token exists, but indexing it failed - it will not show in markets.exe until this lands.");
      $("#ci2_tk_reg_retry")[ok ? "addClass" : "removeClass"]("hide");
    }

    // Manual retry from the done panel (the reg_retry button).
    async function tkRetryRegistry() {
      $("#ci2_tk_regnote").text("// writing the launch to the board...");
      $("#ci2_tk_reg_retry").addClass("hide");
      tkShowRegistryResult(await tkRegistryWrite());
    }

    // ---- markets.exe (the desk's right panel) ----
    // Both chains use the adapter's shared market source, sorted by market cap
    // and refreshed every 30s. Each row supplies its chart and attribution.
    const MK_PAGES = 8;       // 8 x 50 feed rows covers the young board
    const MK_MS = 30000;      // price refresh
    const MK_FEED_TICKS = 5;  // re-read the feed every 5th price tick
    let mkTokens = [];
    let mkCurrent = null;     // coin shown in the chart modal
    let mkTimer = null;
    let mkTick = 0;

    function startMarkets() {
      if (mkTimer) { clearInterval(mkTimer); mkTimer = null; } // a prior page's timer must not tick into this DOM
      $("#ci2_mk_launch").on("click", () => tkOpen());
      // DexScreener is primary; GeckoTerminal fills missing curve-stage coins.
      // A coin stays "new" only while neither source provides a price.
      loadMarkets();
      mkTimer = setInterval(onMarketTick, MK_MS);
    }

    async function onMarketTick() {
      if (!document.getElementById("ci2")) { clearInterval(mkTimer); mkTimer = null; return; }
      mkTick++;
      if (mkTick % MK_FEED_TICKS === 0) await readMarketTokens();
      await enrichMarkets();
      renderMarkets();
    }

    async function loadMarkets() {
      mkTokens = []; mkTick = 0;
      await readMarketTokens();
      await enrichMarkets();
      renderMarkets();
    }

    async function readMarketTokens() {
      const next = [];
      let cursor = null;
      try {
        for (let p = 0; p < MK_PAGES; p++) {
          const res = await window.iqCodein.readBoard(50, cursor);
          (res.rows || []).forEach((it) => {
            const obj = it.row || it;
            if (obj.kind !== "token") return;
            const sig = obj.__txSignature || it.__txSignature || "";
            let t = null; try { t = JSON.parse(String(obj.body || "")); } catch (e) { return; }
            if (!t || !t.mint || next.some((x) => x.mint === t.mint)) return;
            const old = mkTokens.find((x) => x.mint === t.mint); // keep the enriched pair we already have
            next.push(old || { mint: t.mint, name: t.name || "", symbol: t.symbol || "", sig: sig, src: t.src || "", meta: t.meta || "" });
          });
          cursor = res.nextCursor;
          if (!cursor) break;
        }
        mkTokens = next;
      } catch (e) { /* keep whatever we had */ }
    }

    async function enrichMarkets() {
      // A new coin already has an on-chain image even before DexScreener
      // supplies one. Resolve each launch metadata in the background, never
      // blocking the render: /token-meta and /img both reassemble from chain,
      // which is ~25s cold (then cached), far past any patient inline await. So
      // fire the fetches in parallel, warm the image url the moment we learn it
      // (so the <img> and pump.fun both find a hot cache), and re-render when it
      // lands. imageChecked guards against a stampede; a failure clears it so
      // the next tick retries.
      const gwOrigin = new URL(window.iqCodein.imgUrl("x")).origin; // the adapter owns the gateway url
      mkTokens.forEach((t) => {
        if (!t.meta || t.imageChecked) return;
        t.imageChecked = true;
        fetch(window.iqCodein.metaUrl(t.meta), { signal: AbortSignal.timeout(30000) })
          .then((res) => (res.ok ? res.json() : null))
          .then((meta) => {
            if (!meta || typeof meta.image !== "string" || !/^https?:\/\//i.test(meta.image)) return;
            const url = new URL(meta.image);
            // Old /img responses containing JSON may linger in CDN caches.
            if (url.origin === gwOrigin && url.pathname.startsWith("/img/")) url.searchParams.set("v", "2");
            t.image = url.href;
            try { fetch(t.image, { mode: "no-cors" }); } catch (e) {} // warm before the <img> requests it
            renderMarkets();
          })
          .catch(() => { t.imageChecked = false; }); // transient (cold) miss: retry next tick
      });
      // Price/chart data comes from the active chain's market source (it owns
      // batching + dedup).
      try {
        const rows = await window.iqCodein.market.enrich(mkTokens.map((t) => t.mint));
        rows.forEach((r) => {
          const t = mkTokens.find((x) => x.mint === r.mint);
          if (t) t.pair = r; // r is already the deepest-liquidity pair for this mint
        });
      } catch (e) { /* leave pairs as they were */ }
      mkTokens.sort((a, b) => ((b.pair && b.pair.mcap) || -1) - ((a.pair && a.pair.mcap) || -1)); // mcap desc, unindexed last
    }

    function fmtUsd(v) {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return "";
      if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
      if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
      if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
      if (n >= 0.01) return "$" + n.toFixed(4);
      return "$" + n.toPrecision(3);
    }

    // A market row (t.pair) describes itself, chart embed and source included
    // (see js/codein/market.js). No 24h change to show: no row yet means the
    // coin is still unread; a row without one is a pool nobody traded yet.
    function noChg(t) { return t.pair ? "-" : "indexing"; }

    function renderMarkets() {
      const $r = $("#ci2_mk_rows").empty();
      mkTokens.forEach((t) => {
        const chg = t.pair && t.pair.chg24 != null ? Number(t.pair.chg24) : null;
        const up = chg == null || chg >= 0;
        const price = t.pair && fmtUsd(t.pair.priceUsd); // a pool nobody traded yet has no price
        const $logo = $('<span class="mklogo"></span>');
        const initials = (t.symbol || "?").slice(0, 2).toUpperCase();
        const icon = t.image || (t.pair && t.pair.icon);
        if (icon) $logo.append($("<img>").attr({ src: icon, alt: t.symbol || t.name || "token", loading: "lazy" })
          .one("error", function () { $(this).remove(); $logo.text(initials); }));
        else $logo.text(initials);
        const row = $('<div class="mkrow"></div>')
          .append($('<div class="mkcoin"></div>').append($logo)
            .append($("<div>").css("min-width", 0)
              .append($('<div class="mksym"></div>').text("$" + (t.symbol || "?")))
              .append($('<div class="mkname"></div>').text(t.name))))
          .append($("<span>").text(price || "new").css(price ? {} : { opacity: 0.5 }))
          .append($('<span class="mkchg"></span>').addClass(chg == null ? "" : up ? "up" : "down")
            .text(chg == null ? noChg(t) : (up ? "+" : "") + chg.toFixed(1) + "%").css(chg == null ? { opacity: 0.5 } : {}))
          .append($('<span class="mkcap"></span>').text(t.pair && t.pair.mcap ? fmtUsd(t.pair.mcap) : "-"))
          .append($('<span class="mkact"><b>Chart</b> | <span class="tradego" style="cursor:pointer"></span> | <span class="cago" style="cursor:pointer" title="copy contract address">CA</span></span>'));
        row.find(".tradego").text(window.iqCodein.market.tradeShort);
        row.on("click", () => openChart(t.mint));
        row.find(".tradego").on("click", (e) => { e.stopPropagation(); window.open(window.iqCodein.market.tradeUrl(t.mint), "_blank"); });
        row.find(".cago").on("click", function (e) {
          e.stopPropagation();
          const $b = $(this);
          const done = () => { $b.text("COPIED"); setTimeout(() => $b.text("CA"), 1200); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.mint).then(done, () => prompt("copy the contract address:", t.mint));
          else prompt("copy the contract address:", t.mint);
        });
        $r.append(row);
      });
      $("#ci2_mk_empty").toggleClass("hide", mkTokens.length > 0);
      if (!mkTokens.length) $("#ci2_mk_empty").text("no coins launched yet. be the first: LAUNCH A TOKEN.");
    }

    // meta lets a just-launched coin (not yet in the feed/dexscreener) open its
    // chart immediately, showing "indexing" until the pair is picked up.
    function openChart(mint, meta) {
      mkCurrent = mkTokens.find((t) => t.mint === mint)
        || { mint: mint, symbol: (meta && meta.symbol) || "?", name: (meta && meta.name) || "", src: (meta && meta.src) || "" };
      const t = mkCurrent;
      $("#ci2_chart_modal").removeClass("hide");
      $("#ci2_chart_sym").text("$" + t.symbol + "  " + t.name);
      const chg = t.pair && t.pair.chg24 != null ? Number(t.pair.chg24) : null;
      $("#ci2_chart_price").text(t.pair ? fmtUsd(t.pair.priceUsd) : "");
      $("#ci2_chart_chg").css("color", chg == null ? "var(--fg50)" : chg >= 0 ? "#2BD52D" : "#e0554e")
        .text(chg == null ? noChg(t) : (chg >= 0 ? "+" : "") + chg.toFixed(1) + "% (24h)");
      const mkt = window.iqCodein.market;
      $("#ci2_chart_stats").text(t.pair
        ? ["mcap " + (fmtUsd(t.pair.mcap) || "-"), "vol " + (fmtUsd(t.pair.vol24) || "-"), t.pair.via].join("  ")
        : "not indexed yet");
      $("#ci2_chart_pump").attr("href", mkt.tradeUrl(mint)).text(mkt.tradeLabel);
      $("#ci2_chart_copy").text("COPY MINT");
      const $box = $("#ci2_chart_box").empty();
      if (t.pair && t.pair.embed) {
        $box.append($("<iframe>").attr({ src: t.pair.embed, allow: "clipboard-write" }));
        $("#ci2_chart_dexs").removeClass("hide").attr("href", t.pair.url).text(t.pair.siteLabel);
      } else {
        $box.append($('<div id="ci2_chart_hold"><p class="muted" style="font-size:12px;margin:0">no chart yet - this coin has not been indexed.<br>a fresh launch charts here once the first trade is picked up.</p></div>'));
        $("#ci2_chart_dexs").addClass("hide");
      }
      const postSig = t.src || t.sig; // prefer the coin's original inscription over the registry row
      if (postSig) $("#ci2_chart_post").removeClass("hide").off("click").on("click", () => { $("#ci2_chart_modal").addClass("hide"); openPost(postSig); });
      else $("#ci2_chart_post").addClass("hide");
    }

    function copyChartMint() {
      if (!mkCurrent) return;
      const done = () => { $("#ci2_chart_copy").text("COPIED"); setTimeout(() => $("#ci2_chart_copy").text("COPY MINT"), 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mkCurrent.mint).then(done, () => prompt("mint:", mkCurrent.mint));
      else prompt("mint:", mkCurrent.mint);
    }

    $.extend(this, { init });
  }

  $.code_in_v2 = new CodeInV2();
})(jQuery);
