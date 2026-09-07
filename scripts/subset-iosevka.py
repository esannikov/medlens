"""Build the local OFL font derivative from pinned Fontsource 5.3.0 assets.

Run: uv run --with 'fonttools[woff]==4.64.0' python scripts/subset-iosevka.py
Original WOFF2 files must be in ignored output/font-source/.
"""
from pathlib import Path
import hashlib
import json
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
ranges = [(0x20, 0x52F), (0x1D00, 0x1FFF), (0x2000, 0x23FF), (0x2DE0, 0x2DFF), (0xA640, 0xA69F)]
codepoints = {cp for start, end in ranges for cp in range(start, end + 1)}
required = set(map(ord, "ІіЇїЄєҐґαβγλµμ≤≥−×⁰¹²³⁴⁵⁶⁷⁸⁹0123456789.,%/"))
manifest = {"upstream": "Iosevka 22.1.2", "package": "@fontsource/iosevka@5.3.0", "family": "MedLens Iosevka", "license": "OFL-1.1", "features": ["ccmp", "locl", "mark", "mkmk"], "fonts": []}
for name, weight, style in [("regular", 400, "Regular"), ("medium", 500, "Medium"), ("semibold", 600, "SemiBold")]:
    source = root / "output/font-source" / f"{name}.woff2"
    font = TTFont(source)
    assert not (required - set(font.getBestCmap())), "Required clinical glyph missing in upstream font"
    options = subset.Options()
    options.layout_features = manifest["features"]
    options.name_IDs = ["*"]
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=codepoints)
    sub.subset(font)
    for record in font["name"].names:
        text = {1: "MedLens Iosevka", 16: "MedLens Iosevka", 2: style, 17: style,
                3: f"MedLens Iosevka 22.1.2 {style}", 4: f"MedLens Iosevka {style}",
                6: f"MedLensIosevka-{style}"}.get(record.nameID)
        if text is not None:
            record.string = text.encode(record.getEncoding())
    font.flavor = "woff2"
    target = root / "public/fonts/iosevka" / f"iosevka-22.1.2-{name}.woff2"
    font.save(target)
    verified = TTFont(target)
    cmap = verified.getBestCmap()
    assert not (required - set(cmap)), "Required clinical glyph lost during subsetting"
    assert len({verified["hmtx"].metrics[cmap[c]][0] for c in map(ord, "АБВІЇЄҐabc0123βλ")}) == 1
    manifest["fonts"].append({"file": target.name, "weight": weight, "bytes": target.stat().st_size,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "glyphs": len(cmap),
        "required_codepoints": sorted(required)})
(root / "public/fonts/iosevka/manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n")
print(json.dumps({"bytes": sum(f["bytes"] for f in manifest["fonts"]), "fonts": len(manifest["fonts"]), "glyphs_verified": True}))
