# NFT header clearance

Base: `9928df19599551b13b5caa73580a5ec01e522042` (`master`). Chrome screenshots captured 2026-10-26 using the same devnet NFT: collection page at 390px and viewer at 320px.

The fixed navigation used z100, above the viewer's z35. Viewer101 and metadata102 restore overlay order. NFT list/collection/creator pages reserve the shared header-height value; header dimensions and visual styling stay unchanged, and other screens retain their existing padding.

Measured collection clearance 14px at 320/390/600/1280px; no document horizontal overflow. Viewer close preserves clearance; list has 14px and creator 16px. Close receives pointer input, metadata opens above the viewer and dismissal retains the viewer. The newer devnet notice still opens/dismisses, and the bounded scrollable item grid is retained. No wallet or chain write; physical devices not tested.

| | Before | After |
| --- | --- | --- |
| Collection page | ![Original page](page-before.png) | ![Header clearance](page-after.png) |
| NFT viewer | ![Covered header](viewer-before.png) | ![Visible title and close control](viewer-after.png) |
