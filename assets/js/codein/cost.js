// cost.js - exact lamports to top the burner up to for one inscription.
// firstTime adds the burner's one-time user_init rent (user_inventory plus
// code_account), which is only paid on a user's very first inscription because
// the burner is reused. The funder over-provisions slightly and the leftover
// is swept back, so estimates that round up are safe.
const TX_FEE = 5000; // lamports per signature
const CHUNK_BYTES = 3600; // v1 chunk payload budget (SDK constants CHUNK_SIZE_V1)
const SESSION_RENT = 1545120; // session PDA rent budget (measured 726k on mainnet; overshoot sweeps back)
const INIT_RENT = 50000000; // user_inventory + code_account, first inscription only (devnet-measured ~0.05 SOL)
// The burner is the fee payer, so after the finalize it must hold either 0 or
// the rent-exempt minimum (~890,880). Reserve the floor up front (swept back);
// without it a finalize that spends down to sub-rent dust is rejected in
// preflight as "account (0) with insufficient funds for rent".
const RENT_FLOOR = 900000;
// Headroom for fee variance + orphaned retry sessions (swept back after the
// write). Each congested retry parks a session's rent in a dead session.
const MARGIN = 10000000;

// On-chain write fee charged by the program at finalize, per upload method
// (program constants, verified against mainnet transfers to the fee receiver):
// direct (1 chunk) 0.001 SOL, linked-list (2-9 chunks) 0.003 SOL,
// session (10+ chunks) 0.005 SOL. The old flat 0.0005 assumption underfunded
// big writes by up to 0.0045 SOL, which is exactly why 36KB+ inscriptions
// died at finalize while small posts sailed through.
function writeFee(chunks, byteLength) {
  if (chunks >= 10) return 5000000;
  // a single chunk near the 3.6KB cap can still overflow the 3.4KB inline
  // metadata budget and fall to the linked-list path, so only clearly-inline
  // sizes get the direct fee
  if (chunks === 1 && byteLength <= 3000) return 1000000;
  return 3000000;
}

export function estimateCost(byteLength, { firstTime }) {
  const chunks = Math.max(1, Math.ceil(byteLength / CHUNK_BYTES));
  const network = (chunks + 2) * TX_FEE; // chunks + create-session + finalize
  const codeInFee = writeFee(chunks, byteLength);
  const rent = SESSION_RENT + (firstTime ? INIT_RENT : 0);
  const total = network + codeInFee + rent + RENT_FLOOR + MARGIN;
  return { chunks, network, codeInFee, rent, total };
}
