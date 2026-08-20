#!/usr/bin/env python3
"""Generate selected IronClad legal PDFs from the canonical current corpus.

The initial four-document release remains supported. A successor release may
select only Terms and Privacy so the immutable Rulebook, PPA and historical
Terms/Privacy artifacts are preserved. Dates are read per document and an
explicit release-date assertion never rewrites the source corpus.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = ROOT / "content" / "legal-corpus.json"
DEFAULT_OUTPUT = ROOT / "public" / "documents-rules-ppa"
LOGO_PATH = ROOT / "public" / "images" / "ironclad-logo.png"

DOCUMENT_KINDS = ("rulebook", "ppa", "terms", "privacy")
APPROVED_FILENAMES = {
    "rulebook": {
        "3.0": "ironclad-official-tournament-rulebook-v3.0.pdf",
    },
    "ppa": {
        "3.0": "ironclad-player-participation-agreement-v3.0.pdf",
    },
    "terms": {
        "1.0": "ironclad-terms-of-service-v1.0.pdf",
        "1.1": "ironclad-terms-of-service-v1.1.pdf",
    },
    "privacy": {
        "1.0": "ironclad-privacy-policy-v1.0.pdf",
        "1.1": "ironclad-privacy-policy-v1.1.pdf",
    },
}

DISALLOWED_DASHES = {
    "\u2010": "HYPHEN",
    "\u2011": "NON-BREAKING HYPHEN",
    "\u2012": "FIGURE DASH",
    "\u2013": "EN DASH",
    "\u2014": "EM DASH",
    "\u2212": "MINUS SIGN",
}

PAGE_WIDTH, PAGE_HEIGHT = A4
ORANGE = colors.HexColor("#F97316")
ORANGE_DARK = colors.HexColor("#C2410C")
INK = colors.HexColor("#18181B")
MUTED = colors.HexColor("#52525B")
LIGHT = colors.HexColor("#F4F4F5")
PALE_ORANGE = colors.HexColor("#FFF7ED")
WHITE = colors.white
BLACK = colors.HexColor("#09090B")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--effective-date",
        help="YYYY-MM-DD assertion. It must match every selected document.",
    )
    parser.add_argument(
        "--kinds",
        default=",".join(DOCUMENT_KINDS),
        help="Comma-separated document kinds to generate.",
    )
    return parser.parse_args()


def format_date(value: str) -> str:
    parsed = date.fromisoformat(value)
    return f"{parsed.day} {parsed.strftime('%B %Y')}"


def parse_selected_kinds(value: str) -> tuple[str, ...]:
    selected = tuple(part.strip() for part in value.split(",") if part.strip())
    if not selected or len(set(selected)) != len(selected):
        raise ValueError("--kinds must contain unique document kinds")
    invalid = set(selected) - set(DOCUMENT_KINDS)
    if invalid:
        raise ValueError(f"Unsupported --kinds values: {sorted(invalid)}")
    return selected


def load_corpus(
    path: Path,
    effective_date_override: str | None,
    selected_kinds: tuple[str, ...],
) -> dict[str, Any]:
    corpus = json.loads(path.read_text(encoding="utf-8"))
    canonical_date = corpus.get("effectiveDate")
    if not isinstance(canonical_date, str):
        raise ValueError("The corpus must define effectiveDate in YYYY-MM-DD form")
    expected_display = format_date(canonical_date)
    if corpus.get("effectiveDateDisplay") != expected_display:
        raise ValueError("The corpus effectiveDateDisplay does not match effectiveDate")

    documents = corpus.get("documents", [])
    if not isinstance(documents, list):
        raise ValueError("The legal corpus documents must be a list")
    corpus["documents"] = [resolve_document_tokens(document) for document in documents]

    selected_documents = [
        document
        for document in corpus["documents"]
        if document.get("kind") in selected_kinds
    ]
    if len(selected_documents) != len(selected_kinds):
        raise ValueError("The corpus does not contain every selected document kind")
    if effective_date_override:
        mismatched = [
            document.get("kind")
            for document in selected_documents
            if document.get("effectiveDate") != effective_date_override
        ]
        if mismatched:
            raise ValueError(
                "--effective-date does not match selected document dates: "
                + ", ".join(str(kind) for kind in mismatched)
            )
    return corpus


def replace_tokens(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, str):
        for source, target in replacements.items():
            value = value.replace(source, target)
        return value
    if isinstance(value, list):
        return [replace_tokens(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: replace_tokens(item, replacements) for key, item in value.items()}
    return value


def resolve_document_tokens(document: dict[str, Any]) -> dict[str, Any]:
    """Resolve display tokens using this document's own immutable date."""
    effective_date = document.get("effectiveDate")
    if not isinstance(effective_date, str):
        raise ValueError(f"{document.get('kind', 'document')} has no effectiveDate")
    resolved = replace_tokens(
        document,
        {"{{EFFECTIVE_DATE}}": format_date(effective_date)},
    )
    if "{{EFFECTIVE_DATE}}" in json.dumps(resolved, ensure_ascii=False):
        raise ValueError(
            f"{document.get('kind', 'document')} has an unresolved Effective-date token"
        )
    return resolved


def validate_corpus(corpus: dict[str, Any]) -> None:
    if corpus.get("schemaVersion") != 1:
        raise ValueError("Unsupported legal corpus schemaVersion")
    documents = corpus.get("documents")
    if not isinstance(documents, list) or len(documents) != 4:
        raise ValueError("The legal corpus must contain exactly four documents")

    kinds = {document.get("kind") for document in documents}
    if kinds != set(DOCUMENT_KINDS):
        raise ValueError(f"Unexpected document kinds: {sorted(str(kind) for kind in kinds)}")

    serialized = json.dumps(corpus, ensure_ascii=False)
    for character, name in DISALLOWED_DASHES.items():
        if character in serialized:
            raise ValueError(f"Corpus contains disallowed {name} U+{ord(character):04X}")

    for document in documents:
        kind = document["kind"]
        version = document.get("version")
        expected_filename = APPROVED_FILENAMES[kind].get(version)
        if not expected_filename or document.get("filename") != expected_filename:
            raise ValueError(f"Incorrect filename for {kind}")
        if document.get("status") != "Effective":
            raise ValueError(f"{kind} is not marked Effective")
        effective_date = document.get("effectiveDate")
        if not isinstance(effective_date, str):
            raise ValueError(f"{kind} has no effectiveDate")
        format_date(effective_date)
        expected_path = f"/documents-rules-ppa/{expected_filename}"
        if document.get("publicPath") != expected_path:
            raise ValueError(f"Incorrect publicPath for {kind}")
        sections = document.get("sections")
        if not isinstance(sections, list) or not sections:
            raise ValueError(f"{kind} has no sections")
        validate_blocks(document.get("introBlocks", []), f"{kind}.introBlocks")
        for section_index, section in enumerate(sections):
            if not all(key in section for key in ("number", "title", "blocks")):
                raise ValueError(f"Malformed section {section_index} in {kind}")
            validate_blocks(section["blocks"], f"{kind}.sections[{section_index}].blocks")


def validate_blocks(blocks: Any, path: str) -> None:
    if not isinstance(blocks, list):
        raise ValueError(f"{path} must be a list")
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            raise ValueError(f"{path}[{index}] must be an object")
        block_type = block.get("type")
        if block_type == "paragraph":
            if not isinstance(block.get("text"), str):
                raise ValueError(f"{path}[{index}] paragraph requires text")
        elif block_type in {"bullets", "numbered"}:
            if not isinstance(block.get("items"), list) or not all(
                isinstance(item, str) for item in block["items"]
            ):
                raise ValueError(f"{path}[{index}] requires string items")
        elif block_type == "table":
            headers = block.get("headers")
            rows = block.get("rows")
            if not isinstance(headers, list) or not isinstance(rows, list):
                raise ValueError(f"{path}[{index}] table requires headers and rows")
            if not headers or any(len(row) != len(headers) for row in rows):
                raise ValueError(f"{path}[{index}] table column mismatch")
        elif block_type == "callout":
            if not isinstance(block.get("title"), str) or not isinstance(
                block.get("text"), str
            ):
                raise ValueError(f"{path}[{index}] callout requires title and text")
        else:
            raise ValueError(f"Unsupported block type {block_type!r} at {path}[{index}]")


def register_fonts() -> dict[str, str]:
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/ariali.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
        ),
    ]
    for regular_path, bold_path, italic_path in candidates:
        if regular_path.exists() and bold_path.exists() and italic_path.exists():
            pdfmetrics.registerFont(TTFont("IronCladSans", str(regular_path)))
            pdfmetrics.registerFont(TTFont("IronCladSans-Bold", str(bold_path)))
            pdfmetrics.registerFont(TTFont("IronCladSans-Italic", str(italic_path)))
            pdfmetrics.registerFontFamily(
                "IronCladSans",
                normal="IronCladSans",
                bold="IronCladSans-Bold",
                italic="IronCladSans-Italic",
                boldItalic="IronCladSans-Bold",
            )
            return {
                "regular": "IronCladSans",
                "bold": "IronCladSans-Bold",
                "italic": "IronCladSans-Italic",
            }
    return {"regular": "Helvetica", "bold": "Helvetica-Bold", "italic": "Helvetica-Oblique"}


def make_styles(fonts: dict[str, str]) -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "coverBrand": ParagraphStyle(
            "CoverBrand",
            parent=sample["Normal"],
            fontName=fonts["bold"],
            fontSize=10,
            leading=13,
            textColor=ORANGE,
            alignment=TA_CENTER,
            spaceAfter=7 * mm,
            tracking=1.5,
        ),
        "coverTitle": ParagraphStyle(
            "CoverTitle",
            parent=sample["Title"],
            fontName=fonts["bold"],
            fontSize=25,
            leading=29,
            textColor=WHITE,
            alignment=TA_CENTER,
            spaceAfter=4 * mm,
        ),
        "coverSubtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=sample["Normal"],
            fontName=fonts["regular"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#D4D4D8"),
            alignment=TA_CENTER,
            spaceAfter=10 * mm,
        ),
        "coverMeta": ParagraphStyle(
            "CoverMeta",
            parent=sample["Normal"],
            fontName=fonts["regular"],
            fontSize=9.5,
            leading=14,
            textColor=WHITE,
            alignment=TA_CENTER,
            spaceAfter=2 * mm,
        ),
        "tocTitle": ParagraphStyle(
            "TocTitle",
            parent=sample["Heading1"],
            fontName=fonts["bold"],
            fontSize=18,
            leading=22,
            textColor=INK,
            spaceAfter=8 * mm,
        ),
        "section": ParagraphStyle(
            "SectionHeading",
            parent=sample["Heading1"],
            fontName=fonts["bold"],
            fontSize=14,
            leading=17,
            textColor=ORANGE_DARK,
            spaceBefore=6 * mm,
            spaceAfter=3 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=sample["BodyText"],
            fontName=fonts["regular"],
            fontSize=9,
            leading=12.6,
            textColor=INK,
            spaceAfter=2.6 * mm,
            allowWidows=0,
            allowOrphans=0,
        ),
        "clause": ParagraphStyle(
            "Clause",
            parent=sample["BodyText"],
            fontName=fonts["regular"],
            fontSize=9,
            leading=12.6,
            textColor=INK,
            leftIndent=9 * mm,
            firstLineIndent=-9 * mm,
            spaceAfter=2.6 * mm,
            allowWidows=0,
            allowOrphans=0,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=sample["BodyText"],
            fontName=fonts["regular"],
            fontSize=8.8,
            leading=12.2,
            textColor=INK,
            leftIndent=7 * mm,
            firstLineIndent=-3.5 * mm,
            bulletIndent=2 * mm,
            spaceAfter=1.2 * mm,
        ),
        "numbered": ParagraphStyle(
            "Numbered",
            parent=sample["BodyText"],
            fontName=fonts["regular"],
            fontSize=8.8,
            leading=12.2,
            textColor=INK,
            leftIndent=8 * mm,
            firstLineIndent=-6 * mm,
            spaceAfter=1.5 * mm,
        ),
        "calloutTitle": ParagraphStyle(
            "CalloutTitle",
            parent=sample["Normal"],
            fontName=fonts["bold"],
            fontSize=9,
            leading=12,
            textColor=ORANGE_DARK,
            spaceAfter=1.5 * mm,
        ),
        "calloutBody": ParagraphStyle(
            "CalloutBody",
            parent=sample["Normal"],
            fontName=fonts["regular"],
            fontSize=8.8,
            leading=12.2,
            textColor=INK,
        ),
        "tableHeader": ParagraphStyle(
            "TableHeader",
            parent=sample["Normal"],
            fontName=fonts["bold"],
            fontSize=7.6,
            leading=9.4,
            textColor=WHITE,
            alignment=TA_LEFT,
        ),
        "tableBody": ParagraphStyle(
            "TableBody",
            parent=sample["Normal"],
            fontName=fonts["regular"],
            fontSize=7.4,
            leading=9.5,
            textColor=INK,
            alignment=TA_LEFT,
        ),
        "end": ParagraphStyle(
            "End",
            parent=sample["Normal"],
            fontName=fonts["bold"],
            fontSize=9,
            leading=12,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceBefore=10 * mm,
        ),
    }


def paragraph_text(value: str) -> str:
    return html.escape(value).replace("\n", "<br/>")


class OrangeRule(Flowable):
    def __init__(self, width: float, thickness: float = 1.2) -> None:
        super().__init__()
        self.width = width
        self.height = thickness + 2
        self.thickness = thickness
        self.keepWithNext = True

    def draw(self) -> None:
        self.canv.setStrokeColor(ORANGE)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.height / 2, self.width, self.height / 2)


class InvariantCanvas(pdfcanvas.Canvas):
    """ReportLab canvas with stable timestamps, trailer IDs and object ordering."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs["invariant"] = 1
        super().__init__(*args, **kwargs)


class LegalDocTemplate(BaseDocTemplate):
    def __init__(
        self,
        filename: str,
        document: dict[str, Any],
        display_date: str,
        fonts: dict[str, str],
    ) -> None:
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=17 * mm,
            title=f"{document['title']} v{document['version']}",
            author="Marco Stucchi and Simone Vitiello",
            subject=f"Effective {display_date}",
            creator="IronClad legal corpus PDF generator",
        )
        self.document_meta = document
        self.display_date = display_date
        self.fonts = fonts
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
        )
        self.addPageTemplates([PageTemplate(id="legal", frames=[frame], onPage=self.draw_page)])

    def draw_page(self, canvas: Any, doc: BaseDocTemplate) -> None:
        canvas.saveState()
        canvas.setTitle(f"{self.document_meta['title']} v{self.document_meta['version']}")
        canvas.setAuthor("Marco Stucchi and Simone Vitiello")
        canvas.setSubject(f"Effective {self.display_date}")
        canvas.setCreator("IronClad legal corpus PDF generator")
        if doc.page == 1:
            canvas.setFillColor(BLACK)
            canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
            canvas.setFillColor(ORANGE)
            canvas.rect(0, 0, PAGE_WIDTH, 8 * mm, stroke=0, fill=1)
            if LOGO_PATH.exists():
                logo_width = 72 * mm
                logo_height = logo_width * 0.514
                canvas.drawImage(
                    str(LOGO_PATH),
                    (PAGE_WIDTH - logo_width) / 2,
                    PAGE_HEIGHT - 66 * mm,
                    width=logo_width,
                    height=logo_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
        else:
            canvas.setFillColor(BLACK)
            canvas.rect(0, PAGE_HEIGHT - 11 * mm, PAGE_WIDTH, 11 * mm, stroke=0, fill=1)
            canvas.setFillColor(ORANGE)
            canvas.rect(0, PAGE_HEIGHT - 11.8 * mm, PAGE_WIDTH, 0.8 * mm, stroke=0, fill=1)
            canvas.setFont(self.fonts["bold"], 7.5)
            canvas.setFillColor(WHITE)
            canvas.drawString(
                18 * mm,
                PAGE_HEIGHT - 7.2 * mm,
                f"IRONCLAD TOURNAMENTS  |  {self.document_meta['shortTitle'].upper()} v{self.document_meta['version']}",
            )
            canvas.setStrokeColor(colors.HexColor("#D4D4D8"))
            canvas.setLineWidth(0.35)
            canvas.line(18 * mm, 13 * mm, PAGE_WIDTH - 18 * mm, 13 * mm)
            canvas.setFillColor(MUTED)
            canvas.setFont(self.fonts["regular"], 7.2)
            canvas.drawString(18 * mm, 9 * mm, f"Effective {self.display_date}")
            canvas.drawRightString(
                PAGE_WIDTH - 18 * mm,
                9 * mm,
                f"Page {doc.page}",
            )
        canvas.restoreState()

    def afterFlowable(self, flowable: Flowable) -> None:
        if isinstance(flowable, Paragraph) and flowable.style.name == "SectionHeading":
            text = flowable.getPlainText()
            key = f"section-{self.page}-{hashlib.sha1(text.encode('utf-8')).hexdigest()[:10]}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0, closed=False)
            self.notify("TOCEntry", (0, text, self.page, key))


def make_cover_story(
    document: dict[str, Any], display_date: str, styles: dict[str, ParagraphStyle]
) -> list[Flowable]:
    return [
        Spacer(1, 62 * mm),
        Paragraph("IRONCLAD TOURNAMENTS", styles["coverBrand"]),
        Paragraph(paragraph_text(document["title"]), styles["coverTitle"]),
        Paragraph(paragraph_text(document.get("subtitle", "")), styles["coverSubtitle"]),
        Paragraph(f"<b>VERSION {html.escape(document['version'])}</b>", styles["coverMeta"]),
        Paragraph("<b>EFFECTIVE</b>", styles["coverMeta"]),
        Paragraph(f"Effective date: {html.escape(display_date)}", styles["coverMeta"]),
        Spacer(1, 5 * mm),
        Paragraph(paragraph_text(document["operatorStatement"]), styles["coverMeta"]),
        Spacer(1, 4 * mm),
        Paragraph("ironclad.tournaments@gmail.com", styles["coverMeta"]),
        PageBreak(),
    ]


def make_toc(styles: dict[str, ParagraphStyle], fonts: dict[str, str]) -> list[Flowable]:
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOCLevel0",
            fontName=fonts["regular"],
            fontSize=9,
            leading=13,
            leftIndent=0,
            firstLineIndent=0,
            textColor=INK,
            spaceBefore=1.5 * mm,
        )
    ]
    return [Paragraph("Contents", styles["tocTitle"]), toc, PageBreak()]


def make_table(
    block: dict[str, Any], styles: dict[str, ParagraphStyle], available_width: float
) -> Table:
    headers = [Paragraph(paragraph_text(str(value)), styles["tableHeader"]) for value in block["headers"]]
    rows = [
        [Paragraph(paragraph_text(str(value)), styles["tableBody"]) for value in row]
        for row in block["rows"]
    ]
    column_count = len(headers)
    widths = block.get("columnWidths")
    if widths:
        total = sum(float(value) for value in widths)
        col_widths = [available_width * float(value) / total for value in widths]
    else:
        col_widths = [available_width / column_count] * column_count
    table = Table([headers, *rows], colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    commands: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), ORANGE_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D4D4D8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_index in range(1, len(rows) + 1):
        background = WHITE if row_index % 2 else LIGHT
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), background))
    table.setStyle(TableStyle(commands))
    return table


def render_blocks(
    blocks: list[dict[str, Any]],
    styles: dict[str, ParagraphStyle],
    available_width: float,
) -> list[Flowable]:
    story: list[Flowable] = []
    for block in blocks:
        block_type = block["type"]
        if block_type == "paragraph":
            number = block.get("number")
            if number:
                text = f"<b>{html.escape(number)}</b> {paragraph_text(block['text'])}"
                story.append(Paragraph(text, styles["clause"]))
            else:
                story.append(Paragraph(paragraph_text(block["text"]), styles["body"]))
        elif block_type == "bullets":
            for item in block["items"]:
                story.append(
                    Paragraph(paragraph_text(item), styles["bullet"], bulletText="•")
                )
            story.append(Spacer(1, 1.5 * mm))
        elif block_type == "numbered":
            for index, item in enumerate(block["items"], start=1):
                story.append(
                    Paragraph(
                        f"<b>{index}.</b> {paragraph_text(item)}",
                        styles["numbered"],
                    )
                )
            story.append(Spacer(1, 1.5 * mm))
        elif block_type == "table":
            story.extend(
                [make_table(block, styles, available_width), Spacer(1, 3 * mm)]
            )
        elif block_type == "callout":
            contents = [
                Paragraph(paragraph_text(block["title"]), styles["calloutTitle"]),
                Paragraph(paragraph_text(block["text"]), styles["calloutBody"]),
            ]
            callout = Table([[contents]], colWidths=[available_width])
            callout.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), PALE_ORANGE),
                        ("BOX", (0, 0), (-1, -1), 0.7, ORANGE),
                        ("LINEBEFORE", (0, 0), (0, -1), 3, ORANGE),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]
                )
            )
            story.extend([KeepTogether([callout]), Spacer(1, 3 * mm)])
    return story


def build_pdf(
    output_path: Path,
    document: dict[str, Any],
    display_date: str,
    fonts: dict[str, str],
    styles: dict[str, ParagraphStyle],
) -> None:
    template = LegalDocTemplate(str(output_path), document, display_date, fonts)
    story: list[Flowable] = []
    story.extend(make_cover_story(document, display_date, styles))
    story.extend(make_toc(styles, fonts))
    story.extend(render_blocks(document.get("introBlocks", []), styles, template.width))
    if document.get("introBlocks"):
        story.append(Spacer(1, 2 * mm))
    for section in document["sections"]:
        heading = f"{section['number']}. {section['title']}" if section["number"] else section["title"]
        story.append(OrangeRule(template.width))
        story.append(Paragraph(paragraph_text(heading), styles["section"]))
        story.extend(render_blocks(section["blocks"], styles, template.width))
    story.append(
        Paragraph(
            f"END OF {html.escape(document['shortTitle'].upper())} v{html.escape(document['version'])}",
            styles["end"],
        )
    )
    template.multiBuild(story, canvasmaker=InvariantCanvas)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    selected_kinds = parse_selected_kinds(args.kinds)
    corpus_path = args.corpus.resolve()
    output_dir = args.output_dir.resolve()
    corpus = load_corpus(corpus_path, args.effective_date, selected_kinds)
    validate_corpus(corpus)

    print("=" * 78)
    print("IRONCLAD LEGAL DOCUMENT GENERATION")
    print(f"Selected kinds: {', '.join(selected_kinds)}")
    if args.effective_date:
        print(f"Asserted Effective date: {format_date(args.effective_date)} ({args.effective_date})")
    print("=" * 78)

    output_dir.mkdir(parents=True, exist_ok=True)
    existing_pdfs = {path.name for path in output_dir.glob("*.pdf")}
    approved_names = {
        filename
        for versions in APPROVED_FILENAMES.values()
        for filename in versions.values()
    }
    unexpected = existing_pdfs - approved_names
    if unexpected:
        raise RuntimeError(
            "Unexpected PDFs in final output directory; remove or relocate them first: "
            + ", ".join(sorted(unexpected))
        )

    fonts = register_fonts()
    styles = make_styles(fonts)
    documents = {document["kind"]: document for document in corpus["documents"]}

    # Stage directly in the destination directory. This keeps each replacement
    # atomic on Windows and makes files inherit the public directory's ACL.
    staged: list[tuple[Path, Path]] = []
    try:
        for kind in selected_kinds:
            document = documents[kind]
            staged_path = output_dir / f".{document['filename']}.staging"
            if staged_path.exists():
                raise RuntimeError(f"Stale PDF staging file exists: {staged_path.name}")
            build_pdf(
                staged_path,
                document,
                format_date(document["effectiveDate"]),
                fonts,
                styles,
            )
            staged.append((staged_path, output_dir / document["filename"]))

        for staged_path, final_path in staged:
            os.replace(staged_path, final_path)
    finally:
        for staged_path, _ in staged:
            staged_path.unlink(missing_ok=True)

    selected_names = {documents[kind]["filename"] for kind in selected_kinds}
    final_files = sorted(
        path for path in output_dir.glob("*.pdf") if path.name in selected_names
    )
    if {path.name for path in final_files} != selected_names:
        raise RuntimeError("Final directory does not contain every selected PDF")

    for path in final_files:
        print(f"{path.name}\t{path.stat().st_size} bytes\tSHA-256 {sha256(path)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise
