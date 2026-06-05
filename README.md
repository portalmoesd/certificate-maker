# Levels Academy — Certificate Maker

A small, **fully client-side** web app that turns an Excel spreadsheet into a
batch of finished certificates as a single print-ready PDF.

Workflow:

1. **Choose a template** (Template 1 – yellow English, Template 2 – blue English,
   Template 3 – red Art, Template 4 – Georgian Art). The two Art templates show
   the **course only** — no LEVEL or HOURS fields. Template 4 is fully Georgian
   (Georgian fonts, labels and month names).
2. **Upload an Excel file** (`.xlsx`/`.csv`) with one row per person.
3. **Set the certificate numbering** — branch (Vake/Krtsanisi) and the starting
   sequence number.
4. The app fills each certificate, merges them into **one PDF**, shows a preview,
   and lets you **Print all** or **Download**.

Everything runs in the browser — no server, and **no data ever leaves the page**,
which is why it embeds cleanly in a Wix `iframe`.

---

## How it works

The original artwork (`certificate templates(3).pdf`) is split into four
single-page template PDFs which are then **cleaned** of their sample values by
`tools/clean-templates.py` (text-only redaction — the watermark and all graphics
are kept). For each spreadsheet row the app:

- draws the clean template (logo, Cambridge badge, seal, watermark, signature),
- writes the new values at calibrated positions using embedded fonts,
- builds the certificate number and stamps a matching QR verification code.

Because the templates are pre-cleaned, the values sit directly on the artwork and
the **watermark shows through** (no opaque boxes). Long names/courses auto-shrink
to stay inside their column. The principal signature is part of the artwork.

### Preparing a new template

Whenever the source artwork changes, re-run:

```bash
pdfseparate "certificate templates(3).pdf" app/templates/template-%d.pdf
mv app/templates/template-1.pdf app/templates/template1.pdf   # 2, 3, 4 likewise
python3 tools/clean-templates.py     # strips sample values, keeps the watermark
```

If field positions move, update the rects in `clean-templates.py` and the
`LAYOUT` in `app/js/certgen.js` (both are calibrated to the artwork).

### Fonts

Embedded in `app/fonts/`:

| Field | Font file |
|---|---|
| Name (English) | `RedHatDisplay-Medium.ttf` |
| Course / Level / Hours / Period (English) | `calibri-bold.ttf` (Calibri Bold) |
| Certificate number (all) | `calibril.ttf` (Calibri Light) |
| Name (Georgian) | `archyedt-bold-60540591796.otf` (Archy EDT Bold, +50 tracking) |
| Course / Period (Georgian) | `bpg_le_studio_02_caps-7834001055.ttf` (BPG LE Studio 02 Caps) |

The Georgian BPG face ships no bold cut, so its values are drawn faux-bold (a
few sub-pixel offset passes ≈ a 0.5pt stroke) to match the artwork.

Sizes and baselines are calibrated against the original artwork in
`app/js/certgen.js` (`LAYOUT`).

### Certificate number & QR code

Each certificate gets a number `L<branch><subject>-<year>-<seq>`, e.g.
`LVE-2026-0032`:

- **L** — Levels (always).
- **branch** — `V` Vake / `K` Krtsanisi — chosen once per batch in the UI.
- **subject** — `E` English / `A` Art — fixed by the template (yellow & blue = E,
  red = A).
- **year** — the completion year, taken from the End Date (falls back to Start Date).
- **seq** — a 4-digit running number starting from the value you set, incrementing
  down the spreadsheet.

The QR code (bottom-right) encodes `https://levels.ge/verify/<number>` and is
regenerated per certificate (library: `app/vendor/qrcode.min.js`).

**Running count is remembered.** After a batch, the next sequence number is saved
in the browser's `localStorage`, keyed by the number prefix (e.g. `LVE-2026`), and
the Start number field pre-fills from it — so each batch continues where the last
one ended. Because the prefix contains the year, **a new year automatically starts
a fresh sequence** (e.g. `LVE-2027-0001`). The memory is per-device/browser; it
resets if you clear site data or use a different computer.

## Spreadsheet columns

Headers are matched case- and spacing-insensitively. Download a ready-made
sample from inside the app, or from `app/samples/`.

**Templates 1 & 2 (yellow, blue — English)**

| First Name | Last Name | Course | Level | Hours | Start Date | End Date |
|---|---|---|---|---|---|---|
| Elizaveta | Datukishvili | General English | Intermediate | 48 | 16.01.2026 | 16.06.2026 |

**Template 3 (red — Art, course only — no level or hours)**

| First Name | Last Name | Course | Start Date | End Date |
|---|---|---|---|---|
| Elizaveta | Datukishvili | Drawing & Painting | 16.01.2026 | 16.06.2026 |

**Template 4 (Georgian — Art, course only)** — enter the values in Georgian:

| First Name | Last Name | Course | Start Date | End Date |
|---|---|---|---|---|
| ელიზავეტა | დათუკიშვილი | ხატვის ინტენსიური კურსი | 16.01.2026 | 16.06.2026 |

Notes:
- **Dates** are entered as **`DD.MM.YYYY`** (e.g. `16.01.2026`). They render as
  `16 JANUARY 2026` on the English templates and `16 იანვარი 2026` on the
  Georgian one. Real Excel date cells and `YYYY-MM-DD` text are also accepted.
- On the English templates names/courses are shown in UPPERCASE automatically;
  the Georgian font is caps-style by design, so its text is used as typed.
- A single `Name` column also works — it's split into first/last on the space.
- The certificate number is **not** a spreadsheet column — it's generated (see above).

## Project layout

```
app/                     ← the deployable site (this whole folder is static)
  index.html
  css/style.css
  js/app.js              ← browser UI
  js/certgen.js          ← core generator (shared with the Node tests)
  vendor/                ← pdf-lib, fontkit, SheetJS, qrcode (bundled, no CDN needed)
  fonts/                 ← Red Hat Display Medium + Calibri Light/Bold (.ttf)
  templates/             ← template1.pdf, template2.pdf, template3.pdf
  samples/               ← downloadable example spreadsheets
tools/                   ← dev/test only, NOT needed for deployment
  clean-templates.py     ← strips sample values from templates (keeps watermark)
  test-render.js         ← headless render of sample certificates
  e2e.js                 ← drives the real UI in headless Chromium
  mk-samples.js          ← regenerates the sample spreadsheets
certificate templates(2).pdf ← original source artwork
```

## Run locally

It's static, so any web server works (don't open via `file://` — `fetch` of the
templates/fonts needs http):

```bash
cd app
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy on Wix (iframe)

Wix can't host arbitrary files, so host the `app/` folder somewhere static and
embed it. **GitHub Pages** is free and easy:

1. Push this repo to GitHub.
2. Repo **Settings → Pages** → *Deploy from a branch*. Pick your branch and set
   the folder to **`/app`** (or move the contents of `app/` to the site root).
   Save. Your site appears at `https://<user>.github.io/<repo>/`.
3. Confirm it loads at that URL (you should see the Certificate Maker).
4. In the **Wix Editor**: **Add → Embed Code → Embed a Site (iframe)** (a.k.a.
   the "Embed a Site" / HTML iframe widget).
5. Paste your GitHub Pages URL, set the widget height generously (≈ 1200 px so
   the PDF preview fits), and publish.

Alternatives to GitHub Pages: Netlify, Cloudflare Pages, or any static host —
just point the Wix iframe at the URL.

> Tip: in the embedded iframe, "Print all" prints the preview. If a browser's
> sandbox blocks in-iframe printing, the app falls back to opening the PDF in a
> new tab where you can print it.

## Dev tests

```bash
node tools/test-render.js   # writes tools/out/test-{1,2,3}.pdf
node tools/e2e.js           # runs the real UI in headless Chromium
node tools/mk-samples.js    # regenerate app/samples/*.xlsx
```
