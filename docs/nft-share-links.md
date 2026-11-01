# NFT share links

The Share control uses the current NFT backend's cached preview pages. It is shown only after that backend advertises `shareCards: true` in `/health`; old or unavailable backends keep it hidden.

Launchpad, collection and known NFT views share `/share`, `/share/c/:slug` and `/share/asset/:address` respectively. Links derive from the existing `nftApi()` configuration. Native sharing is preferred; desktop copies the link, with a selectable manual-copy input if clipboard access is unavailable. Sharing never asks for a wallet signature.

Deploy the paired backend share-page routes before enabling this capability. Their HTML supplies crawler-readable titles, descriptions and social tags, then redirects browsers to the normal frontend. The gateway image-preview fix supplies PNGs for the referenced inscription images.

This does not add server rendering to the original `iqlabs.dev/?menu=nft...` address-bar URLs. Those URLs still need frontend-host integration for distinct crawler metadata. Devnet must use a frontend configured for that network; a share URL does not switch localStorage network settings.

Local checks cover exact home/collection/asset URLs, old/offline backend hiding, canceled native sharing, clipboard/manual-copy fallbacks, no duplicate controls and the existing single-NFT owner guards. No minting, wallet/provider or coin-launch behavior changes.
