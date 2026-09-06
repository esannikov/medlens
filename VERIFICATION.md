# Publication verification — 2026-09-06

This initial standalone release preserves the approved HematoBoard 2D lens and table. It changes loading to a same-site static JSON file, names the page MedLens, and packages only the required UI. It does not change the canonical Patient Graph or publish clinical hypotheses.

- `npm test`: PASS. Pinned public projection, exact source references, no local API or private file paths; negative clinical-value mutation rejected.
- Lens regression: 185 real objects, 148 results, 8 clinical days; 35,721 transform checks, 756 layout scenarios, 756 navigation checks. Four virtual navigation groups and 188 tree connections represent the 185-object dossier; all 306 structural edges remain accessible in the inspector.
- `npm run build`: PASS. TypeScript + Vite. No Three.js dependency.
- Browser, built static page: 189 navigation glyphs and 188 tree connections; 185 real table rows; date cutoff changes both controls and visible content; structured source opens; no horizontal overflow at 390px. Desktop, time and mobile screenshots visually reviewed.
- Independent read-only review: 185/185 payloads and clinical times match the canonical graph; 146/146 source texts and page fields match the already published package. No missing fact/source references. Initial export hash-check gap was fixed with exact reviewed input-byte pins and a negative mutation check; re-review found no blocking issue.
- Staged credential scan and whitespace checks: PASS.

The publication is a static demonstration, not a clinical validation or clinician acceptance. GitHub Actions independently repeats tests and build before deployment. Public availability and live-browser canary are checked after deployment; these are separate from the local results above.
