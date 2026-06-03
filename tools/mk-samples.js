const fs = require('fs'), path = require('path');
const XLSX = require('../app/vendor/xlsx.full.min.js');
const CertGen = require('../app/js/certgen.js');
const OUT = path.join(__dirname, '..', 'app', 'samples');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const alt = { firstName: 'GIORGI', lastName: 'BERIDZE', course: 'General English', level: 'Beginner', startDate: '2026-02-01', endDate: '2026-07-01' };

for (const id of ['1', '2', '3']) {
  const variant = CertGen.TEMPLATES[id].variant;
  const cols = CertGen.COLUMNS[variant];
  const rows = [cols.map(c => c.label), cols.map(c => c.sample), cols.map(c => alt[c.key])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = cols.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Certificates');
  const f = path.join(OUT, `certificate-template-${id}-sample.xlsx`);
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('wrote', path.relative(path.join(__dirname, '..'), f), `(${variant})`);
}
