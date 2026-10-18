// nft_launch.js - the inscription NFT launchpad page (?menu=nft&nft=<slug>).
// Classic jQuery page module; all chain/wallet work goes through window.iqNft
// (js/codein/nft_bridge.js). v1 = one collection's buyer mint view: header,
// item grid, and a mint panel that drives iqNft.mint() stage by stage.
(function ($) {
  const TEMPLATE = "./html/sections/nft_launch.html?ver=1";
  const STAGE_TEXT = {
    funding: "approve the funding transfer in your wallet...",
    deposit: "paying the deposit...",
    reserve: "reserving your item...",
    image: "inscribing the image on-chain...",
    metadata: "inscribing the metadata...",
    register: "verifying and co-signing...",
    confirming: "confirming the mint...",
    done: "minted.",
  };

  function bridge(cb) {
    if (window.iqNftReady && window.iqNft) return cb();
    window.addEventListener("iqnft:ready", () => cb(), { once: true });
  }
  function slugFromUrl() {
    const p = new URLSearchParams(window.location.search).get("nft");
    return p && p.trim() ? p.trim() : null; // null -> show the home list
  }
  const sol = (lamports) => (Number(lamports || 0) / 1e9).toFixed(4) + " SOL";
  const setBar = (pct) => $("#nftl_progbar").css("width", Math.max(0, Math.min(100, pct)) + "%");
  const short = (s) => (s ? s.slice(0, 8) + "..." + s.slice(-6) : "");

  $.nft_launch = {
    init: function () {
      const slug = slugFromUrl();
      $.get(TEMPLATE, (html) => {
        $("#main_section").show().empty().append($(html));
        $("#nftl_log_clear").on("click", () => $("#nftl_log").empty());
        this.dbg("page init" + (slug ? ", slug=" + slug : ", home"));
        this.renderEnv();
        bridge(() => {
          this.dbg("bridge ready (window.iqNft)");
          (slug ? this.load(slug) : this.loadHome()).catch((e) => this.fail(e));
        });
      });
    },

    loadHome: async function () {
      const cols = await window.iqNft.getCollections();
      this.dbg("home: " + cols.length + " collection(s)");
      $("#nftl_loading").hide();
      $("#nftl_home").show();
      const $g = $("#nftl_home_grid").empty();
      if (!cols.length) { $g.append($("<div class='muted'>").text("no collections yet")); return; }
      cols.forEach((c) => {
        const minted = Number(c.minted || 0), supply = Number(c.maxSupply || 0);
        const soldout = supply > 0 && minted >= supply;
        const card = $("<a class='ccard'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(c.slug));
        card.append($("<span>").addClass("tag" + (soldout ? " out" : "")).text(soldout ? "SOLD OUT" : (supply ? "LIVE" : "SINGLE")));
        card.append($("<div class='cn'>").text(c.name || c.slug));
        card.append($("<div class='cs'>").text((c.symbol || "") + (supply ? "  .  " + minted + "/" + supply + " minted" : "  .  single-mint")));
        card.append($("<div class='cp'>").text(sol(c.priceLamports)));
        $g.append(card);
      });
    },

    // Prominent debug log: every step + raw errors land here and in the console,
    // so a failing mint is diagnosable without opening devtools.
    dbg: function (msg, cls) {
      const t = new Date().toTimeString().slice(0, 8);
      const line = $("<div>").append($("<span class='t'>").text("[" + t + "] "));
      line.append($("<span>").addClass(cls || "").text(typeof msg === "string" ? msg : JSON.stringify(msg)));
      $("#nftl_log").append(line);
      const el = document.getElementById("nftl_log");
      if (el) el.scrollTop = el.scrollHeight;
      (cls === "e" ? console.error : console.log)("[iqnft] " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
    },

    renderEnv: async function () {
      const api = window.iqNft.api(), rpc = window.iqNft.getRpc();
      $("#nftl_env").html("env: api <b>" + api + "</b> . rpc <b>" + rpc + "</b> . cluster <b>...</b>");
      try {
        const h = await window.iqNft.health();
        $("#nftl_env").html("env: api <b>" + api + "</b> . rpc <b>" + rpc + "</b> . cluster <b>" + (h.cluster || "?") + "</b> . program <b>" + (h.programId ? h.programId.slice(0, 8) + "..." : "?") + "</b>");
        this.dbg("health: " + JSON.stringify(h));
      } catch (e) { this.dbg("health failed: " + (e && e.message), "e"); }
    },

    fail: function (e) {
      $("#nftl_loading").hide();
      const msg = e && e.message ? e.message : String(e);
      $("#nftl_error").show().text("error: " + msg);
      this.dbg("LOAD FAILED: " + msg, "e");
      if (e && e.stack) this.dbg(e.stack.split("\n").slice(0, 3).join(" | "), "e");
    },

    load: async function (slug) {
      const col = await window.iqNft.getCollection(slug);
      if (!col || col.error) throw new Error(col && col.error ? col.error : "collection not found: " + slug);
      this.col = col;
      this.dbg("collection loaded: " + col.slug + " supply=" + col.maxSupply + " price=" + col.priceLamports + " deposit=" + col.depositLamports + " minted=" + col.minted + " treasury=" + short(col.treasury));
      $("#nftl_loading").hide();
      $("#nftl_view").show();
      if (!$("#nftl_back").length) $("#nftl_name").before($("<a id='nftl_back'>").attr("href", "?menu=nft").css("font-size", ".7rem").text("← all collections"));
      $("#nftl_name").text(col.name || slug);
      $("#nftl_meta").text([col.symbol, col.creator ? "by " + short(col.creator) : "", col.sequential ? "sequential" : "random"].filter(Boolean).join("  .  "));
      $("#nftl_price").text(sol(col.priceLamports));
      $("#nftl_supply").text(col.maxSupply);
      this.renderProgress();
      await this.renderGrid(slug, col);

      // Connect / mint wiring.
      const addr = window.iqNft.connected();
      if (addr) this.onConnected(addr);
      $("#nftl_connect").on("click", async () => {
        try { this.onConnected(await window.iqNft.connect()); }
        catch (e) { this.status(e.message || String(e), true); }
      });
      $("#nftl_mint").on("click", () => this.mint(slug));
    },

    renderProgress: function () {
      const minted = Number(this.col.minted || 0), supply = Number(this.col.maxSupply || 0);
      $("#nftl_minted").text(minted);
      setBar(supply ? (minted / supply) * 100 : 0);
    },

    renderGrid: async function (slug, col) {
      const $g = $("#nftl_grid").empty();
      if (!col.maxSupply) { $g.append($("<div class='cell'>").text("single-mint")); return; }
      try {
        const data = await window.iqNft.getItems(slug, 0, 120);
        (data.items || []).forEach((it) => {
          $g.append($("<div>").addClass("cell" + (it.minted ? " minted" : ""))
            .append($("<b>").text("#" + it.index))
            .append(document.createTextNode(it.minted ? "minted" : "open")));
        });
      } catch (e) { $g.append($("<div class='cell'>").text("items unavailable")); }
    },

    onConnected: function (addr) {
      $("#nftl_addr").text(short(addr));
      $("#nftl_connect").hide();
      $("#nftl_mint").show();
      this.dbg("wallet connected: " + addr);
      window.iqNft.estimateCost(this.col).then((lamports) => {
        $("#nftl_fee").text("minting will ask to fund ~" + sol(lamports) + " (price + deposit + inscription/network fees). leftover returns to your wallet.");
        this.dbg("funding estimate ~" + sol(lamports));
      }).catch((e) => this.dbg("estimate failed: " + (e && e.message), "e"));
    },

    status: function (msg, isErr) {
      $("#nftl_status").toggleClass("err", !!isErr).text(msg || "");
      if (msg) this.dbg(msg, isErr ? "e" : "");
    },

    mint: async function (slug) {
      $("#nftl_mint").prop("disabled", true);
      $("#nftl_result").hide();
      setBar(0);
      this.dbg("MINT start: " + slug);
      try {
        const res = await window.iqNft.mint({
          slug,
          collection: this.col,
          onStage: (s, x) => {
            this.status(STAGE_TEXT[s] || s);
            if (x) this.dbg("stage:" + s + " " + JSON.stringify(x));
            if (s === "image") setBar(5);
          },
          onProgress: (p) => {
            const pct = typeof p === "number" ? p : (p && (p.percent || p.pct)) || 0;
            setBar(pct);
          },
        });
        this.dbg("MINT ok: " + JSON.stringify({ index: res.index, asset: res.asset, C: res.C, M: res.M, mintSig: res.mintSig }));
        this.showResult(res);
      } catch (e) {
        const msg = (e && e.message) || String(e);
        this.status(msg, true);
        this.dbg("MINT ERROR: " + msg, "e");
        if (e && e.logs) this.dbg("sim logs: " + e.logs.slice(-4).join(" ; "), "e");
        $("#nftl_mint").prop("disabled", false);
      }
    },

    showResult: function (res) {
      this.status(STAGE_TEXT.done);
      setBar(100);
      $("#nftl_asset").text(res.asset);
      $("#nftl_c").text(res.C);
      $("#nftl_m").text(res.M);
      const links = $("#nftl_links").empty();
      if (res.mintSig) links.append($("<a>").attr({ href: window.iqNft.solscanTx(res.mintSig), target: "_blank" }).text("mint tx"));
      links.append($("<a>").attr({ href: window.iqNft.solscanTx(res.C), target: "_blank" }).text("image tx"));
      links.append($("<a>").attr({ href: window.iqNft.solscanTx(res.M), target: "_blank" }).text("metadata tx"));
      links.append($("<a>").attr({ href: "?menu=nft&nft=" + encodeURIComponent(res.slug) }).text("mint another"));
      $("#nftl_result").show();
      // Refresh counts + grid so the freshly minted item flips.
      window.iqNft.getCollection(res.slug).then((c) => { if (c && !c.error) { this.col = c; this.renderProgress(); this.renderGrid(res.slug, c); } }).catch(() => {});
      $("#nftl_mint").prop("disabled", false).text("MINT ANOTHER");
    },
  };
})(jQuery);
