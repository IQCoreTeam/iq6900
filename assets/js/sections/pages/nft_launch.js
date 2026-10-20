// nft_launch.js - the inscription NFT launchpad page (?menu=nft&nft=<slug>).
// Classic jQuery page module; all chain/wallet work goes through window.iqNft
// (js/codein/nft_bridge.js). v1 = one collection's buyer mint view: header,
// item grid, and a mint panel that drives iqNft.mint() stage by stage.
(function ($) {
  const TEMPLATE = "./html/sections/nft_launch.html?ver=4";
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
  function assetFromUrl() {
    const p = new URLSearchParams(window.location.search).get("asset");
    return p && p.trim() ? p.trim() : null; // present -> show the on-chain viewer
  }
  function singleFromUrl() {
    const p = new URLSearchParams(window.location.search).get("single");
    return p && p.trim() ? p.trim() : null; // present -> show the single-NFT (make it a token) view
  }
  const sol = (lamports) => (Number(lamports || 0) / 1e9).toFixed(4) + " SOL";
  const setBar = (pct) => $("#nftl_progbar").css("width", Math.max(0, Math.min(100, pct)) + "%");
  const short = (s) => (s ? s.slice(0, 8) + "..." + s.slice(-6) : "");

  $.nft_launch = {
    init: function () {
      const slug = slugFromUrl();
      const asset = assetFromUrl();
      const single = singleFromUrl();
      $.get(TEMPLATE, (html) => {
        $("#main_section").show().empty().append($(html));
        this.dbg("page init" + (single ? ", single=" + single : asset ? ", asset=" + asset : slug ? ", slug=" + slug : ", home"));
        bridge(() => {
          const route = single ? this.loadSingle(single) : asset ? this.loadAsset(asset, slug) : slug ? this.load(slug) : this.loadHome();
          route.catch((e) => this.fail(e));
        });
      });
    },

    // Home: launchpad.exe (collection cards + MY NFTS) + minted.exe (recent mints).
    loadHome: async function () {
      const cols = await window.iqNft.getCollections();
      this.dbg("home: " + cols.length + " collection(s)");
      $("#nftl_loading").hide();
      $("#nftl_home").show();
      this.cols = cols;
      $("#nftl_tab_cols").off("click").on("click", () => this.homeTab("cols"));
      $("#nftl_tab_mine").off("click").on("click", () => this.homeTab("mine"));
      this.renderCols(cols);
      this.renderMintedFeed(cols); // async, fills the right window as it goes
    },
    homeTab: function (tab) {
      $("#nftl_tab_cols").toggleClass("on", tab === "cols");
      $("#nftl_tab_mine").toggleClass("on", tab === "mine");
      $("#nftl_colgrid").toggle(tab === "cols");
      $("#nftl_desk_cap").toggle(tab === "cols");
      $("#nftl_mine").toggle(tab === "mine");
      if (tab === "mine") this.renderMine();
    },
    renderCols: function (cols) {
      const $g = $("#nftl_colgrid").empty();
      if (!cols.length) { $g.append($("<div class='cm' style='grid-column:1/-1;padding:20px 0'>").text("no collections yet. be the first: + LAUNCH A COLLECTION")); return; }
      // live first, then upcoming, then sold out
      const rank = (c) => { const s = this.statusOf(c); return s.label === "LIVE" ? 0 : s.label === "UPCOMING" ? 1 : s.label === "SINGLE" ? 2 : 3; };
      cols.slice().sort((a, b) => rank(a) - rank(b)).forEach((c) => {
        const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0), st = this.statusOf(c);
        const $card = $("<a class='ccard'>").attr("href", "?menu=nft&nft=" + encodeURIComponent(c.slug));
        const $cov = $("<div class='cov ph' style='position:relative'>").text("[ " + (c.symbol || c.name || c.slug) + " ]");
        if (c.logo) $cov.append($("<img>").attr("src", c.logo).css({ position: "absolute", inset: 0, width: "100%", height: "100%", "object-fit": "cover" }).on("error", function () { $(this).remove(); }));
        const $head = $("<div style='display:flex;justify-content:space-between;align-items:center;gap:8px'>")
          .append($("<span class='cn'>").text(c.name || c.slug))
          .append($("<span>").addClass("chip " + st.cls).text(st.label));
        const pct = supply ? (minted / supply) * 100 : 0;
        const $body = $("<div class='cbody'>")
          .append($head)
          .append($("<div class='cby'>").text("by " + short(c.creator)))
          .append($("<div class='pbar'>").append($("<i>").css("width", pct + "%")))
          .append($("<div class='crow'>").append($("<span>").text(supply ? minted + " / " + supply : "single mint")).append($("<span style='color:var(--green)'>").text(sol(c.priceLamports))));
        $card.append($cov).append($body);
        $g.append($card);
      });
    },
    renderMine: function () {
      const addr = window.iqNft.connected();
      const $m = $("#nftl_mine").empty();
      if (!addr) {
        $m.append($("<div style='text-align:center;padding:44px 0'>")
          .append($("<div style='font:400 18px \"Zen Dots\",monospace;opacity:.85'>").text("CONNECT TO SEE YOURS."))
          .append($("<div class='cm' style='margin:10px 0 16px'>").text("your NFTs are read from the chain by your wallet address."))
          .append($("<button class='btn' id='nftl_mine_connect' type='button'>").text("CONNECT WALLET")));
        $("#nftl_mine_connect").on("click", async () => { try { await window.iqNft.connect(); this.renderMine(); } catch (e) {} });
        return;
      }
      $m.append($("<div class='cm' style='padding:34px 0;text-align:center;line-height:1.9'>")
        .html("connected as " + short(addr) + ".<br>a full owned-NFT gallery reads DAS (getAssetsByOwner), which needs an indexing RPC not wired on this devnet endpoint yet.<br>open a collection: your minted items show there, and each links to the on-chain viewer."));
    },
    // Recent mints across all collections, newest first.
    renderMintedFeed: async function (cols) {
      const $r = $("#nftl_minted_rows").empty();
      const rows = [];
      for (const c of cols) {
        try { (await window.iqNft.getRecent(c.slug, 8)).forEach((x) => rows.push({ ...x, colName: c.name || c.slug, slug: c.slug })); } catch (e) {}
      }
      rows.sort((a, b) => (Number(b.registeredAt) || 0) - (Number(a.registeredAt) || 0));
      if (!rows.length) { $r.append($("<div class='cm' style='padding:16px 14px'>").text("no mints yet")); return; }
      rows.slice(0, 16).forEach((x) => {
        const $row = $("<div class='mrow'>").on("click", () => { window.location.href = "?menu=nft&nft=" + encodeURIComponent(x.slug) + "&asset=" + x.asset; });
        $row.append($("<div class='mn'>")
          .append($("<span class='mth ph'>").css("font-size", "8px").text("#" + x.index))
          .append($("<div style='min-width:0'>").append($("<div class='mnt'>").text(x.colName + " #" + x.index)).append($("<div class='mna'>").text(short(x.asset)))));
        $row.append($("<span class='mc'>").text(x.colName));
        $row.append($("<span class='mo'>").text(short(x.owner)));
        $r.append($row);
      });
    },
    statusOf: function (c) {
      const supply = Number(c.maxSupply || 0), minted = Number(c.minted || 0);
      const now = Math.floor(Date.now() / 1000);
      if (!supply) return { label: "SINGLE", cls: "" };
      if (minted >= supply) return { label: "SOLD OUT", cls: "out" };
      if (Number(c.startAt) > now) return { label: "UPCOMING", cls: "soon" };
      return { label: "LIVE", cls: "live" };
    },

    // On-chain NFT viewer (?menu=nft&asset=<addr>). Reads the asset from the
    // chain only (no backend) and shows the recovered image + metadata, proving
    // the "recover without us" claim. slug (optional) just drives the back link.
    loadAsset: async function (addr, slug) {
      $("#nftl_loading").hide();
      $("#nftl_viewer").show();
      $("#nftl_vback").attr("href", slug ? "?menu=nft&nft=" + encodeURIComponent(slug) : "?menu=nft").text(slug ? "← " + slug : "← all collections");
      $("#nftl_vname").text("recovering " + short(addr) + " ...");
      this.dbg("viewer: read asset " + addr);
      const a = await window.iqNft.viewAsset(addr, (step) => { $("#nftl_vname").text("recovering (" + step + ") ..."); });
      this.dbg("viewer recovered: C=" + short(a.C) + " M=" + short(a.M) + " img=" + (a.imageDataUrl ? "yes" : "no"));
      $("#nftl_vname").text(a.name || short(addr));
      $("#nftl_vsub").text([a.collection ? "collection " + short(a.collection) : "", a.owner ? "owner " + short(a.owner) : ""].filter(Boolean).join("  .  "));

      if (a.imageDataUrl) {
        $("#nftl_vimg").attr("src", a.imageDataUrl).show();
        $("#nftl_vimgnote").text("decoded in your browser from the image inscription (tx C).");
      } else {
        $("#nftl_vimg").hide();
        $("#nftl_vimgnote").html("image not recovered on this RPC. metadata image pointer: " + (a.metadata && a.metadata.image ? a.metadata.image : "-"));
      }

      const rows = [
        ["name", a.name],
        ["collection", a.collection || "-"],
        ["index", a.attributes.index || "-"],
        ["inscription (C)", a.C || "-"],
        ["metadata (M)", a.M || "-"],
        ["std", a.attributes.std || "-"],
        ["uri", a.uri],
      ];
      const $p = $("#nftl_vattrs").empty();
      rows.forEach(([k, v]) => {
        $p.append($("<div>").css({ display: "flex", "justify-content": "space-between", gap: "10px", padding: "5px 0", "border-bottom": "1px solid var(--line)", "font-size": ".68rem" })
          .append($("<span class='k'>").text(k))
          .append($("<span>").css({ color: "var(--cream)", "word-break": "break-all", "text-align": "right" }).text(v)));
      });

      const L = $("#nftl_vlinks").empty();
      if (a.C) L.append($("<a>").attr({ href: window.iqNft.solscanTx(a.C), target: "_blank" }).text("raw tx C"));
      if (a.M) L.append($("<a>").attr({ href: window.iqNft.solscanTx(a.M), target: "_blank" }).text("raw tx M"));
      const dev = window.iqNft.getRpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : "";
      L.append($("<a>").attr({ href: "https://solscan.io/account/" + addr + dev, target: "_blank" }).text("asset on solscan"));
      L.append($("<a>").attr({ href: "https://magiceden.io/item-details/" + addr, target: "_blank" }).text("magic eden"));

      $("#nftl_vmeta").text(JSON.stringify(a.metadata, null, 2));
    },

    // Single NFT "make it a token" view (?menu=nft&single=<C>). Reads the user's
    // inscription from chain, gates on ownership (feed row who == wallet), and
    // mints a 1/1 via iqNft.mintSingle.
    loadSingle: async function (C) {
      $("#nftl_loading").hide();
      $("#nftl_single").show();
      $("#nftl_sc").text(C);
      this.singleC = C;
      this.dbg("single: read inscription " + C);
      let row;
      try { row = await window.iqNft.readRow(C); }
      catch (e) { $("#nftl_scontent").text("could not read that inscription on this RPC: " + (e && e.message)); this.dbg("single read failed: " + (e && e.message), "e"); return; }
      this.singleRow = row;
      $("#nftl_sowner").text(short(row.who || "-"));
      const body = row.body || "";
      if ((row.kind === "image" || /^data:image\//.test(body)) && body) {
        $("#nftl_simg").attr("src", body).show(); $("#nftl_stext").hide(); $("#nftl_scontent").text("this image is inscribed on chain (tx C).");
      } else {
        $("#nftl_stext").text(typeof body === "string" ? body : JSON.stringify(row)).show(); $("#nftl_simg").hide(); $("#nftl_scontent").text("kind: " + (row.kind || "?"));
      }
      $("#nftl_sname").val("");
      this.wireSingle();
      const addr = window.iqNft.connected();
      if (addr) this.onSingleConnected(addr);
    },
    wireSingle: function () {
      $("#nftl_sconnect").off("click").on("click", async () => {
        try { this.onSingleConnected(await window.iqNft.connect()); }
        catch (e) { $("#nftl_sstatus").addClass("err").text(e.message || String(e)); }
      });
      $("#nftl_smint").off("click").on("click", () => this.mintSingle());
    },
    onSingleConnected: function (addr) {
      this.singleWallet = addr;
      this.dbg("single wallet: " + addr);
      $("#nftl_sconnect").hide();
      const owner = this.singleRow && this.singleRow.who;
      if (owner && owner !== addr) {
        $("#nftl_smint").hide();
        $("#nftl_sstatus").addClass("err").text("only the owner of this inscription (" + short(owner) + ") can tokenize it. connected: " + short(addr));
      } else {
        $("#nftl_smint").show();
        $("#nftl_sstatus").removeClass("err").text("");
      }
    },
    mintSingle: async function () {
      const name = ($("#nftl_sname").val() || "").trim();
      if (!name) { $("#nftl_sstatus").addClass("err").text("give your NFT a name"); return; }
      $("#nftl_smint").prop("disabled", true);
      $("#nftl_sresult").hide();
      this.dbg("SINGLE mint start: " + this.singleC);
      try {
        const res = await window.iqNft.mintSingle({
          C: this.singleC, name, kind: this.singleRow && this.singleRow.kind,
          onStage: (s, x) => { $("#nftl_sstatus").removeClass("err").text(STAGE_TEXT[s] || s); if (x) this.dbg("stage:" + s + " " + JSON.stringify(x)); },
        });
        this.dbg("SINGLE mint ok: " + JSON.stringify({ asset: res.asset, M: res.M, mintSig: res.mintSig }));
        $("#nftl_sstatus").removeClass("err").text(STAGE_TEXT.done);
        $("#nftl_sasset").text(res.asset);
        const L = $("#nftl_slinks").empty();
        L.append($("<a>").attr("href", "?menu=nft&asset=" + res.asset).text("view nft"));
        if (res.mintSig) L.append($("<a>").attr({ href: window.iqNft.solscanTx(res.mintSig), target: "_blank" }).text("mint tx"));
        L.append($("<a>").attr({ href: window.iqNft.solscanTx(res.M), target: "_blank" }).text("metadata tx"));
        $("#nftl_sresult").show();
        $("#nftl_smint").prop("disabled", false).text("MAKE ANOTHER");
      } catch (e) {
        const msg = (e && e.message) || String(e);
        $("#nftl_sstatus").addClass("err").text(msg);
        this.dbg("SINGLE mint ERROR: " + msg, "e");
        $("#nftl_smint").prop("disabled", false);
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

    load: async function (slug) {
      const col = await window.iqNft.getCollection(slug);
      if (!col || col.error) throw new Error(col && col.error ? col.error : "collection not found: " + slug);
      this.col = col;
      this.dbg("collection loaded: " + col.slug + " supply=" + col.maxSupply + " price=" + col.priceLamports + " deposit=" + col.depositLamports + " minted=" + col.minted + " treasury=" + short(col.treasury));
      $("#nftl_loading").hide();
      $("#nftl_view").show();
      if (!$("#nftl_back").length) $("#nftl_name").before($("<a id='nftl_back'>").attr("href", "?menu=nft").css("font-size", ".7rem").text("← all collections"));
      // Collection banner + logo (from the inscribed collection.json).
      $("#nftl_banner_wrap").remove();
      if (col.banner || col.logo) {
        const wrap = $("<div id='nftl_banner_wrap' style='margin:8px 0 12px'>");
        if (col.banner) wrap.append($("<img>").attr("src", col.banner).css({ width: "100%", "max-height": "180px", "object-fit": "cover", border: "1px solid var(--line)", "border-radius": "8px", display: "block" }).on("error", function () { this.style.display = "none"; }));
        if (col.logo) wrap.append($("<img>").attr("src", col.logo).css({ width: "64px", height: "64px", "object-fit": "cover", border: "1px solid var(--line)", "border-radius": "8px", "margin-top": col.banner ? "-32px" : "0", "margin-left": "12px", position: "relative", display: "block" }).on("error", function () { this.style.display = "none"; }));
        $("#nftl_name").before(wrap);
      }
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
      // Every item has its (compressed) image on Arweave, so the grid is a real
      // gallery: open and minted alike show a thumbnail. Minted cells link to the
      // on-chain viewer; the image makes a just-minted item obviously succeed.
      const gw = col.arweaveGateway ? col.arweaveGateway.replace(/\/$/, "") : null;
      try {
        const data = await window.iqNft.getItems(slug, 0, 120);
        (data.items || []).forEach((it) => {
          const $cell = (it.minted && it.asset)
            ? $("<a class='cell'>").css("text-decoration", "none").attr("href", "?menu=nft&nft=" + encodeURIComponent(slug) + "&asset=" + it.asset)
            : $("<div class='cell'>");
          if (gw && it.arweaveId) {
            const img = $("<img>").attr("src", gw + "/" + it.arweaveId)
              .css({ width: "100%", "aspect-ratio": "1", "object-fit": "cover", "border-radius": "4px", display: "block", "margin-bottom": "4px" });
            img.on("error", function () { this.style.display = "none"; });
            $cell.append(img);
          }
          $cell.append($("<b>").text("#" + it.index));
          $cell.append($("<div>").css("color", it.minted ? "var(--green)" : "var(--dim)").text(it.minted ? "minted ▸ view" : "open"));
          $g.append($cell);
        });
      } catch (e) { $g.append($("<div class='cell'>").text("items unavailable")); }
    },

    onConnected: function (addr) {
      $("#nftl_addr").text(short(addr));
      $("#nftl_connect").hide();
      $("#nftl_mint").show();
      this.dbg("wallet connected: " + addr);
      window.iqNft.estimateMintCost(this.col).then((lamports) => {
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

    showResult: async function (res) {
      this.status(STAGE_TEXT.done);
      setBar(100);
      // Show the minted image so success is obvious (Arweave, same as the grid).
      $("#nftl_result .resimg").remove();
      const gw = this.col && this.col.arweaveGateway ? this.col.arweaveGateway.replace(/\/$/, "") : null;
      if (gw) {
        try {
          const data = await window.iqNft.getItems(res.slug, 0, 200);
          const it = (data.items || []).find((x) => x.index === res.index);
          if (it && it.arweaveId) {
            $("#nftl_result").prepend($("<img class='resimg'>").attr("src", gw + "/" + it.arweaveId)
              .css({ width: "140px", "aspect-ratio": "1", "object-fit": "cover", border: "1px solid var(--green)", "border-radius": "6px", "margin-bottom": "10px", display: "block" }));
          }
        } catch (e) {}
      }
      $("#nftl_asset").text(res.asset);
      $("#nftl_c").text(res.C);
      $("#nftl_m").text(res.M);
      const links = $("#nftl_links").empty();
      links.append($("<a>").attr({ href: "?menu=nft&nft=" + encodeURIComponent(res.slug) + "&asset=" + res.asset }).text("view nft"));
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
