// nft_launch.js - the inscription NFT launchpad page (?menu=nft ...).
// Classic jQuery page module; all chain/wallet work goes through window.iqNft
// (js/codein/nft_bridge.js). Views: home (launchpad.exe + minted.exe), one
// collection's buyer page (collection.exe), the on-chain viewer (nft.exe) and
// the single-mint page. Markup + geometry follow NFT Launchpad Flow.dc.html.
(function ($) {
  const TEMPLATE = "./html/sections/nft_launch.html?ver=10";
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
  const arweaveUrl = (c, id) => (c && c.arweaveGateway && id ? c.arweaveGateway.replace(/\/$/, "") + "/" + id : null);
  // Cover image into a dark box: the item cover (Arweave, always serves) shows
  // at once; the inscribed banner/logo (gateway) replaces it when it has loaded.
  // No image at all -> the striped placeholder with the symbol.
  const coverInto = ($box, base, upgrade, label) => {
    $box.empty();
    if (!base && !upgrade) { $box.append($("<div class='none'>").text(label)); return; }
    const $im = $("<img alt='' loading='lazy'>").on("error", function () { $(this).remove(); if (!$box.find("img").length) $box.prepend($("<div class='none'>").text(label)); });
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
          const route = single ? this.loadSingle(single) : asset ? this.loadAsset(asset, slug) : slug ? this.load(slug) : this.loadHome();
          route.catch((e) => this.fail(e));
        });
      });
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

    // ── home ──────────────────────────────────────────────────────────────
    loadHome: async function () {
      $("#nftl_loading").hide();
      $("#nftl_home").show();
      this.navMid("// COLLECTIONS + MINTED");
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
      $("#nftl_desk_cap").text(tab === "cols"
        ? "// collections launched from this board. each one = a core collection + N inscriptions. pick one, mint one."
        : tab === "market" ? "// secondary market for everything minted here. not built yet: minted items trade on magic eden and tensor for now."
        : "// nfts owned by your wallet. collection mints and single mints side by side.");
      if (tab === "market") this.renderMarket();
      if (tab === "mine") this.renderMine();
    },
    renderSkeleton: function () {
      const $g = $("#nftl_colgrid").empty();
      for (let i = 0; i < 3; i++) $g.append($("<div class='skel'>").append($("<div class='a'>")).append($("<div style='padding:10px 12px 12px'>").append($("<div class='b'>")).append($("<div class='c'>")).append($("<div class='d'>"))));
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
      const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
      const $p = $("#nftl_pager").empty().append($("<span>").text("// page " + this.page + " / " + pages + " · showing " + shown.length + " of " + all.length));
      if (shown.length < all.length) $p.append($("<span class='more'>").text("LOAD MORE ↓").on("click", () => this.loadMore()));
      else $p.append($("<span class='eof'>").text("EOF · " + all.length + (this.chain === "all" ? " collections, all chains" : " on solana")));
    },
    // One collection card (design: cover + name/chip + creator + bar + minted/price
    // + OWNERS/SUPPLY/VOLUME/FLOOR + chain/std/HOT chips). Every value is ours:
    // volume + floor live on secondary marketplaces we do not index, so "-".
    card: function (c) {
      const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0), st = this.statusOf(c);
      const now = Math.floor(Date.now() / 1000), hot = st.label === "LIVE" && Number(c.lastMintAt) > now - 86400;
      const $card = $("<a class='card'>").toggleClass("out", st.label === "SOLD OUT").attr("href", "?menu=nft&nft=" + encodeURIComponent(c.slug));
      const $cov = $("<div class='cov'>");
      coverInto($cov, c.cover, c.banner, "[ " + (c.symbol || c.slug) + " ]");
      $cov.append($("<span class='tag'>").text("[ " + (c.symbol || c.slug).toUpperCase() + " ]"));
      const $cb = $("<div class='cb'>")
        .append($("<div style='display:flex;justify-content:space-between;align-items:center;gap:8px'>")
          .append($("<span class='cn'>").text(c.name || c.slug))
          .append($("<span>").addClass("chip " + st.cls).text(st.label)))
        .append($("<div class='cby'>").text("by " + short(c.creator)))
        .append($("<div class='bar'>").append($("<i>").css("width", (supply ? Math.round(100 * minted / supply) : 0) + "%")))
        .append($("<div class='crow'>")
          .append($("<span>").text(supply ? num(minted) + " / " + num(supply) : "single mints"))
          .append($("<span class='nftl-g'>").text(st.label === "SOLD OUT" ? "minted out" : supply ? solNum(c.priceLamports) + " SOL" : "free to tokenize")));
      const $stats = $("<div class='stats'>");
      [[c.owners != null ? fmtK(Number(c.owners)) : "-", "OWNERS"], [supply ? fmtK(supply) : "-", "SUPPLY"], ["-", "VOLUME"], ["-", "FLOOR"]]
        .forEach(([v, k]) => $stats.append($("<div class='st'>").append($("<div class='v'>").text(v)).append($("<div class='k'>").text(k))));
      const $chips = $("<div class='chips'>")
        .append($("<span class='chip chain'>").text("◎ " + short(c.collection)))
        .append($("<span class='chip'>").text("MPL CORE"));
      if (hot) $chips.append($("<span class='chip hot'>").text("▲ HOT"));
      return $card.append($cov).append($cb.append($stats).append($chips));
    },
    renderMarket: function () {
      $("#nftl_market").empty().append($("<div class='empty'>")
        .append($("<div class='zen'>").text("MARKET.EXE NOT BUILT YET."))
        .append($("<div class='cm' style='opacity:.55'>").html("listing and buying through our own marketplace program is on the roadmap.<br>until then every minted item is a normal core asset: it trades on magic eden and tensor like any other nft.")));
    },
    renderMine: function () {
      const addr = window.iqNft.connected();
      const $m = $("#nftl_mine").empty();
      if (!addr) {
        $m.append($("<div class='empty'>")
          .append($("<div class='zen'>").text("CONNECT TO SEE YOURS."))
          .append($("<div class='cm' style='opacity:.55'>").text("your nfts are read by your wallet address; each asset's own attributes point back to the inscription."))
          .append($("<button class='btn' type='button' style='padding:10px 18px'>").text("CONNECT WALLET").on("click", () => $("#nftl_hconnect").trigger("click"))));
        return;
      }
      $m.append($("<div class='empty'>")
        .append($("<div class='zen'>").text("CONNECTED " + short(addr).toUpperCase()))
        .append($("<div class='cm' style='opacity:.55'>").html("a full owned-nft gallery reads DAS (getAssetsByOwner), which this devnet endpoint does not index yet.<br>open a collection: your minted items show in its grid, each linking to the on-chain viewer.")));
    },
    // Recent mints across all collections, newest first (WHEN = first seen by
    // the registry mirror; older mints without a time sort last and show "-").
    renderMintedFeed: async function (cols) {
      const $r = $("#nftl_minted_rows").empty();
      const rows = [];
      for (const c of cols) {
        try { (await window.iqNft.getRecent(c.slug, 8)).forEach((x) => rows.push({ ...x, colName: c.name || c.slug, slug: c.slug, img: arweaveUrl(c, x.arweaveId) })); } catch (e) {}
      }
      rows.sort((a, b) => (Number(b.registeredAt) || 0) - (Number(a.registeredAt) || 0) || b.index - a.index);
      if (!rows.length) { $r.append($("<div class='cm' style='padding:16px 14px'>").text("// no mints yet")); return; }
      rows.slice(0, 16).forEach((x) => {
        const $row = $("<div class='fr'>").on("click", () => { window.location.href = "?menu=nft&nft=" + encodeURIComponent(x.slug) + "&asset=" + x.asset; });
        const $th = x.img ? $("<img class='fth' alt=''>").attr("src", x.img).on("error", function () { $(this).replaceWith($("<span class='ph fth'>").text("#" + x.index)); }) : $("<span class='ph fth'>").text("#" + x.index);
        $row.append($("<div class='fn'>").append($th)
          .append($("<div style='min-width:0'>").append($("<div class='fnt'>").text(x.colName + " #" + x.index)).append($("<div class='fna'>").text(short(x.asset)))));
        $row.append($("<span class='fc'>").text(x.colName));
        $row.append($("<span class='fo'>").text(short(x.owner)));
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
      $("#nftl_cslug").text(col.slug);
      // banner strip (if the creator inscribed one) + the 120px cover square
      if (col.banner) {
        $("#nftl_cbanner").show().find("img").attr("src", col.banner).on("error", () => $("#nftl_cbanner").hide());
      } else $("#nftl_cbanner").hide();
      coverInto($("#nftl_ccov"), col.cover, col.logo, "[ " + (col.symbol || col.slug) + " ]");
      $("#nftl_name").text(col.name || slug);
      const st = this.statusOf(col);
      $("#nftl_chip").attr("class", "chip " + st.cls).text(st.label);
      $("#nftl_meta").text(["by " + short(col.creator), num(col.maxSupply) + " items", col.sequential ? "sequential" : "random", col.symbol ? "$" + col.symbol : ""].filter(Boolean).join(" · "));
      $("#nftl_desc").text(col.description || "").toggle(!!col.description);
      const dev = window.iqNft.getRpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : "";
      $("#nftl_clinks").empty()
        .append(link("COLLECTION ON CHAIN", "https://solscan.io/account/" + col.collection + dev))
        .append(link("REGISTRY", "https://solscan.io/account/" + col.registry + dev))
        .append(link("CREATOR", "https://solscan.io/account/" + col.creator + dev));
      $("#nftl_price").html(esc(solNum(col.priceLamports)) + " <small>SOL</small>");
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
      $("#nftl_progtxt").text(num(minted) + " / " + num(supply) + " MINTED");
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
      } catch (e) { this.items = []; $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// items unavailable")); return; }
      this.paintGrid();
    },
    paintGrid: function () {
      const $g = $("#nftl_grid").empty(), col = this.col, f = this.filter || "all";
      const items = (this.items || []).filter((it) => f === "all" || (f === "avail" && !it.minted) || (f === "minted" && it.minted));
      if (!items.length) { $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// nothing here")); return; }
      items.forEach((it) => {
        const fresh = it.index === this.freshIndex;
        const $cell = (it.minted && it.asset)
          ? $("<a class='it'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(col.slug) + "&asset=" + it.asset)
          : $("<div class='it'>");
        $cell.toggleClass("minted", !!it.minted && !fresh).toggleClass("fresh", fresh);
        const $im = $("<div class='im'>");
        const src = arweaveUrl(col, it.arweaveId);
        if (src) $im.append($("<img alt='' loading='lazy'>").attr("src", src).on("error", function () { $(this).remove(); }));
        $im.append($("<span class='tag'>").text(fresh ? "yours" : "#" + it.index));
        $cell.append($im).append($("<div class='if'>").append($("<span>").text("#" + it.index)).append($("<span class='st'>").text(fresh ? "MINTED ✓" : it.minted ? "minted" : "open")));
        $g.append($cell);
      });
    },

    // Mint panel states (design: idle / approve / confirming / done, + error).
    mintState: function (state, x) {
      const $s = $("#nftl_mstate").empty();
      if (state === "idle") {
        if (!this.wallet) $s.append($("<button id='nftl_connect' class='btn2 wide' type='button'>").text("CONNECT WALLET TO MINT").on("click", () => $("#nftl_hconnect").trigger("click")));
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
          .append($("<div class='kv'>").append($("<span class='kvk'>").text("uri")).append($("<span class='kvv'>").text("gateway.iqlabs.dev/token-meta/" + short(r.M)))));
        $s.append($("<div class='acts lab'>")
          .append($("<a class='btng'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(r.slug) + "&asset=" + r.asset).text("VIEW NFT →"))
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
        const it = (this.items || []).find((i) => i.index === res.index);
        this.mintState("done", { ...res, image: it ? arweaveUrl(this.col, it.arweaveId) : null });
        window.iqNft.getCollection(res.slug).then((c) => { if (c && !c.error) { this.col = c; this.renderProgress(); this.renderKv(); this.renderGrid(res.slug, c); } }).catch(() => {});
      } catch (e) {
        const msg = (e && e.message) || String(e);
        this.dbg("MINT ERROR: " + msg, "e");
        if (e && e.logs) this.dbg("sim logs: " + e.logs.slice(-4).join(" ; "), "e");
        this.mintState("error", msg);
      }
    },

    // ── on-chain viewer (?menu=nft&asset=<addr>) ─────────────────────────
    // Reads the asset from the chain only (no backend): recovered image +
    // metadata, proving the "recover without us" claim. slug drives the back link.
    loadAsset: async function (addr, slug) {
      $("#nftl_loading").hide();
      $("#nftl_viewer").show();
      this.navMid("// NFT VIEWER");
      $("#nftl_vback").attr("href", slug ? "?menu=nft&nft=" + encodeURIComponent(slug) : "?menu=nft").text(slug ? "\u2190 " + slug : "\u2190 all collections");
      $("#nftl_vwin").text(short(addr));
      this.dbg("viewer: read asset " + addr);
      // Default = gateway cache: one rpc read for the account, then the metadata
      // json and the image come from the gateway (fast). DECODE FROM CHAIN below
      // re-does it with rpc only.
      const a = await window.iqNft.viewAsset(addr);
      this.dbg("viewer: C=" + short(a.C) + " M=" + short(a.M) + " image=" + (a.imageUrl ? "gateway" : "none"));
      this.asset = a;
      $("#nftl_vwin").text(a.name || short(addr));
      $("#nftl_vsub").text("// " + [a.collection ? "collection " + short(a.collection) : "", a.owner ? "owner " + short(a.owner) : ""].filter(Boolean).join(" \u00b7 "));
      if (a.imageUrl) {
        $("#nftl_vimg").attr("src", a.imageUrl).on("load", () => $("#nftl_vphtxt").hide()).on("error", () => $("#nftl_vphtxt").text("gateway could not render tx C; try DECODE FROM CHAIN")).show();
        this.vcap((a.name || short(addr)) + " \u00b7 gateway /img/C.png (cache of tx C). fallback: decode tx C directly");
      } else {
        $("#nftl_vphtxt").text("no image pointer in the metadata");
      }
      const $p = $("#nftl_vattrs").empty();
      [["name", a.name], ["collection", a.collection || "-"], ["index", a.attributes.index || "-"], ["inscription (C)", a.C || "-", "nftl-g"], ["metadata (M)", a.M || "-", "nftl-g"], ["std", a.attributes.std || "-"], ["uri", a.uri]]
        .forEach(([k, v, cls]) => $p.append($("<div class='kv'>").append($("<span class='kvk'>").text(k)).append($("<span class='kvv'>").addClass(cls || "").text(v))));
      const dev = window.iqNft.getRpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : "";
      const L = $("#nftl_vlinks").empty();
      L.append($("<button class='btng' type='button' id='nftl_recover'>").css("padding", "7px 12px").text("DECODE FROM CHAIN").on("click", () => this.recoverAsset(addr)));
      L.append(link("SOLSCAN", "https://solscan.io/account/" + addr + dev).css("padding", "7px 12px"));
      if (a.C) L.append(link("RAW TX C", window.iqNft.solscanTx(a.C)).css("padding", "7px 12px"));
      if (a.M) L.append(link("RAW TX M", window.iqNft.solscanTx(a.M)).css("padding", "7px 12px"));
      L.append(link("MAGIC EDEN", "https://magiceden.io/item-details/" + addr).css("padding", "7px 12px"));
      $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
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
        $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
        if (a.imageDataUrl) {
          $("#nftl_vimg").attr("src", a.imageDataUrl).show();
          $("#nftl_vphtxt").hide();
          this.vcap((a.name || short(addr)) + " \u00b7 decoded in your browser from tx C. no gateway, no backend.");
          $b.text("DECODED FROM CHAIN \u2713");
        } else {
          this.vcap("metadata decoded from tx M; this rpc could not stream tx C in time (rate limit). the image above is the gateway cache.");
          $b.prop("disabled", false).text("DECODE FROM CHAIN \u00b7 RETRY");
        }
      } catch (e) {
        this.dbg("viewer decode failed: " + (e && e.message), "e");
        this.vcap("chain decode failed on this rpc: " + ((e && e.message) || e) + ". the image above is the gateway cache.");
        $b.prop("disabled", false).text("DECODE FROM CHAIN \u00b7 RETRY");
      }
    },

    // ── single NFT "make it a token" (?menu=nft&single=<C>) ──────────────
    loadSingle: async function (C) {
      $("#nftl_loading").hide();
      $("#nftl_single").show();
      this.navMid("// MAKE IT A TOKEN");
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
            .append($("<a class='btng'>").attr("href", "?menu=nft&asset=" + x.asset).text("VIEW NFT →"))
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
