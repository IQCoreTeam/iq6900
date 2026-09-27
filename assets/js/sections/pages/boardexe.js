// Boardexe / Chart page module. Lists tokens launched through the Code In
// board (feed rows with kind "token", written by the launcher after each
// pump.fun create) and shows a live DexScreener chart for the selected one.
// Reads go through the same gateway-backed adapter as the board.
(function ($) {
  $.extend(true, window, { boardexe: Boardexe });

  function Boardexe() {
    const templateUrl = "./html/sections/boardexe.html?ver=1";
    const FEED_PAGES = 8; // 8 x 50 rows is plenty while the feed is young; raise or move to a gateway filter when it is not
    let tokens = [];      // [{ mint, name, symbol, sig, pair }] newest first
    let current = null;   // selected token

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
      const ad = () => (window.iqCodeinChains || {}).solana;
      if (ad()) { cb(); return; }
      window.addEventListener("iqcodein:ready", cb, { once: true });
    }
    const adapter = () => window.iqCodeinChains.solana;

    function wire() {
      $("#bx_home_dot").on("click", () => { window.location.href = window.location.pathname; });
      $("#bx_reload").on("click", () => load(current && current.mint));
      $("#bx_make").on("click", () => $.code_in_v2.init(null, null, { maketoken: 1 }));
      $("#bx_copy").on("click", copyMint);
    }

    async function load(sel) {
      tokens = [];
      $("#bx_rows").empty();
      $("#bx_empty").text("loading...").removeClass("hide");
      const seen = new Set();
      let cursor = null;
      try {
        for (let p = 0; p < FEED_PAGES; p++) {
          const res = await adapter().readBoard(50, cursor);
          (res.rows || []).forEach((it) => {
            const obj = it.row || it;
            if (obj.kind !== "token") return;
            let t = null;
            try { t = JSON.parse(String(obj.body || "")); } catch (e) { return; }
            if (!t || !t.mint || seen.has(t.mint)) return;
            seen.add(t.mint);
            tokens.push({ mint: t.mint, name: t.name || "", symbol: t.symbol || "", sig: obj.__txSignature || it.__txSignature || "" });
          });
          cursor = res.nextCursor;
          if (!cursor) break;
        }
      } catch (e) { /* render whatever was collected */ }
      if (!tokens.length) {
        $("#bx_empty").text("no tokens launched yet. be the first: MAKE IT AS TOKEN on the code in board.");
        return;
      }
      $("#bx_empty").addClass("hide");
      await enrich();
      renderList();
      const pick = tokens.find((t) => t.mint === sel) || tokens[0];
      select(pick.mint);
    }

    // Price, 24h change and market cap from the public DexScreener token API
    // (max 30 mints per call). The best pair (highest liquidity) wins; a token
    // still on the bonding curve shows its pumpfun pair here too.
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
            if (!t.pair || liq > t.pair.liq) t.pair = {
              liq, pairAddress: p.pairAddress, dexId: p.dexId, url: p.url,
              priceUsd: p.priceUsd, chg24: p.priceChange && p.priceChange.h24, mcap: p.marketCap,
            };
          });
        } catch (e) { /* leave batch unenriched */ }
      }
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

    function renderList() {
      const $r = $("#bx_rows").empty();
      tokens.forEach((t) => {
        const chg = t.pair && t.pair.chg24 != null ? Number(t.pair.chg24) : null;
        const row = $('<div class="trow" data-mint="' + t.mint + '"></div>')
          .append($('<span class="sym"></span>').text("$" + (t.symbol || "?")))
          .append($('<span class="nm"></span>').text(t.name))
          .append($('<span class="px"></span>').text(t.pair ? fmtUsd(t.pair.priceUsd) : "new"))
          .append($('<span class="chg"></span>').addClass(chg == null ? "" : chg >= 0 ? "up" : "down")
            .text(chg == null ? "" : (chg >= 0 ? "+" : "") + chg.toFixed(1) + "%"));
        row.on("click", () => select(t.mint));
        $r.append(row);
      });
    }

    function select(mint) {
      current = tokens.find((t) => t.mint === mint);
      if (!current) return;
      $("#bx .trow").removeClass("on");
      $('#bx .trow[data-mint="' + mint + '"]').addClass("on");
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("token", mint);
        history.replaceState({ menu: "boardexe" }, "", url);
      } catch (e) {}

      $("#bx_title").text("$" + current.symbol + "  " + current.name);
      $("#bx_stats").text(current.pair ? [fmtUsd(current.pair.priceUsd), current.pair.mcap ? "mcap " + fmtUsd(current.pair.mcap) : ""].filter(Boolean).join("  |  ") : "not indexed yet");
      $("#bx_pump").attr("href", "https://pump.fun/coin/" + mint);
      $("#bx_copy").text("COPY MINT");
      const $box = $("#bx_chart_box").empty();
      if (current.pair && current.pair.pairAddress) {
        // the real dexscreener chart, embedded; the pair page follows the
        // token from the pumpfun bonding curve through graduation
        $box.append($("<iframe>").attr({
          src: "https://dexscreener.com/solana/" + current.pair.pairAddress + "?embed=1&theme=dark&trades=0&info=0",
          allow: "clipboard-write",
        }));
        $("#bx_dexs").removeClass("hide").attr("href", current.pair.url || ("https://dexscreener.com/solana/" + current.pair.pairAddress));
      } else {
        $box.append($('<div id="bx_hold"><p class="muted" style="font-size:12px;margin:0">dexscreener has not indexed this token yet - a fresh launch takes a few minutes.<br>watch it live on pump.fun meanwhile.</p></div>'));
        $("#bx_dexs").addClass("hide");
      }
      if (current.sig) $("#bx_post").removeClass("hide").off("click").on("click", (e) => {
        e.preventDefault();
        $.code_in_v2.init(current.sig);
      });
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
