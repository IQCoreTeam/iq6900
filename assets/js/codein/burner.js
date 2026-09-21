// burner.js — deterministic per-user signing wallet, derived from one wallet
// signature. Same wallet + same message always yields the same keypair, so we
// store nothing at rest and the burner is reused: its one-time account-init
// rent is paid once per user instead of once per inscription.
//
// The signature is key material. Never log or transmit it. A wallet whose
// signMessage is not deterministic must fall back to a stored key instead.
import { Keypair } from "@solana/web3.js";

const DERIVE_MESSAGE =
  "IQ6900 code-in burner v1. Sign to unlock your inscription wallet. This costs nothing and never leaves your browser.";

export async function deriveBurner(signMessage) {
  const signature = await signMessage(new TextEncoder().encode(DERIVE_MESSAGE));
  const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", signature));
  return Keypair.fromSeed(seed);
}
