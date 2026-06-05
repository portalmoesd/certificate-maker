/*
 * Wix Velo backend for automatic certificate numbering + the certificate registry.
 *
 * This file is the SOURCE OF TRUTH for the code that must live in the Wix site at
 * Backend  ▸  http-functions.js  (Velo / Dev Mode). After editing here, paste the
 * contents into the Wix Editor and Publish. See wix/README.md for full setup.
 *
 * Endpoint:  POST https://www.levels.ge/_functions/issue
 *   body (JSON, sent as text/plain to avoid a CORS pre-flight):
 *     { code, prefix, rows: [{ firstName, lastName, course, level, hours,
 *                              startDate, endDate, branch, templateId }] }
 *   returns: { numbers: ["LVE-2026-0032", ...] }   (one per row, in order)
 *
 * Requires:
 *   - a "Certificates" data collection (fields listed in wix/README.md),
 *   - a Secrets Manager secret named "certMakerSecret" (the staff access code).
 */
import { ok, badRequest, forbidden, serverError } from 'wix-http-functions';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Browser pre-flight check.
export function options_issue() {
  return ok({ headers: CORS });
}

// POST /_functions/issue — assigns the next certificate numbers and stores the batch.
export async function post_issue(request) {
  let body;
  try { body = JSON.parse(await request.body.text()); }
  catch (e) { return badRequest({ headers: CORS, body: { error: 'bad json' } }); }

  let secret;
  try { secret = await getSecret('certMakerSecret'); }
  catch (e) { return serverError({ headers: CORS, body: { error: 'secret not set' } }); }
  if (!body || body.code !== secret) return forbidden({ headers: CORS, body: { error: 'wrong access code' } });

  const prefix = String(body.prefix || '');           // e.g. "LVE-2026"
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!/^L[VK][EA]-\d{4}$/.test(prefix) || !rows.length) {
    return badRequest({ headers: CORS, body: { error: 'bad input' } });
  }

  // Next sequence = highest existing number for this prefix + 1.
  const res = await wixData.query('Certificates')
    .startsWith('certNumber', prefix + '-')
    .descending('certNumber').limit(1)
    .find({ suppressAuth: true });
  let start = 1;
  if (res.items.length) start = parseInt(res.items[0].certNumber.split('-').pop(), 10) + 1;

  const pad = (n) => String(n).padStart(4, '0');
  const records = rows.map((r, i) => ({
    certNumber: prefix + '-' + pad(start + i),
    firstName: r.firstName || '', lastName: r.lastName || '', course: r.course || '',
    level: r.level || '', hours: r.hours || '', startDate: r.startDate || '',
    endDate: r.endDate || '', branch: r.branch || '', templateId: r.templateId || '',
    issuedAt: new Date()
  }));
  await wixData.bulkInsert('Certificates', records, { suppressAuth: true });

  return ok({ headers: CORS, body: { numbers: records.map((x) => x.certNumber) } });
}
