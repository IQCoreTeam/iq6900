// Shared Solana cache hint transport. A confirmed write must remain successful
// when a gateway is unavailable; no polling or background retry loop here.
export async function notifyGateways(urls, payload) {
  const body = JSON.stringify(payload);
  for (const url of new Set(urls)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body, signal: ctrl.signal, redirect: "error",
      });
      if (response.ok) return true;
    } catch (e) {} finally { clearTimeout(timer); }
  }
  return false;
}
