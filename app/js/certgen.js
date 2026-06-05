/*
 * certgen.js — Core certificate generator for the Levels Academy
 * "Certificate of Completion" templates (yellow, blue, red + Georgian art).
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
 * Fonts:
 *   English (yellow/blue/red): name = Red Hat Display Medium; course/level/
 *     hours/period = Calibri Bold; certificate number = Calibri Light.
 *   Georgian (template 4): name = Archy EDT Bold (with +50 tracking); course/
 *     period = BPG LE Studio 02 Caps (faux-bold via a light stroke, since the
 *     font has no bold cut); certificate number = Calibri Light.
 *
 * Dates are entered in the spreadsheet as DD.MM.YYYY and rendered as
 * "16 JANUARY 2026" (English) or "16 იანვარი 2026" (Georgian).
 *
 * Certificate number:  L<branch><subject>-<year>-<seq>
 *   branch  : V (Vake) or K (Krtsanisi)        — chosen per batch
 *   subject : E (English) or A (Art)           — fixed by template
 *   year    : completion year (from the dates)
 *   seq     : 4-digit running number from a start value
 *
 * Layout variants:
 *   'full'       (yellow, blue)      : COURSE | LEVEL | HOURS , PERIOD
 *   'courseonly' (red / Art)         : COURSE , PERIOD   (no level, no hours)
 *   'kacourse'   (Georgian / Art)    : same as courseonly, Georgian fonts/dates
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
  // The QR encodes the verify URL with a per-certificate random token (?v=...),
  // so other certificates can't be found by guessing the sequential number.
  var VERIFY_BASE = 'https://levels.ge/verify?v=';

  var BRANCHES = { V: 'Vake', K: 'Krtsanisi' };

  // Template catalogue. `variant` selects the field layout; `subject` is the
  // 3rd letter of the certificate number.
  var TEMPLATES = {
    '1': { id: '1', variant: 'full', subject: 'E', label: 'Template 1 — Yellow', accent: '#fbc037', accentName: 'Yellow · English', file: 'template1.pdf' },
    '2': { id: '2', variant: 'full', subject: 'E', label: 'Template 2 — Blue', accent: '#365ab1', accentName: 'Blue · English', file: 'template2.pdf' },
    '3': { id: '3', variant: 'courseonly', subject: 'A', label: 'Template 3 — Red', accent: '#f25468', accentName: 'Red · Art', file: 'template3.pdf' },
    '4': { id: '4', variant: 'kacourse', subject: 'A', lang: 'ka', label: 'Template 4 — Georgian', accent: '#f25468', accentName: 'Georgian · Art', file: 'template4.pdf' }
  };

  // Fonts (key -> filename under app/fonts/).
  var FONT_FILES = {
    rhmed: 'RedHatDisplay-Medium.ttf',                   // English name
    cbold: 'calibri-bold.ttf',                           // English course/level/hours/period
    clight: 'calibril.ttf',                              // certificate number (all templates)
    archy: 'archyedt-bold-60540591796.otf',              // Georgian name
    bpg: 'bpg_le_studio_02_caps-7834001055.ttf'          // Georgian course/period
  };
  var FONT_KEYS = ['rhmed', 'cbold', 'clight', 'archy', 'bpg'];

  // Default Georgian statement (the line under the name). Editable per row.
  var KA_STATEMENT = 'კურსის წარმატებით დასრულებისთვის';

  // Expected spreadsheet columns per variant (case/spacing-insensitive headers).
  var BASE_COLS = {
    firstName: { key: 'firstName', headers: ['first name', 'firstname', 'name'], label: 'First Name', sample: 'Elizaveta' },
    lastName: { key: 'lastName', headers: ['last name', 'lastname', 'surname'], label: 'Last Name', sample: 'Datukishvili' },
    course: { key: 'course', headers: ['course'], label: 'Course', sample: 'General English' },
    level: { key: 'level', headers: ['level'], label: 'Level', sample: 'Intermediate' },
    hours: { key: 'hours', headers: ['hours', 'hour'], label: 'Hours', sample: '48' },
    startDate: { key: 'startDate', headers: ['start date', 'start', 'from', 'period start'], label: 'Start Date', sample: '16.01.2026' },
    endDate: { key: 'endDate', headers: ['end date', 'end', 'to', 'period end'], label: 'End Date', sample: '16.06.2026' },
    // Georgian-only: the subtitle under the name. Blank cell falls back to KA_STATEMENT.
    statement: { key: 'statement', headers: ['statement', 'subtitle', 'message', 'text'], label: 'Statement', sample: KA_STATEMENT }
  };
  var COLUMNS = {
    full: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.level, BASE_COLS.hours, BASE_COLS.startDate, BASE_COLS.endDate],
    courseonly: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.startDate, BASE_COLS.endDate],
    kacourse: [BASE_COLS.firstName, BASE_COLS.lastName, BASE_COLS.course, BASE_COLS.startDate, BASE_COLS.endDate, BASE_COLS.statement]
  };

  // Example rows for the downloadable sample spreadsheets (dates as DD.MM.YYYY).
  var EN_SAMPLES = [
    { firstName: 'Elizaveta', lastName: 'Datukishvili', course: 'General English', level: 'Intermediate', hours: '48', startDate: '16.01.2026', endDate: '16.06.2026' },
    { firstName: 'Giorgi', lastName: 'Beridze', course: 'General English', level: 'Beginner', hours: '36', startDate: '01.02.2026', endDate: '01.07.2026' }
  ];
  var KA_SAMPLES = [
    { firstName: 'ელიზავეტა', lastName: 'დათუკიშვილი', course: 'ხატვის ინტენსიური კურსი', startDate: '16.01.2026', endDate: '16.06.2026', statement: KA_STATEMENT },
    { firstName: 'გიორგი', lastName: 'ბერიძე', course: 'ხატვის ინტენსიური კურსი', startDate: '01.02.2026', endDate: '01.07.2026', statement: KA_STATEMENT }
  ];

  // Shared name placement (identical on all three pages).
  var NAME = { x: 199, line1: 409.2, lineGap: 37.2, size: 40, font: 'rhmed', color: INK, maxWidth: 560, whiteout: { x0: 195, y0: 143, x1: 650, y1: 236 } };
  // Certificate number + QR (identical on all three pages).
  var CERTNO = { x: 576.4, baseline: 46.6, size: 10, font: 'clight', color: INK, maxWidth: 90, whiteout: { x0: 574, y0: 538, x1: 648, y1: 550 } };
  var QR = { x: 792.5, y: 42.6, size: 24.5, whiteout: { x0: 790, y0: 526, x1: 818, y1: 554 } };

  function valueField(x, maxWidth, whiteout) {
    return { x: x, baseline: 250.4, size: 12, font: 'cbold', color: INK, maxWidth: maxWidth, whiteout: whiteout };
  }
  var PERIOD = { x: 199, baseline: 188.8, size: 12, font: 'cbold', color: INK, maxWidth: 360, whiteout: { x0: 197, y0: 393, x1: 570, y1: 407 } };

  // Georgian (template 4) placement. Name is Archy EDT Bold with +50 tracking;
  // course/period are BPG LE Studio 02 Caps drawn faux-bold (no bold cut exists).
  var NAME_KA = { x: 199, line1: 410.0, lineGap: 37.2, size: 40, font: 'archy', tracking: 50, color: INK, maxWidth: 560 };

  var LAYOUT = {
    full: {
      name: NAME,
      course: valueField(199, 210, { x0: 197, y0: 332, x1: 415, y1: 346 }),
      level: valueField(422.6, 210, { x0: 420, y0: 332, x1: 640, y1: 346 }),
      hours: valueField(646.5, 130, { x0: 644, y0: 332, x1: 775, y1: 346 }),
      period: PERIOD, certno: CERTNO, qr: QR
    },
    courseonly: {
      name: NAME,
      course: valueField(199, 560, { x0: 197, y0: 332, x1: 600, y1: 346 }),
      period: PERIOD, certno: CERTNO, qr: QR
    },
    kacourse: {
      name: NAME_KA,
      statement: { x: 199, baseline: 322.2, size: 14, font: 'bpg', color: INK, maxWidth: 580, default: KA_STATEMENT },
      course: { x: 199, baseline: 249.9, size: 12, font: 'bpg', bold: true, color: INK, maxWidth: 560 },
      period: { x: 199, baseline: 188.3, size: 12, font: 'bpg', bold: true, color: INK, maxWidth: 360 },
      certno: CERTNO, qr: QR
    }
  };

  var MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  var MONTHS_KA = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
    'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

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

  function formatDate(v, lang) {
    var d = toDate(v);
    if (!d) return String(v == null ? '' : v).trim();
    var months = lang === 'ka' ? MONTHS_KA : MONTHS_EN;
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Header + data rows for a template's downloadable sample spreadsheet.
  function sampleRows(templateId) {
    var tpl = TEMPLATES[templateId], cols = COLUMNS[tpl.variant];
    var data = tpl.lang === 'ka' ? KA_SAMPLES : EN_SAMPLES;
    return {
      headers: cols.map(function (c) { return c.label; }),
      rows: data.map(function (d) { return cols.map(function (c) { return d[c.key] == null ? '' : d[c.key]; }); })
    };
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

  // Build the list of certificate numbers for a batch (used by the headless
  // harness and as a fallback; the web app gets numbers from the server).
  function certNumbers(templateId, rows, branch, startNumber) {
    var tpl = TEMPLATES[templateId];
    var start = parseInt(startNumber, 10);
    if (!isFinite(start)) start = 1;
    return rows.map(function (row, i) {
      return certNumber(tpl.subject, branch, yearOf(row), start + i);
    });
  }

  // The number prefix for each row, e.g. "LVE-2026" (no sequence). Rows can
  // differ in year, so this is computed per row.
  function certPrefixes(templateId, rows, branch) {
    var tpl = TEMPLATES[templateId];
    return rows.map(function (row) {
      return 'L' + branch + tpl.subject + '-' + yearOf(row);
    });
  }

  // Canonical YYYY-MM-DD for storage in the registry (verify formats per language).
  function toISO(v) {
    var d = toDate(v);
    if (!d) return String(v == null ? '' : v).trim();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
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

  // Faux-bold offset passes (points) — approximate a ~0.5pt stroke for fonts
  // that ship no bold cut (the Georgian BPG face).
  var BOLD_PASSES = [[0, 0], [0.35, 0], [0.17, 0.17]];
  var PLAIN_PASS = [[0, 0]];

  // Draw one line, optionally with Illustrator-style letter spacing (tracking, in
  // 1/1000 em) and/or faux-bold. Shrinks to fit maxWidth. With no tracking and no
  // bold this matches drawLine exactly (used by all the English fields).
  function drawRich(page, text, font, x, baseline, size, maxWidth, color, rgb, opts) {
    if (text == null || text === '') return;
    opts = opts || {};
    var col = rgb01(color, rgb);
    var passes = opts.bold ? BOLD_PASSES : PLAIN_PASS;
    var trackEm = (opts.tracking || 0) / 1000;
    var p;

    if (!trackEm) {
      var s = size, w = font.widthOfTextAtSize(text, size);
      if (maxWidth && w > maxWidth) s = size * maxWidth / w;
      for (p = 0; p < passes.length; p++) {
        page.drawText(text, { x: x + passes[p][0], y: baseline + passes[p][1], size: s, font: font, color: col });
      }
      return;
    }

    // Letter-spaced: lay the glyphs out one by one. total() is linear in size.
    var chars = Array.from(String(text));
    function total(sz) {
      var t = 0;
      for (var i = 0; i < chars.length; i++) t += font.widthOfTextAtSize(chars[i], sz);
      return t + trackEm * sz * Math.max(0, chars.length - 1);
    }
    var s2 = size;
    if (maxWidth && total(size) > maxWidth) s2 = size * maxWidth / total(size);
    var gap = trackEm * s2, cx = x;
    for (var i = 0; i < chars.length; i++) {
      for (p = 0; p < passes.length; p++) {
        page.drawText(chars[i], { x: cx + passes[p][0], y: baseline + passes[p][1], size: s2, font: font, color: col });
      }
      cx += font.widthOfTextAtSize(chars[i], s2) + gap;
    }
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

  function draw(page, row, tpl, certNo, verifyUrl, fonts, qrcode, rgb) {
    var L = LAYOUT[tpl.variant];
    var ka = tpl.lang === 'ka';
    // Georgian fonts are caps-style by design and have no Latin-style case
    // mapping, so only the English templates upper-case their values.
    var cap = ka ? function (s) { return s; } : function (s) { return s.toUpperCase(); };

    // Templates are pre-cleaned of their sample values (see tools/clean-templates.py),
    // so no whiteout is needed for text fields — only the sample QR image is hidden.
    whiteout(page, L.qr.whiteout, rgb);

    var nm = L.name;
    drawRich(page, cap(String(row.firstName || '').trim()), fonts[nm.font], nm.x, nm.line1, nm.size, nm.maxWidth, nm.color, rgb, { tracking: nm.tracking });
    drawRich(page, cap(String(row.lastName || '').trim()), fonts[nm.font], nm.x, nm.line1 - nm.lineGap, nm.size, nm.maxWidth, nm.color, rgb, { tracking: nm.tracking });

    if (L.statement) {
      var st = L.statement, stmt = String(row.statement || '').trim() || st.default || '';
      drawRich(page, stmt, fonts[st.font], st.x, st.baseline, st.size, st.maxWidth, st.color, rgb, { bold: st.bold });
    }

    drawRich(page, cap(String(row.course || '')), fonts[L.course.font], L.course.x, L.course.baseline, L.course.size, L.course.maxWidth, L.course.color, rgb, { bold: L.course.bold });
    if (L.level) drawRich(page, cap(String(row.level || '')), fonts[L.level.font], L.level.x, L.level.baseline, L.level.size, L.level.maxWidth, L.level.color, rgb, { bold: L.level.bold });
    if (L.hours) drawRich(page, String(row.hours || '').trim(), fonts[L.hours.font], L.hours.x, L.hours.baseline, L.hours.size, L.hours.maxWidth, L.hours.color, rgb, { bold: L.hours.bold });

    var lang = ka ? 'ka' : 'en';
    var start = formatDate(row.startDate, lang), end = formatDate(row.endDate, lang);
    drawRich(page, end ? start + ' - ' + end : start, fonts[L.period.font], L.period.x, L.period.baseline, L.period.size, L.period.maxWidth, L.period.color, rgb, { bold: L.period.bold });

    drawLine(page, certNo, fonts[L.certno.font], L.certno.x, L.certno.baseline, L.certno.size, L.certno.maxWidth, L.certno.color, rgb);
    drawQR(page, verifyUrl, L.qr, qrcode, rgb);
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
    // Numbers are normally assigned by the server and passed in; fall back to a
    // local sequence (used by the headless test harness).
    var numbers = opts.numbers || certNumbers(opts.templateId, rows, branch, opts.startNumber);
    if (numbers.length !== rows.length) throw new Error('Number/row count mismatch.');
    // The QR carries the per-row verify token from the server. With no token
    // (harness), fall back to the number so the QR is still valid-looking.
    var tokens = opts.tokens || numbers;

    var out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);
    var fonts = {};
    var needed = fontKeysForLayout(LAYOUT[tpl.variant]);
    for (var i = 0; i < needed.length; i++) {
      // Archy (OTF/CFF) is embedded whole — its subset trips some PDF engines.
      var subset = needed[i] !== 'archy';
      fonts[needed[i]] = await out.embedFont(opts.fontBytes[needed[i]], { subset: subset });
    }
    var tplPage = (await out.embedPdf(opts.templateBytes, [0]))[0];

    for (var r = 0; r < rows.length; r++) {
      var page = out.addPage([PAGE.W, PAGE.H]);
      page.drawPage(tplPage);
      draw(page, rows[r], tpl, numbers[r], VERIFY_BASE + tokens[r], fonts, qrcode, rgb);
    }
    return out.save();
  }

  // The distinct font keys a layout actually uses (so we embed only those).
  function fontKeysForLayout(L) {
    var keys = {};
    ['name', 'statement', 'course', 'level', 'hours', 'period', 'certno'].forEach(function (k) {
      if (L[k] && L[k].font) keys[L[k].font] = true;
    });
    return Object.keys(keys);
  }

  function mapRows(rawRows, variant) { return rawRows.map(function (r) { return mapRow(r, variant); }); }

  return {
    PAGE: PAGE, TEMPLATES: TEMPLATES, BRANCHES: BRANCHES,
    FONT_FILES: FONT_FILES, FONT_KEYS: FONT_KEYS, COLUMNS: COLUMNS, LAYOUT: LAYOUT,
    formatDate: formatDate, toISO: toISO, sampleRows: sampleRows, mapRow: mapRow, mapRows: mapRows,
    certNumber: certNumber, certNumbers: certNumbers, certPrefixes: certPrefixes, generate: generate
  };
}));
