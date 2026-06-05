# Wix Velo backend — registry & automatic numbering

The certificate **sequence number is assigned server-side** by a small Wix Velo
backend, so numbering is automatic and never collides across branches/computers.
Each issued certificate is stored in a Wix Data collection (`Certificates`),
which the verify page will also read later.

This folder is the version-controlled copy of that backend. Wix can't be deployed
to from this repo — you paste the code into the Wix Editor and Publish.

## One-time setup

1. **Turn on Dev Mode (Velo)** in the Wix Editor (top menu *Dev Mode → Turn on*).

2. **Create a data collection** named `Certificates` (permissions: Admin only).
   Fields (Field ID must match exactly):

   | Field name | Field ID | Type |
   |---|---|---|
   | Certificate Number | `certNumber` | Text |
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

## Endpoint

```
POST https://www.levels.ge/_functions/issue
Content-Type: text/plain           # plain text avoids a CORS pre-flight
body: {"code":"<access code>","prefix":"LVE-2026","rows":[{...}]}
->   {"numbers":["LVE-2026-0032","LVE-2026-0033"]}
```

The generator (`app/js/app.js`, constant `REGISTRY_URL`) calls this on **Generate**,
then stamps the returned numbers onto the PDFs.

### Quick health checks (no access code needed)

```bash
# alive? a POST with junk should return 400 "bad json"
curl -X POST --data 'x' https://www.levels.ge/_functions/issue
# secret wired? a wrong code should return 403 "wrong access code"
curl -X POST -H 'Content-Type: text/plain' \
  --data '{"code":"x","prefix":"LVE-2026","rows":[{}]}' \
  https://www.levels.ge/_functions/issue
```

## Notes

- **Concurrency:** numbers are assigned from `max(existing)+1`. For this volume
  that's safe; if two people ever click Generate in the same second a duplicate is
  theoretically possible. If that ever matters, add a unique index on `certNumber`
  and retry on conflict.
- **Security:** the access code gates writes. The generator should also sit behind
  a members-only Wix page. The public verify page will only *read* this collection
  (through its own read-only endpoint, added with the verify work).
