const fs = require('fs'), path = require('path');
const XLSX = require('../app/vendor/xlsx.full.min.js');
const CertGen = require('../app/js/certgen.js');
const OUT = path.join(__dirname, '..', 'app', 'samples');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const id of Object.keys(CertGen.TEMPLATES)) {
  const tpl = CertGen.TEMPLATES[id];
  const sample = CertGen.sampleRows(id);
  const ws = XLSX.utils.aoa_to_sheet([sample.headers].concat(sample.rows));
  ws['!cols'] = sample.headers.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Certificates');
  const f = path.join(OUT, `certificate-template-${id}-sample.xlsx`);
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('wrote', path.relative(path.join(__dirname, '..'), f), `(${tpl.variant})`);
}
