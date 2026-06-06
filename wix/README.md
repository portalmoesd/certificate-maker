# Wix Velo backend — registry & automatic numbering

The certificate **sequence number is assigned server-side** by a small Wix Velo
backend, so numbering is automatic and never collides across branches/computers.
Each issued certificate is stored in a Wix Data collection (`Certificates`), which
the public **verify page** also reads. Lookup is by a random per-certificate
**token** (in the QR), never by the sequential number, so the registry can't be
enumerated.

This folder is the version-controlled copy of that backend. Wix can't be deployed
to from this repo — you paste the code into the Wix Editor and Publish.

## One-time setup

1. **Turn on Dev Mode (Velo)** in the Wix Editor (top menu *Dev Mode → Turn on*).

2. **Create a data collection** named `Certificates` (permissions: Admin only).
   Fields (Field ID must match exactly):

   | Field name | Field ID | Type |
   |---|---|---|
   | Certificate Number | `certNumber` | Text |
   | Token | `token` | Text |
   | First Name | `firstName` | Text |
   | Last Name | `lastName` | Text |
   | Course | `course` | Text |
   | Level | `level` | Text |
   | Hours | `hours` | Text |
   | Start Date | `startDate` | Text |
   | End Date | `endDate` | Text |
   | Branch | `branch` | Text |
   | Template | `templateId` | Text |
   | Issued At | `issuedAt` | Date and Time |

3. **Add a secret** in the Wix Dashboard → Settings → Secrets Manager:
   - Name: `certMakerSecret`
   - Value: a hard-to-guess string — this is the **staff access code** typed into
     the generator (kept on the device, never committed to this repo).

4. **Add the backend file**: in the Velo sidebar create `Backend ▸ http-functions.js`
   and paste the contents of [`http-functions.js`](./http-functions.js).

5. **Publish** the site (the endpoint only goes live after publishing).

## Endpoints

```
# Write (generator -> registry). Assigns numbers + tokens, stores the batch.
POST https://www.levels.ge/_functions/issue
Content-Type: text/plain           # plain text avoids a CORS pre-flight
body: {"code":"<access code>","prefix":"LVE-2026","rows":[{...}]}
->   {"numbers":["LVE-2026-0032", ...], "tokens":["A1b2C3...", ...]}

# Read (verify page -> registry). Public, by token only.
GET  https://www.levels.ge/_functions/verify?v=<token>
->   {"found":true,"certificate":{certNumber,firstName,lastName,course,level,
                                   hours,startDate,endDate,templateId,issuedAt}}
```

The generator (`app/js/app.js`, `REGISTRY_URL`) calls `issue` on **Generate**, stamps
the returned numbers on the PDFs, and encodes `verify?v=<token>` into each QR.

### Quick health checks (no access code needed)

```bash
# issue alive? a POST with junk should return 400 "bad json"
curl -X POST --data 'x' https://www.levels.ge/_functions/issue
# verify alive? an unknown token should return {"found":false}
curl 'https://www.levels.ge/_functions/verify?v=unknowncode123'
```

## The verify page (Wix /verify)

The QR codes point to `https://levels.ge/verify?v=<token>`. Set that page up once:

1. **Create a page** with the URL slug `verify`.
2. Add an **Embed → Embed HTML** element. Paste the contents of
   [`verify.html`](./verify.html) (choose the *Code* option, not a URL).
3. Select the embed → **Properties panel → set the element ID to `verifyHtml`**.
   Make it wide enough (≈ 600px) and tall enough for the card.
4. Open the **page's** code file in the Velo sidebar (e.g. `verify.js`) and paste
   the contents of [`verify-page.velo.js`](./verify-page.velo.js).
5. **Publish.** Test by opening `https://www.levels.ge/verify?v=<a real token>`
   (any token from the `Certificates` table, or scan a certificate's QR).

The page reads `?v=<token>`, calls `/_functions/verify`, and the embed renders the
result (English, or Georgian for template-4 certificates).

## Notes

- **Update both files when they change here:** re-paste `http-functions.js` and
  `verify.html`/`verify-page.velo.js` into Wix and Publish.
- **Privacy:** verify accepts the random token only, so the sequential numbers can't
  be used to enumerate the registry. The endpoint returns only display fields.
- **Concurrency:** numbers are assigned from `max(existing)+1`. For this volume
  that's safe; if two people ever click Generate in the same second a duplicate is
  theoretically possible. If that ever matters, add a unique index on `certNumber`
  and retry on conflict.
- **Security:** the access code gates writes; keep the generator behind a
  members-only Wix page.
