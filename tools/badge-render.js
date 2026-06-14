/*
 * Headless badge render — same core (app/js/badgegen.js) the browser uses.
 *
 *   node tools/badge-render.js   ->  tools/out/badges-<academy>.pdf
 */
const fs = require('fs');
const path = require('path');

const PDFLib = require('../app/vendor/pdf-lib.min.js');
const fontkit = require('../app/vendor/fontkit.umd.min.js');
const BadgeGen = require('../app/js/badgegen.js');

const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const u8 = (p) => new Uint8Array(fs.readFileSync(p));

function fonts() {
  const out = {};
  BadgeGen.FONT_KEYS.forEach((k) => { out[k] = u8(path.join(APP, 'fonts', BadgeGen.FONT_FILES[k])); });
  return out;
}

// 10 kids -> proves the 8-per-sheet pagination (one full sheet + a partial one).
const ROWS = [
  { firstName: 'ელიზავეტა', lastName: 'დათუკიშვილი', age: '9' },
  { firstName: 'გიორგი', lastName: 'ბერიძე', age: '7' },
  { firstName: 'ნინო', lastName: 'კვარაცხელია', age: '11' },
  { firstName: 'ლუკა', lastName: 'მაისურაძე', age: '6' },
  { firstName: 'მარიამ', lastName: 'გელაშვილი', age: '8' },
  { firstName: 'დავითი', lastName: 'ჩხეიძე', age: '10' },
  { firstName: 'ანა', lastName: 'წერეთელი', age: '5' },
  { firstName: 'საბა', lastName: 'ლომიძე', age: '12' },
  { firstName: 'თამარი', lastName: 'აბაშიძე', age: '7' },
  { firstName: 'ირაკლი', lastName: 'ჯავახიშვილი', age: '9' }
];

(async () => {
  const fontBytes = fonts();
  for (const academy of ['E', 'A']) {
    const ac = BadgeGen.ACADEMIES[academy];
    const pdf = await BadgeGen.generate({
      academy,
      templateBytes: u8(path.join(APP, 'badges', ac.file)),
      fontBytes, rows: ROWS,
      PDFLib, fontkit
    });
    const dest = path.join(OUT, `badges-${academy}.pdf`);
    fs.writeFileSync(dest, pdf);
    console.log(`wrote ${dest} (${pdf.length} bytes) — ${ROWS.length} badges on ${Math.ceil(ROWS.length / BadgeGen.PER_SHEET)} sheet(s)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
