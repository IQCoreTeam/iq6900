// Keep the legacy provider on the creator who started the publication. The
// burner derivation and funding helper both await RPC/wallet prompts.
export function guardPackCreator(provider) {
  const publicKey = provider.publicKey;
  if (!publicKey) throw Error('Connect the creator wallet');
  function check() {
    if (!provider.publicKey || provider.publicKey.toBase58() !== publicKey.toBase58() || provider.isConnected === false)
      throw Error('Creator wallet changed; reconnect before continuing');
  }
  return {
    get publicKey() { check(); return publicKey; },
    async signMessage(...args) { check(); const result = await provider.signMessage(...args); check(); return result; },
    async signTransaction(tx) { check(); const result = await provider.signTransaction(tx); check(); return result; },
  };
}
