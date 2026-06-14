/*
 * badgegen.js — Name-badge generator for Levels Academy.
 *
 * Produces a print-ready PDF of name badges (8 per A4 sheet, 2 x 4 grid) from a
 * list of {firstName, lastName, age} rows. Like certgen.js it is pure logic
 * (no DOM) and runs both in the browser (window.BadgeGen) and in Node.
 *
 * Each badge keeps the baked artwork (the "levels academy" / "levels art
 * academy" logo) and stamps:
 *   - the name on two centred lines  — Archy EDT Bold, +50 tracking, dark grey,
 *   - the age centred underneath      — BPG LE Studio 02 Caps with a 0.25pt
 *     stroke (fill + outline), in the academy's accent colour.
 *
 * Two academies map to the two template sheets (matching the certificate
 * subject codes): 'E' -> levels academy (yellow), 'A' -> levels art academy
 * (red). Colours are CMYK to match the source artwork exactly.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BadgeGen = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHEET = { W: 595.28, H: 841.89 };

  // Fonts (shared with the certificates).
  var FONT_FILES = {
    archy: 'archyedt-bold-60540591796.otf',       // name
    bpg: 'bpg_le_studio_02_caps-7834001055.ttf'   // age
  };
  var FONT_KEYS = ['archy', 'bpg'];

  // Grid geometry, measured from the source artwork (academy badges.pdf).
  // Everything in a badge is centred on its column; the name's first line sits
  // on ROWS_Y[r], the second line a lineGap below, the age a little lower still.
  var COLS_X = [148.82, 446.46];                  // column centres
  var ROWS_Y = [736.1, 527.0, 318.0, 109.3];      // first-name baselines, top -> bottom

  var NAME = { font: 'archy', size: 28, tracking: 50, lineGap: 23, color: [0, 0, 0, 0.8], maxWidth: 270 };
  var AGE = { font: 'bpg', size: 12, stroke: 0.25, dy: -41.8, maxWidth: 220, suffix: ' წლის' };

  // White-out box covering the baked sample name + age in a cell (relative to the
  // row baseline), used to build the clean templates. Stays clear of the logo.
  var CELL_CLEAR = { halfW: 95, top: 24, bottom: -48 };

  // Per-academy template, accent (hex for the UI / CMYK for the age).
  var ACADEMIES = {
    E: { id: 'E', file: 'badge-academy.pdf', label: 'Levels Academy', accent: '#fbc037', accentName: 'Yellow', age: [0, 0.239, 0.788, 0] },
    A: { id: 'A', file: 'badge-art.pdf', label: 'Levels Art Academy', accent: '#f25468', accentName: 'Red', age: [0, 0.69, 0.462, 0] }
  };

  // Spreadsheet columns (case/space-insensitive headers), mirroring certgen.
  var COLUMNS = [
    { key: 'firstName', headers: ['first name', 'firstname', 'name'], label: 'First Name', sample: 'ელიზავეტა' },
    { key: 'lastName', headers: ['last name', 'lastname', 'surname'], label: 'Last Name', sample: 'დათუკიშვილი' },
    { key: 'age', headers: ['age', 'years', 'ასაკი', 'წლები'], label: 'Age', sample: '9' }
  ];

  var SAMPLES = [
    { firstName: 'ელიზავეტა', lastName: 'დათუკიშვილი', age: '9' },
    { firstName: 'გიორგი', lastName: 'ბერიძე', age: '7' }
  ];

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  function mapRow(rawRow) {
    var lookup = {};
    Object.keys(rawRow).forEach(function (h) { lookup[norm(h)] = rawRow[h]; });
    var out = {};
    COLUMNS.forEach(function (col) {
      var val;
      for (var i = 0; i < col.headers.length; i++) {
        if (lookup[col.headers[i]] != null && lookup[col.headers[i]] !== '') { val = lookup[col.headers[i]]; break; }
      }
      out[col.key] = val == null ? '' : val;
    });
    // A single full-name cell falls back to firstName, then splits.
    if (!String(out.firstName).trim() && lookup['name']) out.firstName = lookup['name'];
    if (!String(out.lastName).trim() && String(out.firstName).trim()) {
      var p = String(out.firstName).trim().split(/\s+/);
      if (p.length > 1) { out.firstName = p.shift(); out.lastName = p.join(' '); }
    }
    return out;
  }

  function mapRows(rawRows) { return rawRows.map(mapRow); }

  function sampleRows() {
    return {
      headers: COLUMNS.map(function (c) { return c.label; }),
      rows: SAMPLES.map(function (d) { return COLUMNS.map(function (c) { return d[c.key] == null ? '' : String(d[c.key]); }); })
    };
  }

  // The 8 white-out rectangles for one sheet (used by the template builder).
  function cellClearBoxes() {
    var boxes = [];
    for (var r = 0; r < ROWS_Y.length; r++) {
      for (var c = 0; c < COLS_X.length; c++) {
        boxes.push({
          x: COLS_X[c] - CELL_CLEAR.halfW,
          y: ROWS_Y[r] + CELL_CLEAR.bottom,
          width: CELL_CLEAR.halfW * 2,
          height: CELL_CLEAR.top - CELL_CLEAR.bottom
        });
      }
    }
    return boxes;
  }

  // The age string for a row: a bare number gets the " წლის" suffix; anything
  // else (already a phrase, or blank) is used verbatim.
  function ageText(age) {
    var s = String(age == null ? '' : age).trim();
    if (s === '') return '';
    return /^\d+$/.test(s) ? s + AGE.suffix : s;
  }

  // --- drawing ---------------------------------------------------------------

  // Centred line with Illustrator-style letter spacing (tracking in 1/1000 em),
  // shrunk to fit maxWidth. Fill only (Archy ships a real bold cut).
  function drawCentredTracked(page, text, font, centerX, baseline, size, tracking, maxWidth, color, PDFLib) {
    if (text == null || text === '') return;
    var chars = Array.from(String(text)), trackEm = tracking / 1000;
    function total(sz) {
      var t = 0;
      for (var i = 0; i < chars.length; i++) t += font.widthOfTextAtSize(chars[i], sz);
      return t + trackEm * sz * Math.max(0, chars.length - 1);
    }
    var s = size;
    if (maxWidth && total(size) > maxWidth) s = size * maxWidth / total(size);
    var gap = trackEm * s, col = PDFLib.cmyk(color[0], color[1], color[2], color[3]);
    var cx = centerX - total(s) / 2;
    for (var i = 0; i < chars.length; i++) {
      page.drawText(chars[i], { x: cx, y: baseline, size: s, font: font, color: col });
      cx += font.widthOfTextAtSize(chars[i], s) + gap;
    }
  }

  // Centred text drawn with a real fill + stroke (text render mode 2), shrunk to
  // fit maxWidth. The stroke and fill share the colour, giving a crisp faux-bold.
  function drawCentredStroked(page, text, font, centerX, baseline, size, maxWidth, color, strokeW, PDFLib) {
    if (text == null || text === '') return;
    var s = size, w = font.widthOfTextAtSize(text, size);
    if (maxWidth && w > maxWidth) { s = size * maxWidth / w; w = font.widthOfTextAtSize(text, s); }
    var x = centerX - w / 2;
    var key = page.node.newFontDictionary(font.name, font.ref);
    page.pushOperators(
      PDFLib.pushGraphicsState(),
      PDFLib.beginText(),
      PDFLib.setFillingCmykColor(color[0], color[1], color[2], color[3]),
      PDFLib.setStrokingCmykColor(color[0], color[1], color[2], color[3]),
      PDFLib.setLineWidth(strokeW),
      PDFLib.setTextRenderingMode(PDFLib.TextRenderingMode.FillAndOutline),
      PDFLib.setFontAndSize(key, s),
      PDFLib.setTextMatrix(1, 0, 0, 1, x, baseline),
      PDFLib.showText(font.encodeText(text)),
      PDFLib.endText(),
      PDFLib.popGraphicsState()
    );
  }

  function drawBadge(page, row, cell, ageColor, fonts, PDFLib) {
    var first = String(row.firstName == null ? '' : row.firstName).trim();
    var last = String(row.lastName == null ? '' : row.lastName).trim();
    drawCentredTracked(page, first, fonts.archy, cell.x, cell.y, NAME.size, NAME.tracking, NAME.maxWidth, NAME.color, PDFLib);
    drawCentredTracked(page, last, fonts.archy, cell.x, cell.y - NAME.lineGap, NAME.size, NAME.tracking, NAME.maxWidth, NAME.color, PDFLib);
    var age = ageText(row.age);
    if (age) drawCentredStroked(page, age, fonts.bpg, cell.x, cell.y + AGE.dy, AGE.size, AGE.maxWidth, ageColor, AGE.stroke, PDFLib);
  }

  // The cell anchors (column centre + first-name baseline), row-major.
  function cells() {
    var out = [];
    for (var r = 0; r < ROWS_Y.length; r++) {
      for (var c = 0; c < COLS_X.length; c++) out.push({ x: COLS_X[c], y: ROWS_Y[r] });
    }
    return out;
  }
  var PER_SHEET = ROWS_Y.length * COLS_X.length;

  // --- public API ------------------------------------------------------------

  /** Build a badge sheet PDF (8 per page). @returns {Promise<Uint8Array>} */
  async function generate(opts) {
    var PDFLib = opts.PDFLib, fontkit = opts.fontkit;
    var academy = ACADEMIES[opts.academy] || ACADEMIES.E;
    var rows = opts.rows || [];
    if (opts.rawRows) rows = mapRows(rows);
    if (!rows.length) throw new Error('No rows to render.');

    var out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);
    var fonts = {};
    for (var k = 0; k < FONT_KEYS.length; k++) {
      var key = FONT_KEYS[k];
      // Archy (OTF/CFF) is embedded whole — subsetting trips some PDF engines.
      fonts[key] = await out.embedFont(opts.fontBytes[key], { subset: key !== 'archy' });
    }
    var tplPage = (await out.embedPdf(opts.templateBytes, [0]))[0];
    var anchors = cells();

    for (var i = 0; i < rows.length; i += PER_SHEET) {
      var page = out.addPage([SHEET.W, SHEET.H]);
      page.drawPage(tplPage);
      for (var j = 0; j < PER_SHEET && i + j < rows.length; j++) {
        drawBadge(page, rows[i + j], anchors[j], academy.age, fonts, PDFLib);
      }
    }
    return out.save();
  }

  return {
    SHEET: SHEET, FONT_FILES: FONT_FILES, FONT_KEYS: FONT_KEYS, ACADEMIES: ACADEMIES,
    COLUMNS: COLUMNS, PER_SHEET: PER_SHEET,
    mapRow: mapRow, mapRows: mapRows, sampleRows: sampleRows,
    cellClearBoxes: cellClearBoxes, ageText: ageText, generate: generate
  };
}));
