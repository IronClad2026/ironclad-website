"""Render the version 1.4 review copy alongside the approved legal tooling."""

import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
review = root / "docs" / "legal-drafts" / "caster-ready-privacy-v1.4"
filename = "ironclad-privacy-policy-v1.4.pdf"
document = json.loads((review / ".privacy-1.4-render-input.json").read_text(encoding="utf-8"))
if any(document.get(key) != expected for key, expected in {
    "kind": "privacy",
    "version": "1.4",
    "status": "Review Draft",
    "effectiveDate": None,
    "filename": filename,
    "publicPath": f"/documents-rules-ppa/{filename}",
}.items()):
    raise ValueError("Only the in-repository Privacy 1.4 review copy may be rendered")

renderer = runpy.run_path(str(root / "scripts" / "generate-legal-pdfs.py"))
document = renderer["resolve_document_tokens"](document, review_draft=True)
renderer["validate_blocks"](document["introBlocks"], "privacy.introBlocks")
for section in document["sections"]:
    renderer["validate_blocks"](section["blocks"], f"privacy.{section['number']}")
fonts = renderer["register_fonts"]()
staged = review / f".{filename}.staging"
with staged.open("xb"):
    pass
try:
    renderer["build_pdf"](staged, document, "TBD", fonts, renderer["make_styles"](fonts), True)
    staged.replace(review / filename)
finally:
    staged.unlink(missing_ok=True)
