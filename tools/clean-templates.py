#!/usr/bin/env python3
"""
Remove the baked-in SAMPLE values from each split template PDF, keeping the
watermark and everything else. Text-only redaction (graphics + images are
preserved) so the faint watermark shows through where values used to be.

Run after splitting the source PDF into app/templates/template{1..4}.pdf:

    pdfseparate "certificate templates(3).pdf" app/templates/template-%d.pdf
    (rename to template1/2/3/4.pdf)
    python3 tools/clean-templates.py

The rectangles below are top-left origin (points) and sit just *below* each
label so the labels (COURSE/LEVEL/HOURS/PERIOD/CERTIFICATE NO. / their Georgian
equivalents) are kept.

Templates 1 & 2 (English, full) carry COURSE | LEVEL | HOURS, so each column is
redacted separately. Templates 3 (English Art) and 4 (Georgian Art) carry the
COURSE only, so the whole value row is redacted with one wide band (room for
long Georgian course names).
"""
import os
import sys
import fitz  # PyMuPDF

fitz.TOOLS.mupdf_display_errors(False)  # silence harmless source xref warnings

# Rects shared by every template (top-left origin, points).
COMMON = [
    (188, 140, 660, 240),    # name (two lines)
    (192, 396.5, 578, 412),  # period (one line)
    (574, 542, 648, 553),    # certificate number (kept clear of the label above)
]
# Full English templates: three separate value columns.
FULL_EXTRA = [
    (192, 335, 415, 350),    # course value
    (415, 335, 640, 350),    # level value
    (640, 335, 778, 350),    # hours value
]
# Course-only templates (English & Georgian Art): one wide course band.
COURSEONLY_EXTRA = [
    (192, 335, 778, 350),    # course value (full width — long Georgian names)
]

RECTS_BY_TEMPLATE = {
    "app/templates/template1.pdf": COMMON + FULL_EXTRA,
    "app/templates/template2.pdf": COMMON + FULL_EXTRA,
    "app/templates/template3.pdf": COMMON + COURSEONLY_EXTRA,
    "app/templates/template4.pdf": COMMON + COURSEONLY_EXTRA,
}


def clean(path, rects):
    doc = fitz.open(path)
    page = doc[0]
    for r in rects:
        page.add_redact_annot(fitz.Rect(*r))
    # keep vector graphics (watermark) and images; remove only the text
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                          graphics=fitz.PDF_REDACT_LINE_ART_NONE)
    tmp = path + ".tmp"
    doc.save(tmp, deflate=True, garbage=3)
    doc.close()
    os.replace(tmp, path)
    print("cleaned", path)


if __name__ == "__main__":
    paths = sys.argv[1:] or list(RECTS_BY_TEMPLATE.keys())
    for p in paths:
        clean(p, RECTS_BY_TEMPLATE.get(p, COMMON + COURSEONLY_EXTRA))
