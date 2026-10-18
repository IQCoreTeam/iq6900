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
    return p && p.trim() ? p.trim() : "test-monks";
  }
  const sol = (lamports) => (Number(lamports || 0) / 1e9).toFixed(4) + " SOL";
  const setBar = (pct) => $("#nftl_progbar").css("width", Math.max(0, Math.min(100, pct)) + "%");
  const short = (s) => (s ? s.slice(0, 8) + "..." + s.slice(-6) : "");

  $.nft_launch = {
    init: function () {
      const slug = slugFromUrl();
      $.get(TEMPLATE, (html) => {
        $("#main_section").show().empty().append($(html));
        bridge(() => this.load(slug).catch((e) => this.fail(e)));
      });
    },

    fail: function (e) {
      $("#nftl_loading").hide();
      $("#nftl_error").show().text("error: " + (e && e.message ? e.message : e));
    },

    load: async function (slug) {
      const col = await window.iqNft.getCollection(slug);
      if (!col || col.error) throw new Error(col && col.error ? col.error : "collection not found: " + slug);
      this.col = col;
      $("#nftl_loading").hide();
      $("#nftl_view").show();
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
    },

    status: function (msg, isErr) {
      $("#nftl_status").toggleClass("err", !!isErr).text(msg || "");
    },

    mint: async function (slug) {
      $("#nftl_mint").prop("disabled", true);
      $("#nftl_result").hide();
      setBar(0);
      try {
        const res = await window.iqNft.mint({
          slug,
          collection: this.col,
          onStage: (s, x) => {
            this.status(STAGE_TEXT[s] || s);
            if (s === "image") setBar(5);
          },
          onProgress: (p) => {
            const pct = typeof p === "number" ? p : (p && (p.percent || p.pct)) || 0;
            setBar(pct);
          },
        });
        this.showResult(res);
      } catch (e) {
        this.status((e && e.message) || String(e), true);
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
