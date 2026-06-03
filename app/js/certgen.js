/*
 * certgen.js — Core certificate generator for the Levels Academy
 * "Certificate of Completion" templates (yellow, blue, red — all English).
 *
 * Pure logic, no DOM. Works both in the browser (attaches window.CertGen)
 * and in Node (module.exports) so the same code is used by the web app and
 * the headless test/calibration harness.
 *
 * For each spreadsheet row it:
 *  - draws the original template once (embedded + re-drawn per row -> small file),
 *  - covers the sample text baked into the template with white rectangles,
 *  - writes the new values with embedded fonts at calibrated positions,
 *  - stamps the principal's signature image above the "PRINCIPAL" label.
 *
 * Two layout variants:
 *  - 'full'    (yellow, blue): COURSE | LEVEL | PERIOD
 *  - 'nolevel' (red)         : COURSE | PERIOD   (PERIOD in the middle column)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CertGen = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAGE = { W: 841.89, H: 595.276 };

  // Dark grey used for all the variable text (sampled from the artwork).
  var INK = [0x39, 0x35, 0x36];

  // Template catalogue. `variant` selects the field layout.
  var TEMPLATES = {
    '1': { id: '1', variant: 'full', label: 'Template 1 — Yellow', accent: '#fbc037', accentName: 'Yellow', file: 'template1.pdf' },
    '2': { id: '2', variant: 'full', label: 'Template 2 — Blue', accent: '#365ab1', accentName: 'Blue', file: 'template2.pdf' },
    '3': { id: '3', variant: 'nolevel', label: 'Template 3 — Red', accent: '#f25468', accentName: 'Red', file: 'template3.pdf' }
  };

  // Fonts (key -> filename under app/fonts/): name in Medium, values in Bold.
  var FONT_FILES = {
    rhmed: 'RedHatDisplay-Medium.ttf',
    rhbold: 'RedHatDisplay-Bold.ttf'
  };
  var FONT_KEYS = ['rhmed', 'rhbold'];

  // Expected spreadsheet columns per variant (case/spacing-insensitive headers).
  var BASE_COLS = {
    firstName: { key: 'firstName', headers: ['first name', 'firstname', 'name'], label: 'First Name', sample: 'Elizaveta' },
    lastName: { key: 'lastName', headers: ['last name', 'lastname', 'surname'], label: 'Last Name', sample: 'Datukishvili' },
    course: { key: 'course', headers: ['course'], label: 'Course', sample: 'General English' },
    level: { key: 'level', headers: ['level'], label: 'Level', sample: 'Intermediate' },
    startDate: { key: 'startDate', headers: ['start date', 'start', 'from', 'period start'], label: 'Start Date', sample: '2026-01-16' },
    endDate: { key: 'endDate', headers: ['end date', 'end', 'to', 'period end'], label: 'End Date', sample: '2026-06-16' }
  };
  var COLUMNS = {
    full: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.level, BASE_COLS.startDate, BASE_COLS.endDate],
    nolevel: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.startDate, BASE_COLS.endDate]
  };

  // Shared name placement (identical on all three pages).
  var NAME = {
    x: 197.34, line1: 405.5, lineGap: 38.7, size: 46, font: 'rhmed', color: INK,
    maxWidth: 600, whiteout: { x0: 194, y0: 142, x1: 650, y1: 241 }
  };
  // Principal signature image: sits just above the "PRINCIPAL" label.
  var SIGNATURE = { x: 197.34, bottomY: 62, width: 185 };

  // Field placement per variant. Bottom-left origin; whiteouts are top-origin.
  var LAYOUT = {
    full: {
      name: NAME,
      course: { x: 197.34, baseline: 239.5, size: 14.8, font: 'rhbold', color: INK, maxWidth: 214, whiteout: { x0: 195, y0: 339, x1: 417, y1: 360 } },
      level: { x: 420.94, baseline: 239.5, size: 14.8, font: 'rhbold', color: INK, maxWidth: 218, whiteout: { x0: 419, y0: 339, x1: 642, y1: 360 } },
      period: { x: 644.55, line1: 240, line2: 224, size: 14.8, font: 'rhbold', color: INK, maxWidth: 190, whiteout: { x0: 642, y0: 339, x1: 825, y1: 377 } }
    },
    nolevel: {
      name: NAME,
      course: { x: 197.34, baseline: 239.5, size: 14.8, font: 'rhbold', color: INK, maxWidth: 214, whiteout: { x0: 195, y0: 339, x1: 417, y1: 360 } },
      period: { x: 420.94, line1: 240, line2: 224, size: 14.8, font: 'rhbold', color: INK, maxWidth: 210, whiteout: { x0: 419, y0: 339, x1: 610, y1: 377 } }
    }
  };

  var MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  // --- helpers ---------------------------------------------------------------

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function excelSerialToDate(n) {
    return new Date(Math.round((n - 25569) * 86400 * 1000));
  }

  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && isFinite(v)) {
      return (v > 59 && v < 80000) ? excelSerialToDate(v) : null;
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  // Format a date for display ("16 JANUARY 2026"); raw text passes through.
  function formatDate(v) {
    var d = toDate(v);
    if (!d) return String(v == null ? '' : v).trim();
    return d.getDate() + ' ' + MONTHS_EN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function rgb01(c, rgb) { return rgb(c[0] / 255, c[1] / 255, c[2] / 255); }

  // Map a sheet row (header->value object) to canonical field keys.
  function mapRow(rawRow, variant) {
    var cols = COLUMNS[variant];
    var lookup = {};
    Object.keys(rawRow).forEach(function (h) { lookup[norm(h)] = rawRow[h]; });
    var out = {};
    cols.forEach(function (col) {
      var val;
      for (var i = 0; i < col.headers.length; i++) {
        if (lookup[col.headers[i]] != null && lookup[col.headers[i]] !== '') { val = lookup[col.headers[i]]; break; }
      }
      out[col.key] = val == null ? '' : val;
    });
    if ((out.firstName === '' || out.firstName == null) && lookup['name']) out.firstName = lookup['name'];
    if ((out.lastName === '' || out.lastName == null) && out.firstName) {
      var p = String(out.firstName).trim().split(/\s+/);
      if (p.length > 1) { out.firstName = p.shift(); out.lastName = p.join(' '); }
    }
    return out;
  }

  // --- drawing ---------------------------------------------------------------

  function whiteout(page, w, rgb) {
    page.drawRectangle({ x: w.x0, y: PAGE.H - w.y1, width: w.x1 - w.x0, height: w.y1 - w.y0, color: rgb(1, 1, 1) });
  }

  function drawLine(page, text, font, x, baseline, size, maxWidth, color, rgb) {
    if (text == null || text === '') return;
    var s = size;
    var w = font.widthOfTextAtSize(text, size);
    if (maxWidth && w > maxWidth) s = size * maxWidth / w;
    page.drawText(text, { x: x, y: baseline, size: s, font: font, color: rgb01(color, rgb) });
  }

  function draw(page, row, variant, fonts, sig, rgb) {
    var L = LAYOUT[variant];
    // cover the baked sample text
    whiteout(page, L.name.whiteout, rgb);
    whiteout(page, L.course.whiteout, rgb);
    if (L.level) whiteout(page, L.level.whiteout, rgb);
    whiteout(page, L.period.whiteout, rgb);

    var med = fonts.rhmed, bold = fonts.rhbold;

    // name (two lines, uppercase)
    var first = String(row.firstName || '').trim();
    var last = String(row.lastName || '').trim();
    drawLine(page, first.toUpperCase(), med, L.name.x, L.name.line1, L.name.size, L.name.maxWidth, L.name.color, rgb);
    drawLine(page, last.toUpperCase(), med, L.name.x, L.name.line1 - L.name.lineGap, L.name.size, L.name.maxWidth, L.name.color, rgb);

    // course / level
    drawLine(page, String(row.course || '').toUpperCase(), bold, L.course.x, L.course.baseline, L.course.size, L.course.maxWidth, L.course.color, rgb);
    if (L.level) drawLine(page, String(row.level || '').toUpperCase(), bold, L.level.x, L.level.baseline, L.level.size, L.level.maxWidth, L.level.color, rgb);

    // period (two lines)
    var start = formatDate(row.startDate), end = formatDate(row.endDate);
    drawLine(page, end ? start + ' –' : start, bold, L.period.x, L.period.line1, L.period.size, L.period.maxWidth, L.period.color, rgb);
    drawLine(page, end, bold, L.period.x, L.period.line2, L.period.size, L.period.maxWidth, L.period.color, rgb);

    // principal signature
    if (sig) {
      var h = SIGNATURE.width * sig.height / sig.width;
      page.drawImage(sig, { x: SIGNATURE.x, y: SIGNATURE.bottomY, width: SIGNATURE.width, height: h });
    }
  }

  // --- public API ------------------------------------------------------------

  /** Build a single merged PDF with one page per row. @returns {Promise<Uint8Array>} */
  async function generate(opts) {
    var PDFLib = opts.PDFLib, fontkit = opts.fontkit, rgb = PDFLib.rgb;
    var tpl = TEMPLATES[opts.templateId];
    if (!tpl) throw new Error('Unknown template: ' + opts.templateId);

    var rows = opts.rows || [];
    if (opts.rawRows) rows = rows.map(function (r) { return mapRow(r, tpl.variant); });
    if (!rows.length) throw new Error('No rows to render.');

    var out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);

    var fonts = {};
    for (var i = 0; i < FONT_KEYS.length; i++) {
      fonts[FONT_KEYS[i]] = await out.embedFont(opts.fontBytes[FONT_KEYS[i]], { subset: true });
    }

    var tplPage = (await out.embedPdf(opts.templateBytes, [0]))[0];
    var sig = opts.signatureBytes ? await out.embedPng(opts.signatureBytes) : null;

    for (var r = 0; r < rows.length; r++) {
      var page = out.addPage([PAGE.W, PAGE.H]);
      page.drawPage(tplPage);
      draw(page, rows[r], tpl.variant, fonts, sig, rgb);
    }
    return out.save();
  }

  function mapRows(rawRows, variant) {
    return rawRows.map(function (r) { return mapRow(r, variant); });
  }

  return {
    PAGE: PAGE,
    TEMPLATES: TEMPLATES,
    FONT_FILES: FONT_FILES,
    FONT_KEYS: FONT_KEYS,
    COLUMNS: COLUMNS,
    LAYOUT: LAYOUT,
    formatDate: formatDate,
    mapRow: mapRow,
    mapRows: mapRows,
    generate: generate
  };
}));
