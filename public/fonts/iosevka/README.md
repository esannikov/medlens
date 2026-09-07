# MedLens Iosevka

Local, normal-width subset of **Iosevka 22.1.2**, distributed through the pinned
`@fontsource/iosevka@5.3.0` package. This is a pinned release, not the latest upstream
Iosevka release. Upstream: https://github.com/be5invis/Iosevka.

The derivative family is named **MedLens Iosevka**. Regular (400), Medium (500), and
SemiBold (600) total 395,452 bytes. The original copyright and SIL Open Font License
are retained in [OFL.txt](OFL.txt). File and source hashes are in [manifest.json](manifest.json).

The subset retains Latin, Cyrillic, Greek, combining marks, punctuation, arrows,
mathematical operators and superscripts in U+0020–052F, U+1D00–1FFF,
U+2000–23FF, U+2DE0–2DFF and U+A640–A69F where present upstream. Programming
ligatures are removed; composition, language, mark and mark-to-mark features remain.
The generator checks Ukrainian letters, common medical symbols and equal advances.

To regenerate, obtain the three `files/iosevka-latin-{400,500,600}-normal.woff2`
files from https://cdn.jsdelivr.net/npm/@fontsource/iosevka@5.3.0/ and place them in
ignored `output/font-source/` as `regular.woff2`, `medium.woff2`, `semibold.woff2`.
Despite these upstream filenames, the source cmap includes Cyrillic and Greek.
Run from the repository root:

```sh
uv run --no-project --with 'fonttools[woff]==4.64.0' python scripts/subset-iosevka.py
npm test
```

Deployment serves these files from the same site. No external font service is
contacted by the application. Fonts are licensed assets; their public author
attribution is not patient data.
