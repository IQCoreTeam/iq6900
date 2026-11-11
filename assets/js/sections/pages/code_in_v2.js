// Code-In v2 page module. Loads html/sections/code_in_v2.html into #main_section
// and drives it through window.iqCodein - either the solana adapter
// (js/codein/browser.js, ?menu=codein, Model B burner) or the EVM adapter
// (js/codein/evm.js, ?menu=hoodin on Robinhood Chain, hybrid burner upload
// with wallet finalization). One UI, two chains.
(function ($) {
  $.extend(true, window, { code_in_v2: CodeInV2 });

  const CAP_KB = 256; // solana: mainnet-measured on the default free RPC (publicnode): 32-512KB all landed with 0 rpc errors; 256KB ~51s is the wait we accept, above it recommend own RPC / SDK

  function CodeInV2() {
    const templateUrl = "./html/sections/code_in_v2.html?ver=70";
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
    let pendingInscription = null; // The submitted payload and confirmed result belong to this compose/retry operation.
    let walletGeneration = 0;
    let removeWalletListeners = () => {};
    const confirmedPosts = new Map(); // Recent writes in this tab, keyed by chain + signature.
    let boardGen = 0;      // load generation; a fresh load supersedes in-flight ones

    // Opt-in return flow for the two posting apps. Only a public inscription
    // signature crosses this boundary; wallet and burner material stay here.
    const params = new URLSearchParams(window.location.search);
    let attachment = null;
    try {
      const origin = params.get("attachmentOrigin");
      const requestId = params.get("attachmentRequest") || "";
      const url = new URL(origin);
      const loopback = ["localhost", "127.0.0.1", "[::1]"];
      const local = loopback.includes(window.location.hostname) && loopback.includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
      const originChain = { "https://blockchan.sol.site": "solana", "https://hoodchan.xyz": "evm", "https://blockchan.ar.io": "solana" }[origin];
      if (window.opener && url.origin === origin && (originChain || local) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        attachment = { origin, requestId, opener: window.opener,
          chain: originChain || (params.get("menu") === "hoodin" ? "evm" : "solana"), result: null };
      }
    } catch (_) { /* Normal standalone upload, or an invalid return request. */ }

    // Launching (coins, NFTs, markets) lives on inscribe.codes; the board only
    // hands an inscription over. image / text / ascii / file posts can back a
    // coin; launch registry rows cannot.
    const LAUNCH_SITE = "https://inscribe.codes/";
    const launchable = (kind, body) => ["image", "text", "ascii", "file"].includes(kind) && String(body || "").length > 0;

    function returnAttachment() {
      if (!attachment?.result) return;
      if (attachment.opener.closed) {
        $("#ci2_return_status").text("Your post window closed. Your inscription is saved and can be opened from the board.");
        return;
      }
      try {
        attachment.opener.postMessage({ type: "iq:attachment-complete", requestId: attachment.requestId,
          ...attachment.result }, attachment.origin);
        $("#ci2_return_status").text("Returning the attachment to your post…");
      } catch (_) {
        $("#ci2_return_status").text("Could not reach your post window. Your inscription is saved; you can retry attaching it.");
      }
    }
    window.addEventListener("message", (event) => {
      if (!attachment?.result || event.origin !== attachment.origin || event.source !== attachment.opener ||
          event.data?.requestId !== attachment.requestId || event.data.type !== "iq:attachment-accepted") return;
      $("#ci2_return_status").text("Attachment added to your post. You can return to the post window.");
      $("#ci2_return").addClass("hide");
    });

    function init(post, chainName, opts) {
      // A posting origin chooses its network once. Route changes in this popup
      // cannot turn a BlockChan attachment into a paid Hood inscription.
      if (attachment && (chainName === "evm" ? "evm" : "solana") !== attachment.chain && document.getElementById("ci2")) return;
      walletGeneration++;
      removeWalletListeners();
      chain = attachment ? attachment.chain : (chainName === "evm" ? "evm" : "solana");
      who = null; burner = null; bigAck = false; // route switch = fresh wallet state
      pendingInscription = null;
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
        import(new URL("js/codein/evm.js?v=17", document.baseURI).href)
          .then(() => { window.iqCodein = chains().evm; cb(); })
          .catch((e) => { console.error("[hood-in] adapter load failed:", e); $("#ci2_empty").text("could not load the robinhood module. refresh to retry."); });
        return;
      }
      const useSolana = () => { if (chains().solana) window.iqCodein = chains().solana; cb(); };
      if (window.iqCodein) useSolana();
      else window.addEventListener("iqcodein:ready", useSolana, { once: true });
    }

    function wire() {
      // The Solana provider is set by connect()/restoreWallet() from the wallet
      // the user picked (window.iqCodein discovers every Solana wallet).
      $("#ci2_connect").on("click", () => connect());        // auto: picker only when ambiguous
      $("#ci2_change_wallet").on("click", () => connect(true)); // explicit switch
      $("#ci2_wallet_close").on("click", () => document.getElementById("ci2_wallet_dialog").close(""));
      $("#ci2_wallet_disconnect").on("click", () => {
        walletGeneration++;
        removeWalletListeners();
        window.iqCodein.disconnectWallet();
        showWallet(null);
        $("#ci2_rpcwarn").addClass("hide");
        document.getElementById("ci2_wallet_dialog").close("");
      });
      $(window).off("iq:evm-wallets.codein");
      if (isEvm()) $(window).on("iq:evm-wallets.codein", renderWalletOptions);
      $("#ci2_home_dot").on("click", () => { window.location.href = window.location.pathname; });
      // Cross-chain hop (design: header "ROBINHOOD? -> /HOODIN" / "SOLANA? -> /CODEIN").
      // init() re-renders the template, updates ?menu= and resets timers/wallet state.
      $("#ci2_xchain").text(isEvm() ? "SOLANA? → /CODEIN" : "ROBINHOOD? → /HOODIN")
        .on("click", () => init(null, isEvm() ? null : "evm"));
      if (attachment) $("#ci2_xchain").prop("disabled", true)
        .text("ATTACHMENT NETWORK: " + (isEvm() ? "ROBINHOOD" : "SOLANA"));
      $("#ci2_new").on("click", openCompose);
      $("#ci2_tab_feed").on("click", () => switchTab("feed"));
      $("#ci2_tab_mine").on("click", () => switchTab("mine"));
      $("#ci2 .tab[data-kind]").on("click", function () { selectKind($(this).attr("data-kind")); });
      $("#ci2_text").on("input", refreshCost);
      $("#ci2_ascii_file").on("change", onAsciiFile);
      $("#ci2_ascii_size, #ci2_ascii_dist").on("input", reAscii);
      $("#ci2_image_file").on("change", onImageFile);
      $("#ci2_image_compress").on("change", () => onImageFile()); // re-process the current image when toggled
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
      $("#ci2_copy_link, #ci2_copy_tx").on("click", copyLink);
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
      if (!attachment) loadBoard();
      if (attachment) {
        $("#ci2_again").addClass("hide");
        $("#ci2_done").append('<p id="ci2_return_status" role="status"></p><button id="ci2_return" class="btn" type="button">ATTACH TO POST AGAIN</button>');
        $("#ci2_return").on("click", returnAttachment);
        $("#ci2 .tab[data-kind=\"text\"], #ci2 .tab[data-kind=\"ascii\"]").hide();
        $("#ci2_file_file, #ci2_image_file").attr("accept", "image/png,image/jpeg,image/gif,image/webp,image/avif,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,video/mp4,video/webm,video/ogg");
        selectKind("file");
        openCompose();
        attachment.opener.postMessage({ type: "iq:attachment-ready", requestId: attachment.requestId }, attachment.origin);
      }
      restoreWallet();
    }

    // Same template, hood skin: swap the theme tokens (CSS class) and the
    // solana-specific copy. Everything structural stays shared.
    function applyHoodTheme() {
      const M = window.iqCodein.meta;
      $("#ci2").addClass("hood");
      $("#ci2_board_title").text(M.boardTitle);
      $("#ci2_page_title").text("// HOOD IN");
      $("#ci2_prog_title").text("// WRITING TO ROBINHOOD CHAIN - keep this tab open");
      $("#ci2_win").text("hood_in.exe");
      $("#ci2_launch_nft").addClass("hide"); // inscription NFTs are solana only
      $("#ci2_launch_token, #ci2_launch_markets").attr("href", LAUNCH_SITE + "?view=token&chain=hood");
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

    // Wallet Standard icons are data: image URIs; anything else is not rendered.
    const walletIcon = (icon) => (typeof icon === "string" && /^data:image\/(svg\+xml|png|webp|gif);base64,/.test(icon) ? icon : null);
    function renderWalletOptions() {
      $("#ci2_wallet_disconnect").toggleClass("hide", !who);
      const options = window.iqCodein.getWallets();
      $("#ci2_wallet_dialog .body > p").first().text(isEvm() ? "Choose your wallet for Robinhood Chain." : "Choose your Solana wallet.");
      $("#ci2_wallet_empty").text(isEvm()
        ? "No EVM wallet detected. Open this page in your wallet browser or enable your wallet extension."
        : "No Solana wallet detected. Install Phantom, Jupiter, Backpack or Solflare, or open this page in your wallet's browser.");
      const box = $("#ci2_wallet_options").empty();
      $("#ci2_wallet_empty").toggleClass("hide", options.length > 0);
      for (const wallet of options) {
        const $b = $("<button>").attr("type", "button").addClass("btn ghost")
          .on("click", () => document.getElementById("ci2_wallet_dialog").close(wallet.id));
        const icon = walletIcon(wallet.icon);
        if (icon) $b.append($("<img alt='' class='wicon'>").attr("src", icon));
        box.append($b.append(document.createTextNode(wallet.name + (wallet.selected && who ? " · Connected" : ""))));
      }
    }

    // Open the wallet picker dialog; resolves to the chosen wallet id ("" = cancelled).
    function pickWallet() {
      const dialog = document.getElementById("ci2_wallet_dialog");
      if (dialog.open) return Promise.resolve("");
      renderWalletOptions();
      dialog.returnValue = "";
      return new Promise(resolve => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
        dialog.showModal();
      });
    }

    // forcePicker (CHANGE WALLET) always opens the picker. A plain CONNECT
    // auto-connects the saved or only wallet: connectWallet() picks a
    // single/saved wallet itself and throws "Choose a ... wallet first" only
    // when ambiguous (2+ wallets, none saved), so the picker opens only then.
    // One flow for Solana and EVM; the adapter behind window.iqCodein differs.
    async function connect(forcePicker) {
      let walletId;
      if (forcePicker) { walletId = await pickWallet(); if (!walletId) return; }
      const generation = ++walletGeneration; // Ignore a late silent reconnect after an explicit choice.
      removeWalletListeners();
      showWallet(null);
      const ambiguous = (e) => /choose an? (evm|solana) wallet/i.test(String((e && e.message) || e));
      let address;
      try { address = await window.iqCodein.connectWallet({ walletId }); }
      catch (e) {
        if (walletId || forcePicker || !ambiguous(e)) { alert(String((e && e.message) || e)); return; }
        // auto attempt and the choice is ambiguous: open the picker once and retry
        walletId = await pickWallet();
        if (!walletId || generation !== walletGeneration) return;
        try { address = await window.iqCodein.connectWallet({ walletId }); }
        catch (e2) { alert(String((e2 && e2.message) || e2)); return; }
      }
      if (generation !== walletGeneration || !address) return;
      if (!isEvm()) provider = window.iqCodein.getWalletProvider();
      bindWalletListeners();
      if (isEvm() && !await walletRpcHealthy()) return;
      showWallet(address);
    }

    async function walletRpcHealthy() {
      const generation = walletGeneration;
      const h = await window.iqCodein.checkWalletRpc();
      if (generation !== walletGeneration) return false;
      if (h.ok) { $("#ci2_rpcwarn").addClass("hide"); return true; }
      $("#ci2_rpcwarn").removeClass("hide").text(
        "warning: the Robinhood Chain RPC saved in your wallet is " + h.reason +
        ", so writes will fail before anything is spent. open your wallet network settings for chain 4663 and set the RPC to https://rpc.mainnet.chain.robinhood.com, then reconnect.");
      return false;
    }

    function showWallet(address) {
      if (who !== address) burner = null;
      who = address;
      const wallets = window.iqCodein.getWallets();
      if (address) {
        const selected = wallets.find(wallet => wallet.selected);
        $("#ci2_change_wallet").text(selected ? selected.name + " · CHANGE WALLET" : "CHANGE WALLET");
      }
      // switching only makes sense when there is something to switch to
      $("#ci2_change_wallet").toggleClass("hide", !who || wallets.length < 2);
      $("#ci2_who").text(who ? who.slice(0, 4) + "..." + who.slice(-4) : "").toggleClass("hide", !who);
      $("#ci2_connect").toggleClass("hide", !!who);
      $("#ci2_new").toggleClass("hide", !who);
      if (tab === "mine" && !attachment) loadBoard();
    }

    function bindWalletListeners() {
      removeWalletListeners();
      const activeProvider = isEvm() ? window.iqCodein.getWalletProvider() : provider;
      if (!activeProvider) return;
      const changed = () => {
        walletGeneration++;
        burner = null;
        if (isEvm()) window.iqCodein.disconnectWallet();
        showWallet(null);
      };
      const accountEvent = isEvm() ? "accountsChanged" : "accountChanged";
      activeProvider.on?.(accountEvent, changed);
      activeProvider.on?.("disconnect", changed);
      if (isEvm()) activeProvider.on?.("chainChanged", changed);
      removeWalletListeners = () => {
        activeProvider.removeListener?.(accountEvent, changed);
        activeProvider.removeListener?.("disconnect", changed);
        activeProvider.removeListener?.("chainChanged", changed);
      };
    }
    async function restoreWallet() {
      const generation = walletGeneration;
      try {
        const address = await window.iqCodein.connectWallet({
          onlyIfTrusted: true,
          // Solana: listen on the candidate before its silent connect resolves,
          // so an account change during the wait outranks the late response.
          onProvider: isEvm() ? undefined : (p) => { if (generation === walletGeneration) { provider = p; bindWalletListeners(); } },
        });
        if (generation !== walletGeneration || !address) return;
        if (!isEvm()) provider = window.iqCodein.getWalletProvider();
        bindWalletListeners();
        if (isEvm() && !await walletRpcHealthy()) return;
        if (generation === walletGeneration) showWallet(address);
      } catch (_) { /* Locked or unapproved wallet: keep the connect button. */ }
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
        if (!before) {
          const local = [...confirmedPosts.values()].filter(post => post.chain === chain && (tab !== "mine" || post.row.who === who)).map(post => post.row);
          const signatures = new Set(local.map(row => row.__txSignature));
          rows = [...local.reverse(), ...rows.filter(it => !signatures.has((it.row || it).__txSignature || it.__txSignature || it.signature))];
        }
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
        $th.addClass("txt").text("$" + (t.symbol || "?") + "  " + (t.name || "") + "\n[ launched coin ]");
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
            .append($("<a>").addClass("btn").attr({ href: window.iqCodein.market.tradeUrl(t.mint), target: "_blank", rel: "noopener" }).css("text-decoration", "none").text(window.iqCodein.market.tradeLabel))));
      }
      else {
        // green record body, matching the design viewer; ascii keeps pre, text wraps
        const $pre = $("<pre>").addClass("vpre").text(body);
        if (obj.kind === "ascii") $pre.css({ fontSize: "7px", lineHeight: "1" });
        else $pre.css({ whiteSpace: "pre-wrap", wordBreak: "break-word" });
        $b.html($pre);
      }
      // Launching moved to inscribe.codes: a coin from this inscription, or a
      // 1 of 1 NFT (solana). Only the owner sees the hand-off; the launchpad
      // re-checks ownership on its side.
      const mine = !!who && owner === who;
      $("#ci2_view_token").toggleClass("hide", !(mine && launchable(obj.kind, body))).attr("href", LAUNCH_SITE + "?view=token");
      $("#ci2_view_nft").toggleClass("hide", !(mine && !isEvm())).attr("href", LAUNCH_SITE + "?view=nft&single=" + encodeURIComponent(sig));
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
      const input = this.id === "ci2_copy_tx" ? document.getElementById("ci2_tx_id")
        : this.id === "ci2_copy_link" ? document.getElementById("ci2_share_link") : null;
      const value = input ? input.value : (currentSig ? window.iqCodein.viewUrl(currentSig) : "");
      if (!value) return;
      const $b = $(this), prev = $b.text();
      const ok = () => {
        $b.text("COPIED"); setTimeout(() => $b.text(prev), 1200);
        if (input) $("#ci2_link_status").text("Copied.");
      };
      const fallback = () => {
        if (!input) { prompt("copy this link:", value); return; }
        input.focus(); input.select();
        $("#ci2_link_status").text("Select and copy the highlighted value.");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(ok, fallback);
      else fallback();
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
    // Auto-shrink an uploaded image to WebP so a big photo becomes a few-KB
    // inscription. Decode to pixels here (DOM work), then hand them to
    // window.iqCodein.compressImage - the SAME @jsquash compressor the NFT
    // creator uses, so both paths share one engine. maxEdge 1280 keeps Code In
    // uploads legible (the NFT uses 512 for small art tiles); shared module
    // defaults to quality 80. GIFs (animation) and any failure fall back to the
    // raw file, and the smaller of the two always wins so "compress" never grows.
    const kB = (n) => (n / 1024).toFixed(1) + " KB";
    async function compressToWebp(file, maxEdge = 1280, quality = 80) {
      const bmp = await createImageBitmap(file);
      const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
      const ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0);
      const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
      if (bmp.close) bmp.close();
      const { bytes, mime } = await window.iqCodein.compressImage(imageData, { maxEdge, quality });
      const blob = new Blob([bytes], { type: mime });
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      return { dataUrl, name: file.name.replace(/\.[^.]+$/, "") + ".webp", outSize: blob.size };
    }
    let lastImageFile = null;
    function onImageFile() {
      const f = this && this.files ? this.files[0] : lastImageFile;
      if (!f) return;
      lastImageFile = f;
      const prev = () => $("#ci2_image_prev").html($("<img>").attr("src", uploadBody));
      const raw = () => readUpload(f, () => { prev(); $("#ci2_image_size").html(kB(f.size)); });
      const wantCompress = $("#ci2_image_compress").prop("checked") && f.type.indexOf("image/") === 0 && f.type !== "image/gif";
      if (!wantCompress) { raw(); return; }
      compressToWebp(f).then(({ dataUrl, name, outSize }) => {
        if (outSize >= f.size) { raw(); return; } // never grow a file
        uploadBody = withName(dataUrl, name);
        prev();
        const saved = Math.round((1 - outSize / f.size) * 100);
        $("#ci2_image_size").html(kB(f.size) + " &rarr; <b>" + kB(outSize) + "</b> (-" + saved + "%)");
        refreshCost();
      }).catch(raw); // any decode/encode failure keeps the original
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
      pendingInscription = null;
      $("#ci2_modal").removeClass("hide");
      $("#ci2_compose").removeClass("hide"); $("#ci2_progress").addClass("hide"); $("#ci2_done").addClass("hide");
      $("#ci2_win").text(isEvm() ? "hood_in.exe" : "code_in.exe");
      refreshCost();
    }
    function closeModal() { $("#ci2_modal").addClass("hide"); }

    function checkAttachmentNetwork() {
      if (!attachment || (chain === attachment.chain &&
          new URLSearchParams(window.location.search).get("menu") === (attachment.chain === "evm" ? "hoodin" : "codein") &&
          window.iqCodein === window.iqCodeinChains?.[attachment.chain] &&
          (isEvm() || window.iqCodein.cluster === "mainnet-beta"))) return true;
      alert("This attachment must be inscribed on the posting app's network. Return to its uploader and try again.");
      return false;
    }

    async function doInscribe() {
      if (!pendingInscription?.result && !checkAttachmentNetwork()) return;
      if (!who && !pendingInscription?.result) { await connect(); if (!who) return; }
      if (!pendingInscription?.result && !checkAttachmentNetwork()) return;
      const inscription = pendingInscription || { pay: currentPayload(), author: who, chain, adapter: window.iqCodein };
      const { pay, author, adapter } = inscription;
      if (!pay.body) return;
      const inscriptionChain = inscription.chain;
      if (attachment && !/^data:(image\/(png|jpeg|gif|webp|avif)|audio\/(mpeg|mp3|wav|x-wav|ogg|mp4|aac|flac)|video\/(mp4|webm|ogg))(?:;name=(?:[A-Za-z0-9_.!~*'()-]|%[0-9a-f]{2})*)?;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/i.test(pay.body)) {
        alert("Choose a supported image, audio or video file on the posting app's network.");
        return;
      }
      const bytes = new TextEncoder().encode(JSON.stringify({ kind: pay.kind, body: pay.body, who: author })).length;
      if (overCapNow(bytes)) { openCap("choice"); return; }
      pendingInscription = inscription;

      $("#ci2_compose").addClass("hide"); $("#ci2_progress").removeClass("hide");
      $("#ci2_win").text("writing...");
      $("#ci2_retry").addClass("hide"); $("#ci2_log").text("");
      setBar(0, "starting");

      try {
        const res = inscription.result || await inscribeRaw({ kind: pay.kind, body: pay.body, onPct: setBar, author });
        inscription.result = res;
        if (!res) {
          pendingInscription = null;
          $("#ci2_compose").removeClass("hide"); $("#ci2_progress").addClass("hide");
          return;
        }
        $("#ci2_progress").addClass("hide"); $("#ci2_done").removeClass("hide");
        $("#ci2_win").text("done.exe");
        $("#ci2_sig").text((inscriptionChain === "evm" ? "tx: " : "sig: ") + res.sig.slice(0, 12) + "..." + res.sig.slice(-8));
        // a fresh image/text/ascii/file inscription can go straight to the launchpad
        const canLaunch = launchable(pay.kind, pay.body);
        $("#ci2_launch_after").toggleClass("hide", !canLaunch);
        $("#ci2_view").toggleClass("ghost", canLaunch); // LAUNCH is the primary when present
        if (inscriptionChain === "evm") $("#ci2_donenote").text("// the storage fee charges once, at the final step. every tx before it is gas only.");
        const confirmed = { kind: pay.kind, body: pay.body, who: author, __txSignature: res.sig, __blockTime: Math.floor(Date.now() / 1000) };
        confirmedPosts.set(inscriptionChain + ":" + res.sig, { chain: inscriptionChain, row: confirmed });
        if (confirmedPosts.size > 20) confirmedPosts.delete(confirmedPosts.keys().next().value);
        Promise.resolve().then(() => adapter.notify(res.sig, { kind: pay.kind, body: pay.body, who: author })).catch(() => {});
        const shareLink = adapter.viewUrl(res.sig);
        $("#ci2_share_link").val(shareLink);
        $("#ci2_tx_id").val(res.sig);
        $("#ci2_open_link").attr("href", shareLink);
        $("#ci2_link_status").text(attachment ? "Returning your inscription to the post…" : "Keep this link to your inscription.");
        if (!attachment) loadBoard();
        if (attachment) {
          attachment.result = { network: inscriptionChain === "evm" ? "robinhood" : "solana", signature: res.sig };
          $("#ci2_return").removeClass("hide");
          returnAttachment();
        }
      } catch (e) {
        // Never show "failed". solana: refund the burner to the wallet and say
        // so; when even the refund can't land, the funds sit in the burner and
        // the next retry reuses them. evm: the storage fee only charges at the
        // final tx, so an aborted upload cost gas pennies at most.
        $("#ci2_pct").text("paused - tap retry");
        $("#ci2_retry").removeClass("hide");
        const msg = String((e && e.message) || e);
        let note = "";
        if (isEvm() && (e?.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(msg))) {
          $("#ci2_pct").text("not enough ETH on Robinhood Chain");
          $("#ci2_log").text("The selected wallet needs ETH on Robinhood Chain for storage and gas. Fund that address on this network or choose another wallet, then retry. Earlier transactions, if any, may have paid fees.");
          console.error("[code-in] insufficient funds:", e);
          return;
        }
        if (isEvm()) {
          note = /user rejected|denied|4001/i.test(msg)
            ? "you canceled the signature in your wallet - tap retry when ready. "
            : /oversized|too large|exceeds|-32603|could not coalesce|Unexpected error/i.test(msg)
            ? "your wallet could not complete this write. Check your wallet activity before retrying; earlier transactions may have landed and paid fees. "
            : "The write did not complete. Earlier transactions may have paid gas or storage fees. Check wallet activity before retrying. ";
        } else {
          try {
            const back = burner ? await adapter.sweep(adapter.connect(), burner, provider.publicKey) : 0;
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
      const generation = walletGeneration;
      const walletProvider = provider;
      const signMessage = async (msg) => {
        const out = await walletProvider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
        return out.signature || out;
      };
      const derived = await window.iqCodein.deriveBurner(signMessage);
      if (generation !== walletGeneration) throw new Error("The wallet changed before submission. Connect again and retry.");
      burner = derived;
      return burner;
    }

    // Write one {kind, body} payload through the active adapter and return its
    // result ({sig}). The single place that builds the per-chain inscribe call,
    // shared by the compose flow and the launcher's album-art write. onPct is
    // called with (percent, label) across both chains.
    async function inscribeRaw({ kind, body, onPct, author = who }) {
      const adapter = window.iqCodein;
      if (isEvm()) {
        return adapter.inscribe({ kind, body, who: author, onStatus: (pct, label) => onPct && onPct(pct, label) });
      }
      const walletProvider = provider;
      if (!walletProvider || String(walletProvider.publicKey) !== author) throw new Error("The wallet changed before submission. Connect again and retry.");
      await ensureBurner();
      if (!checkAttachmentNetwork()) return null;
      const wallet = { publicKey: walletProvider.publicKey, signTransaction: (tx) => walletProvider.signTransaction(tx) };
      const connection = adapter.connect();
      const manual = adapter.getSpeed();
      const speed = manual !== "auto" ? manual : adapter.recommendSpeed(adapter.hasOwnRpc());
      return adapter.inscribe({
        connection, wallet, burner, kind, body, speed,
        onProgress: (pct) => onPct && onPct(pct, "writing " + pct + "%"),
        onRetry: (n) => onPct && onPct(0, "network congestion - retrying (" + (n + 1) + "/2)"),
      });
    }

    $.extend(this, { init });
  }

  $.code_in_v2 = new CodeInV2();
})(jQuery);
