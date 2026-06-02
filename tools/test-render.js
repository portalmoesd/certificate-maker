/*
 * Headless calibration/test harness.
 * Generates sample certificates for each template using the SAME core code
 * (app/js/certgen.js) the browser uses, so placement can be verified with
 * pdftoppm before shipping.
 *
 *   node tools/test-render.js
 *
 * Output: tools/out/test-<id>.pdf
 */
const fs = require('fs');
const path = require('path');

const PDFLib = require('../app/vendor/pdf-lib.min.js');
const fontkit = require('../app/vendor/fontkit.umd.min.js');
const CertGen = require('../app/js/certgen.js');

const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function readFonts(keys) {
  const out = {};
  keys.forEach((k) => {
    out[k] = new Uint8Array(fs.readFileSync(path.join(APP, 'fonts', CertGen.FONT_FILES[k])));
  });
  return out;
}

const SAMPLES = {
  en: [
    { firstName: 'Elizaveta', lastName: 'Datukishvili', course: 'General English', level: 'Intermediate', startDate: '2026-01-16', endDate: '2026-06-16' },
    { firstName: 'Konstantine', lastName: 'Kvaratskhelia', course: 'Business English', level: 'Upper-Intermediate', startDate: '2025-09-01', endDate: '2026-02-28' },
    { firstName: 'Ann', lastName: 'Lee', course: 'IELTS Preparation', level: 'Advanced', startDate: '2026-03-02', endDate: '2026-05-30' }
  ],
  ka: [
    { firstName: 'ელიზავეტა', lastName: 'დათუკიშვილს', courseLine: 'ხატვის კურსის წარმატებით დასრულებისთვის', startDate: '2026-01-16', endDate: '2026-06-16' },
    { firstName: 'კონსტანტინე', lastName: 'კვარაცხელია', courseLine: 'ინგლისური ენის კურსის წარმატებით დასრულებისთვის', startDate: '2025-09-01', endDate: '2026-02-28' }
  ]
};

(async () => {
  for (const id of ['1', '2', '3']) {
    const tpl = CertGen.TEMPLATES[id];
    const templateBytes = new Uint8Array(fs.readFileSync(path.join(APP, 'templates', tpl.file)));
    const fontBytes = readFonts(CertGen.FONTS_FOR_KIND[tpl.kind]);
    const rows = SAMPLES[tpl.kind];
    const pdf = await CertGen.generate({
      templateId: id, templateBytes, fontBytes, rows, PDFLib, fontkit
    });
    const dest = path.join(OUT, `test-${id}.pdf`);
    fs.writeFileSync(dest, pdf);
    console.log(`wrote ${dest} (${pdf.length} bytes, ${rows.length} pages)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
