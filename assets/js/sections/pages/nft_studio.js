// nft_studio.js - the creator "launch a collection" wizard (?menu=nft-create).
// Classic jQuery page module; all chain/wallet/Arweave work goes through
// window.iqNft (js/codein/nft_bridge.js) -> nft_create.js deploy(). This module
// only does the browser-side job the engine cannot: collect the spec across the
// 4 steps and PRODUCE the items[] (name + template + decoded image). Images are
// real: trait files are composited on a canvas (generate), or decoded from the
// creator's files (hand-craft / upload). Nothing here is mocked.
(function ($) {
  const TEMPLATE = "./html/sections/nft_studio.html?ver=5";
  const COMPOSITE = 512; // deploy images are built at this edge; compressImage downscales to <=512 anyway
  const STAGE_TEXT = {
    compress: "compressing images...",
    stage: "uploading to Arweave + building the manifest...",
    funding: "approve the funding transfer in your wallet...",
    manifest: "inscribing the manifest...",
    logo: "inscribing the logo...",
    banner: "inscribing the banner...",
    collection: "inscribing collection.json...",
    deploy: "deploying the collection + registry...",
    finalize: "finalizing...",
    done: "deployed.",
  };

  function bridge(cb) {
    if (window.iqNftReady && window.iqNft) return cb();
    window.addEventListener("iqnft:ready", () => cb(), { once: true });
  }
  const short = (s) => (s ? s.slice(0, 8) + "..." + s.slice(-6) : "");
  const sol = (lamports) => (Number(lamports || 0) / 1e9).toFixed(4) + " SOL";
  const stripExt = (n) => String(n || "").replace(/\.[a-z0-9]+$/i, "");

  // ---- canvas helpers (the DOM work the engine leaves to the caller) ----
  async function decodeFile(file) {
    const bitmap = await createImageBitmap(file);
    return { bitmap, w: bitmap.width, h: bitmap.height, url: URL.createObjectURL(file) };
  }
  function bitmapToImageData(bitmap, maxEdge) {
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return cv.getContext("2d").getImageData(0, 0, w, h);
  }
  // Composite one pick per layer onto a square canvas. layers[0] = front, so draw
  // back-to-front. picks[i] = trait index for layer i (or -1/none to skip).
  function compositeCanvas(layers, picks, size) {
    const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    const ctx = cv.getContext("2d");
    for (let i = layers.length - 1; i >= 0; i--) {
      const t = layers[i].traits[picks[i]];
      if (t && t.bitmap) ctx.drawImage(t.bitmap, 0, 0, size, size);
    }
    return cv;
  }
  function compositeImageData(layers, picks) { return compositeCanvas(layers, picks, COMPOSITE).getContext("2d").getImageData(0, 0, COMPOSITE, COMPOSITE); }
  function compositeDataUrl(layers, picks, size) { return compositeCanvas(layers, picks, size).toDataURL("image/png"); }

  function combosOf(layers) { let n = 1; for (const l of layers) n *= Math.max(1, l.traits.length); return n; }
  function dnaKey(picks) { return picks.join("-"); }
  function rollOne(layers) { return layers.map((l) => (l.traits.length ? Math.floor(Math.random() * l.traits.length) : -1)); }

  $.nft_studio = {
    init: function () {
      $.get(TEMPLATE, (html) => {
        $("#main_section").show().empty().append($(html));
        this.state = {
          step: 1, name: "", slug: "", symbol: "", description: "",
          itemsMode: "gen",
          layers: [], selLayer: 0, roll: [], supply: 10,
          handItems: [], selHand: 0,
          uploadItems: [], upImgs: {}, upJsons: {},
          priceSol: "0.01", depositSol: "0", royaltyPct: "5", assignment: "random",
          items: null, // produced items for deploy
          connected: null, deploying: false,
        };
        this.renderEnv();
        this.wire();
        this.renderSteps();
        this.show(1);
        bridge(() => { this.dbg("bridge ready"); this.refreshSlug(); });
      });
    },

    dbg: function (msg, cls) {
      const t = new Date().toTimeString().slice(0, 8);
      const line = $("<div>").append($("<span class='t'>").text("[" + t + "] ")).append($("<span>").addClass(cls || "").text(typeof msg === "string" ? msg : JSON.stringify(msg)));
      $("#nfts_log").append(line);
      const el = document.getElementById("nfts_log"); if (el) el.scrollTop = el.scrollHeight;
      (cls === "e" ? console.error : console.log)("[iqstudio] " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
    },
    renderEnv: async function () {
      const api = window.iqNft ? window.iqNft.nftApi() : "?", rpc = window.iqNft ? window.iqNft.getRpc() : "?";
      $("#nfts_env").html("env: api <b>" + api + "</b> . rpc <b>" + rpc + "</b> . cluster <b>...</b>");
      try { const h = await window.iqNft.health(); $("#nfts_env").html("env: api <b>" + api + "</b> . rpc <b>" + rpc + "</b> . cluster <b>" + (h.cluster || "?") + "</b> . program <b>" + (h.programId ? h.programId.slice(0, 8) + "..." : "?") + "</b>"); } catch (e) {}
    },

    // ---- step framing ----
    renderSteps: function () {
      const names = ["1 · NAME", "2 · NETWORK", "3 · ITEMS", "4 · MINT LISTS"];
      const $s = $("#nfts_steps").empty();
      names.forEach((n, i) => {
        const st = i + 1;
        $s.append($("<div class='st'>").toggleClass("on", this.state.step === st).text(n).on("click", () => this.goto(st)));
      });
    },
    show: function (step) {
      this.state.step = step;
      $(".stepbody").addClass("hidden");
      $(".stepbody[data-step=" + step + "]").removeClass("hidden");
      $("#nfts_prev").prop("disabled", step === 1);
      this.updateNext();
      this.renderSteps();
      this.err("");
      if (step === 2) this.renderNets();
      if (step === 3) this.renderItemsTab();
      if (step === 4) this.renderSummary();
    },
    // The single primary button. Step 4 hides it (the summary has its own deploy).
    // Step 3 generate tab: "make items" with no items yet, "continue →" + a
    // "regenerate" button once items exist. Everywhere else: "continue →".
    updateNext: function () {
      const s = this.state;
      const genEmpty = s.step === 3 && s.itemsMode === "gen" && !(s.items && s.items.length);
      $("#nfts_next").text(s.step === 4 ? "review ↑" : genEmpty ? "make items" : "continue →").toggle(s.step !== 4);
      $("#nfts_regen").toggle(s.step === 3 && s.itemsMode === "gen" && !!(s.items && s.items.length));
    },
    goto: function (step) {
      // Validate forward moves; backward is always allowed.
      if (step > this.state.step) { const why = this.blockedReason(step); if (why) { this.err(why); return; } }
      this.show(step);
    },
    blockedReason: function (target) {
      const s = this.state;
      // To leave NAME you need a valid name + slug + symbol.
      if (target >= 2) { if (!s.name.trim()) return "enter a collection name"; if (!this.slugOk) return "pick a valid, available handle"; if (!s.symbol.trim()) return "enter a symbol"; }
      // To reach MINT LISTS you need produced items.
      if (target >= 4) { if (!s.items || !s.items.length) return "make at least one item first (step 3)"; }
      return null;
    },
    err: function (m) { $("#nfts_error").text(m || ""); if (m) this.dbg(m, "e"); },

    wire: function () {
      const s = this.state;
      $("#nfts_logclear").on("click", () => $("#nfts_log").empty());
      $("#nfts_prev").on("click", () => this.show(Math.max(1, s.step - 1)));
      // One primary button on step 3: "make items" when none exist (generates),
      // "continue →" once they do (with "regenerate" alongside). No separate
      // generate button. Other steps: plain continue.
      $("#nfts_next").on("click", () => {
        if (s.step === 3 && s.itemsMode === "gen" && !(s.items && s.items.length)) { this.generate(); return; }
        this.goto(Math.min(4, s.step + 1));
      });
      $("#nfts_regen").on("click", () => this.generate());

      // step 1
      $("#nfts_name").on("input", (e) => { s.name = e.target.value; });
      $("#nfts_slug").on("input", (e) => { s.slug = e.target.value; this.refreshSlug(); });
      $("#nfts_symbol").on("input", (e) => { s.symbol = e.target.value; });
      $("#nfts_desc").on("input", (e) => { s.description = e.target.value; });
      // optional collection logo + banner
      $("#nfts_logo_btn").on("click", () => $("#nfts_file_logo").val("").trigger("click"));
      $("#nfts_file_logo").on("change", (e) => this.onBrand(e.target.files, "logo"));
      $("#nfts_logo_clear").on("click", () => this.clearBrand("logo"));
      $("#nfts_banner_btn").on("click", () => $("#nfts_file_banner").val("").trigger("click"));
      $("#nfts_file_banner").on("change", (e) => this.onBrand(e.target.files, "banner"));
      $("#nfts_banner_clear").on("click", () => this.clearBrand("banner"));

      // step 3 tabs
      $("#nfts_tab_gen").on("click", () => { s.itemsMode = "gen"; this.renderItemsTab(); });
      $("#nfts_tab_hand").on("click", () => { s.itemsMode = "hand"; this.renderItemsTab(); });
      $("#nfts_tab_upload").on("click", () => { s.itemsMode = "upload"; this.renderItemsTab(); });

      // generate
      $("#nfts_addlayer").on("click", () => { s.layers.push({ name: "Layer " + (s.layers.length + 1), traits: [] }); s.selLayer = s.layers.length - 1; this.renderGen(); });
      $("#nfts_layername").on("input", (e) => { const l = s.layers[s.selLayer]; if (l) { l.name = e.target.value; this.renderLayers(); this.renderLegend(); } });
      $("#nfts_addtrait").on("click", () => $("#nfts_file_trait").val("").trigger("click"));
      $("#nfts_file_trait").on("change", (e) => this.onTraitFiles(e.target.files));
      $("#nfts_reroll").on("click", () => { s.roll = rollOne(s.layers); this.renderPreview(); this.renderLegend(); });
      $("#nfts_supply").on("input", (e) => { s.supply = parseInt(e.target.value || "0", 10) || 0; this.renderCombos(); });

      // hand-craft
      $("#nfts_file_hand").on("change", (e) => this.onHandFiles(e.target.files));
      $("#nfts_handreplace").on("click", () => $("#nfts_file_handreplace").val("").trigger("click"));
      $("#nfts_file_handreplace").on("change", (e) => this.onHandReplace(e.target.files));
      $("#nfts_handname").on("input", (e) => { const it = s.handItems[s.selHand]; if (it) { it.name = e.target.value; this.renderHandGrid(); } });
      $("#nfts_handaddtrait").on("click", () => this.addHandTrait());

      // upload: two equip slots. Clicking a slot opens its picker; drag/drop onto
      // either routes files by extension. Images (slot 1) required, json (slot 2)
      // is the optional metadata, paired by name.
      $("#nfts_slot_img").on("click", () => $("#nfts_up_imgfiles").val("").trigger("click"));
      $("#nfts_slot_json").on("click", () => $("#nfts_up_jsonfiles").val("").trigger("click"));
      $("#nfts_up_imgfiles").on("change", (e) => this.addUploadFiles(e.target.files));
      $("#nfts_up_jsonfiles").on("change", (e) => this.addUploadFiles(e.target.files));
      ["nfts_slot_img", "nfts_slot_json"].forEach((id) => {
        const el = document.getElementById(id); if (!el) return;
        ["dragover", "dragenter"].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add("hot"); }));
        el.addEventListener("dragleave", () => el.classList.remove("hot"));
        el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("hot"); if (e.dataTransfer && e.dataTransfer.files) this.addUploadFiles(e.dataTransfer.files); });
      });

      // step 4
      $("#nfts_price").on("input", (e) => { s.priceSol = e.target.value; this.renderSummary(); });
      $("#nfts_deposit").on("input", (e) => { s.depositSol = e.target.value; this.renderSummary(); });
      $("#nfts_royalty").on("input", (e) => { s.royaltyPct = e.target.value; this.renderSummary(); });
      $("#nfts_asg_random").on("click", () => { s.assignment = "random"; this.renderSummary(); });
      $("#nfts_asg_seq").on("click", () => { s.assignment = "sequential"; this.renderSummary(); });
      $("#nfts_deploy").on("click", () => this.onDeployBtn());
    },

    // ---- step 1: slug ----
    refreshSlug: async function () {
      const clean = (this.state.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
      this.slugClean = clean;
      $("#nfts_sluglink").text("→ iqlabs.dev/collection/" + (clean || "your-handle"));
      const $tag = $("#nfts_slugtag");
      if (!clean) { this.slugOk = false; $tag.attr("class", "muted").text("pick a handle"); return; }
      if (clean.length < 3 || clean.length > 32) { this.slugOk = false; $tag.attr("class", "tag-bad").text("3..32 characters"); return; }
      $tag.attr("class", "muted").text("checking...");
      try {
        const cols = await window.iqNft.getCollections();
        const taken = cols.some((c) => c.slug === clean);
        this.slugOk = !taken;
        $tag.attr("class", taken ? "tag-bad" : "tag-ok").text(taken ? "already taken" : "available");
      } catch (e) { this.slugOk = true; $tag.attr("class", "muted").text("(could not check; will verify at deploy)"); }
    },

    // Optional collection logo / banner: decoded to a bitmap, compressed +
    // inscribed at deploy (specFromState hands the engine a thunk).
    onBrand: async function (files, which) {
      if (!files || !files[0]) return;
      try {
        const d = await decodeFile(files[0]);
        if (which === "logo") this.logoBitmap = d.bitmap; else this.bannerBitmap = d.bitmap;
        $("#nfts_" + which + "_prev").attr("src", d.url).show();
        $("#nfts_" + which + "_clear").show();
        this.dbg(which + " set (" + d.w + "x" + d.h + ")");
      } catch (e) { this.dbg(which + " decode failed: " + (e && e.message), "e"); }
    },
    clearBrand: function (which) {
      if (which === "logo") this.logoBitmap = null; else this.bannerBitmap = null;
      $("#nfts_" + which + "_prev").hide().removeAttr("src");
      $("#nfts_" + which + "_clear").hide();
    },

    // ---- step 2: network ----
    renderNets: function () {
      const nets = [
        { k: "solana", label: "SOLANA", sub: "Core + registry", on: true },
        { k: "ethereum", label: "ETHEREUM", sub: "coming soon", off: true },
        { k: "robinhood", label: "ROBINHOOD", sub: "coming soon", off: true },
        { k: "monad", label: "MONAD", sub: "coming soon", off: true },
      ];
      const $n = $("#nfts_nets").empty();
      nets.forEach((n) => {
        const $t = $("<div class='tile'>").toggleClass("on", !!n.on).toggleClass("off", !!n.off)
          .append($("<div>").text(n.label)).append($("<div class='t2'>").text(n.sub));
        $n.append($t); // only solana is active; others are visibly disabled, never fake-clickable
      });
    },

    // ---- step 3: items ----
    renderItemsTab: function () {
      const m = this.state.itemsMode;
      $("#nfts_tab_gen").toggleClass("on", m === "gen");
      $("#nfts_tab_hand").toggleClass("on", m === "hand");
      $("#nfts_tab_upload").toggleClass("on", m === "upload");
      $("#nfts_gen").toggleClass("hidden", m !== "gen");
      $("#nfts_hand").toggleClass("hidden", m !== "hand");
      $("#nfts_upload").toggleClass("hidden", m !== "upload");
      if (m === "gen") this.renderGen();
      if (m === "hand") this.renderHand();
      if (m === "upload") this.renderUpload();
      this.updateNext();
    },

    // generate
    renderGen: function () {
      const s = this.state;
      if (s.selLayer >= s.layers.length) s.selLayer = Math.max(0, s.layers.length - 1);
      if (!s.roll.length || s.roll.length !== s.layers.length) s.roll = rollOne(s.layers);
      $("#nfts_layername").val(s.layers[s.selLayer] ? s.layers[s.selLayer].name : "");
      this.renderLayers();
      this.renderGallery();
      this.renderPreview();
      this.renderLegend();
      this.renderCombos();
    },
    renderLayers: function () {
      const s = this.state; const $l = $("#nfts_layers").empty();
      s.layers.forEach((l, i) => {
        const row = $("<div class='lrow'>").toggleClass("sel", i === s.selLayer);
        // The layer name is click-to-rename inline (swaps to an input).
        const $nameText = $("<div>").text(l.name).attr("title", "click to rename").css("cursor", "text");
        $nameText.on("click", (e) => {
          e.stopPropagation();
          s.selLayer = i;
          const $inp = $("<input>").val(l.name).css({ width: "100%", "box-sizing": "border-box", background: "rgba(0,0,0,.35)", color: "var(--cream)", border: "1px solid var(--green)", "border-radius": "4px", font: "600 .74rem 'Kode Mono',monospace", padding: "2px 6px", outline: "none" });
          $nameText.replaceWith($inp);
          $inp[0].focus(); $inp[0].select();
          const commit = () => { const v = ($inp.val() || "").trim(); if (v) l.name = v; this.renderGen(); };
          $inp.on("blur", commit).on("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); $inp[0].blur(); } else if (ev.key === "Escape") { this.renderGen(); } });
        });
        row.append($("<div class='ln'>").append($nameText).append($("<div class='lc'>").text(l.traits.length + " traits"))
          .on("click", () => { s.selLayer = i; this.renderGen(); }));
        const up = $("<div class='arw'>").text("↑").on("click", (e) => { e.stopPropagation(); this.reorder(i, i - 1); });
        const dn = $("<div class='arw'>").text("↓").on("click", (e) => { e.stopPropagation(); this.reorder(i, i + 1); });
        if (i === 0) up.css({ opacity: .25, "pointer-events": "none" });
        if (i === s.layers.length - 1) dn.css({ opacity: .25, "pointer-events": "none" });
        const rm = $("<div class='arw'>").text("×").attr("title", "remove layer").css({ "border-color": "rgba(255,154,154,.5)", color: "var(--red)" })
          .on("click", (e) => { e.stopPropagation(); this.removeLayer(i); });
        row.append($("<div style='display:flex;flex-direction:column;gap:3px'>").append(up).append(dn).append(rm));
        $l.append(row);
      });
      if (!s.layers.length) $l.append($("<div class='note'>").text("no layers yet. add a layer (e.g. Background), then upload its trait images."));
    },
    reorder: function (from, to) {
      const s = this.state; if (to < 0 || to >= s.layers.length) return;
      const m = s.layers.splice(from, 1)[0]; s.layers.splice(to, 0, m); s.selLayer = to;
      s.roll = rollOne(s.layers); this.renderGen();
    },
    removeLayer: function (i) {
      const s = this.state;
      s.layers.splice(i, 1);
      if (s.selLayer >= s.layers.length) s.selLayer = Math.max(0, s.layers.length - 1);
      s.roll = rollOne(s.layers); this.renderGen();
    },
    renderGallery: function () {
      const s = this.state; const l = s.layers[s.selLayer];
      $("#nfts_galtitle").text((l ? l.name : "layer").toUpperCase() + " images");
      const $g = $("#nfts_gallery").empty();
      $g.append($("<div class='gadd'>").text("+ image").on("click", () => $("#nfts_file_trait").val("").trigger("click")));
      if (!l) return;
      l.traits.slice().reverse().forEach((t, ri) => {
        const idx = l.traits.length - 1 - ri; // real index (gallery is newest-first)
        const tile = $("<div class='gtile'>").append($("<img>").attr("src", t.url)).append($("<div class='gn'>").text(t.name));
        tile.append($("<div class='gx'>").text("×").on("click", () => { l.traits.splice(idx, 1); s.roll = rollOne(s.layers); this.renderGen(); }));
        $g.append(tile);
      });
    },
    renderPreview: function () {
      const s = this.state;
      if (!s.layers.length || !s.layers.some((l) => l.traits.length)) { $("#nfts_preview").hide().removeAttr("src"); $("#nfts_preview_ph").show(); return; }
      try { $("#nfts_preview").attr("src", compositeDataUrl(s.layers, s.roll, 256)).show(); $("#nfts_preview_ph").hide(); } catch (e) { this.dbg("preview failed: " + e.message, "e"); }
    },
    renderLegend: function () {
      const s = this.state; const $lg = $("#nfts_legend").empty();
      s.layers.forEach((l, i) => {
        const t = l.traits[s.roll[i]];
        $lg.append($("<div class='lg'>").append($("<span class='lk'>").text(l.name)).append($("<span>").text(t ? stripExt(t.name) : "—")).append($("<span class='muted' style='margin-left:auto'>").text(i === 0 ? "front" : "")));
      });
    },
    renderCombos: function () {
      const s = this.state; const n = combosOf(s.layers);
      $("#nfts_combos").text("of " + n + " possible");
      const dup = s.supply > n;
      $("#nfts_dup").text(n === 0 ? "" : dup ? "// above max: " + (s.supply - n) + " item(s) will repeat a combination" : "// all unique, within the max").toggleClass("amber", dup);
    },
    onTraitFiles: async function (files) {
      const s = this.state; const l = s.layers[s.selLayer];
      if (!l) { this.err("add a layer first"); return; }
      for (const f of files) { try { const d = await decodeFile(f); l.traits.push({ name: f.name, bitmap: d.bitmap, url: d.url }); } catch (e) { this.dbg("decode failed " + f.name + ": " + e.message, "e"); } }
      s.roll = rollOne(s.layers); this.renderGen();
      this.dbg("layer '" + l.name + "' now " + l.traits.length + " traits");
    },
    generate: function () {
      const s = this.state;
      if (!s.layers.length || !s.layers.every((l) => l.traits.length)) { this.err("every layer needs at least one trait image"); return; }
      const want = Math.max(1, s.supply | 0);
      const max = combosOf(s.layers);
      const seen = new Set(); const dnas = [];
      let guard = 0;
      while (dnas.length < Math.min(want, max) && guard < max * 20 + 100) { const p = rollOne(s.layers); const k = dnaKey(p); if (!seen.has(k)) { seen.add(k); dnas.push(p); } guard++; }
      while (dnas.length < want) dnas.push(rollOne(s.layers)); // supply > max: allow repeats (design)
      const snapshot = s.layers.map((l) => ({ name: l.name, traits: l.traits.slice() })); // freeze refs at generate time
      const collName = s.name.trim() || "Item";
      s.items = dnas.map((picks, i) => ({
        name: collName + " #" + (i + 1),
        template: { attributes: snapshot.map((l, li) => ({ trait_type: l.name, value: stripExt(l.traits[picks[li]] ? l.traits[picks[li]].name : "") })) },
        imageData: () => compositeImageData(snapshot, picks), // lazy: one composite at a time at deploy
      }));
      this.dbg("generated " + s.items.length + " items (" + max + " max combos)");
      // preview grid (first <=18, composited to dataURL now; cheap)
      const grid = $("#nfts_gengrid").empty();
      const show = Math.min(18, dnas.length);
      for (let i = 0; i < show; i++) grid.append($("<div class='card'>").append($("<img>").attr("src", compositeDataUrl(snapshot, dnas[i], 96))));
      $("#nfts_gencount").text(s.items.length + " items generated (preview of first " + show + ")");
      $("#nfts_genresult").removeClass("hidden");
      this.updateNext(); // flip "make items" -> "continue →" + show "regenerate"
      this.err("");
    },

    // hand-craft
    renderHand: function () { this.renderHandGrid(); this.renderHandEdit(); },
    renderHandGrid: function () {
      const s = this.state; $("#nfts_handcount").text("your 1/1 items · " + s.handItems.length);
      const $g = $("#nfts_handgrid").empty();
      s.handItems.forEach((it, i) => {
        const c = $("<div class='card'>").toggleClass("sel", i === s.selHand).append($("<img>").attr("src", it.url)).append($("<div class='cn'>").text(it.name)).on("click", () => { s.selHand = i; this.renderHandEdit(); this.renderHandGrid(); });
        $g.append(c);
      });
      $g.append($("<div class='card add'>").html("+ add<br>item").on("click", () => $("#nfts_file_hand").val("").trigger("click")));
      this.markHandItems();
    },
    renderHandEdit: function () {
      const s = this.state; const it = s.handItems[s.selHand];
      $("#nfts_handedit").toggle(!!it);
      if (!it) return;
      $("#nfts_handimg").attr("src", it.url);
      $("#nfts_handname").val(it.name);
      const $t = $("#nfts_handtraits").empty();
      it.traits.forEach((tr, ti) => {
        $t.append($("<span class='chip'>").append($("<span>").text(tr.trait_type + ": " + tr.value)).append($("<span class='cx'>").text("×").on("click", () => { it.traits.splice(ti, 1); this.renderHandEdit(); })));
      });
    },
    onHandFiles: async function (files) {
      const s = this.state;
      for (const f of files) { try { const d = await decodeFile(f); s.handItems.push({ name: stripExt(f.name) || ("Item #" + (s.handItems.length + 1)), bitmap: d.bitmap, url: d.url, traits: [] }); } catch (e) { this.dbg("decode failed: " + e.message, "e"); } }
      s.selHand = s.handItems.length - 1; this.renderHand();
    },
    onHandReplace: async function (files) {
      const s = this.state; const it = s.handItems[s.selHand]; if (!it || !files[0]) return;
      const d = await decodeFile(files[0]); it.bitmap = d.bitmap; it.url = d.url; this.renderHand();
    },
    addHandTrait: function () {
      const it = this.state.handItems[this.state.selHand]; if (!it) return;
      const tt = prompt("trait_type (e.g. Vibe)"); if (!tt) return;
      const vv = prompt("value (e.g. Calm)"); if (vv == null) return;
      it.traits.push({ trait_type: tt, value: vv }); this.renderHandEdit();
    },
    markHandItems: function () {
      const s = this.state;
      s.items = s.handItems.length ? s.handItems.map((it) => ({ name: it.name, template: { attributes: it.traits }, imageData: () => bitmapToImageData(it.bitmap, COMPOSITE) })) : null;
    },

    // upload folder
    renderUpload: function () {
      const s = this.state;
      const ni = Object.keys(s.upImgs || {}).length, nj = Object.keys(s.upJsons || {}).length;
      $("#nfts_slot_img").toggleClass("filled", ni > 0);
      $("#nfts_slot_img_state").text(ni ? (ni + " image" + (ni > 1 ? "s" : "") + " equipped ✓") : "drop images, or click");
      $("#nfts_slot_json").toggleClass("filled", nj > 0);
      $("#nfts_slot_json_state").text(nj ? (nj + " json equipped ✓") : "drop json, or click");
      $("#nfts_uploadreport").toggleClass("hidden", !s.uploadItems.length);
      if (s.uploadItems.length) this.renderUploadReport();
    },
    // Accumulate dropped/picked files into the two slots (sorted by extension, so
    // a drop on either slot still routes right), then re-pair. Same name overwrites.
    addUploadFiles: async function (fileList) {
      const s = this.state;
      for (const f of Array.from(fileList || [])) {
        const base = stripExt(f.name.split("/").pop());
        if (/\.json$/i.test(f.name)) { try { s.upJsons[base] = JSON.parse(await f.text()); } catch (e) { this.dbg("bad json " + f.name, "e"); } }
        else if (f.type.indexOf("image/") === 0 || /\.(png|jpe?g|gif|webp)$/i.test(f.name)) { s.upImgs[base] = f; }
      }
      await this.repairUpload();
    },
    // Pair each equipped image with its same-name json into an item.
    repairUpload: async function () {
      const s = this.state;
      const keys = Object.keys(s.upImgs).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));
      const items = []; let errs = 0;
      for (const k of keys) {
        try {
          const d = await decodeFile(s.upImgs[k]);
          const meta = s.upJsons[k] || {};
          const idx = parseInt(k, 10); const index = isNaN(idx) ? items.length + 1 : idx + (keys[0] === "0" ? 1 : 0); // normalize 0-based to 1-based
          const name = (typeof meta.name === "string" && meta.name) ? meta.name : ((s.name.trim() || "Item") + " #" + (items.length + 1));
          const attributes = Array.isArray(meta.attributes) ? meta.attributes.filter((a) => a && a.trait_type != null).map((a) => ({ trait_type: String(a.trait_type), value: a.value })) : [];
          items.push({ index, name, bitmap: d.bitmap, url: d.url, template: { description: meta.description, attributes } });
        } catch (e) { errs++; this.dbg("item " + k + " failed: " + e.message, "e"); }
      }
      s.uploadItems = items;
      s._up = { mediaN: Object.keys(s.upImgs).length, jsonN: Object.keys(s.upJsons).length, errs };
      s.items = items.length ? items.map((it) => ({ index: it.index, name: it.name, template: it.template, imageData: () => bitmapToImageData(it.bitmap, COMPOSITE) })) : null;
      this.renderUpload();
      this.updateNext();
      this.dbg("upload: " + items.length + " items, " + s._up.mediaN + " media, " + s._up.jsonN + " json, " + errs + " errors");
      this.err(items.length || !s._up.mediaN ? "" : "could not decode those images");
    },
    renderUploadReport: function () {
      const s = this.state; const u = s._up || {};
      $("#nfts_uploadreport").removeClass("hidden");
      $("#nfts_up_media").text(u.mediaN + " images");
      $("#nfts_up_json").text(u.jsonN + " json");
      $("#nfts_up_items").text(s.uploadItems.length);
      $("#nfts_up_err").attr("class", u.errs ? "tag-bad" : "tag-ok").text(u.errs || 0);
      const grid = $("#nfts_upgrid").empty();
      s.uploadItems.slice(0, 24).forEach((it) => grid.append($("<div class='card'>").append($("<img>").attr("src", it.url)).append($("<div class='cn'>").text(it.name))));
    },

    // ---- step 4: summary + deploy ----
    specFromState: function () {
      const s = this.state;
      const price = Math.round(parseFloat(s.priceSol || "0") * 1e9) || 0;
      const deposit = Math.round(parseFloat(s.depositSol || "0") * 1e9) || 0;
      const royaltyBps = Math.round(parseFloat(s.royaltyPct || "0") * 100) || 0;
      const logoBmp = this.logoBitmap, bannerBmp = this.bannerBitmap;
      return {
        slug: this.slugClean, name: s.name.trim(), symbol: s.symbol.trim(), description: s.description.trim(),
        price, deposit, royaltyBps, sequential: s.assignment === "sequential",
        logo: logoBmp ? () => bitmapToImageData(logoBmp, 512) : undefined,
        banner: bannerBmp ? () => bitmapToImageData(bannerBmp, 1024) : undefined,
      };
    },
    renderSummary: function () {
      const s = this.state; const spec = this.specFromState();
      const n = s.items ? s.items.length : 0;
      $("#nfts_sum_name").text(spec.name || "-");
      $("#nfts_sum_slug").text(spec.slug || "-");
      $("#nfts_sum_items").text(n);
      $("#nfts_sum_price").text(sol(spec.price) + " / " + sol(spec.deposit));
      $("#nfts_sum_roy").text((spec.royaltyBps / 100) + "% / " + (spec.sequential ? "sequential" : "random"));
      // deploy fee = base 0.01 + 0.0003/item (matches the backend constant)
      const fee = 0.01 + 0.0003 * n;
      $("#nfts_deployfee").text("deploy fee: ~" + fee.toFixed(4) + " SOL (" + n + " items)");
      // reflect connection state on the button
      const addr = (window.iqNft && window.iqNft.connected && window.iqNft.connected()) || this.state.connected;
      $("#nfts_deploy").text(s.deploying ? "deploying..." : s.deployed ? "DEPLOYED ✓" : addr ? "DEPLOY · 1 SIGNATURE" : "CONNECT WALLET").prop("disabled", !!s.deploying || !!s.deployed);
    },
    onDeployBtn: async function () {
      const s = this.state;
      if (s.deploying) return;
      const addr = (window.iqNft.connected && window.iqNft.connected());
      if (!addr && !s.connected) {
        try { s.connected = await window.iqNft.connect(); this.dbg("wallet connected: " + s.connected); this.renderSummary(); }
        catch (e) { this.status(e.message || String(e), true); }
        return;
      }
      this.deploy();
    },
    status: function (m, isErr) { $("#nfts_status").toggleClass("err", !!isErr).text(m || ""); if (m) this.dbg(m, isErr ? "e" : ""); },
    setBar: function (p) { $("#nfts_progbar").css("width", Math.max(0, Math.min(100, p)) + "%"); },
    deploy: async function () {
      const s = this.state;
      const spec = this.specFromState();
      if (!s.items || !s.items.length) { this.err("no items to deploy"); return; }
      if (spec.deposit > spec.price) { this.err("deposit cannot exceed price"); return; }
      s.deploying = true; this.renderSummary();
      $("#nfts_progwrap").removeClass("hidden"); this.setBar(2);
      $("#nfts_result").addClass("hidden");
      this.dbg("DEPLOY start: " + spec.slug + " items=" + s.items.length);
      try {
        const total = s.items.length;
        const res = await window.iqNft.deploy({
          spec, items: s.items,
          onStage: (st, x) => {
            this.status(STAGE_TEXT[st] || st);
            if (x) this.dbg("stage:" + st + " " + JSON.stringify(x));
            if (st === "compress" && x) this.setBar(2 + (x.done / Math.max(1, total)) * 60);
            if (st === "stage") this.setBar(66);
            if (st === "manifest") this.setBar(74);
            if (st === "logo") this.setBar(77);
            if (st === "banner") this.setBar(80);
            if (st === "collection") this.setBar(82);
            if (st === "deploy") this.setBar(90);
            if (st === "finalize") this.setBar(96);
          },
        });
        this.setBar(100);
        this.dbg("DEPLOY ok: " + JSON.stringify(res));
        this.showResult(res);
      } catch (e) {
        const msg = (e && e.message) || String(e);
        this.status(msg, true); this.dbg("DEPLOY ERROR: " + msg, "e");
        if (e && e.logs) this.dbg("sim logs: " + e.logs.slice(-4).join(" ; "), "e");
      } finally { s.deploying = false; this.renderSummary(); }
    },
    showResult: function (res) {
      this.state.deployed = true; // lock the deploy button: the collection now exists
      this.status(STAGE_TEXT.done);
      $("#nfts_rescol").text(res.collection);
      const L = $("#nfts_reslinks").empty();
      L.append($("<a>").attr("href", "?menu=nft&nft=" + encodeURIComponent(res.slug)).text("open mint page →"));
      if (res.deploySig) L.append($("<a>").attr({ href: window.iqNft.solscanTx(res.deploySig), target: "_blank" }).text("deploy tx"));
      $("#nfts_result").removeClass("hidden");
    },
  };
})(jQuery);
