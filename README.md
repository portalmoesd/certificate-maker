# Levels Academy — Certificate Maker

A small, **fully client-side** web app that turns an Excel spreadsheet into a
batch of finished certificates as a single print-ready PDF.

Workflow:

1. **Choose a template** (Template 1 – yellow English, Template 2 – blue English,
   Template 3 – coral Georgian).
2. **Upload an Excel file** (`.xlsx`/`.csv`) with one row per person.
3. The app fills each certificate, merges them into **one PDF**, shows a preview,
   and lets you **Print all** or **Download**.

Everything runs in the browser — no server, and **no data ever leaves the page**,
which is why it embeds cleanly in a Wix `iframe`.

---

## How it works

The original artwork (`certificate templates.pdf`) is split into three
single-page template PDFs. For each spreadsheet row the app:

- draws the original template (logo, seal, decorations, colours — pixel-perfect),
- covers the sample text baked into the template with white boxes,
- writes the new values at calibrated positions using embedded fonts
  (**Red Hat Display** for English, **Noto Sans Georgian** for Georgian — close
  free substitutes for the originals' Red Hat Display / BPG / LGV fonts).

Long names/courses auto-shrink to stay inside their column.

## Spreadsheet columns

Headers are matched case- and spacing-insensitively. Download a ready-made
sample from inside the app, or from `app/samples/`.

**Templates 1 & 2 (English)**

| First Name | Last Name | Course | Level | Start Date | End Date |
|---|---|---|---|---|---|
| Elizaveta | Datukishvili | General English | Intermediate | 2026-01-16 | 2026-06-16 |

**Template 3 (Georgian)**

| First Name | Last Name | Course Line | Start Date | End Date |
|---|---|---|---|---|
| ელიზავეტა | დათუკიშვილს | ხატვის კურსის წარმატებით დასრულებისთვის | 2026-01-16 | 2026-06-16 |

Notes:
- **Dates** may be real Excel dates or text. Real dates are formatted
  automatically (`16 JANUARY 2026` / `16 იანვარი 2026`); text is used as typed.
- English names/courses are shown in UPPERCASE automatically (matching the design).
- A single `Name` column also works — it's split into first/last on the space.

## Project layout

```
app/                     ← the deployable site (this whole folder is static)
  index.html
  css/style.css
  js/app.js              ← browser UI
  js/certgen.js          ← core generator (shared with the Node tests)
  vendor/                ← pdf-lib, fontkit, SheetJS (bundled, no CDN needed)
  fonts/                 ← Red Hat Display + Noto Sans Georgian (.ttf)
  templates/             ← template1.pdf, template2.pdf, template3.pdf
  samples/               ← downloadable example spreadsheets
tools/                   ← dev/test only, NOT needed for deployment
  test-render.js         ← headless render of sample certificates
  e2e.js                 ← drives the real UI in headless Chromium
  mk-samples.js          ← regenerates the sample spreadsheets
certificate templates.pdf← original source artwork
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
