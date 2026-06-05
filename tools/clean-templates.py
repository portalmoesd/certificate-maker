#!/usr/bin/env python3
"""
Remove the baked-in SAMPLE values from each split template PDF, keeping the
watermark and everything else, then save.

Two kinds of redaction (top-left origin, points):
  "text"  – remove text only, keep all vector art (the faint watermark shows
            through). Used for every English value and for the labels we drop.
  "value" – remove text AND the vector strokes touching the band. On the Georgian
            template the sample course/period values are live text with a 0.5pt
            stroke (faux-bold), i.e. a text layer + a stroke layer, so both must
            go. Bands sit just below their labels; the watermark (a separate
            object) survives.

Run after splitting the source PDF into app/templates/template{1..4}.pdf:

    pdfseparate "certificate templates(3).pdf" app/templates/template-%d.pdf
    (rename to template1/2/3/4.pdf)
    python3 tools/clean-templates.py
"""
import os
import sys
import fitz  # PyMuPDF

fitz.TOOLS.mupdf_display_errors(False)  # silence harmless source xref warnings

# --- rectangles (x0, y0, x1, y1), top-left origin ---------------------------
NAME = (188, 140, 660, 240)             # name (two lines)
CERTNO = (574, 542, 648, 553)           # certificate number (clear of its label)
PERIOD = (192, 396.5, 578, 412)         # English period value
COURSE_FULL = (192, 335, 415, 350)      # English course column (full layout)
LEVEL = (415, 335, 640, 350)            # English level column
HOURS = (640, 335, 778, 350)            # English hours column
COURSE_WIDE = (192, 335, 778, 350)      # English course (course-only layout)
# Georgian (template 4). Value bands start just below their labels
# (კურსი ends y=334.1, value starts 336.1; პერიოდი ends 395.7, value starts 397.7).
KA_STATEMENT = (190, 261, 778, 281)     # subtitle under the name -> now editable
KA_COURSE_VAL = (195, 335, 410, 350)    # course value (text + 0.5pt stroke)
KA_PERIOD_VAL = (195, 396.5, 435, 412)  # period value (text + 0.5pt stroke)

PLAN = {
    "app/templates/template1.pdf": [(NAME, "text"), (COURSE_FULL, "text"), (LEVEL, "text"), (HOURS, "text"), (PERIOD, "text"), (CERTNO, "text")],
    "app/templates/template2.pdf": [(NAME, "text"), (COURSE_FULL, "text"), (LEVEL, "text"), (HOURS, "text"), (PERIOD, "text"), (CERTNO, "text")],
    "app/templates/template3.pdf": [(NAME, "text"), (COURSE_WIDE, "text"), (PERIOD, "text"), (CERTNO, "text")],
    "app/templates/template4.pdf": [(NAME, "text"), (KA_STATEMENT, "text"), (CERTNO, "text"),
                                    (KA_COURSE_VAL, "value"), (KA_PERIOD_VAL, "value")],
}


def _apply(page, rects, text, graphics):
    if not rects:
        return
    for r in rects:
        page.add_redact_annot(fitz.Rect(*r))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, text=text, graphics=graphics)


def clean(path, plan):
    doc = fitz.open(path)
    page = doc[0]
    # Pass 1: text-only redactions (keep all vector art / the watermark).
    _apply(page, [r for r, kind in plan if kind == "text"],
           fitz.PDF_REDACT_TEXT_REMOVE, fitz.PDF_REDACT_LINE_ART_NONE)
    # Pass 2: value bands — remove both the text and the stroke layer. The bands
    # are clear of the labels above; the watermark is a separate object that
    # survives the line-art removal.
    _apply(page, [r for r, kind in plan if kind == "value"],
           fitz.PDF_REDACT_TEXT_REMOVE, fitz.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED)
    tmp = path + ".tmp"
    doc.save(tmp, deflate=True, garbage=3)
    doc.close()
    os.replace(tmp, path)
    print("cleaned", path)


if __name__ == "__main__":
    paths = sys.argv[1:] or list(PLAN.keys())
    for p in paths:
        clean(p, PLAN.get(p, [(NAME, "text"), (COURSE_WIDE, "text"), (PERIOD, "text"), (CERTNO, "text")]))
