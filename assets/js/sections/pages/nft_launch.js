// nft_launch.js - the inscription NFT launchpad page (?menu=nft ...).
// Classic jQuery page module; all chain/wallet work goes through window.iqNft
// (js/codein/nft_bridge.js). Views: home (launchpad.exe + minted.exe), one
// collection's buyer page (collection.exe), the on-chain viewer (nft.exe) and
// the single-mint page. Markup + geometry follow NFT Launchpad Flow.dc.html.
(function ($) {
  const TEMPLATE = "./html/sections/nft_launch.html?ver=7";
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
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n));
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
      if ($("#nftl_mine").is(":visible")) this.renderMine();
    },
    navMid: (t) => $("#nftl_nav_mid").text(t),

    // ── home ──────────────────────────────────────────────────────────────
    loadHome: async function () {
      const cols = await window.iqNft.getCollections();
      this.dbg("home: " + cols.length + " collection(s)");
      $("#nftl_loading").hide();
      $("#nftl_home").show();
      this.navMid("// COLLECTIONS + MINTED");
      this.cols = cols;
      $("#nftl_tab_cols").off("click").on("click", () => this.homeTab("cols"));
      $("#nftl_tab_mine").off("click").on("click", () => this.homeTab("mine"));
      this.renderCols(cols);
      this.renderMintedFeed(cols); // async, fills the right window as it goes
    },
    homeTab: function (tab) {
      $("#nftl_tab_cols").toggleClass("on", tab === "cols");
      $("#nftl_tab_mine").toggleClass("on", tab === "mine");
      $("#nftl_colgrid, #nftl_cols_note").toggle(tab === "cols");
      $("#nftl_mine").toggle(tab === "mine");
      $("#nftl_desk_cap").text(tab === "cols"
        ? "// collections launched from this board. each one = a core collection + N inscriptions. pick one, mint one."
        : "// nfts owned by your wallet. collection mints and single mints side by side.");
      if (tab === "mine") this.renderMine();
    },
    // Card cover: the registered banner, else the first item's image (both
    // inscribed, real), else the striped placeholder with the symbol.
    coverInto: function ($ph, primary, secondary, label) {
      $ph.empty().text(label);
      if (!primary) return;
      const $im = $("<img>").attr("src", primary);
      let fellBack = false;
      $im.on("error", function () { if (!fellBack && secondary) { fellBack = true; this.src = secondary; } else { $(this).remove(); } });
      $ph.append($im);
    },
    renderCols: function (cols) {
      const $g = $("#nftl_colgrid").empty();
      if (!cols.length) { $g.append($("<div class='cm' style='grid-column:1/-1;padding:20px 0'>").text("// no collections yet. be the first: + LAUNCH A COLLECTION")); return; }
      cols.forEach((c) => { // backend order = latest mint first (bump order)
        const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0), st = this.statusOf(c);
        const $card = $("<a class='card'>").toggleClass("out", st.label === "SOLD OUT").attr("href", "?menu=nft&nft=" + encodeURIComponent(c.slug));
        const $cov = $("<div class='ph cov'>");
        this.coverInto($cov, c.banner || c.cover, c.banner && c.cover && c.cover !== c.banner ? c.cover : null, "[ " + (c.symbol || c.name || c.slug) + " ]");
        const $cb = $("<div class='cb'>")
          .append($("<div style='display:flex;justify-content:space-between;align-items:center;gap:8px'>")
            .append($("<span class='cn'>").text(c.name || c.slug))
            .append($("<span>").addClass("chip " + st.cls).text(st.label)))
          .append($("<div class='cby'>").text("by " + short(c.creator)))
          .append($("<div class='bar'>").append($("<i>").css("width", (supply ? Math.round(100 * minted / supply) : 0) + "%")))
          .append($("<div class='crow'>")
            .append($("<span>").text(supply ? num(minted) + " / " + num(supply) : "single mints"))
            .append($("<span class='nftl-g'>").text(supply ? solNum(c.priceLamports) + " SOL" : "free to tokenize")));
        // OWNERS + SUPPLY come from our registry mirror; VOLUME + FLOOR live on
        // secondary marketplaces we do not index, so they stay "-".
        const $stats = $("<div class='stats'>");
        [["OWNERS", c.owners != null ? fmtK(Number(c.owners)) : "-"], ["SUPPLY", supply ? fmtK(supply) : "-"], ["VOLUME", "-"], ["FLOOR", "-"]]
          .forEach(([k, v]) => $stats.append($("<div class='st'>").append($("<div class='k'>").text(k)).append($("<div class='v'>").text(v))));
        $g.append($card.append($cov).append($cb.append($stats)));
      });
    },
    renderMine: function () {
      const addr = window.iqNft.connected();
      const $m = $("#nftl_mine").empty();
      if (!addr) {
        $m.append($("<div style='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:50px 0;text-align:center'>")
          .append($("<div style='font:400 20px \"Zen Dots\",monospace;opacity:.85'>").text("CONNECT TO SEE YOURS."))
          .append($("<div class='cm' style='opacity:.55'>").text("your nfts are read by your wallet address; each asset's own attributes point back to the inscription."))
          .append($("<button class='btn' type='button' style='padding:10px 18px'>").text("CONNECT WALLET").on("click", () => $("#nftl_hconnect").trigger("click"))));
        return;
      }
      $m.append($("<div style='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:50px 0;text-align:center'>")
        .append($("<div style='font:400 20px \"Zen Dots\",monospace;opacity:.85'>").text("CONNECTED " + short(addr).toUpperCase()))
        .append($("<div class='cm' style='opacity:.55'>").html("a full owned-nft gallery reads DAS (getAssetsByOwner), which this devnet endpoint does not index yet.<br>open a collection: your minted items show in its grid, each linking to the on-chain viewer.")));
    },
    // Recent mints across all collections, newest first (WHEN = first seen by
    // the registry mirror; older mints without a time sort last and show "-").
    renderMintedFeed: async function (cols) {
      const $r = $("#nftl_minted_rows").empty();
      const rows = [];
      for (const c of cols) {
        try { (await window.iqNft.getRecent(c.slug, 8)).forEach((x) => rows.push({ ...x, colName: c.name || c.slug, slug: c.slug, gw: c.arweaveGateway })); } catch (e) {}
      }
      rows.sort((a, b) => (Number(b.registeredAt) || 0) - (Number(a.registeredAt) || 0) || b.index - a.index);
      if (!rows.length) { $r.append($("<div class='cm' style='padding:16px 14px'>").text("// no mints yet")); return; }
      rows.slice(0, 16).forEach((x) => {
        const $row = $("<div class='fr'>").on("click", () => { window.location.href = "?menu=nft&nft=" + encodeURIComponent(x.slug) + "&asset=" + x.asset; });
        $row.append($("<div class='fn'>")
          .append($("<span class='ph fth'>").text("#" + x.index))
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
      this.coverInto($("#nftl_ccov"), col.logo || col.cover, col.logo && col.cover ? col.cover : null, "[ " + (col.symbol || col.slug) + " ]");
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
      $("#nftl_fee").text([Number(col.depositLamports) > 0 ? "+ " + solNum(col.depositLamports) + " deposit at reserve" : "", "+ platform fee", "+ inscription rent", "leftover returns"].filter(Boolean).join(" \u00b7 "));
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
    canMint: function () { const s = this.statusOf(this.col).label; return s === "LIVE"; },
    renderKv: function () {
      const c = this.col, st = this.statusOf(c), now = Math.floor(Date.now() / 1000);
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
      void now;
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
      const gw = col.arweaveGateway ? col.arweaveGateway.replace(/\/$/, "") : null;
      const items = (this.items || []).filter((it) => f === "all" || (f === "avail" && !it.minted) || (f === "minted" && it.minted));
      if (!items.length) { $g.append($("<div class='cm' style='grid-column:1/-1'>").text("// nothing here")); return; }
      items.forEach((it) => {
        const fresh = it.index === this.freshIndex;
        const $cell = (it.minted && it.asset)
          ? $("<a class='it'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(col.slug) + "&asset=" + it.asset)
          : $("<div class='it'>");
        $cell.toggleClass("minted", !!it.minted && !fresh).toggleClass("fresh", fresh);
        const $ph = $("<div class='ph'>").text("#" + it.index);
        if (gw && it.arweaveId) $ph.append($("<img>").attr("src", gw + "/" + it.arweaveId).on("error", function () { $(this).remove(); }));
        $cell.append($ph).append($("<div class='if'>").append($("<span>").text("#" + it.index)).append($("<span class='st'>").text(fresh ? "MINTED ✓" : it.minted ? "minted" : "open")));
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
        if (r.image) $s.append($("<div class='ph' style='height:140px;border:1px solid rgba(43,213,45,.6);border-radius:6px'>").append($("<img>").attr("src", r.image)));
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
        const gw = this.col.arweaveGateway ? this.col.arweaveGateway.replace(/\/$/, "") : null;
        const it = (this.items || []).find((i) => i.index === res.index);
        this.mintState("done", { ...res, image: gw && it && it.arweaveId ? gw + "/" + it.arweaveId : null });
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
      $("#nftl_vback").attr("href", slug ? "?menu=nft&nft=" + encodeURIComponent(slug) : "?menu=nft").text(slug ? "← " + slug : "← all collections");
      $("#nftl_vwin").text(short(addr));
      this.dbg("viewer: read asset " + addr);
      const a = await window.iqNft.viewAsset(addr, (step) => $("#nftl_vphtxt").text("reading (" + step + ")…"));
      this.dbg("viewer recovered: C=" + short(a.C) + " M=" + short(a.M) + " img=" + (a.imageDataUrl ? "yes" : "no"));
      $("#nftl_vwin").text(a.name || short(addr));
      $("#nftl_vsub").text("// " + [a.collection ? "collection " + short(a.collection) : "", a.owner ? "owner " + short(a.owner) : ""].filter(Boolean).join(" · "));
      if (a.imageDataUrl) {
        $("#nftl_vphtxt").hide();
        $("#nftl_vimg").attr("src", a.imageDataUrl).show();
        $("#nftl_vimgnote").text("// decoded in your browser from the image inscription (tx C). no gateway, no backend.");
      } else {
        $("#nftl_vphtxt").text("image not recovered on this rpc");
        $("#nftl_vimgnote").text("// metadata image pointer: " + (a.metadata && a.metadata.image ? a.metadata.image : "-"));
      }
      const $p = $("#nftl_vattrs").empty();
      [["name", a.name], ["collection", a.collection || "-"], ["index", a.attributes.index || "-"], ["inscription (C)", a.C || "-", "nftl-g"], ["metadata (M)", a.M || "-", "nftl-g"], ["std", a.attributes.std || "-"], ["uri", a.uri]]
        .forEach(([k, v, cls]) => $p.append($("<div class='kv'>").append($("<span class='kvk'>").text(k)).append($("<span class='kvv'>").addClass(cls || "").text(v))));
      const dev = window.iqNft.getRpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : "";
      const L = $("#nftl_vlinks").empty();
      L.append(link("SOLSCAN", "https://solscan.io/account/" + addr + dev).css("padding", "7px 12px"));
      if (a.C) L.append(link("RAW TX C", window.iqNft.solscanTx(a.C)).css("padding", "7px 12px"));
      if (a.M) L.append(link("RAW TX M", window.iqNft.solscanTx(a.M)).css("padding", "7px 12px"));
      L.append(link("MAGIC EDEN", "https://magiceden.io/item-details/" + addr).css("padding", "7px 12px"));
      $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
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
      catch (e) { $("#nftl_sphtxt").text("could not read that inscription on this rpc"); $("#nftl_scontent").text("// " + (e && e.message)); this.dbg("single read failed: " + (e && e.message), "e"); return; }
      this.singleRow = row;
      $("#nftl_sowner").text(short(row.who || "-"));
      const body = row.body || "";
      $("#nftl_sphtxt").hide();
      if ((row.kind === "image" || /^data:image\//.test(body)) && body) {
        $("#nftl_simg").attr("src", body).show();
        $("#nftl_scontent").text("// this image is inscribed on chain (tx C).");
      } else {
        $("#nftl_stext").text(typeof body === "string" ? body : JSON.stringify(row)).show();
        $("#nftl_scontent").text("// kind: " + (row.kind || "?"));
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
