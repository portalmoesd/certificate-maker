/* End-to-end browser test: serves app/, drives the real UI in Chromium. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'app');
const PORT = 8123;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

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

  const results = {};
  for (const id of ['1', '2', '3', '4']) {
    await page.click(`.tpl[data-id="${id}"]`);
    const variant = { '1': 'full', '2': 'full', '3': 'courseonly', '4': 'kacourse' }[id];
    const sample = path.join(ROOT, 'samples', `certificate-template-${id}-sample.xlsx`);
    await page.setInputFiles('#file', sample);
    await page.waitForFunction(() => !document.getElementById('generateBtn').disabled, { timeout: 5000 });
    const count = await page.textContent('.preview .count');
    await page.click('#generateBtn');
    await page.waitForFunction(() => /Done/.test(document.getElementById('status').textContent), { timeout: 15000 });
    const status = await page.textContent('#status');
    const dl = await page.getAttribute('#downloadBtn', 'href');
    results['template' + id] = { variant, count: count.trim(), status: status.trim(), pdfBlob: dl && dl.startsWith('blob:') };
  }

  await browser.close();
  server.close();
  console.log(JSON.stringify(results, null, 2));
  if (errors.length) { console.log('JS ERRORS:\n' + errors.join('\n')); process.exit(2); }
  console.log('NO JS ERRORS');
})().catch((e) => { console.error(e); process.exit(1); });
