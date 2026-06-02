/*
 * certgen.js — Core certificate generator for Levels Academy Certificate Maker.
 *
 * Pure logic, no DOM. Works both in the browser (attaches window.CertGen)
 * and in Node (module.exports) so the same code is used by the web app and
 * the headless test/calibration harness.
 *
 * It stamps spreadsheet rows onto the original certificate PDFs:
 *  - the original template is embedded once and re-drawn per row (small output),
 *  - the sample text baked into the template is covered with white rectangles,
 *  - new values are written with embedded fonts at calibrated positions.
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

  // Colours sampled from the original artwork.
  var INK = [0x39, 0x35, 0x36];      // main dark grey used for all English text
  var INK_DARK = [0x30, 0x2c, 0x2d]; // slightly darker grey (Georgian dates)
  var CORAL = [0xed, 0x91, 0x85];    // Georgian name colour

  // Template catalogue. `kind` selects the layout/language handling.
  var TEMPLATES = {
    '1': { id: '1', kind: 'en', label: 'Template 1 — English', accent: '#fbc037', accentName: 'Yellow', file: 'template1.pdf' },
    '2': { id: '2', kind: 'en', label: 'Template 2 — English', accent: '#365ab1', accentName: 'Blue', file: 'template2.pdf' },
    '3': { id: '3', kind: 'ka', label: 'Template 3 — Georgian', accent: '#ed9185', accentName: 'Coral', file: 'template3.pdf' }
  };

  // Fonts each template needs (key -> filename under app/fonts/).
  // English uses Red Hat Display Medium (name) and Bold (values/dates).
  // Georgian currently uses Noto Sans Georgian as a stand-in for the
  // proprietary BPG Calibri / LGV Anastasia fonts (swap the files to match).
  var FONT_FILES = {
    rhmed: 'RedHatDisplay-Medium.ttf',   // English — name
    rhbold: 'RedHatDisplay-Bold.ttf',    // English — course / level / dates
    // Georgian slots. The files below are Noto Sans Georgian stand-ins; to match
    // the originals exactly, just overwrite each file (keep the same name):
    kaName: 'georgian-name.ttf',    // → LGV Anastasia 2025 Geo Bold (the name)
    kaCourse: 'georgian-course.ttf', // → BPG Calibri (the course line)
    kaDate: 'georgian-date.ttf'     // → BPG Calibri Bold (the period dates)
  };

  var FONTS_FOR_KIND = {
    en: ['rhmed', 'rhbold'],
    ka: ['kaName', 'kaCourse', 'kaDate']
  };

  // Expected spreadsheet columns per kind (used for validation, previews and
  // the downloadable sample files). Header matching is case/spacing-insensitive.
  var COLUMNS = {
    en: [
      { key: 'firstName', headers: ['first name', 'firstname', 'name'], label: 'First Name', sample: 'ELIZAVETA' },
      { key: 'lastName', headers: ['last name', 'lastname', 'surname'], label: 'Last Name', sample: 'DATUKISHVILI' },
      { key: 'course', headers: ['course'], label: 'Course', sample: 'General English' },
      { key: 'level', headers: ['level'], label: 'Level', sample: 'Intermediate' },
      { key: 'startDate', headers: ['start date', 'start', 'from', 'period start'], label: 'Start Date', sample: '2026-01-16' },
      { key: 'endDate', headers: ['end date', 'end', 'to', 'period end'], label: 'End Date', sample: '2026-06-16' }
    ],
    ka: [
      { key: 'firstName', headers: ['first name', 'firstname', 'name', 'სახელი'], label: 'First Name', sample: 'ელიზავეტა' },
      { key: 'lastName', headers: ['last name', 'lastname', 'surname', 'გვარი'], label: 'Last Name', sample: 'დათუკიშვილს' },
      { key: 'courseLine', headers: ['course line', 'course', 'კურსი', 'ტექსტი'], label: 'Course Line', sample: 'ხატვის კურსის წარმატებით დასრულებისთვის' },
      { key: 'startDate', headers: ['start date', 'start', 'from', 'period start'], label: 'Start Date', sample: '2026-01-16' },
      { key: 'endDate', headers: ['end date', 'end', 'to', 'period end'], label: 'End Date', sample: '2026-06-16' }
    ]
  };

  // Per-field placement, calibrated from the original PDFs. Coordinates are in
  // PDF points with a bottom-left origin (pdf-lib convention). Whiteout rects
  // are given top-origin {x0,y0,x1,y1} and converted at draw time.
  var LAYOUT = {
    en: {
      name: {
        x: 197.34, line1: 405.5, lineGap: 38.7, size: 46, font: 'rhmed',
        color: INK, maxWidth: 600, upper: true,
        whiteout: { x0: 194, y0: 142, x1: 650, y1: 241 }
      },
      course: {
        x: 197.34, baseline: 239.5, size: 14.8, font: 'rhbold', color: INK,
        maxWidth: 214, upper: true,
        whiteout: { x0: 195, y0: 339, x1: 417, y1: 360 }
      },
      level: {
        x: 420.94, baseline: 239.5, size: 14.8, font: 'rhbold', color: INK,
        maxWidth: 218, upper: true,
        whiteout: { x0: 419, y0: 339, x1: 642, y1: 360 }
      },
      period: {
        x: 644.55, line1: 240, line2: 224, size: 14.8, font: 'rhbold', color: INK,
        maxWidth: 190, upper: true,
        whiteout: { x0: 642, y0: 339, x1: 825, y1: 377 }
      }
    },
    ka: {
      name: {
        x: 197.34, line1: 414, lineGap: 37, size: 27.5, font: 'nsgbold',
        color: CORAL, maxWidth: 600,
        whiteout: { x0: 194, y0: 146, x1: 630, y1: 231 }
      },
      courseLine: {
        x: 197.34, baseline: 321, size: 13.9, font: 'nsgreg', color: INK,
        maxWidth: 430,
        whiteout: { x0: 195, y0: 254, x1: 645, y1: 282 }
      },
      period: {
        x: 197.34, line1: 240.5, line2: 222.5, size: 12.8, font: 'nsgbold', color: INK_DARK,
        maxWidth: 200,
        whiteout: { x0: 195, y0: 338, x1: 425, y1: 379 }
      }
    }
  };

  var MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  var MONTHS_KA = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
    'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

  // --- helpers ---------------------------------------------------------------

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Turn an Excel serial number into a JS Date (1900 date system).
  function excelSerialToDate(n) {
    var ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms);
  }

  // Parse a cell value into a Date, or return null if it isn't a date.
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && isFinite(v)) {
      if (v > 59 && v < 80000) return excelSerialToDate(v);
      return null;
    }
    var s = String(v).trim();
    // ISO-ish or common date strings
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  // Format a date value for display; falls back to the raw string if not a date.
  function formatDate(v, kind) {
    var d = toDate(v);
    if (!d) return String(v == null ? '' : v).trim();
    var months = kind === 'ka' ? MONTHS_KA : MONTHS_EN;
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function rgb01(c, rgb) { return rgb(c[0] / 255, c[1] / 255, c[2] / 255); }

  // Map a sheet row (header->value object) to canonical field keys.
  function mapRow(rawRow, kind) {
    var cols = COLUMNS[kind];
    var lookup = {};
    Object.keys(rawRow).forEach(function (h) { lookup[norm(h)] = rawRow[h]; });
    var out = {};
    cols.forEach(function (col) {
      var val;
      for (var i = 0; i < col.headers.length; i++) {
        if (lookup[col.headers[i]] != null && lookup[col.headers[i]] !== '') {
          val = lookup[col.headers[i]];
          break;
        }
      }
      out[col.key] = val == null ? '' : val;
    });
    // If a single "name" was provided without a last name, split it.
    if ((out.firstName === '' || out.firstName == null) && lookup['name']) {
      out.firstName = lookup['name'];
    }
    if ((out.lastName === '' || out.lastName == null) && out.firstName) {
      var parts = String(out.firstName).trim().split(/\s+/);
      if (parts.length > 1) { out.firstName = parts.shift(); out.lastName = parts.join(' '); }
    }
    return out;
  }

  // --- drawing ---------------------------------------------------------------

  function whiteout(page, w, rgb) {
    page.drawRectangle({
      x: w.x0, y: PAGE.H - w.y1, width: w.x1 - w.x0, height: w.y1 - w.y0,
      color: rgb(1, 1, 1)
    });
  }

  function fitSize(font, text, size, maxWidth) {
    if (!maxWidth) return size;
    var w = font.widthOfTextAtSize(text, size);
    return w > maxWidth ? size * maxWidth / w : size;
  }

  function drawLine(page, text, f, x, baseline, size, maxWidth, color, rgb) {
    if (!text) return;
    var s = fitSize(f, text, size, maxWidth);
    page.drawText(text, { x: x, y: baseline, size: s, font: f, color: rgb01(color, rgb) });
  }

  function drawEnglish(page, row, fonts, rgb) {
    var L = LAYOUT.en;
    [L.name, L.course, L.level, L.period].forEach(function (f) { whiteout(page, f.whiteout, rgb); });

    var med = fonts.rhmed;   // name
    var bold = fonts.rhbold; // course / level / dates
    var first = (row.firstName || '').toString();
    var last = (row.lastName || '').toString();
    drawLine(page, first.toUpperCase(), med, L.name.x, L.name.line1, L.name.size, L.name.maxWidth, L.name.color, rgb);
    drawLine(page, last.toUpperCase(), med, L.name.x, L.name.line1 - L.name.lineGap, L.name.size, L.name.maxWidth, L.name.color, rgb);

    drawLine(page, String(row.course || '').toUpperCase(), bold, L.course.x, L.course.baseline, L.course.size, L.course.maxWidth, L.course.color, rgb);
    drawLine(page, String(row.level || '').toUpperCase(), bold, L.level.x, L.level.baseline, L.level.size, L.level.maxWidth, L.level.color, rgb);

    var start = formatDate(row.startDate, 'en');
    var end = formatDate(row.endDate, 'en');
    drawLine(page, end ? start + ' –' : start, bold, L.period.x, L.period.line1, L.period.size, L.period.maxWidth, L.period.color, rgb);
    drawLine(page, end, bold, L.period.x, L.period.line2, L.period.size, L.period.maxWidth, L.period.color, rgb);
  }

  function drawGeorgian(page, row, fonts, rgb) {
    var L = LAYOUT.ka;
    [L.name, L.courseLine, L.period].forEach(function (f) { whiteout(page, f.whiteout, rgb); });

    var nameF = fonts.kaName;     // LGV Anastasia (name)
    var courseF = fonts.kaCourse; // BPG Calibri (course line)
    var dateF = fonts.kaDate;     // BPG Calibri Bold (dates)
    drawLine(page, String(row.firstName || ''), nameF, L.name.x, L.name.line1, L.name.size, L.name.maxWidth, L.name.color, rgb);
    drawLine(page, String(row.lastName || ''), nameF, L.name.x, L.name.line1 - L.name.lineGap, L.name.size, L.name.maxWidth, L.name.color, rgb);

    drawLine(page, String(row.courseLine || ''), courseF, L.courseLine.x, L.courseLine.baseline, L.courseLine.size, L.courseLine.maxWidth, L.courseLine.color, rgb);

    var start = formatDate(row.startDate, 'ka');
    var end = formatDate(row.endDate, 'ka');
    drawLine(page, end ? start + ' -' : start, dateF, L.period.x, L.period.line1, L.period.size, L.period.maxWidth, L.period.color, rgb);
    drawLine(page, end, dateF, L.period.x, L.period.line2, L.period.size, L.period.maxWidth, L.period.color, rgb);
  }

  // --- public API ------------------------------------------------------------

  /**
   * Build a single merged PDF with one page per row.
   * @param {Object} opts
   * @param {string} opts.templateId   '1' | '2' | '3'
   * @param {Uint8Array} opts.templateBytes  the template PDF
   * @param {Object} opts.fontBytes    { fontKey: Uint8Array }
   * @param {Array}  opts.rows         already mapped rows (use mapRows first) OR raw rows
   * @param {Object} opts.PDFLib       pdf-lib module
   * @param {Object} opts.fontkit      @pdf-lib/fontkit module
   * @param {boolean} [opts.rawRows]   set true if rows are raw sheet objects
   * @returns {Promise<Uint8Array>}
   */
  async function generate(opts) {
    var PDFLib = opts.PDFLib, fontkit = opts.fontkit, rgb = PDFLib.rgb;
    var tpl = TEMPLATES[opts.templateId];
    if (!tpl) throw new Error('Unknown template: ' + opts.templateId);

    var rows = opts.rows || [];
    if (opts.rawRows) rows = rows.map(function (r) { return mapRow(r, tpl.kind); });
    if (!rows.length) throw new Error('No rows to render.');

    var out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);

    var fonts = {};
    var keys = FONTS_FOR_KIND[tpl.kind];
    for (var i = 0; i < keys.length; i++) {
      fonts[keys[i]] = await out.embedFont(opts.fontBytes[keys[i]], { subset: true });
    }

    var embedded = await out.embedPdf(opts.templateBytes, [0]);
    var tplPage = embedded[0];

    var draw = tpl.kind === 'ka' ? drawGeorgian : drawEnglish;
    for (var r = 0; r < rows.length; r++) {
      var page = out.addPage([PAGE.W, PAGE.H]);
      page.drawPage(tplPage);
      draw(page, rows[r], fonts, rgb);
    }
    return out.save();
  }

  function mapRows(rawRows, kind) {
    return rawRows.map(function (r) { return mapRow(r, kind); });
  }

  return {
    PAGE: PAGE,
    TEMPLATES: TEMPLATES,
    FONT_FILES: FONT_FILES,
    FONTS_FOR_KIND: FONTS_FOR_KIND,
    COLUMNS: COLUMNS,
    LAYOUT: LAYOUT,
    formatDate: formatDate,
    mapRow: mapRow,
    mapRows: mapRows,
    generate: generate
  };
}));
