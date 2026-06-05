/*
 * certgen.js — Core certificate generator for the Levels Academy
 * "Certificate of Completion" templates (yellow, blue, red).
 *
 * Pure logic, no DOM. Works both in the browser (attaches window.CertGen)
 * and in Node (module.exports) so the same code powers the web app and the
 * headless test/calibration harness.
 *
 * For each spreadsheet row it:
 *  - draws the original template once (embedded + re-drawn per row -> small file),
 *  - covers the sample text/QR baked into the template with white rectangles,
 *  - writes the new values with embedded fonts at calibrated positions,
 *  - builds the certificate number and stamps a matching QR verification code.
 *
 * Fonts: the name is Red Hat Display Medium; all other values are Calibri
 * (Bold for course/level/hours/period, Light for the certificate number).
 *
 * Certificate number:  L<branch><subject>-<year>-<seq>
 *   branch  : V (Vake) or K (Krtsanisi)        — chosen per batch
 *   subject : E (English) or A (Art)           — fixed by template
 *   year    : completion year (from the dates)
 *   seq     : 4-digit running number from a start value
 *
 * Two layout variants:
 *   'full'    (yellow, blue): COURSE | LEVEL | HOURS , PERIOD
 *   'nolevel' (red)         : COURSE | HOURS , PERIOD
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
  var INK = [0x39, 0x35, 0x36]; // dark grey for all variable text
  var VERIFY_BASE = 'https://levels.ge/verify/';

  var BRANCHES = { V: 'Vake', K: 'Krtsanisi' };

  // Template catalogue. `variant` selects the field layout; `subject` is the
  // 3rd letter of the certificate number.
  var TEMPLATES = {
    '1': { id: '1', variant: 'full', subject: 'E', label: 'Template 1 — Yellow', accent: '#fbc037', accentName: 'Yellow · English', file: 'template1.pdf' },
    '2': { id: '2', variant: 'full', subject: 'E', label: 'Template 2 — Blue', accent: '#365ab1', accentName: 'Blue · English', file: 'template2.pdf' },
    '3': { id: '3', variant: 'nolevel', subject: 'A', label: 'Template 3 — Red', accent: '#f25468', accentName: 'Red · Art', file: 'template3.pdf' }
  };

  // Fonts (key -> filename under app/fonts/).
  var FONT_FILES = {
    rhmed: 'RedHatDisplay-Medium.ttf', // name
    cbold: 'calibri-bold.ttf',         // course / level / hours / period
    clight: 'calibril.ttf'             // certificate number
  };
  var FONT_KEYS = ['rhmed', 'cbold', 'clight'];

  // Expected spreadsheet columns per variant (case/spacing-insensitive headers).
  var BASE_COLS = {
    firstName: { key: 'firstName', headers: ['first name', 'firstname', 'name'], label: 'First Name', sample: 'Elizaveta' },
    lastName: { key: 'lastName', headers: ['last name', 'lastname', 'surname'], label: 'Last Name', sample: 'Datukishvili' },
    course: { key: 'course', headers: ['course'], label: 'Course', sample: 'General English' },
    level: { key: 'level', headers: ['level'], label: 'Level', sample: 'Intermediate' },
    hours: { key: 'hours', headers: ['hours', 'hour'], label: 'Hours', sample: '48' },
    startDate: { key: 'startDate', headers: ['start date', 'start', 'from', 'period start'], label: 'Start Date', sample: '2026-01-16' },
    endDate: { key: 'endDate', headers: ['end date', 'end', 'to', 'period end'], label: 'End Date', sample: '2026-06-16' }
  };
  var COLUMNS = {
    full: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.level, BASE_COLS.hours, BASE_COLS.startDate, BASE_COLS.endDate],
    nolevel: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.hours, BASE_COLS.startDate, BASE_COLS.endDate]
  };

  // Shared name placement (identical on all three pages).
  var NAME = { x: 194, line1: 408.5, lineGap: 38.2, size: 40.5, font: 'rhmed', color: INK, maxWidth: 560, whiteout: { x0: 190, y0: 143, x1: 645, y1: 236 } };
  // Certificate number + QR (identical on all three pages).
  var CERTNO = { x: 559.4, baseline: 49.5, size: 10.5, font: 'clight', color: INK, maxWidth: 100, whiteout: { x0: 557, y0: 538.5, x1: 642, y1: 547 } };
  var QR = { x: 775.7, y: 43.3, size: 24, whiteout: { x0: 772, y0: 524, x1: 803, y1: 556 } };

  function valueField(x, maxWidth, whiteout) {
    return { x: x, baseline: 251.1, size: 12.6, font: 'cbold', color: INK, maxWidth: maxWidth, whiteout: whiteout };
  }
  var PERIOD = { x: 194, baseline: 189.7, size: 12.75, font: 'cbold', color: INK, maxWidth: 360, whiteout: { x0: 192, y0: 393, x1: 565, y1: 407 } };

  var LAYOUT = {
    full: {
      name: NAME,
      course: valueField(194, 210, { x0: 192, y0: 332, x1: 410, y1: 346 }),
      level: valueField(417.6, 210, { x0: 415, y0: 332, x1: 635, y1: 346 }),
      hours: valueField(641.5, 150, { x0: 639, y0: 332, x1: 770, y1: 346 }),
      period: PERIOD, certno: CERTNO, qr: QR
    },
    nolevel: {
      name: NAME,
      course: valueField(194, 210, { x0: 192, y0: 332, x1: 410, y1: 346 }),
      hours: valueField(417.6, 200, { x0: 415, y0: 332, x1: 600, y1: 346 }),
      period: PERIOD, certno: CERTNO, qr: QR
    }
  };

  var MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  // --- helpers ---------------------------------------------------------------

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function excelSerialToDate(n) { return new Date(Math.round((n - 25569) * 86400 * 1000)); }

  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && isFinite(v)) return (v > 59 && v < 80000) ? excelSerialToDate(v) : null;
    var s = String(v).trim(), m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function formatDate(v) {
    var d = toDate(v);
    if (!d) return String(v == null ? '' : v).trim();
    return d.getDate() + ' ' + MONTHS_EN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function pad4(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }

  // Completion year for a row: end date, else start date, else current year.
  function yearOf(row) {
    var d = toDate(row.endDate) || toDate(row.startDate);
    return d ? d.getFullYear() : new Date().getFullYear();
  }

  // L<branch><subject>-<year>-<seq>
  function certNumber(subject, branch, year, seq) {
    return 'L' + branch + subject + '-' + year + '-' + pad4(seq);
  }

  // Build the list of certificate numbers for a batch (used by UI + render).
  function certNumbers(templateId, rows, branch, startNumber) {
    var tpl = TEMPLATES[templateId];
    var start = parseInt(startNumber, 10);
    if (!isFinite(start)) start = 1;
    return rows.map(function (row, i) {
      return certNumber(tpl.subject, branch, yearOf(row), start + i);
    });
  }

  function rgb01(c, rgb) { return rgb(c[0] / 255, c[1] / 255, c[2] / 255); }

  function mapRow(rawRow, variant) {
    var cols = COLUMNS[variant], lookup = {};
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
    var s = size, w = font.widthOfTextAtSize(text, size);
    if (maxWidth && w > maxWidth) s = size * maxWidth / w;
    page.drawText(text, { x: x, y: baseline, size: s, font: font, color: rgb01(color, rgb) });
  }

  function drawQR(page, text, q, qrcode, rgb) {
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), m = q.size / n, black = rgb(0, 0, 0);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          // +0.25 overlap avoids hairline gaps between modules when rasterised
          page.drawRectangle({ x: q.x + c * m, y: q.y + q.size - (r + 1) * m, width: m + 0.25, height: m + 0.25, color: black });
        }
      }
    }
  }

  function draw(page, row, variant, certNo, fonts, qrcode, rgb) {
    var L = LAYOUT[variant];
    // Templates are pre-cleaned of their sample values (see tools/clean-templates.py),
    // so no whiteout is needed for text fields — only the sample QR image is hidden.
    whiteout(page, L.qr.whiteout, rgb);

    var med = fonts.rhmed, bold = fonts.cbold, light = fonts.clight;

    drawLine(page, String(row.firstName || '').trim().toUpperCase(), med, L.name.x, L.name.line1, L.name.size, L.name.maxWidth, L.name.color, rgb);
    drawLine(page, String(row.lastName || '').trim().toUpperCase(), med, L.name.x, L.name.line1 - L.name.lineGap, L.name.size, L.name.maxWidth, L.name.color, rgb);

    drawLine(page, String(row.course || '').toUpperCase(), bold, L.course.x, L.course.baseline, L.course.size, L.course.maxWidth, L.course.color, rgb);
    if (L.level) drawLine(page, String(row.level || '').toUpperCase(), bold, L.level.x, L.level.baseline, L.level.size, L.level.maxWidth, L.level.color, rgb);
    drawLine(page, String(row.hours || '').trim(), bold, L.hours.x, L.hours.baseline, L.hours.size, L.hours.maxWidth, L.hours.color, rgb);

    var start = formatDate(row.startDate), end = formatDate(row.endDate);
    drawLine(page, end ? start + ' - ' + end : start, bold, L.period.x, L.period.baseline, L.period.size, L.period.maxWidth, L.period.color, rgb);

    drawLine(page, certNo, light, L.certno.x, L.certno.baseline, L.certno.size, L.certno.maxWidth, L.certno.color, rgb);
    drawQR(page, VERIFY_BASE + certNo, L.qr, qrcode, rgb);
  }

  // --- public API ------------------------------------------------------------

  /** Build a single merged PDF with one page per row. @returns {Promise<Uint8Array>} */
  async function generate(opts) {
    var PDFLib = opts.PDFLib, fontkit = opts.fontkit, qrcode = opts.qrcode, rgb = PDFLib.rgb;
    var tpl = TEMPLATES[opts.templateId];
    if (!tpl) throw new Error('Unknown template: ' + opts.templateId);
    if (!qrcode) throw new Error('QR code library missing.');
    var branch = opts.branch || 'V';

    var rows = opts.rows || [];
    if (opts.rawRows) rows = rows.map(function (r) { return mapRow(r, tpl.variant); });
    if (!rows.length) throw new Error('No rows to render.');
    var numbers = certNumbers(opts.templateId, rows, branch, opts.startNumber);

    var out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);
    var fonts = {};
    for (var i = 0; i < FONT_KEYS.length; i++) {
      fonts[FONT_KEYS[i]] = await out.embedFont(opts.fontBytes[FONT_KEYS[i]], { subset: true });
    }
    var tplPage = (await out.embedPdf(opts.templateBytes, [0]))[0];

    for (var r = 0; r < rows.length; r++) {
      var page = out.addPage([PAGE.W, PAGE.H]);
      page.drawPage(tplPage);
      draw(page, rows[r], tpl.variant, numbers[r], fonts, qrcode, rgb);
    }
    return out.save();
  }

  function mapRows(rawRows, variant) { return rawRows.map(function (r) { return mapRow(r, variant); }); }

  return {
    PAGE: PAGE, TEMPLATES: TEMPLATES, BRANCHES: BRANCHES,
    FONT_FILES: FONT_FILES, FONT_KEYS: FONT_KEYS, COLUMNS: COLUMNS, LAYOUT: LAYOUT,
    formatDate: formatDate, mapRow: mapRow, mapRows: mapRows,
    certNumber: certNumber, certNumbers: certNumbers, generate: generate
  };
}));
