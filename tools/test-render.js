/*
 * Headless calibration/test harness — uses the same core (app/js/certgen.js)
 * the browser uses, so placement can be verified with pdftoppm before shipping.
 *
 *   node tools/test-render.js   ->  tools/out/test-<id>.pdf
 */
const fs = require('fs');
const path = require('path');

const PDFLib = require('../app/vendor/pdf-lib.min.js');
const fontkit = require('../app/vendor/fontkit.umd.min.js');
const qrcode = require('../app/vendor/qrcode.min.js');
const CertGen = require('../app/js/certgen.js');

const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const u8 = (p) => new Uint8Array(fs.readFileSync(p));

function fonts() {
  const out = {};
  CertGen.FONT_KEYS.forEach((k) => { out[k] = u8(path.join(APP, 'fonts', CertGen.FONT_FILES[k])); });
  return out;
}

const ROWS = [
  { firstName: 'Elizaveta', lastName: 'Datukishvili', course: 'General English', level: 'Intermediate', hours: 48, startDate: '16.01.2026', endDate: '16.06.2026' },
  { firstName: 'Konstantine', lastName: 'Kvaratskhelia', course: 'Business English', level: 'Upper-Intermediate', hours: 60, startDate: '01.09.2025', endDate: '28.02.2026' }
];
const ROWS_KA = [
  { firstName: 'ელიზავეტა', lastName: 'დათუკიშვილი', course: 'ხატვის ინტენსიური კურსი', startDate: '16.01.2026', endDate: '16.06.2026' },
  { firstName: 'კონსტანტინე', lastName: 'კვარაცხელია', course: 'ხატვის ინტენსიური კურსი', startDate: '01.09.2025', endDate: '28.02.2026' }
];

(async () => {
  const fontBytes = fonts();
  for (const id of ['1', '2', '3', '4']) {
    const tpl = CertGen.TEMPLATES[id];
    const pdf = await CertGen.generate({
      templateId: id,
      templateBytes: u8(path.join(APP, 'templates', tpl.file)),
      fontBytes, rows: tpl.lang === 'ka' ? ROWS_KA : ROWS, branch: 'V', startNumber: 32,
      PDFLib, fontkit, qrcode
    });
    const dest = path.join(OUT, `test-${id}.pdf`);
    fs.writeFileSync(dest, pdf);
    console.log(`wrote ${dest} (${pdf.length} bytes) — nums:`,
      CertGen.certNumbers(id, ROWS, 'V', 32).join(', '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
