// Preview budget; actual funding uses RPC rent quotes for the signer's accounts.
import { contract, constants } from "@iqlabs-official/solana-sdk";
const TX_FEE = 5000; // lamports per signature
const CHUNK_BYTES = 3600; // v1 4KB chunk payload budget (constants.ts CHUNK_SIZE_V1)
// Cover session finalization in the reviewed program (0.005 SOL). This is a
// funding ceiling, not a claim about live/discounted fees; leftovers are refunded.
const CODE_IN_FEE = 5000000;
const SESSION_RENT = 1545120; // session PDA rent
// Standard rent for 4215-byte code, 4213-byte inventory and 1146-byte user state.
const INIT_RENT = 69307680;
const MARGIN = 4000000; // headroom for fee variance + one retry session (swept back)

export function estimateCost(byteLength, { accountRent = INIT_RENT } = {}) {
  const chunks = Math.max(1, Math.ceil(byteLength / CHUNK_BYTES));
  const network = (chunks + 2) * TX_FEE; // chunks + create-session + finalize
  const rent = SESSION_RENT + accountRent;
  const total = network + CODE_IN_FEE + rent + MARGIN;
  return { chunks, network, codeInFee: CODE_IN_FEE, rent, total };
}

export async function getAccountRent(connection, publicKey) {
  // UserState includes the discriminator, owner, two bounded vectors and counter.
  const accounts = [
    [contract.getCodeAccountPda(publicKey), constants.CODE_ACCOUNT_SPACE],
    [contract.getUserInventoryPda(publicKey), constants.USER_INVENTORY_SPACE],
    [contract.getUserPda(publicKey), 8 + 32 + 4 + 1000 + 4 + 90 + 8],
  ];
  const existing = await connection.getMultipleAccountsInfo(accounts.map(([address]) => address));
  const rents = await Promise.all(accounts.map(async ([, size], i) => {
    const account = existing[i];
    if (account && !account.owner.equals(contract.PROGRAM_ID)) throw new Error("unexpected inscription account owner");
    if (account && account.data.length >= size) return 0;
    const rent = await connection.getMinimumBalanceForRentExemption(size);
    return Math.max(0, rent - (account?.lamports || 0));
  }));
  return rents.reduce((total, rent) => total + rent, 0);
}
