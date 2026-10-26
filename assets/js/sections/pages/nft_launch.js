// nft_launch.js - the inscription NFT launchpad page (?menu=nft ...).
// Classic jQuery page module; all chain/wallet work goes through window.iqNft
// (js/codein/nft_bridge.js). Views: home (launchpad.exe + minted.exe), one
// collection's buyer page (collection.exe), the on-chain viewer (nft.exe) and
// the single-mint page. Markup + geometry follow NFT Launchpad Flow.dc.html.
(function ($) {
  const TEMPLATE = "./html/sections/nft_launch.html?ver=22";
  const PER_PAGE = 6; // design: 6 collections per registry page
  const STAGE_TEXT = {
    funding: "approve the funding transfer in your wallet",
    deposit: "paying the deposit",
    reserve: "reserving your item",
    image: "inscribing the image on solana",
    metadata: "inscribing the metadata",
    register: "verifying and co-signing",
    confirming: "confirming on solana",
    done: "minted.",
  };
  // Stage order drives the confirming bar (stages before "funding" are popups).
  const STAGE_PCT = { deposit: 10, reserve: 18, image: 30, metadata: 70, register: 85, confirming: 93, done: 100 };

  function bridge(cb) {
    if (window.iqNftReady && window.iqNft) return cb();
    window.addEventListener("iqnft:ready", () => cb(), { once: true });
  }
  const param = (k) => { const p = new URLSearchParams(window.location.search).get(k); return p && p.trim() ? p.trim() : null; };
  const sol = (lamports) => (Number(lamports || 0) / 1e9).toFixed(4) + " SOL";
  const solNum = (lamports) => { const n = Number(lamports || 0) / 1e9; return n >= 1 ? n.toFixed(2) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0"; };
  const short = (s) => (s ? s.slice(0, 4) + "..." + s.slice(-4) : "");
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n));
  const ago = (ts) => {
    const t = Number(ts || 0); if (!t) return "-";
    const d = Math.max(0, Math.floor(Date.now() / 1000) - t);
    return d < 60 ? d + "s" : d < 3600 ? Math.floor(d / 60) + "m" : d < 86400 ? Math.floor(d / 3600) + "h" : Math.floor(d / 86400) + "d";
  };
  const fmtDate = (ts) => {
    const t = Number(ts || 0); if (!t) return null;
    const d = new Date(t * 1000);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).toLowerCase();
  };
  const esc = (s) => $("<i>").text(s == null ? "" : String(s)).html();
  const link = (text, href, cls) => $("<a>").addClass(cls || "btn2").css("padding", "6px 12px").attr({ href, target: /^https?:/.test(href) ? "_blank" : null }).text(text);
  // The sealed tile: unminted art is never shown, the design's bold "?" stands in.
  const sealed = (size) => $("<div class='q'>").addClass(size || "").text("?");
  // Cover image into a dark box: the on-chain cover (newest minted item, via the
  // gateway) shows at once; the inscribed banner/logo replaces it once loaded.
  // Nothing on chain yet -> the sealed tile.
  const coverInto = ($box, base, upgrade) => {
    $box.empty();
    if (!base && !upgrade) { $box.append(sealed("lg")); return; }
    const $im = $("<img alt='' loading='lazy'>").on("error", function () { $(this).remove(); if (!$box.find("img").length) $box.prepend(sealed("lg")); });
    $im.attr("src", base || upgrade);
    $box.prepend($im);
    if (base && upgrade && upgrade !== base) { const pre = new Image(); pre.onload = () => $im.attr("src", upgrade); pre.src = upgrade; }
  };

  $.nft_launch = {
    init: function () {
      const slug = param("nft"), asset = param("asset"), single = param("single");
      $.get(TEMPLATE, (html) => {
        $("#main_section").show().empty().append($(html));
        this.dbg("page init" + (single ? ", single=" + single : asset ? ", asset=" + asset : slug ? ", slug=" + slug : ", home"));
        bridge(() => {
          this.wireNav();
          this.devnetNotice();
          // browser back and the [ x ] button both close the viewer overlay through history
          window.addEventListener("popstate", () => { if ($("#nftl_viewer").hasClass("open")) this.hideViewer(); });
          let route;
          if (single) route = this.loadSingle(single);
          else if (asset) route = (slug ? this.load(slug) : this.loadHome()).then(() => {
            // cold deep link: render the base view, then float the viewer on top so [ x ] lands back on it
            try { history.replaceState({}, "", this.baseUrl(slug)); history.pushState({ nftv: 1 }, "", this.viewerUrl(asset, slug)); } catch (e) {}
            return this.loadAsset(asset, slug);
          });
          else if (slug) route = this.load(slug);
          else route = this.loadHome();
          route.catch((e) => this.fail(e));
        });
      });
    },

    // First-entry notice: the launchpad is on devnet while testing. Once per page load.
    devnetNotice: function () {
      if (window.__nftlDevnetSeen) return;
      window.__nftlDevnetSeen = true;
      const $ov = $("<div>").css({ position: "fixed", inset: "0", zIndex: "300", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,6,4,.8)", backdropFilter: "blur(3px)", webkitBackdropFilter: "blur(3px)" });
      const $box = $("<div>").css({ maxWidth: "380px", margin: "20px", padding: "22px 24px", background: "rgba(20,19,16,.98)", border: "1px solid #e8e4d6", borderRadius: "8px", textAlign: "center", color: "#e8e4d6" });
      $box.append($("<div>").css({ font: "700 14px 'Archivo',sans-serif", letterSpacing: ".04em", marginBottom: "10px", color: "#2BD52D" }).text("TESTING IN PROGRESS"));
      $box.append($("<div>").css({ font: "500 12px/1.7 'Kode Mono',monospace", opacity: ".8" }).text("The IQ NFT launchpad is on Solana devnet for now. Please connect a devnet wallet to try it out."));
      const $ok = $("<button>").css({ marginTop: "18px", padding: "9px 26px", background: "#e8e4d6", color: "#141310", border: "none", borderRadius: "5px", font: "700 12px 'Kode Mono',monospace", letterSpacing: ".1em", cursor: "pointer" }).text("OK");
      $ok.on("click", () => $ov.remove());
      $box.append($ok);
      $ov.append($box).appendTo("body");
    },
    // ── nav: wallet pill shared by every view ───────────────────────────────
    wireNav: function () {
      $("#nftl_hconnect").on("click", async () => {
        try { this.setWallet(await window.iqNft.connect()); }
        catch (e) { this.dbg("connect failed: " + (e && e.message), "e"); }
      });
      const addr = window.iqNft.connected();
      if (addr) this.setWallet(addr, true);
    },
    setWallet: function (addr, silent) {
      this.wallet = addr;
      $("#nftl_hconnect").hide();
      $("#nftl_who").css("display", "flex").find("span").text(short(addr));
      if (!silent) this.dbg("wallet connected: " + addr);
      if (this.col) this.onConnected(addr);
      if (this.singleRow) this.onSingleConnected(addr);
      if (this.tab === "mine") this.renderMine();
    },
    navMid: (t) => $("#nftl_nav_mid").text(t),
    // the nav's back button goes up one level: item -> its collection, collection -> the list, home -> code in
    navBack: (text, href) => $("#nftl_navback").attr("href", href).html("&larr; " + $("<i>").text(text).html()),

    // ── home ──────────────────────────────────────────────────────────────
    loadHome: async function () {
      $("#nftl_loading").hide();
      $("#nftl_home").show();
      this.navMid("");
      this.navBack("CODE IN", "?menu=codein");
      this.tab = "cols"; this.chain = "all"; this.page = 1;
      this.renderSkeleton();
      $("#nftl_tabs .tab").on("click", (e) => this.homeTab($(e.currentTarget).data("tab")));
      $("#nftl_chains div").not(".soon").on("click", (e) => {
        this.chain = $(e.currentTarget).data("chain"); this.page = 1;
        $("#nftl_chains div").removeClass("on"); $(e.currentTarget).addClass("on");
        this.renderCols();
      });
      $("#nftl_colscroll").on("scroll", (e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) this.loadMore(); });
      const cols = await window.iqNft.getCollections();
      this.dbg("home: " + cols.length + " collection(s)");
      this.cols = cols;
      this.renderCols();
      this.renderMintedFeed(cols); // async, fills the right window as it goes
    },
    homeTab: function (tab) {
      this.tab = tab;
      $("#nftl_tabs .tab").removeClass("on").filter("[data-tab='" + tab + "']").addClass("on");
      $("#nftl_cols").css("display", tab === "cols" ? "flex" : "none");
      $("#nftl_market").css("display", tab === "market" ? "flex" : "none");
      $("#nftl_mine").css("display", tab === "mine" ? "flex" : "none");
      // no caption on MY NFTS (the gallery header carries the context)
      $("#nftl_desk_cap").css("display", tab === "mine" ? "none" : "block").text(tab === "cols"
        ? "// collections launched from this board. each one = a core collection + N inscriptions. pick one, mint one."
        : tab === "market" ? "// secondary market for everything minted here. not built yet: minted items trade on magic eden and tensor for now."
        : "");
      if (tab === "market") this.renderMarket();
      if (tab === "mine") this.renderMine();
    },
    // A card-shaped skeleton: same box + child classes as card(), so margins
    // and heights come from the same CSS and the grid does not reflow when the
    // real cards replace it. Shimmer bars (.sk) stand in for each line.
    renderSkeleton: function () {
      const $g = $("#nftl_colgrid").empty();
      const bar = (w, h, mt) => { const $b = $("<span class='sk'>").css({ width: w, height: h }); if (mt) $b.css("marginTop", mt); return $b; };
      const col = (vw) => $("<div class='st'>").append($("<div class='k'>").append(bar("55%", "11px"))).append($("<div class='vrow'>").append(bar(vw, "17px")));
      for (let i = 0; i < PER_PAGE; i++) {
        const $segs = $("<div class='segs'>");
        for (let k = 0; k < 40; k++) $segs.append($("<span>").css("background", "rgba(232,228,214,.1)"));
        $g.append($("<div class='card skel'>")
          .append($("<div class='cov'>"))
          .append($("<div class='cn'>").append(bar("62%", "19px")))
          .append($("<div class='segwrap'>").append($segs).append($("<div class='segl'>").append(bar("26%", "13px"))))
          .append($("<div class='cdesc'>").append(bar("80%", "14px")))
          .append($("<div class='stats'>").append(col("45%")).append(col("35%")))
          .append($("<div class='chainline'>").append(bar("50%", "12px")))
          .append($("<div class='band'>").append($("<div class='bfill'>")).append($("<div class='btext'>").append(bar("40%", "13px")))));
      }
      $("#nftl_pager").empty().append($("<span>").text("// reading the registry…"));
    },
    visibleCols: function () {
      return (this.cols || []).filter((c) => this.chain === "all" || (c.chain || "solana") === this.chain); // backend order = latest mint first
    },
    loadMore: function () {
      const total = this.visibleCols().length;
      if (this.page * PER_PAGE >= total) return;
      this.page++;
      this.renderCols();
    },
    renderCols: function () {
      const all = this.visibleCols(), shown = all.slice(0, this.page * PER_PAGE);
      const $g = $("#nftl_colgrid").empty();
      if (!all.length) {
        $g.append($("<div class='cm' style='grid-column:1/-1;padding:20px 0'>").text("// no collections yet. be the first: + LAUNCH A COLLECTION"));
        $("#nftl_pager").empty();
        return;
      }
      shown.forEach((c) => $g.append(this.card(c)));
      // fill the gauges: a reflow commits the dim state as the transition start,
      // then setting each on-segment to its color animates it (staggered via the
      // per-segment transition-delay) regardless of frame timing
      if ($g[0]) $g[0].offsetWidth;
      $g.find(".segs span.on").each(function () { this.style.background = this.getAttribute("data-c"); });
      const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
      const $p = $("#nftl_pager").empty().append($("<span>").text("// page " + this.page + " / " + pages + " · showing " + shown.length + " of " + all.length));
      if (shown.length < all.length) $p.append($("<span class='more'>").text("LOAD MORE ↓").on("click", () => this.loadMore()));
      else $p.append($("<span class='eof'>").text("EOF · " + all.length + (this.chain === "all" ? " collections, all chains" : " on solana")));
    },
    // One collection card, ported 1:1 from the live design: cover with corner
    // brackets, big Archivo title, a 40-segment progress bar, a description, the
    // OWNERS / VOLUME stats, a chain line, and an animated price/CTA band. Volume
    // lives on secondary marketplaces we do not index, so "-".
    card: function (c) {
      const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0), st = this.statusOf(c);
      const now = Math.floor(Date.now() / 1000), hot = st.label === "LIVE" && Number(c.lastMintAt) > now - 86400;
      const live = st.label === "LIVE", out = st.label === "SOLD OUT", hood = (c.chain || "solana") === "hood";
      const $card = $("<a class='card'>").toggleClass("dim", !live).toggleClass("out", out).toggleClass("flick", live)
        .attr("href", "?menu=nft&nft=" + encodeURIComponent(c.slug));
      const $cov = $("<div class='cov'>");
      coverInto($cov, c.coverSig ? window.iqNft.imgUrl(c.coverSig) : null, c.banner);
      // 40-segment progress, colored by how far the mint has gone
      const p = supply ? minted / supply : 0, on = Math.round(40 * p);
      const segcol = p >= 1 ? "#2BD52D" : p >= 0.7 ? "#e0a84e" : p >= 0.2 ? "#f2d94e" : "rgba(232,228,214,.85)";
      const $segs = $("<div class='segs'>");
      // on-segments start dim and fill to their color on load, staggered left to
      // right (renderCols flips them once the grid is in the DOM)
      for (let k = 0; k < 40; k++) {
        const $s = $("<span>").css("background", "rgba(232,228,214,.1)");
        if (k < on) $s.addClass("on").attr("data-c", segcol).css("transition-delay", (k * 24) + "ms");
        $segs.append($s);
      }
      const $segwrap = $("<div class='segwrap'>").append($segs)
        .append($("<div class='segl'>").text(supply ? num(minted) + " / " + num(supply) : "single mints"));
      const desc = c.description || (supply ? num(supply) + " items, each inscribed on solana before mint." : "single inscriptions, tokenized on solana.");
      const stat = (k, v) => $("<div class='st'>").append($("<div class='k'>").text(k))
        .append($("<div class='vrow'>").append($("<span class='v'>").text(v)));
      const $stats = $("<div class='stats'>")
        .append(stat("OWNERS", c.owners != null ? fmtK(Number(c.owners)) : "-"))
        .append(stat("VOLUME", "-"));
      const $chain = $("<div class='chainline'>")
        .append($("<span class='cadr'>").text((hood ? "▲ ROBINHOOD · ERC721 · " : "◎ SOLANA · MPL CORE · ") + short(c.collection)));
      if (hot) $chain.append($("<span class='hot'>").text("▲ HOT"));
      const price = out ? "minted out" : supply ? solNum(c.priceLamports) + " SOL" : "free";
      const cta = live ? "MINT" : st.label === "UPCOMING" ? "NOTIFY" : "VIEW";
      const $band = $("<div class='band'>").append($("<div class='bfill'>"))
        .append($("<div class='btext'>")
          .append($("<span class='bprice'>").text(price))
          .append($("<span class='bcta'>").append(document.createTextNode(cta + " ")).append($("<span class='barr'>").text("→"))));
      return $card.append($cov).append($("<div class='cn'>").text(c.name || c.slug)).append($segwrap)
        .append($("<p class='cdesc'>").text(desc)).append($stats).append($chain).append($band);
    },
    renderMarket: function () {
      $("#nftl_market").empty().append($("<div class='empty'>")
        .append($("<div class='zen'>").text("MARKET.EXE NOT BUILT YET."))
        .append($("<div class='cm' style='opacity:.55'>").html("listing and buying through our own marketplace program is on the roadmap.<br>until then every minted item is a normal core asset: it trades on magic eden and tensor like any other nft.")));
    },
    // MY NFTS: the public devnet RPC does not serve DAS getAssetsByOwner, so we
    // aggregate across every collection's items (the registry mirror carries the
    // holder per minted index) and keep the ones this wallet holds. Each cell
    // opens the on-chain viewer. Single-mint registries are not item-indexed, so
    // they are not listed here yet.
    renderMine: async function () {
      const addr = window.iqNft.connected();
      const $m = $("#nftl_mine").empty();
      if (!addr) {
        $m.append($("<div class='empty'>")
          .append($("<div class='zen'>").text("CONNECT TO SEE YOURS."))
          .append($("<div class='cm' style='opacity:.55'>").text("your nfts are read from your wallet address across every collection on this board."))
          .append($("<button class='btn' type='button' style='padding:10px 18px'>").text("CONNECT WALLET").on("click", () => $("#nftl_hconnect").trigger("click"))));
        return;
      }
      const token = (this.mineToken = (this.mineToken || 0) + 1);
      // loading skeleton (same mc shape) while we read every collection
      const skbar = (w, h) => $("<span class='sk'>").css({ width: w, height: h });
      const $sk = $("<div class='minegrid'>");
      for (let i = 0; i < 8; i++) $sk.append($("<div class='mc skel'>")
        .append($("<div class='mim'>"))
        .append($("<div class='mnm'>").append(skbar("70%", "14px")))
        .append($("<div class='msub'>").append(skbar("50%", "9px")))
        .append($("<div class='mfoot'>").append(skbar("30%", "9px"))));
      $m.append($sk);
      const cols = (this.cols && this.cols.length) ? this.cols : await window.iqNft.getCollections().catch(() => []);
      const mine = [];
      for (const c of cols) {
        if (token !== this.mineToken) return; // a newer render (tab switch / reconnect) took over
        try {
          const data = await window.iqNft.getItems(c.slug, 0, 300);
          ((data && data.items) || []).forEach((it) => {
            if (it.minted && it.asset && it.owner === addr) mine.push({ it: it, slug: c.slug, colName: c.name || c.slug });
          });
        } catch (e) {}
      }
      if (token !== this.mineToken) return;
      const tierOf = (x) => (x.it.rarity && x.it.rarity.tier) || "common";
      const counts = ["legendary", "epic", "rare", "common"].map((t) => [t, mine.filter((x) => tierOf(x) === t).length]).filter((e) => e[1]);
      $m.empty().append($("<div class='minehead'>")
        .append($("<div class='ml'>")
          .append($("<span class='mcount'>").text(mine.length + (mine.length === 1 ? " NFT" : " NFTS")))
          .append($("<span class='mheld'>").text("held by " + short(addr))))
        .append($("<span class='mrar'>").text(counts.map((e) => e[1] + " " + e[0].toUpperCase()).join(" · "))));
      if (!mine.length) {
        $m.append($("<div class='empty'>").append($("<div class='cm' style='opacity:.55'>")
          .html("no minted items held by this wallet yet.<br>mint one from a collection and it appears here.")));
        return;
      }
      const $grid = $("<div class='minegrid'>");
      mine.forEach(({ it, slug, colName }) => {
        const tier = (it.rarity && it.rarity.tier) || "common";
        const $cell = $("<a class='mc'>").addClass("r-" + tier).attr("href", "?menu=nft&asset=" + it.asset)
          .on("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return; e.preventDefault(); this.openViewer(it.asset, slug); });
        const $im = $("<div class='mim'>");
        if (it.inscriptionSig) $("<img alt='' loading='lazy'>").attr("src", window.iqNft.imgUrl(it.inscriptionSig)).on("error", function () { $(this).remove(); }).appendTo($im);
        $im.append($("<span class='mtag'>").text(tier.toUpperCase()));
        $cell.append($im)
          .append($("<div class='mnm'>").text(it.name || (colName + " #" + it.index)))
          .append($("<div class='msub'>").text(colName))
          .append($("<div class='mfoot'>").append($("<span>").text("VIEW")).append($("<span class='lst'>").text("LIST →")));
        $grid.append($cell);
      });
      $m.append($grid);
    },
    // Recent mints across all collections, newest first (WHEN = first seen by
    // the registry mirror; older mints without a time sort last and show "-").
    renderMintedFeed: async function (cols) {
      const $r = $("#nftl_minted_rows").empty();
      const rows = [];
      for (const c of cols) {
        // mint price = the collection price we already hold (no extra call); a
        // sale row carries its own on-chain sale price (lamports, from Tensor)
        const mintPrice = Number(c.maxSupply) ? solNum(c.priceLamports) + " SOL" : "free";
        try {
          (await window.iqNft.getRecent(c.slug, 100)).forEach((x) => {
            const sale = x.kind === "sale";
            rows.push({ ...x, colName: c.name || c.slug, slug: c.slug, sale: sale,
              ev: sale ? "SALE" : "MINT",
              priceLabel: sale ? (x.price ? solNum(x.price) + " SOL" : "-") : mintPrice,
              img: x.inscriptionSig ? window.iqNft.imgUrl(x.inscriptionSig) : null });
          });
        } catch (e) {}
      }
      rows.sort((a, b) => (Number(b.registeredAt) || 0) - (Number(a.registeredAt) || 0) || b.index - a.index);
      if (!rows.length) { $r.append($("<div class='cm' style='padding:16px 14px'>").text("// no mints yet")); return; }
      rows.slice(0, 300).forEach((x) => {
        const $row = $("<div class='fr flickrow'>").on("click", () => this.openViewer(x.asset, x.slug));
        const $th = x.img ? $("<img class='fth' alt=''>").attr("src", x.img).on("error", function () { $(this).replaceWith($("<span class='ph fth'>").text("#" + x.index)); }) : $("<span class='ph fth'>").text("#" + x.index);
        $row.append($("<div class='fn'>").append($th)
          .append($("<div style='min-width:0'>").append($("<div class='fnt'>").text(x.colName + " #" + x.index))
            .append($("<div class='fna'>").append($("<span class='fev'>").toggleClass("sale", x.sale).text(x.ev)).append(document.createTextNode(" " + x.priceLabel)))));
        $row.append($("<span class='fw'>").text(ago(x.registeredAt)));
        $r.append($row);
      });
    },
    statusOf: function (c) {
      const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0);
      const now = Math.floor(Date.now() / 1000);
      if (!supply) return { label: "SINGLE", cls: "" };
      if (minted >= supply) return { label: "SOLD OUT", cls: "out" };
      if (Number(c.startAt) > now) return { label: "UPCOMING", cls: "soon" };
      if (Number(c.endAt) && Number(c.endAt) < now) return { label: "ENDED", cls: "out" };
      return { label: "LIVE", cls: "live" };
    },

    // ── collection page ────────────────────────────────────────────────────
    load: async function (slug) {
      const col = await window.iqNft.getCollection(slug);
      if (!col || col.error) throw new Error(col && col.error ? col.error : "collection not found: " + slug);
      this.col = col;
      this.filter = "all";
      this.dbg("collection loaded: " + col.slug + " supply=" + col.maxSupply + " price=" + col.priceLamports + " deposit=" + col.depositLamports + " minted=" + col.minted);
      $("#nftl_loading").hide();
      $("#nftl_view").show();
      this.navMid("// " + (col.name || slug).toUpperCase());
      this.navBack("ALL COLLECTIONS", "?menu=nft");
      $("#nftl_cslug").text(col.slug);
      // banner strip (if the creator inscribed one) + the 120px cover square
      if (col.banner) {
        $("#nftl_cbanner").show().find("img").attr("src", col.banner).on("error", () => $("#nftl_cbanner").hide());
      } else $("#nftl_cbanner").hide();
      coverInto($("#nftl_ccov"), col.coverSig ? window.iqNft.imgUrl(col.coverSig) : null, col.logo);
      $("#nftl_name").text(col.name || slug);
      const st = this.statusOf(col);
      $("#nftl_chip").attr("class", "chip " + st.cls).text(st.label);
      $("#nftl_meta").text(["by " + short(col.creator), num(col.maxSupply) + " items", col.sequential ? "sequential" : "random", col.symbol ? "$" + col.symbol : ""].filter(Boolean).join(" · "));
      $("#nftl_desc").text(col.description || "").toggle(!!col.description);
      const dev = window.iqNft.explorerCluster();
      $("#nftl_clinks").empty()
        .append(link("COLLECTION ON CHAIN", "https://solscan.io/account/" + col.collection + dev))
        .append(link("REGISTRY", "https://solscan.io/account/" + col.registry + dev))
        .append(link("CREATOR", "https://solscan.io/account/" + col.creator + dev));
      $("#nftl_price").text(solNum(col.priceLamports));
      $("#nftl_fee").text([Number(col.depositLamports) > 0 ? "+ " + solNum(col.depositLamports) + " deposit at reserve" : "", "+ platform fee", "+ inscription rent", "leftover returns"].filter(Boolean).join(" · "));
      $("#nftl_items_lab").text("// ITEMS · " + (col.sequential ? "sequential (#1, #2, #3 …)" : "random (shuffled at launch)"));
      $("#nftl_filters .tab").off("click").on("click", (e) => {
        this.filter = $(e.currentTarget).data("f");
        $("#nftl_filters .tab").removeClass("on"); $(e.currentTarget).addClass("on");
        this.paintGrid();
      });
      this.renderProgress();
      this.renderKv();
      this.mintState("idle");
      await this.renderGrid(slug, col);
      if (this.wallet) this.onConnected(this.wallet);
    },
    renderProgress: function () {
      const minted = Number(this.col.minted || 0), supply = Number(this.col.maxSupply || 0);
      $("#nftl_progbar").css("width", (supply ? Math.round(100 * minted / supply) : 0) + "%");
      $("#nftl_progtxt").text(num(minted) + " / " + num(supply));
    },
    canMint: function () { return this.statusOf(this.col).label === "LIVE"; },
    renderKv: function () {
      const c = this.col, st = this.statusOf(c);
      const phase = st.label === "UPCOMING" ? { t: "STARTS " + (fmtDate(c.startAt) || "soon").toUpperCase(), cls: "nftl-a" }
        : st.label === "LIVE" ? { t: c.allowlistOnly ? "ALLOWLIST" : "PUBLIC", cls: "nftl-g" }
        : { t: st.label === "SOLD OUT" ? "MINTED OUT" : "ENDED", cls: "" };
      const you = !this.wallet ? { t: "connect to check", cls: "", dim: true }
        : st.label === "LIVE" ? { t: this.estimate ? "eligible · funds ~" + solNum(this.estimate) + " SOL" : "eligible", cls: "nftl-g" }
        : st.label === "UPCOMING" ? { t: "come back when it opens", cls: "nftl-a" } : { t: "minted out", cls: "nftl-a" };
      const rows = [
        ["phase", phase.t, phase.cls],
        ["per wallet", c.maxPerWallet ? c.maxPerWallet + " per wallet" : "no limit", ""],
        ["starts / ends", (fmtDate(c.startAt) || "open") + " → " + (fmtDate(c.endAt) || "open"), ""],
        ["assignment", c.sequential ? "sequential (#1, #2, #3 …)" : "random (shuffled at launch)", ""],
        ["you", you.t, you.cls, you.dim],
      ];
      const $kv = $("#nftl_kv").empty();
      rows.forEach(([k, v, cls, dim]) => $kv.append($("<div class='kv'>").append($("<span class='kvk'>").text(k)).append($("<span class='kvv'>").addClass(cls || "").css("opacity", dim ? .5 : 1).text(v))));
    },
    renderGrid: async function (slug, col) {
      const $g = $("#nftl_grid").empty();
      if (!col.maxSupply) { $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// single-mint registry: no numbered items")); return; }
      try {
        const data = await window.iqNft.getItems(slug, 0, 120);
        this.items = data.items || [];
        this.hasRarity = !!data.hasRarity;
      } catch (e) { this.items = []; $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// items unavailable")); return; }
      this.paintGrid();
    },
    paintGrid: function () {
      const $g = $("#nftl_grid").empty(), col = this.col, f = this.filter || "all";
      $("#nftl_legend").toggle(!!this.hasRarity);
      const items = (this.items || []).filter((it) => f === "all" || (f === "avail" && !it.minted) || (f === "minted" && it.minted));
      if (!items.length) { $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// nothing here")); return; }
      items.forEach((it) => {
        const fresh = it.index === this.freshIndex, rev = !!(it.minted && it.asset), tier = it.rarity && it.rarity.tier;
        // revealed (minted) cells light up and open the on-chain viewer; sealed
        // ones stay dim and inactive, a CRT "?" standing in for the art
        const $cell = rev ? $("<a class='it rev'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(col.slug) + "&asset=" + it.asset).on("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return; e.preventDefault(); this.openViewer(it.asset, col.slug); }) : $("<div class='it'>");
        $cell.toggleClass("fresh", fresh).addClass(rev && tier ? "r-" + tier : "");
        const $im = $("<div class='im'>");
        if (rev && it.inscriptionSig) $im.append($("<img alt='' loading='lazy'>").attr("src", window.iqNft.imgUrl(it.inscriptionSig)).on("error", function () { $(this).remove(); }));
        else if (!rev) $im.append(sealed());
        if (rev && tier && tier !== "common") $im.append($("<span class='rb'>").addClass("c-" + tier).text(tier));
        $im.append($("<span class='tag'>").text(fresh ? "yours" : "#" + it.index));
        const $if = $("<div class='if'>")
          .append($("<span class='ow'>").text(fresh ? "owner: you" : rev ? short(it.owner) : "#" + it.index))
          .append($("<span class='st'>").addClass(rev && tier ? "c-" + tier : "").text(fresh ? "MINTED \u2713" : rev ? (tier || "minted") : "unrevealed"));
        $g.append($cell.append($im).append($if));
      });
    },

    // Mint panel states (design: idle / approve / confirming / done, + error).
    mintState: function (state, x) {
      const $s = $("#nftl_mstate").empty();
      if (state === "idle") {
        if (!this.wallet) $s.append($("<button id='nftl_connect' class='btn3d' type='button'>").text("CONNECT WALLET TO MINT").on("click", () => $("#nftl_hconnect").trigger("click")));
        else if (this.canMint()) $s.append($("<button id='nftl_mint' class='btn wide' type='button'>").text("MINT 1 · SIGN IN WALLET").on("click", () => this.mint(this.col.slug)));
        else $s.append($("<div class='btn2 wide' style='opacity:.5;cursor:not-allowed'>").text(this.statusOf(this.col).label === "UPCOMING" ? "NOT STARTED YET" : "SOLD OUT"));
      } else if (state === "approve") {
        $s.append($("<div class='approve'>").text("APPROVE IN YOUR WALLET…"))
          .append($("<div class='cm'>").text("// " + (x || "two popups: a message that derives your burner, then the funding transfer.")));
      } else if (state === "confirming") {
        $s.append($("<div class='bigbar tall'>").append($("<i id='nftl_mbar'>")).append($("<span id='nftl_mlabel'>").text("WORKING…")))
          .append($("<div class='log' id='nftl_mlog'>"));
      } else if (state === "done") {
        const r = x;
        $s.append($("<div style='text-align:center;padding:6px 0 2px'>")
          .append($("<div class='done'>").text("MINTED."))
          .append($("<div class='cm' style='margin-top:10px;opacity:.65'>").text((this.col.name || this.col.slug) + " #" + r.index + " · asset " + short(r.asset) + " · owner " + short(this.wallet))));
        if (r.image) $s.append($("<div class='vimg' style='height:140px;border-color:rgba(43,213,45,.6)'>").append($("<img alt=''>").attr("src", r.image)));
        $s.append($("<div class='kvbox'>")
          .append($("<div class='kv'>").append($("<span class='kvk'>").text("image inscription C")).append($("<span class='kvv nftl-g'>").text(short(r.C))))
          .append($("<div class='kv'>").append($("<span class='kvk'>").text("metadata inscription M")).append($("<span class='kvv nftl-g'>").text(short(r.M))))
          .append($("<div class='kv'>").append($("<span class='kvk'>").text("uri")).append($("<span class='kvv'>").text(window.iqNft.gatewayHost() + "/token-meta/" + short(r.M)))));
        $s.append($("<div class='acts lab'>")
          .append($("<a class='btng'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(r.slug) + "&asset=" + r.asset).text("VIEW NFT →").on("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return; e.preventDefault(); this.openViewer(r.asset, r.slug); }))
          .append(r.mintSig ? link("SOLSCAN", window.iqNft.solscanTx(r.mintSig)).css("padding", "9px 16px") : null)
          .append(link("MAGIC EDEN", "https://magiceden.io/item-details/" + r.asset).css("padding", "9px 16px"))
          .append($("<button class='btn2' type='button'>").text("MINT ANOTHER").on("click", () => this.mintState("idle"))));
      } else if (state === "error") {
        $s.append($("<div class='nftl-e' style='font:500 10.5px/1.7 \"Kode Mono\",monospace;word-break:break-word'>").text(x))
          .append($("<button class='btn wide' type='button'>").text("RETRY · FUNDS STAY IN YOUR BURNER").on("click", () => this.mint(this.col.slug)));
      }
    },
    onConnected: function (addr) {
      this.wallet = addr;
      this.renderKv();
      this.mintState("idle");
      window.iqNft.estimateMintCost(this.col).then((lamports) => {
        this.estimate = lamports;
        this.renderKv();
        this.dbg("funding estimate ~" + sol(lamports));
      }).catch((e) => this.dbg("estimate failed: " + (e && e.message), "e"));
    },
    mint: async function (slug) {
      this.dbg("MINT start: " + slug);
      this.mintState("approve");
      const logs = [];
      const log = (t, wait) => {
        logs.push(t);
        const $l = $("#nftl_mlog"); if (!$l.length) return;
        $l.empty(); logs.forEach((s, i) => $l.append($("<div>").toggleClass("wait", wait && i === logs.length - 1).text("> " + s)));
      };
      try {
        const res = await window.iqNft.mint({
          slug, collection: this.col,
          onStage: (s, x) => {
            if (x) this.dbg("stage:" + s + " " + JSON.stringify(x));
            if (s === "funding") return; // still the approve state
            if (!$("#nftl_mlog").length) this.mintState("confirming");
            $("#nftl_mbar").css("width", (STAGE_PCT[s] || 5) + "%");
            $("#nftl_mlabel").text((STAGE_TEXT[s] || s).toUpperCase().replace(/\.$/, "") + "…");
            const detail = x && x.index != null ? " #" + x.index : x && x.C ? " " + short(x.C) : x && x.M ? " " + short(x.M) : "";
            log((STAGE_TEXT[s] || s).replace(/\.$/, "") + detail, s !== "done");
          },
          onProgress: (p) => {
            const pct = typeof p === "number" ? p : (p && (p.percent || p.pct)) || 0; // image upload 0..100 inside the image stage
            $("#nftl_mbar").css("width", Math.round(STAGE_PCT.image + (STAGE_PCT.metadata - STAGE_PCT.image) * Math.min(100, pct) / 100) + "%");
          },
        });
        this.dbg("MINT ok: " + JSON.stringify({ index: res.index, asset: res.asset, C: res.C, M: res.M, mintSig: res.mintSig }));
        this.freshIndex = res.index;
        this.mintState("done", { ...res, image: window.iqNft.imgUrl(res.C) });
        window.iqNft.getCollection(res.slug).then((c) => { if (c && !c.error) { this.col = c; this.renderProgress(); this.renderKv(); this.renderGrid(res.slug, c); } }).catch(() => {});
      } catch (e) {
        const msg = (e && e.message) || String(e);
        this.dbg("MINT ERROR: " + msg, "e");
        if (e && e.logs) this.dbg("sim logs: " + e.logs.slice(-4).join(" ; "), "e");
        this.mintState("error", msg);
      }
    },

    // ── viewer overlay (design: nft.exe pops over the current view) ──────────
    baseUrl: (slug) => (slug ? "?menu=nft&nft=" + encodeURIComponent(slug) : "?menu=nft"),
    viewerUrl: (addr, slug) => "?menu=nft&asset=" + encodeURIComponent(addr) + (slug ? "&nft=" + encodeURIComponent(slug) : ""),
    openViewer: function (addr, slug) {
      try { history.pushState({ nftv: 1 }, "", this.viewerUrl(addr, slug)); } catch (e) {}
      this.loadAsset(addr, slug).catch((e) => this.fail(e));
    },
    closeViewer: function () {
      if (!$("#nftl_viewer").hasClass("open")) return;
      if (window.history.state && window.history.state.nftv) { try { history.back(); return; } catch (e) {} }
      this.hideViewer();
    },
    hideViewer: function () { this.closeMeta(); $("#nftl_viewer").removeClass("open"); $(document).off("keydown.nftv"); this.asset = null; },

    // ── on-chain viewer (?menu=nft&asset=<addr>) ─────────────────────────
    // Reads the asset from the chain only (no backend): recovered image +
    // metadata, proving the "recover without us" claim. Floats over the base view.
    loadAsset: async function (addr, slug) {
      $("#nftl_loading").hide();
      $("#nftl_viewer").addClass("open").scrollTop(0);
      $("#nftl_vclose").off("click").on("click", () => this.closeViewer());
      $("#nftl_viewer").off("click.bd").on("click.bd", (e) => { if (e.target === e.currentTarget) this.closeViewer(); });
      $(document).off("keydown.nftv").on("keydown.nftv", (e) => { if (e.key === "Escape") { if ($("#nftl_metapop").hasClass("open")) return; this.closeViewer(); } });
      // reset to the loading state each open (the overlay is reused)
      $("#nftl_vimg").hide().attr("src", "");
      $("#nftl_vphtxt").show().text("reading the asset account…");
      $("#nftl_vcap").hide();
      $("#nftl_vwin").text(short(addr));
      this.dbg("viewer: " + addr);
      // Fast path: the registry mirror knows the minted item (name, holder, C, M,
      // rarity) with zero rpc calls; the json comes from the gateway cache. An
      // asset the mirror does not track (single mints) falls back to one rpc
      // account read. DECODE FROM CHAIN re-reads everything from chain.
      let a, rarity = null;
      try {
        const m = await window.iqNft.getAsset(addr);
        if (!m || m.error) throw new Error(m && m.error);
        slug = slug || m.slug;
        rarity = m.rarity;
        a = { asset: addr, name: m.name, owner: m.owner, collection: m.collection, uri: window.iqNft.metaUrl(m.metaSig), attributes: { index: String(m.index) }, M: m.metaSig, C: m.inscriptionSig, source: "registry mirror" };
        a.metadata = await window.iqNft.gatewayMeta(a.M);
        a.imageUrl = window.iqNft.imgUrl(a.C);
      } catch (e) {
        this.dbg("viewer: not in the registry mirror (" + (e && e.message) + "), reading the account");
        $("#nftl_vphtxt").text("reading the asset account\u2026");
        a = await window.iqNft.viewAsset(addr);
        a.source = "asset account";
        if (slug && a.attributes.index) { try { const it = await window.iqNft.getItem(slug, a.attributes.index); rarity = it && it.rarity ? it.rarity : null; } catch (e2) {} }
      }
      this.asset = a;
      this.dbg("viewer: via " + a.source + " C=" + short(a.C) + " M=" + short(a.M));
      $("#nftl_vwin").text(a.name || short(addr));
      const tier = (rarity && rarity.tier) || "common", lit = tier !== "common";
      const RC = { common: "#e8e4d6", rare: "#5aa9ff", epic: "#c77dff", legendary: "#ffb347" };
      $("#nftl_vrchip").attr("class", "rchip c-" + tier).text(lit ? tier : "").toggle(lit);
      $("#nftl_vph").attr("class", "vimg" + (lit ? " r-" + tier : ""));
      $("#nftl_vwinbox").attr("class", "win" + (lit ? " r-" + tier : ""));
      // LEFT column: identity / rarity / holder / status
      $("#nftl_vname").text(a.name || short(addr));
      $("#nftl_vcol").text(a.collection ? "collection " + short(a.collection) : "");
      $("#nftl_vrarity").text(tier).css("color", RC[tier]);
      const lvl = { common: 1, rare: 2, epic: 3, legendary: 4 }[tier];
      const $pips = $("#nftl_vpips").empty();
      for (let i = 0; i < 4; i++) $pips.append($("<span>").css("background", i < lvl ? RC[tier] : "rgba(232,228,214,.15)"));
      $("#nftl_vholder").text(a.owner ? short(a.owner) : "-");
      $("#nftl_vstd").text(a.attributes.std || "iqnft-0.1");
      // CENTER: image
      if (a.imageUrl) {
        $("#nftl_vimg").attr("src", a.imageUrl).on("load", () => $("#nftl_vphtxt").hide()).on("error", () => $("#nftl_vphtxt").text("gateway could not render tx C; try DECODE FROM CHAIN")).show();
        this.vcap((a.name || short(addr)) + " \u00b7 /img/C.png");
      } else {
        $("#nftl_vphtxt").text("no image pointer in the metadata");
      }
      // RIGHT column: on-chain account rows + action buttons
      this.renderAssetRows(a);
      const dev = window.iqNft.explorerCluster();
      const L = $("#nftl_vlinks").empty();
      L.append($("<button class='btng' type='button' id='nftl_recover'>").text("DECODE").on("click", () => this.recoverAsset(addr)));
      L.append($("<button class='btn2' type='button'>").text("METADATA").on("click", () => this.openMeta()));
      if (a.C) L.append(link("RAW TX C", window.iqNft.viewUrl(a.C)));
      if (a.M) L.append(link("RAW TX M", window.iqNft.viewUrl(a.M)));
      L.append(link("SOLSCAN", "https://solscan.io/account/" + addr + dev));
      L.append(link("MAGIC EDEN", "https://magiceden.io/item-details/" + addr));
      $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
    },
    // metadata json popup (nested over the viewer, so the panel stays compact)
    openMeta: function () {
      $("#nftl_metapop").addClass("open");
      $("#nftl_metaclose").off("click").on("click", () => this.closeMeta());
      $("#nftl_metapop").off("click.bd").on("click.bd", (e) => { if (e.target === e.currentTarget) this.closeMeta(); });
      $(document).off("keydown.nftm").on("keydown.nftm", (e) => { if (e.key === "Escape") { e.stopPropagation(); this.closeMeta(); } });
    },
    closeMeta: function () { $("#nftl_metapop").removeClass("open"); $(document).off("keydown.nftm"); },
    // The attribute table. C and M are clickable (open the raw tx on solscan);
    // std only exists once the account itself was read.
    // The right-column ON-CHAIN ACCOUNT grid: collection + C/M (clickable to the
    // gateway viewer) + uri. Identity/rarity/holder live in the left column now.
    renderAssetRows: function (a) {
      const $p = $("#nftl_vattrs").empty();
      const row = (k, v, href) => {
        $p.append($("<span class='k'>").text(k));
        $p.append(href ? $("<a class='kvlink'>").attr({ href, target: "_blank", rel: "noopener" }).text(v) : $("<span>").text(v));
      };
      row("collection", a.collection ? short(a.collection) : "-");
      row("inscr (C)", a.C ? short(a.C) : "-", a.C ? window.iqNft.viewUrl(a.C) : null);
      row("meta (M)", a.M ? short(a.M) : "-", a.M ? window.iqNft.viewUrl(a.M) : null);
      row("uri", a.uri || "-");
    },
    vcap: (t) => $("#nftl_vcap").show().text(t),
    // The proof: re-read everything with rpc only (no gateway) and swap the image
    // for the bytes decoded in the browser. Public rpcs rate-limit the chunk walk
    // of bigger images, so this can take a while or fail; the gateway view stays.
    recoverAsset: async function (addr) {
      const $b = $("#nftl_recover").prop("disabled", true).text("DECODING\u2026");
      this.dbg("viewer: decode from chain " + addr);
      try {
        const a = await window.iqNft.recoverAsset(addr, (step) => $b.text("DECODING (" + step + ")\u2026"));
        this.dbg("viewer decoded: C=" + short(a.C) + " M=" + short(a.M) + " img=" + (a.imageDataUrl ? "yes" : "no"));
        a.source = "asset account + tx M, read by this browser";
        this.renderAssetRows(a);
        $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
        if (a.imageDataUrl) {
          $("#nftl_vimg").attr("src", a.imageDataUrl).show();
          $("#nftl_vphtxt").hide();
          this.vcap((a.name || short(addr)) + " \u00b7 decoded in your browser from tx C. no gateway, no backend.");
          $b.text("DECODED \u2713");
        } else {
          this.vcap("metadata decoded from tx M; this rpc could not stream tx C in time (rate limit). the image above is the gateway cache.");
          $b.prop("disabled", false).text("RETRY");
        }
      } catch (e) {
        this.dbg("viewer decode failed: " + (e && e.message), "e");
        this.vcap("chain decode failed on this rpc: " + ((e && e.message) || e) + ". the image above is the gateway cache.");
        $b.prop("disabled", false).text("RETRY");
      }
    },

    // ── single NFT "make it a token" (?menu=nft&single=<C>) ──────────────
    loadSingle: async function (C) {
      $("#nftl_loading").hide();
      $("#nftl_single").show();
      this.navMid("// MAKE IT A TOKEN");
      this.navBack("ALL COLLECTIONS", "?menu=nft");
      $("#nftl_sc").text(C);
      this.singleC = C;
      this.dbg("single: read inscription " + C);
      let row;
      try { row = await window.iqNft.readRow(C); }
      catch (e) { $("#nftl_sphtxt").text("could not read that inscription on this rpc: " + (e && e.message)); this.dbg("single read failed: " + (e && e.message), "e"); return; }
      this.singleRow = row;
      $("#nftl_sowner").text(short(row.who || "-"));
      const body = row.body || "";
      $("#nftl_sphtxt").hide();
      if ((row.kind === "image" || /^data:image\//.test(body)) && body) {
        $("#nftl_simg").attr("src", body).show();
        $("#nftl_scap").show().text("this image is inscribed on chain (tx C)");
      } else {
        $("#nftl_stext").text(typeof body === "string" ? body : JSON.stringify(row)).show();
        $("#nftl_scap").show().text("kind: " + (row.kind || "?") + " · inscribed on chain (tx C)");
      }
      $("#nftl_sname").val("");
      this.singleState("idle");
      if (this.wallet) this.onSingleConnected(this.wallet);
    },
    singleState: function (state, x) {
      const $s = $("#nftl_sstate").empty();
      const owner = this.singleRow && this.singleRow.who;
      if (state === "idle") {
        if (!this.wallet) $s.append($("<button class='btn2 wide' type='button'>").text("CONNECT WALLET").on("click", () => $("#nftl_hconnect").trigger("click")));
        else if (owner && owner !== this.wallet) $s.append($("<div class='nftl-e' style='font:500 10.5px/1.7 \"Kode Mono\",monospace'>").text("only the owner of this inscription (" + short(owner) + ") can tokenize it. connected: " + short(this.wallet)));
        else $s.append($("<button class='btn wide' type='button'>").text("MAKE IT A TOKEN · SIGN IN WALLET").on("click", () => this.mintSingle()));
      } else if (state === "working") {
        $s.append($("<div class='approve'>").text(x.toUpperCase() + "…"));
      } else if (state === "done") {
        $s.append($("<div style='text-align:center;padding:6px 0 2px'>").append($("<div class='done'>").text("MINTED.")).append($("<div class='cm' style='margin-top:10px;opacity:.65'>").text("asset " + short(x.asset) + " · owner " + short(this.wallet))))
          .append($("<div class='kvbox'>")
            .append($("<div class='kv'>").append($("<span class='kvk'>").text("inscription C")).append($("<span class='kvv nftl-g'>").text(short(this.singleC))))
            .append($("<div class='kv'>").append($("<span class='kvk'>").text("metadata M")).append($("<span class='kvv nftl-g'>").text(short(x.M)))))
          .append($("<div class='acts lab'>")
            .append($("<a class='btng'>").attr("href", "?menu=nft&asset=" + x.asset).text("VIEW NFT →").on("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return; e.preventDefault(); this.openViewer(x.asset); }))
            .append(x.mintSig ? link("SOLSCAN", window.iqNft.solscanTx(x.mintSig)).css("padding", "9px 16px") : null));
      } else if (state === "error") {
        $s.append($("<div class='nftl-e' style='font:500 10.5px/1.7 \"Kode Mono\",monospace;word-break:break-word'>").text(x))
          .append($("<button class='btn wide' type='button'>").text("RETRY").on("click", () => this.mintSingle()));
      }
    },
    onSingleConnected: function (addr) {
      this.wallet = addr;
      this.singleState("idle");
    },
    mintSingle: async function () {
      const name = ($("#nftl_sname").val() || "").trim();
      if (!name) { this.singleState("error", "give your NFT a name first"); return; }
      this.dbg("SINGLE mint start: " + this.singleC);
      this.singleState("working", "approve in your wallet");
      try {
        const res = await window.iqNft.mintSingle({
          C: this.singleC, name, kind: this.singleRow && this.singleRow.kind,
          onStage: (s, x) => { this.singleState("working", STAGE_TEXT[s] || s); if (x) this.dbg("stage:" + s + " " + JSON.stringify(x)); },
        });
        this.dbg("SINGLE mint ok: " + JSON.stringify({ asset: res.asset, M: res.M, mintSig: res.mintSig }));
        this.singleState("done", res);
      } catch (e) {
        const msg = (e && e.message) || String(e);
        this.dbg("SINGLE mint ERROR: " + msg, "e");
        this.singleState("error", msg);
      }
    },

    // Step + error trace to the console only (open F12 to follow a mint).
    dbg: function (msg, cls) {
      (cls === "e" ? console.error : console.log)("[iqnft] " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
    },
    fail: function (e) {
      $("#nftl_loading").hide();
      const msg = e && e.message ? e.message : String(e);
      $("#nftl_error").show().text("error: " + msg);
      this.dbg("LOAD FAILED: " + msg, "e");
      if (e && e.stack) this.dbg(e.stack.split("\n").slice(0, 3).join(" | "), "e");
    },
  };
})(jQuery);
