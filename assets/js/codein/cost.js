// cost.js - exact lamports to top the burner up to for one inscription.
// firstTime adds the burner's one-time user_init rent (user_inventory plus
// code_account), which is only paid on a user's very first inscription because
// the burner is reused. The funder over-provisions slightly and the leftover
// is swept back, so estimates that round up are safe.
const TX_FEE = 5000; // lamports per signature
const CHUNK_BYTES = 3600; // v1 4KB chunk payload budget (constants.ts CHUNK_SIZE_V1)
const CODE_IN_FEE = 500000; // 0.0005 SOL on-chain write fee (measured on mainnet)
const SESSION_RENT = 1545120; // session PDA rent
const INIT_RENT = 50000000; // user_inventory + code_account, first inscription only (devnet-measured ~0.05 SOL)
const MARGIN = 4000000; // headroom for fee variance + one retry session (swept back)

export function estimateCost(byteLength, { firstTime }) {
  const chunks = Math.max(1, Math.ceil(byteLength / CHUNK_BYTES));
  const network = (chunks + 2) * TX_FEE; // chunks + create-session + finalize
  const rent = SESSION_RENT + (firstTime ? INIT_RENT : 0);
  const total = network + CODE_IN_FEE + rent + MARGIN;
  return { chunks, network, codeInFee: CODE_IN_FEE, rent, total };
}
