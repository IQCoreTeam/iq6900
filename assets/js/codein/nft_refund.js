import { sweep } from "./inscribe.js?v=10";
import { net } from "./nft_net.js?v=2";

const memoryPending = new Map();
const key = (wallet) => "iq6900_nft_refund_" + net() + "_" + wallet;
export function pendingRefund(wallet) {
  return wallet ? refundForKey(key(wallet), wallet) : null;
}
function refundForKey(storageKey, wallet) {
  if (memoryPending.has(storageKey)) return memoryPending.get(storageKey);
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    return value?.wallet === wallet && typeof value.burner === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
function save(storageKey, value) {
  // Failure must stop a new refund transfer before it broadcasts.
  if (value) {
    memoryPending.set(storageKey, value);
    localStorage.setItem(storageKey, JSON.stringify(value));
  } else {
    localStorage.removeItem(storageKey);
    memoryPending.delete(storageKey);
  }
}
const inFlight = new Map();
export function returnMintFunds(connection, burner, wallet) {
  const owner = wallet.toBase58(),
    burnerAddress = burner.publicKey.toBase58(),
    storageKey = key(owner);
  if (inFlight.has(storageKey)) return inFlight.get(storageKey);
  const operation = (async () => {
    let record = refundForKey(storageKey, owner);
    if (record && record.burner !== burnerAddress)
      throw new Error(
        "The connected inscription wallet does not match the pending refund.",
      );
    record ||= { wallet: owner, burner: burnerAddress };
    try {
      save(storageKey, record);
      if (record.signature) {
        const status = (
          await connection.getSignatureStatuses([record.signature], {
            searchTransactionHistory: true,
          })
        ).value[0];
        if (
          status &&
          !status.err &&
          ["confirmed", "finalized"].includes(status.confirmationStatus)
        ) {
          save(storageKey, null);
          return { pending: false, signature: record.signature };
        }
        if (
          !status?.err &&
          (status ||
            (await connection.getBlockHeight("confirmed")) <=
              record.lastValidBlockHeight)
        ) {
          return { pending: true, signature: record.signature };
        }
        // A failed receipt or an expired, unseen transfer cannot later land.
        record = { wallet: owner, burner: burnerAddress };
        save(storageKey, record);
      }
      const amount = await sweep(connection, burner, wallet, (signed) => {
        record = { ...record, ...signed };
        save(storageKey, record);
      });
      save(storageKey, null);
      return {
        pending: false,
        returnedLamports: amount,
        signature: record.signature,
      };
    } catch (error) {
      return {
        pending: true,
        signature: record.signature,
        message:
          "Your NFT is minted. Returning leftover funds is still pending.",
      };
    }
  })().finally(() => inFlight.delete(storageKey));
  inFlight.set(storageKey, operation);
  return operation;
}
