# Publication verification — 2026-09-06

This initial standalone release preserves the approved HematoBoard 2D lens and table. It changes loading to a same-site static JSON file, names the page MedLens, and packages only the required UI. It does not change the canonical Patient Graph or publish clinical hypotheses.

- `npm test`: PASS. Pinned public projection, exact source references, no local API or private file paths; negative clinical-value mutation rejected.
- Lens regression: 185 real objects, 148 results, 8 clinical days; 35,721 transform checks, 756 layout scenarios, 756 navigation checks. Four virtual navigation groups and 188 tree connections represent the 185-object dossier; all 306 structural edges remain accessible in the inspector.
- `npm run build`: PASS. TypeScript + Vite. No Three.js dependency.
- Browser, built static page: 189 navigation glyphs and 188 tree connections; 185 real table rows; date cutoff changes both controls and visible content; structured source opens; no horizontal overflow at 390px. Desktop, time and mobile screenshots visually reviewed.
- Independent read-only review: 185/185 payloads and clinical times match the canonical graph; 146/146 source texts and page fields match the already published package. No missing fact/source references. Initial export hash-check gap was fixed with exact reviewed input-byte pins and a negative mutation check; re-review found no blocking issue.
- Staged credential scan and whitespace checks: PASS.

The publication is a static demonstration, not a clinical validation or clinician acceptance. GitHub Actions independently repeats tests and build before deployment. Public availability and live-browser canary are checked after deployment; these are separate from the local results above.

## Lens motion refinement — 2026-09-06

Status: DONE_WITH_CONCERNS. Scope: two lens modules, regression test and documentation. Clinical/public data files unchanged.

Root cause: each frame greedily chose among eight unrelated label slots; discrete radius thresholds also changed wrapping and metadata. A small circular drag reproduced 138–278px caption jumps. Regression failed before the fix.

Fix: remembered angular anchors, bounded 24px relative adjustment, stable typesetting, continuous 11.5–26px title scale, earlier peripheral values and a stationary soft focus gradient. Nodes and active-branch strokes remain protected; thin context lines may pass behind the existing text halo. No visible label rectangles or extra connectors were added.

- `npm test`: PASS, including 178 continuous-caption computational samples, 756 layout scenarios and all existing data checks. 5,322 labels checked; 31 static dense layouts use the persistent orientation-caption fallback.
- `npm run build`: PASS; no new dependencies, no changed clinical bytes.
- Two batched browser rounds, desktop 1440px and mobile 390px, screenshots visually reviewed. Final circular drag: electrophoresis 0/31 hidden samples, maximum visible step 10.35px; urinalysis 4/31 hidden samples, maximum visible step 10.34px. These results do not claim uninterrupted visibility for every clinical title.
- Early readable value labels: 14 and 11 respectively. Radial drag produced a smooth sequence 24.57 → 24.21 → 23.86 → … → 21.72px before the tracked caption met a collision.
- Table still has 185 real object rows. No mobile horizontal overflow or page errors. Reduced-motion navigation bypasses automatic camera travel. Focus gradient remains centered in the viewport and does not intercept pointer input.
- Mechanical design detector on both changed UI modules returned `[]`; this is not a complete accessibility certification.
- Independent pre-publication review found a separate pointerup reflow: an already visible secondary label moved 155.58px on unchanged geometry. Motion-only feedback no longer invalidates label placement; a regression guards the memo dependency contract. This functional lifecycle repair does not add a new visual-polish round.

Residual: dense crossings can briefly hide the moving caption to preserve node readability. Its exact text remains available in the fixed focus header and reader. This was disclosed to the user; additional visual polishing was stopped after the two inspection rounds required by Impeccable.
