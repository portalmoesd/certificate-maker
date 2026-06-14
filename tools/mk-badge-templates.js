/*
 * Build clean badge templates from the source artwork.
 *
 *   node tools/mk-badge-templates.js
 *
 * Reads "academy badges.pdf" (2 pages: levels academy, levels art academy),
 * whites out the 8 baked sample name/age blocks on each page (keeping the
 * logos), and writes one logo-only template per academy to app/badges/.
 * BadgeGen then stamps real names onto these.
 */
const fs = require('fs');
const path = require('path');
const PDFLib = require('../app/vendor/pdf-lib.min.js');
const BadgeGen = require('../app/js/badgegen.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'academy badges.pdf');
const OUT = path.join(ROOT, 'app', 'badges');

// page index in the source -> output file (academy code order: E then A)
const PAGES = [
  { index: 0, file: BadgeGen.ACADEMIES.E.file },
  { index: 1, file: BadgeGen.ACADEMIES.A.file }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srcBytes = new Uint8Array(fs.readFileSync(SRC));
  const boxes = BadgeGen.cellClearBoxes();
  const white = PDFLib.rgb(1, 1, 1);

  for (const p of PAGES) {
    const src = await PDFLib.PDFDocument.load(srcBytes);
    const page = src.getPages()[p.index];
    boxes.forEach((b) => page.drawRectangle({ x: b.x, y: b.y, width: b.width, height: b.height, color: white }));

    const doc = await PDFLib.PDFDocument.create();
    const [copied] = await doc.copyPages(src, [p.index]);
    doc.addPage(copied);
    const dest = path.join(OUT, p.file);
    fs.writeFileSync(dest, await doc.save());
    console.log('wrote', path.relative(ROOT, dest));
  }
})().catch((e) => { console.error(e); process.exit(1); });
