// Pons V2 token launcher for the Hood In board (Robinhood Chain).
// The hood analog of token_launch.js: where solana asks PumpPortal for an
// unsigned create tx, Pons has no portal, so we build the launchToken call
// directly against the factory and let the connected wallet sign it. The
// wallet's own address is recorded as the launch deployer (the creator), so
// the launching user owns the coin.
//
// Verified on-chain (2026-09, factory 0x7ed5...ec7e, chainId 4663):
// launchFee 0.0005 ETH, maxCreatorTaxBps 1000, a single enabled launch config.
import { Contract, ZeroAddress, ZeroHash, randomBytes, hexlify } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";

const FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

// Only the surface this module calls. TokenParams keeps its component names so
// ethers can take the struct as a named object; the nested Socials tuple
// mirrors PonsV2LauncherToken.Socials field order.
const ABI = [
  "function launchFee() view returns (uint256)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256) view returns ((uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled))",
  "function launchToken((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
];

// The factory rejects a launchConfigId whose config is not enabled, so pick the
// lowest enabled one rather than assuming id 0 stays the live config forever.
async function resolveLaunchConfigId(factory) {
  const count = Number(await factory.launchConfigCount());
  for (let i = 0; i < count; i++) {
    if ((await factory.getLaunchConfig(i)).enabled) return i;
  }
  throw new Error("no enabled Pons launch config on chain");
}

// Returns { token, txHash }. onStep(label) reports coarse progress, matching
// the solana launcher's step callback so the page can drive one gauge.
async function launch(opts) {
  const step = opts.onStep || function () {};
  if (!opts.signer) throw new Error("connect the wallet first");
  if (!opts.name || !opts.symbol) throw new Error("name and symbol are required");
  const creatorTaxBps = opts.creatorTaxBps || 0;
  if (creatorTaxBps > 1000) throw new Error("creator tax cannot exceed 10% (1000 bps)");

  const factory = new Contract(FACTORY, ABI, opts.signer);

  step("reading launch terms from chain");
  const [launchConfigId, launchFee] = await Promise.all([
    resolveLaunchConfigId(factory),
    factory.launchFee(),
  ]);

  const s = opts.socials || {};
  const params = {
    name: opts.name,
    symbol: opts.symbol,
    logo: opts.logo || "",
    description: opts.description || "",
    socials: {
      twitter: s.twitter || "",
      telegram: s.telegram || "",
      discord: s.discord || "",
      website: s.website || "",
      farcaster: s.farcaster || "",
    },
    creatorFeeRecipient: opts.creatorFeeRecipient || (await opts.signer.getAddress()),
    creatorTaxBps,
    buybackEnabled: !!opts.buybackEnabled,
    // Zero waives the economics guard. We do not pin here because the launch is
    // sent in the same flow that reads the terms, and the sole config's shape
    // is fixed; pinning would only matter against an owner re-peg mid-flight.
    expectedEconomics: ZeroHash,
    // Namespaced per deployer, so a fresh random value is unique among this
    // wallet's launches; collision on identical terms would revert.
    salt: hexlify(randomBytes(32)),
  };

  step("approve the transaction in your wallet");
  // Native ETH quote (pairToken = zero); msg.value must equal launchFee exactly.
  const tx = await factory.launchToken(params, launchConfigId, ZeroAddress, { value: launchFee });

  step("confirming on robinhood chain");
  const receipt = await tx.wait();

  // launchToken's return values are not visible to an EOA tx, so read the token
  // address from the TokenLaunched log (token is the first indexed topic).
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== FACTORY.toLowerCase()) continue;
    const parsed = factory.interface.parseLog(log);
    if (parsed && parsed.name === "TokenLaunched") {
      return { token: parsed.args.token, txHash: receipt.hash };
    }
  }
  throw new Error("launch landed but no TokenLaunched event was found: " + receipt.hash);
}

window.iqPonsLaunch = { launch, FACTORY };
