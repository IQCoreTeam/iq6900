// Boardexe / Chart page module: split view. The left side is a compact
// read-only render of the inscription board; the right side is a market table
// of the coins launched through the board (feed rows with kind "token"),
// sorted by market cap and refreshed periodically from the DexScreener API.
// Clicking a row swaps the table for the live DexScreener chart embed.
(function ($) {
  $.extend(true, window, { boardexe: Boardexe });

  function Boardexe() {
    const templateUrl = "./html/sections/boardexe.html?ver=2";
    const FEED_PAGES = 8;        // 8 x 50 rows is plenty while the feed is young
    const PRICE_MS = 30000;      // dexscreener refresh
    const FEED_TICKS = 5;        // re-read the feed every 5th price tick
    let feedRows = [];           // non-token inscription rows for the left side
    let tokens = [];             // [{ mint, name, symbol, sig, pair }]
    let current = null;          // token shown in the chart view
    let timer = null;
    let tick = 0;

    function init(token) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("menu", "boardexe");
        token ? url.searchParams.set("token", token) : url.searchParams.delete("token");
        url.searchParams.delete("post");
        history.pushState({ menu: "boardexe" }, "", url);
      } catch (e) {}
      $.ajax({ url: templateUrl, dataType: "html", type: "get", global: false, success: (html) => {
        $("#main_section").show().empty().append($(html));
        wire();
        ready(() => load(token));
      }});
    }

    // The solana adapter (js/codein/browser.js) loads with the page and fires
    // iqcodein:ready; its readBoard is the same gateway call the board uses.
    function ready(cb) {
      if ((window.iqCodeinChains || {}).solana) { cb(); return; }
      window.addEventListener("iqcodein:ready", cb, { once: true });
    }
    const adapter = () => window.iqCodeinChains.solana;

    function wire() {
      $("#bx_home_dot").on("click", () => { window.location.href = window.location.pathname; });
      $("#bx_make").on("click", () => $.code_in_v2.init(null, null, { maketoken: 1 }));
      $("#bx_copy").on("click", copyMint);
      $("#bx_back").on("click", showList);
      if (timer) clearInterval(timer);
      timer = setInterval(onTick, PRICE_MS);
    }

    // The interval must die with the page: other menus empty #main_section, so
    // a missing #bx root means we navigated away.
    async function onTick() {
      if (!document.getElementById("bx")) { clearInterval(timer); timer = null; return; }
      tick++;
      if (tick % FEED_TICKS === 0) await readFeed();
      await enrich();
      renderList();
      if (current) renderChartHead();
    }

    async function load(sel) {
      tokens = []; feedRows = []; tick = 0;
      await readFeed();
      renderFeed();
      await enrich();
      renderList();
      if (sel) {
        const pick = tokens.find((t) => t.mint === sel);
        if (pick) select(pick.mint);
      }
    }

    async function readFeed() {
      const seenMint = new Set(tokens.map((t) => t.mint));
      const nextTokens = [], nextFeed = [];
      const mintOf = (obj) => { try { return (JSON.parse(String(obj.body || "")) || {}).mint; } catch (e) { return null; } };
      let cursor = null;
      try {
        for (let p = 0; p < FEED_PAGES; p++) {
          const res = await adapter().readBoard(50, cursor);
          (res.rows || []).forEach((it) => {
            const obj = it.row || it;
            const sig = obj.__txSignature || it.__txSignature || "";
            if (obj.kind === "token") {
              let t = null;
              try { t = JSON.parse(String(obj.body || "")); } catch (e) { return; }
              if (!t || !t.mint || nextTokens.some((x) => x.mint === t.mint)) return;
              // keep the enriched pair when we already know this mint
              const old = tokens.find((x) => x.mint === t.mint);
              nextTokens.push(old || { mint: t.mint, name: t.name || "", symbol: t.symbol || "", sig, src: t.src || "" });
            } else if (nextFeed.length < 12) {
              nextFeed.push({ obj, sig });
            }
          });
          cursor = res.nextCursor;
          if (!cursor) break;
        }
        tokens = nextTokens; feedRows = nextFeed;
      } catch (e) { /* keep whatever we had */ }
    }

    // Left side: a compact thumb per inscription. Deliberately simpler than the
    // board's renderer (no id3 parsing); clicking opens the real board viewer.
    function renderFeed() {
      const $f = $("#bx_feed").empty();
      feedRows.forEach(({ obj, sig }) => {
        const body = String(obj.body || "");
        const $th = $('<div class="th"></div>');
        if (body.slice(0, 11) === "data:image/") $th.append($("<img>").attr("src", body));
        else if (body.slice(0, 11) === "data:audio/") $th.addClass("txt").text("|> audio");
        else if (obj.kind === "file") $th.addClass("txt").text("[ file ]");
        else if (obj.kind === "ascii") $th.addClass("art").text(body.slice(0, 800));
        else $th.addClass("txt").text(body.slice(0, 110));
        const card = $('<div class="rec"></div>').append($th)
          .append($('<div class="m"></div>')
            .append($('<span class="tag"></span>').text(obj.kind || "text"))
            .append($('<span class="ago"></span>').text(relTime(obj.__blockTime))));
        if (sig) card.on("click", () => $.code_in_v2.init(sig));
        $f.append(card);
      });
      $("#bx_feed_empty").toggleClass("hide", feedRows.length > 0);
      if (!feedRows.length) $("#bx_feed_empty").text("nothing inscribed yet.");
    }

    function relTime(bt) {
      if (!bt) return "";
      const d = Math.max(0, Math.floor(Date.now() / 1000) - bt);
      if (d < 60) return d + "s";
      if (d < 3600) return Math.floor(d / 60) + "m";
      if (d < 86400) return Math.floor(d / 3600) + "h";
      return Math.floor(d / 86400) + "d";
    }

    // Price, 24h change and market cap from the public DexScreener token API
    // (max 30 mints per call). Best pair (highest liquidity) wins; a coin still
    // on the bonding curve shows its pumpfun pair. The sparkline is rebuilt
    // from the m5/h1/h6/h24 change percentages: five real points of the day.
    async function enrich() {
      for (let i = 0; i < tokens.length; i += 30) {
        const batch = tokens.slice(i, i + 30);
        try {
          const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + batch.map((t) => t.mint).join(","));
          if (!res.ok) continue;
          const pairs = await res.json();
          (Array.isArray(pairs) ? pairs : []).forEach((p) => {
            const t = batch.find((x) => x.mint === (p.baseToken && p.baseToken.address));
            if (!t) return;
            const liq = (p.liquidity && p.liquidity.usd) || 0;
            if (t.pair && liq < t.pair.liq) return;
            const pc = p.priceChange || {};
            const now = Number(p.priceUsd) || 0;
            const at = (chg) => (chg == null ? null : now / (1 + Number(chg) / 100));
            t.pair = {
              liq, pairAddress: p.pairAddress, url: p.url,
              priceUsd: p.priceUsd, chg24: pc.h24, mcap: p.marketCap, vol24: p.volume && p.volume.h24,
              icon: p.info && p.info.imageUrl,
              points: [at(pc.h24), at(pc.h6), at(pc.h1), at(pc.m5), now].filter((v) => v != null && isFinite(v)),
            };
          });
        } catch (e) { /* leave batch as it was */ }
      }
      // market cap sort, like any market screen; not-yet-indexed coins last
      tokens.sort((a, b) => ((b.pair && b.pair.mcap) || -1) - ((a.pair && a.pair.mcap) || -1));
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

    function sparkSvg(points, upDown) {
      if (!points || points.length < 2) {
        return '<svg class="spark" viewBox="0 0 100 26"><polyline fill="none" stroke="#5c5c63" stroke-width="1.5" stroke-dasharray="3 3" points="0,13 100,13"/></svg>';
      }
      const min = Math.min.apply(null, points), max = Math.max.apply(null, points);
      const span = max - min || 1;
      const pts = points.map((v, i) => (i * (100 / (points.length - 1))).toFixed(1) + "," + (22 - ((v - min) / span) * 18).toFixed(1)).join(" ");
      return '<svg class="spark" viewBox="0 0 100 26"><polyline fill="none" stroke="' + (upDown ? "#2BD52D" : "#e0554e") + '" stroke-width="1.5" points="' + pts + '"/></svg>';
    }

    function renderList() {
      const $r = $("#bx_rows").empty();
      tokens.forEach((t) => {
        const chg = t.pair && t.pair.chg24 != null ? Number(t.pair.chg24) : null;
        const up = chg == null || chg >= 0;
        const $logo = $('<span class="clogo"></span>');
        if (t.pair && t.pair.icon) $logo.append($("<img>").attr("src", t.pair.icon));
        else $logo.text((t.symbol || "?").slice(0, 2).toUpperCase());
        const row = $('<div class="mrow"></div>')
          .append($('<div class="coin"></div>').append($logo)
            .append($("<div>").css("min-width", 0)
              .append($('<div class="csym"></div>').text("$" + (t.symbol || "?")))
              .append($('<div class="cname"></div>').text(t.name))))
          .append($("<span>").text(t.pair ? fmtUsd(t.pair.priceUsd) : "new").css(t.pair ? {} : { color: "var(--mute)" }))
          .append($('<span class="chg"></span>').addClass(chg == null ? "" : up ? "up" : "down")
            .text(chg == null ? "indexing" : (up ? "+" : "") + chg.toFixed(1) + "%").css(chg == null ? { color: "var(--mute)" } : {}))
          .append($(sparkSvg(t.pair && t.pair.points, up)))
          .append($('<span class="mcap"></span>').text(t.pair && t.pair.mcap ? fmtUsd(t.pair.mcap) : "-"))
          .append($('<span class="mact"><b>Chart</b> | <span class="pumpgo">Pump</span></span>'));
        row.on("click", () => select(t.mint));
        row.find(".pumpgo").on("click", (e) => { e.stopPropagation(); window.open("https://pump.fun/coin/" + t.mint, "_blank"); });
        $r.append(row);
      });
      $("#bx_empty").toggleClass("hide", tokens.length > 0);
      if (!tokens.length) $("#bx_empty").text("no coins launched yet. be the first: MAKE IT AS TOKEN.");
    }

    function showList() {
      current = null;
      $("#bx_view_chart").addClass("hide");
      $("#bx_view_list").removeClass("hide");
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        history.replaceState({ menu: "boardexe" }, "", url);
      } catch (e) {}
    }

    function renderChartHead() {
      $("#bx_c_sym").text("$" + current.symbol + "  " + current.name);
      $("#bx_c_price").text(current.pair ? fmtUsd(current.pair.priceUsd) : "");
      const chg = current.pair && current.pair.chg24 != null ? Number(current.pair.chg24) : null;
      $("#bx_c_chg").removeClass("up down").addClass(chg == null ? "" : chg >= 0 ? "up" : "down")
        .css("color", chg == null ? "var(--mute)" : chg >= 0 ? "var(--up)" : "var(--down)")
        .text(chg == null ? "indexing" : (chg >= 0 ? "+" : "") + chg.toFixed(1) + "% (24h)");
      $("#bx_c_stats").text(current.pair
        ? ["mcap " + (fmtUsd(current.pair.mcap) || "-"), "vol " + (fmtUsd(current.pair.vol24) || "-"), "via dexscreener"].join("  ")
        : "not indexed yet");
    }

    function select(mint) {
      current = tokens.find((t) => t.mint === mint);
      if (!current) return;
      $("#bx_view_list").addClass("hide");
      $("#bx_view_chart").removeClass("hide");
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("token", mint);
        history.replaceState({ menu: "boardexe" }, "", url);
      } catch (e) {}
      renderChartHead();
      $("#bx_pump").attr("href", "https://pump.fun/coin/" + mint);
      $("#bx_copy").text("COPY MINT");
      const $box = $("#bx_chart_box").empty();
      if (current.pair && current.pair.pairAddress) {
        // the real dexscreener chart; the pair page follows the coin from the
        // pumpfun bonding curve through graduation
        $box.append($("<iframe>").attr({
          src: "https://dexscreener.com/solana/" + current.pair.pairAddress + "?embed=1&theme=dark&trades=0&info=0",
          allow: "clipboard-write",
        }));
        $("#bx_dexs").removeClass("hide").attr("href", current.pair.url || ("https://dexscreener.com/solana/" + current.pair.pairAddress));
      } else {
        $box.append($('<div id="bx_hold"><p class="muted" style="font-size:12px;margin:0">dexscreener has not indexed this coin yet - a fresh launch takes a few minutes.<br>watch it live on pump.fun meanwhile.</p></div>'));
        $("#bx_dexs").addClass("hide");
      }
      // prefer the source inscription (the coin's original) over the launch row
      const postSig = current.src || current.sig;
      if (postSig) $("#bx_post").removeClass("hide").off("click").on("click", () => $.code_in_v2.init(postSig));
      else $("#bx_post").addClass("hide");
    }

    function copyMint() {
      if (!current) return;
      const done = () => { $("#bx_copy").text("COPIED"); setTimeout(() => $("#bx_copy").text("COPY MINT"), 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(current.mint).then(done, () => prompt("mint:", current.mint));
      else prompt("mint:", current.mint);
    }

    $.extend(this, { init });
  }

  $.boardexe = new Boardexe();
})(jQuery);
