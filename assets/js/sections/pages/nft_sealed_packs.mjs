// Optional sealed mode inside the existing packs page; no fixture signer or
// operator key is available here. Uses the same registry and transaction sender.
export async function mountSealedPackPage(root, config) {
  const client = await import("/sealed-client.js"),
    connection =
      config.connection ?? new client.Connection(config.rpc, "confirmed");
  const { createPackPageTransport } = await import("./pack-transport.mjs"),
    transport = createPackPageTransport(config, location.href),
    base = new URL(config.apiBase ?? location.origin),
    endpoint = new URL("/packs/" + config.collection + "/sealed", base);
  let wallet = null,
    account = null,
    data = null,
    busy = false,
    disposed = false,
    pageBefore = null,
    opening = null,
    timer = null,
    openingView = null,
    generation = 0,
    openingCards = [],
    openingPackId = null;
  const revealed = new Set();
  root.querySelector(".packs-title-row p").textContent =
    "Keep it sealed, trade it, or open it for four traits.";
  root.querySelector(".opening-window").replaceChildren();
  root.querySelector(".inventory-window").remove();
  const area = root.querySelector(".opening-window"),
    walletRoot = document.createElement("section");
  walletRoot.className = "pack-wallet-controls";
  root.querySelector(".packs-nav").append(walletRoot);
  const status = document.createElement("p");
  status.className = "pack-status";
  status.setAttribute("role", "status");
  const error = document.createElement("p");
  error.className = "pack-error";
  error.setAttribute("role", "alert");
  const proofPanel = document.createElement("div");
  proofPanel.className = "randomness-proof";
  proofPanel.hidden = true;
  const grid = document.createElement("div");
  grid.className = "sealed-grid";
  const listingGrid = document.createElement("div");
  listingGrid.className = "sealed-grid";
  const totals = document.createElement("p");
  totals.className = "sealed-totals";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "text-button";
  refresh.textContent = "Refresh";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "text-button";
  more.textContent = "Earlier packs";
  more.hidden = true;
  const older = document.createElement("button");
  older.type = "button";
  older.className = "text-button";
  older.textContent = "Latest packs";
  older.hidden = true;
  const heading = text("h2", "Your packs"),
    marketHeading = text("h2", "Listed packs"),
    openHost = document.createElement("div");
  openHost.className = "pack-workspace";
  area.append(
    totals,
    status,
    error,
    openHost,
    heading,
    grid,
    marketHeading,
    listingGrid,
    more,
    older,
    refresh,
    proofPanel,
  );
  const openingStage = document.createElement("div");
  openingStage.className = "library-opening";
  openHost.append(openingStage);
  const { createPackOpening } = await import("/packs-reveal.js");
  const { normalizePackAppearance, applyPackAppearance } =
    await import("/packs-appearance.mjs");
  openingView = createPackOpening(
    openingStage,
    (id) => {
      if (!openingCards.some((card) => card.id === id)) return false;
      revealed.add(id);
      renderOpening();
      return true;
    },
    () => {
      openingCards = [];
      openingPackId = null;
      revealed.clear();
      renderOpening();
      status.textContent = "Your four traits remain in your wallet.";
    },
  );
  function renderOpening() {
    openingView.update({
      cards: openingCards,
      opened: [...revealed],
      packId: openingPackId,
      interactive: openingCards.length === 4,
    });
  }
  renderOpening();
  root.querySelector(".primary-actions").hidden = true;
  function text(tag, value) {
    const el = document.createElement(tag);
    el.textContent = value;
    return el;
  }
  async function json(url, options) {
    const response = await fetch(url, {
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        ...options,
      }),
      value = await response.json();
    if (!response.ok)
      throw Error(value.error ?? "Confirmed sealed state unavailable");
    return value;
  }
  async function notify(assets) {
    return json(new URL(endpoint.href + "/notify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assets }),
    });
  }
  const buyer = client.createSealedPackClient({
    connection,
    program: config.program,
    collection: config.collection,
    chain: config.chain,
    localGenesis: config.localGenesis,
    pendingPurchases: config.pendingPurchases,
    notify,
    requestWindow: config.windowRequests
      ? (wallet, account) =>
          client.requestPackWindow({
            wallet,
            account,
            chain: config.chain,
            program: config.program,
            collection: config.collection,
            endpoint: transport.windowEndpoint,
          })
      : null,
  });
  const disconnect = client.mountPackWalletUI(walletRoot, {
    registry: config.registry,
    client: buyer,
    chain: config.chain,
    purchaseRoot: root.querySelector("#nftp-checkout"),
  });
  const priceRefresh = root.querySelector("#nftp-checkout .text-button");
  if (priceRefresh) priceRefresh.hidden = true;
  walletRoot.addEventListener("iqpacks:wallet", async (event) => {
    wallet = event.detail.wallet;
    account = event.detail.account;
    generation++;
    proofPanel.hidden = true;
    opening = null;
    window.clearTimeout(timer);
    openingCards = [];
    openingPackId = null;
    revealed.clear();
    renderOpening();
    grid.replaceChildren();
    listingGrid.replaceChildren();
    try {
      await read();
    } catch (e) {
      error.textContent = e.message;
    }
  });
  walletRoot.addEventListener("iqpacks:purchase", async () => {
    status.textContent =
      "Your pack NFT is sealed. Keep it, list it, or open it.";
    try {
      await read();
    } catch (e) {
      error.textContent = e.message;
    }
  });
  async function read() {
    const revision = generation,
      url = new URL(endpoint);
    if (pageBefore !== null) url.searchParams.set("before", String(pageBefore));
    const value = await json(url);
    if (
      value.program !== config.program ||
      value.collectionAddress !== config.collection ||
      value.chain !== config.chain
    )
      throw Error("Sealed state differs from the configured deployment");
    const listings = await client.readTensorListings(
      connection,
      value.packs.filter((p) => !p.opened).map((p) => p.asset),
    );
    if (disposed || revision !== generation) return;
    data = { ...value, listings };
    applyPackAppearance(
      root,
      normalizePackAppearance(
        {
          title: root.dataset.packTitle,
          subtitle: root.dataset.packSubtitle,
          collectionName: data.name,
          logo: root.dataset.packLogo,
          cover: root.dataset.packCover,
        },
        location.origin,
      ),
    );
    render();
  }
  async function run(operation) {
    if (
      busy ||
      disposed ||
      root.querySelector("#nftp-checkout").getAttribute("aria-busy") === "true"
    )
      return;
    busy = true;
    error.textContent = "";
    render();
    try {
      await operation();
      await read();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      busy = false;
      if (!disposed) render();
    }
  }
  function card(pack) {
    const row = document.createElement("article");
    row.className = "sealed-card";
    row.append(
      text("h3", "Pack #" + (pack.serial + 1)),
      text("p", pack.opened ? "Consumed on opening" : "Unopened pack NFT"),
    );
    return row;
  }
  function action(label, handler) {
    const button = text("button", label);
    button.type = "button";
    button.className = "quiet-button";
    button.disabled = busy;
    button.onclick = () => run(handler);
    return button;
  }
  function render() {
    walletRoot.toggleAttribute("inert", busy);
    root.querySelector("#nftp-checkout").toggleAttribute("inert", busy);
    if (!data || disposed) return;
    root.querySelector("#nftp-title").textContent = data.name;
    totals.textContent =
      data.unminted +
      " unminted · " +
      data.sealed +
      " sealed · " +
      data.opened +
      " opened";
    grid.replaceChildren();
    listingGrid.replaceChildren();
    more.hidden = data.pagination?.nextBefore == null;
    older.hidden = pageBefore === null;
    for (const pack of data.packs) {
      const listing = data.listings.find((x) => x.asset === pack.asset);
      if (!pack.opened && listing) {
        const row = card(pack);
        row.append(
          text(
            "p",
            client.formatSolLamports(listing.price) +
              " SOL · seller asking price",
          ),
        );
        if (account?.address === listing.seller)
          row.append(
            action("Cancel listing", async () => {
              await financial(
                [
                  await client.tensorCancelInstruction({
                    listing,
                    collection: data.packCollection,
                    seller: account.address,
                  }),
                ],
                pack.asset,
              );
            }),
          );
        else if (account && listing.supported && !listing.expired)
          row.append(
            action("Buy listed pack", async () => {
              await financial(
                await client.tensorPurchaseInstructions({
                  listing,
                  collection: data.packCollection,
                  buyer: account.address,
                  creators: [],
                  maximumAmount: listing.price,
                }),
                pack.asset,
              );
            }),
          );
        listingGrid.append(row);
      } else if (account && !pack.opened && pack.owner === account.address) {
        const row = card(pack);
        row.append(
          action("Open pack", async () => {
            status.textContent =
              "Preparing opening. Approve the required wallet prompts; no second purchase price is charged.";
            const revision = generation;
            await buyer.open({
              wallet,
              account,
              asset: pack.asset,
            });
            if (disposed || revision !== generation) return;
            opening = pack.asset;
            status.textContent = "Preparing randomness…";
            follow();
          }),
        );
        const price = document.createElement("input");
        price.type = "text";
        price.inputMode = "decimal";
        price.placeholder = "Asking price in SOL";
        price.setAttribute(
          "aria-label",
          "Asking price for pack " + (pack.serial + 1),
        );
        row.append(
          price,
          action("List pack", async () => {
            const { parsePackPrice } = await import("./nft_pack_creator.js");
            const amount = parsePackPrice(price.value);
            await financial(
              [
                await client.tensorListingInstruction({
                  asset: pack.asset,
                  collection: data.packCollection,
                  seller: account.address,
                  price: BigInt(amount),
                  expiresInSeconds: 86400,
                }),
              ],
              pack.asset,
            );
          }),
        );
        grid.append(row);
      } else if (account && pack.opened && pack.opener === account.address) {
        const row = card(pack);
        if (pack.status === "ready")
          row.append(
            action("Show opening", async () => {
              opening = pack.asset;
              await showOpening(pack);
            }),
          );
        if (pack.status === "ready")
          row.append(
            action("Verify randomness", async () => {
              const revision = generation;
              const result = await client.verifyPackRandomness({
                connection,
                program: config.program,
                collection: config.collection,
                chain: config.chain,
                localGenesis: config.localGenesis,
                epochId: pack.epoch,
                ticket: pack.ticket,
              });
              if (disposed || revision !== generation) return;
              const { renderRandomnessProof } = await import("./nft_packs.js");
              proofPanel.hidden = false;
              renderRandomnessProof(
                proofPanel,
                result,
                "Pack #" + (pack.serial + 1),
              );
            }),
          );
        if (pack.status !== "ready")
          row.append(
            text(
              "p",
              pack.status === "refunded"
                ? "Original prepaid price refunded."
                : "Preparing randomness…",
            ),
          );
        grid.append(row);
      }
    }
    if (!grid.children.length)
      grid.append(
        text(
          "p",
          account
            ? "No packs in this page for your wallet."
            : "Connect your wallet to see your packs.",
        ),
      );
    if (!listingGrid.children.length)
      listingGrid.append(text("p", "No indexed listings on this page."));
  }
  async function financial(instructions, asset) {
    if (!wallet || !account) throw Error("Connect a wallet");
    const key = client.packPurchaseKey(
      config.chain,
      config.program,
      config.collection,
      account.address,
    );
    const pending = await config.pendingPurchases.load(key);
    if (pending)
      throw Error("Reconcile the previous transaction before another action");
    const signature = await client.sendWalletTransaction({
      connection,
      wallet,
      account,
      chain: config.chain,
      localGenesis: config.localGenesis,
      transaction: new client.Transaction().add(...instructions),
      beforeSubmit: (receipt) =>
        config.pendingPurchases.save(key, { ...receipt, asset }),
    });
    await notify([asset]);
    await config.pendingPurchases.clear(key, signature);
    status.textContent = "Confirmed on chain.";
  }
  async function showOpening(pack) {
    const current = await transport.read(
        account.address,
        undefined,
        pack.epoch + 1,
      ),
      ticket = current.packs.find(
        (x) =>
          x.epoch === pack.epoch &&
          x.sequence === pack.ticket &&
          x.owner === account.address,
      );
    if (!ticket || ticket.status !== "settled") {
      status.textContent = ticket?.void
        ? "Opening timed out. Check the original-price refund."
        : "Preparing randomness…";
      if (!ticket?.void) follow();
      return;
    }
    const { packRewards } = await import("./nft_packs.js"),
      rewards = packRewards(current, ticket);
    openingPackId = ticket.address;
    revealed.clear();
    openingCards = rewards.map((trait) => ({
      id: trait.address,
      name: trait.name,
      image: transport.media(trait.image),
      category: "Trait",
      creatorTier: current.stock.find((row) => row.id === trait.definition)
        ?.creatorTier,
    }));
    renderOpening();
    openHost.scrollIntoView({ block: "center" });
    status.textContent = "Pack ready. Click the pack to reveal your traits.";
  }
  function follow() {
    window.clearTimeout(timer);
    let n = 0;
    const revision = generation;
    const tick = async () => {
      if (disposed || !account || generation !== revision) return;
      try {
        const pack = data.packs.find((x) => x.asset === opening);
        if (pack) {
          const current = await transport.read(
              account.address,
              undefined,
              pack.epoch + 1,
            ),
            ticket = current.packs.find(
              (x) => x.epoch === pack.epoch && x.sequence === pack.ticket,
            );
          if (ticket?.status === "settled") {
            await read();
            await showOpening(pack);
            return;
          }
        }
        if (++n < 24) timer = window.setTimeout(tick, 5000);
        else
          status.textContent =
            "Delivery remains pending. Refresh to check; do not open another transaction.";
      } catch (e) {
        error.textContent = e.message;
      }
    };
    timer = window.setTimeout(tick, 5000);
  }
  refresh.onclick = () =>
    run(async () => {
      if (account) await buyer.reconcilePurchase(account);
      await read();
      walletRoot.dispatchEvent(new Event("iqpacks:refresh-sale"));
    });
  more.onclick = () =>
    run(async () => {
      pageBefore = data.pagination.nextBefore;
      await read();
    });
  older.onclick = () =>
    run(async () => {
      pageBefore = null;
      await read();
    });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      disposed = true;
      generation++;
      window.clearTimeout(timer);
      disconnect();
      openingView?.dispose();
      observer.disconnect();
    }
  });
  observer.observe(document.querySelector("#main_section"), {
    childList: true,
  });
  await read();
}
