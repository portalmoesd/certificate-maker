/* End-to-end browser test for badge mode: drives the real UI in Chromium. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');
const XLSX = require('../app/vendor/xlsx.full.min.js');

const ROOT = path.join(__dirname, '..', 'app');
const PORT = 8124;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Write a sample badge sheet to a temp file for the upload.
function sampleXlsx() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['First Name', 'Last Name', 'Age'],
    ['ელიზავეტა', 'დათუკიშვილი', '9'],
    ['გიორგი', 'ბერიძე', '7'],
    ['ნინო', 'კვარაცხელია', '11']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Badges');
  const f = path.join(os.tmpdir(), 'badge-e2e.xlsx');
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return f;
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  const sample = sampleXlsx();
  const results = {};
  await page.click('.mode-btn[data-mode="badge"]');

  for (const academy of ['E', 'A']) {
    await page.click(`.tpl[data-id="${academy}"]`);
    await page.setInputFiles('#file', sample);
    await page.waitForFunction(() => !document.getElementById('generateBtn').disabled, { timeout: 5000 });
    const count = await page.textContent('.preview .count');
    await page.click('#generateBtn');
    await page.waitForFunction(() => /Done —/.test(document.getElementById('status').textContent), { timeout: 15000 });
    const status = await page.textContent('#status');
    const hasPdf = await page.evaluate(() => {
      const a = document.getElementById('downloadBtn');
      return !!a.href && !a.classList.contains('disabled');
    });
    results[academy] = { count: count.trim(), status: status.trim(), pdf: hasPdf };
  }

  // Numbering step must be hidden in badge mode.
  results.numberingHidden = await page.evaluate(() => {
    return getComputedStyle(document.getElementById('stepNumbering')).display === 'none';
  });

  await browser.close();
  server.close();
  console.log(JSON.stringify(results, null, 2));
  if (errors.length) { console.error('\nJS ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nNO JS ERRORS');
})().catch((e) => { console.error(e); process.exit(1); });
