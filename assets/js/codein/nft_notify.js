import { feedTablePda } from "./feed.js";
import { notifyGateways } from "./gateway_notify.js?v=1";

const genesisByConnection = new WeakMap();
const gateways = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "https://gateway.iqlabs.dev",
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG": "https://dev-gateway.iqlabs.dev",
};

// Only C/logo/banner feed rows belong in /table/.../notify. Raw metadata,
// funding and registrar transactions are not table rows and must not go here.
export async function notifyNftFeedRow(connection, signature, row, burner) {
  try {
    let genesis = genesisByConnection.get(connection);
    if (!genesis) {
      genesis = connection.getGenesisHash();
      genesisByConnection.set(connection, genesis);
      genesis.catch(() => genesisByConnection.delete(connection));
    }
    const gateway = gateways[await genesis];
    if (!gateway) return false; // unknown/local/testnet chain: never guess mainnet
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (!status || status.err || !["confirmed", "finalized"].includes(status.confirmationStatus)) return false;
    return await notifyGateways([`${gateway}/table/${feedTablePda.toBase58()}/notify`], {
      txSignature: signature,
      row: { ...row, __signer: burner },
      signer: row.who, // invalidate the original wallet's inventory reference
    });
  } catch (e) { return false; }
}
