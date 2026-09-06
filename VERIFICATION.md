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

## Complete captions and explicit focus — 2026-09-06

Fixed oversized truncated labels by changing their base composition, not only the final SVG font size. Type now ranges from 11.5 to 21px, with full-title fitting for long names. Finding boilerplate and its empty detail band were removed. Textual values and dates wrap with stable line breaks. A distinct fixed optical ring, light rim and four subtle ticks identify the magnification area.

Short findings (including negation and question marks) remain verbatim. Long prose is never cropped into an apparent clinical conclusion: a source-defined section heading or neutral structured-type caption links to the unchanged full reader. Sentence punctuation disqualifies a colon prefix from becoming a heading. Visible captions are included in accessible button names, and the disclosure arrow is inside its hit/collision rectangle.

Independent typography review identified and closed four issues: non-clickable arrow, missing visible alias in accessible name, narrative colon-prefix extraction, and dynamic detail rewrapping. No dependency or clinical-data changes.

`npm test` and build PASS: 5,334 labels checked across 756 layouts, 178 motion checks, complete visible navigation titles and values. Browser checked all 16 study titles, all full and uncut; one 540-character narrative matched its source exactly. Desktop and mobile screenshots were inspected; no page error or horizontal overflow. Mechanical detector on the four changed UI files returned `[]`. Final full-finding tour and deployment canary are recorded separately in local QA evidence.

Final browser tour opened all 38 findings, checked each complete reader text against the public payload, and dragged from every finding. No ellipsis or source-boilerplate string was found in the sampled graph labels. The actual disclosure-arrow pixel opened the matching full record. Time controls and the 185-row table were rechecked; overview/mobile screenshots inspected. Two test-selector typos interrupted only the post-tour script tail (wrong ARIA role and wrong spelling of the return button); the corrected tail completed, without production changes for those harness errors. Clinical data SHA-256 remains unchanged.

## Optical pass, connection hierarchy and alignment — 2026-09-06

Added active-subtree and incoming-route emphasis, a subtle branch-colored field, a one-shot 650ms rim glint, and three adjustable stroke profiles. Stroke width is explicitly navigation emphasis, not clinical significance. Labels align toward their owning node; the minimum width/gap is tighter, and observation labels avoid their own active connector where space permits.

Two batched visual rounds covered all three profiles, dragging, desktop and mobile. R2 verified eight highlighted serum-result edges, maximum route widths 1.7625/2.35/3.1725px across profiles, one active glint during drag, and zero glint animations under reduced motion. The centered material caption remained visible; no horizontal overflow or console errors. R1's negative inner-circle radius during a transient collapsed viewport was fixed with a nonnegative clamp. Screenshots in both rounds were visually reviewed.

The single detector run reported a `layout-transition` warning matching the substring `width` in SVG `stroke-width`. This is a documented false positive for DOM layout: only stroke paint and opacity are transitioned, not element width/height. It is not counted as an unexplained clean detector pass.

Independent review raised a possible pointerup text-anchor change; label memoization already prevents motion-only reflow, and the complete text coordinates/alignment were checked through the browser. A separate functional resize/first-drag defect was found: passive cache reset erased the just-committed anchors. Reset now precedes layout storage in the layout-effect phase, with a regression guarding the lifecycle. No extra visual-polish cycle was performed for this functional repair.

Final automated suite: 756 layouts, 5,225 labels, 178 motion checks plus alignment/stroke tests. Build PASS. Clinical dataset hash unchanged; clinician acceptance remains false. Dense-position label suppression remains an existing fallback, not a claim of perfect placement for every view.

## User-authorized issue-date fallback — 2026-09-06

The user requested using issuance dates after the distinction between clinical and administrative dates was explained. The read-only display policy is now: own clinical date → parent study clinical date → unique valid explicit issue date → unknown. Temporal-relation endpoint dates are unchanged. No clinical date, payload or public-data hash is rewritten.

Seven studies and 76 results receive an `issued` display basis. The visible date range now ends on 24.08.2026 (11 unique display dates). Nine clinically dated studies retain their dates. Date search includes the display fallback; table, reader, lens and timeline all show its role. The timeline no longer calls this mixed date range exclusively clinical.

Tests cover clinical-date precedence, child fallback, inclusive cutoff and exclusion before issuance even with the undated toggle enabled, invalid/conflicting issue dates, duplicate identical issue dates, and rejection of registration/order as substitutes. `npm test` and build PASS: 185 objects, 148 results, 756 layouts, 5,223 labels, 178 motion checks.

Browser verified `Загальний аналіз сечі — 19.08.2026 · видано`; the study is absent at 18.08 and present at 19.08. All 185 table rows return at 24.08. Desktop lens/table and mobile screenshots were inspected, with no horizontal overflow or page errors. Detector returned `[]`. Independent read-only review found no blocking issue.
