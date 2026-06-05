#!/usr/bin/env python3
"""
Remove the baked-in SAMPLE values from each split template PDF, keeping the
watermark and everything else. Text-only redaction (graphics + images are
preserved) so the faint watermark shows through where values used to be.

Run after splitting the source PDF into app/templates/template{1,2,3}.pdf:

    pdfseparate "certificate templates(3).pdf" app/templates/template-%d.pdf
    (rename to template1/2/3.pdf)
    python3 tools/clean-templates.py

The rectangles below are top-left origin (points) and sit just *below* each
label so the labels (COURSE/LEVEL/HOURS/PERIOD/CERTIFICATE NO.) are kept.
Rects cover all variants; on the red (Art) template the LEVEL/HOURS positions
are empty and simply match nothing — that template carries COURSE only.
"""
import os
import sys
import fitz  # PyMuPDF

fitz.TOOLS.mupdf_display_errors(False)  # silence harmless source xref warnings

TEMPLATES = ["app/templates/template1.pdf", "app/templates/template2.pdf", "app/templates/template3.pdf"]

# (x0, y0, x1, y1) top-left origin. Values only — kept clear of the labels above.
RECTS = [
    (188, 140, 660, 240),   # name (two lines)
    (192, 335, 415, 350),   # course value  (also red: course)
    (415, 335, 640, 350),   # level value   (yellow/blue only)
    (640, 335, 778, 350),   # hours value   (yellow/blue only)
    (192, 396.5, 578, 412),  # period (one line)
    (574, 542, 648, 553),   # certificate number (kept clear of the label above)
]


def clean(path):
    doc = fitz.open(path)
    page = doc[0]
    for r in RECTS:
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
    for p in (sys.argv[1:] or TEMPLATES):
        clean(p)
