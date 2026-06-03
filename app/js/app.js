/* app.js — browser UI for the Certificate Maker. Uses certgen.js for all PDF work. */
(function () {
  'use strict';

  var XLSX = window.XLSX;
  var PDFLib = window.PDFLib;
  var fontkit = window.fontkit;
  var CertGen = window.CertGen;

  var state = {
    templateId: null,
    rows: [],          // mapped rows
    rawRows: [],       // original sheet rows (for preview)
    fileName: '',
    pdfUrl: null
  };

  // simple in-memory caches so we don't re-fetch assets
  var templateCache = {};
  var fontBytesPromise = null;
  var signaturePromise = null;

  var el = {
    templates: document.getElementById('templates'),
    colsNote: document.getElementById('colsNote'),
    sampleLink: document.getElementById('sampleLink'),
    drop: document.getElementById('drop'),
    file: document.getElementById('file'),
    browseBtn: document.getElementById('browseBtn'),
    dropFile: document.getElementById('dropFile'),
    preview: document.getElementById('preview'),
    generateBtn: document.getElementById('generateBtn'),
    printBtn: document.getElementById('printBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    status: document.getElementById('status'),
    frame: document.getElementById('pdfFrame'),
    footnote: document.getElementById('footnote')
  };

  // ---- asset loading --------------------------------------------------------

  function fetchBytes(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
      return r.arrayBuffer();
    }).then(function (b) { return new Uint8Array(b); });
  }

  function loadTemplate(id) {
    if (templateCache[id]) return Promise.resolve(templateCache[id]);
    var file = CertGen.TEMPLATES[id].file;
    return fetchBytes('./templates/' + file).then(function (bytes) {
      templateCache[id] = bytes; return bytes;
    });
  }

  function loadFonts() {
    if (fontBytesPromise) return fontBytesPromise;
    fontBytesPromise = Promise.all(CertGen.FONT_KEYS.map(function (k) {
      return fetchBytes('./fonts/' + CertGen.FONT_FILES[k]).then(function (b) { return [k, b]; });
    })).then(function (pairs) {
      var out = {};
      pairs.forEach(function (p) { out[p[0]] = p[1]; });
      return out;
    });
    return fontBytesPromise;
  }

  // The principal's signature is optional — if it's missing, certificates are
  // still generated (just without it).
  function loadSignature() {
    if (signaturePromise) return signaturePromise;
    signaturePromise = fetchBytes('./signature.png').catch(function () { return null; });
    return signaturePromise;
  }

  // ---- UI: templates --------------------------------------------------------

  function renderTemplates() {
    var ids = Object.keys(CertGen.TEMPLATES);
    el.templates.innerHTML = '';
    ids.forEach(function (id) {
      var t = CertGen.TEMPLATES[id];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'tpl';
      card.dataset.id = id;
      card.innerHTML =
        '<div class="bar" style="background:' + t.accent + '"></div>' +
        '<div class="body">' +
          '<div class="name">' + t.label + '</div>' +
          '<div class="meta">' + t.accentName + ' accent</div>' +
          '<span class="lang">' + (t.variant === 'nolevel' ? 'No level field' : 'Course + Level') + '</span>' +
        '</div>';
      card.addEventListener('click', function () { selectTemplate(id); });
      el.templates.appendChild(card);
    });
  }

  function selectTemplate(id) {
    state.templateId = id;
    document.documentElement.style.setProperty('--accent', CertGen.TEMPLATES[id].accent);
    Array.prototype.forEach.call(el.templates.children, function (c) {
      c.classList.toggle('active', c.dataset.id === id);
    });
    renderColumns(id);
    // re-map any already-loaded rows to this template's schema
    if (state.rawRows.length) mapAndPreview();
    refreshButtons();
    // warm caches in the background
    loadTemplate(id).catch(function () {});
    loadFonts().catch(function () {});
    loadSignature();
  }

  function renderColumns(id) {
    var variant = CertGen.TEMPLATES[id].variant;
    var cols = CertGen.COLUMNS[variant];
    el.colsNote.innerHTML = '<span style="font-size:13px;color:#555;margin-right:4px">Expected columns:</span>';
    cols.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'col-chip';
      chip.textContent = c.label;
      el.colsNote.appendChild(chip);
    });
  }

  // ---- sample excel ---------------------------------------------------------

  function buildSampleWorkbook(variant) {
    var cols = CertGen.COLUMNS[variant];
    var header = cols.map(function (c) { return c.label; });
    var alt = { firstName: 'GIORGI', lastName: 'BERIDZE', course: 'General English', level: 'Beginner', startDate: '2026-02-01', endDate: '2026-07-01' };
    var rows = [
      header,
      cols.map(function (c) { return c.sample; }),
      cols.map(function (c) { return alt[c.key]; })
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(function () { return { wch: 22 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Certificates');
    return wb;
  }

  function downloadSample(e) {
    e.preventDefault();
    if (!state.templateId) { setStatus('Pick a template first.', 'err'); return; }
    var variant = CertGen.TEMPLATES[state.templateId].variant;
    XLSX.writeFile(buildSampleWorkbook(variant), 'certificate-template-' + state.templateId + '-sample.xlsx');
  }

  // ---- file handling --------------------------------------------------------

  function handleFile(file) {
    if (!file) return;
    state.fileName = file.name;
    el.dropFile.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        state.rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        if (!state.rawRows.length) { setStatus('That sheet has no data rows.', 'err'); }
        else { setStatus(''); }
        mapAndPreview();
      } catch (err) {
        setStatus('Could not read that file: ' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function mapAndPreview() {
    if (!state.templateId) { renderPreview(); refreshButtons(); return; }
    var variant = CertGen.TEMPLATES[state.templateId].variant;
    state.rows = CertGen.mapRows(state.rawRows, variant);
    renderPreview();
    refreshButtons();
  }

  function renderPreview() {
    el.preview.innerHTML = '';
    if (!state.rawRows.length) return;
    if (!state.templateId) {
      el.preview.innerHTML = '<div class="warn">Choose a template above to map these columns.</div>';
      return;
    }
    var cols = CertGen.COLUMNS[CertGen.TEMPLATES[state.templateId].variant];

    var count = document.createElement('div');
    count.className = 'count';
    count.textContent = state.rows.length + ' certificate' + (state.rows.length === 1 ? '' : 's') + ' ready';
    el.preview.appendChild(count);

    var table = document.createElement('table');
    var thead = '<tr>' + cols.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr>';
    var limit = Math.min(state.rows.length, 8);
    var body = '';
    for (var i = 0; i < limit; i++) {
      var r = state.rows[i];
      body += '<tr>' + cols.map(function (c) {
        var v = r[c.key];
        if ((c.key === 'startDate' || c.key === 'endDate')) v = CertGen.formatDate(v);
        return '<td>' + escapeHtml(v == null ? '' : String(v)) + '</td>';
      }).join('') + '</tr>';
    }
    table.innerHTML = '<thead>' + thead + '</thead><tbody>' + body + '</tbody>';
    el.preview.appendChild(table);
    if (state.rows.length > limit) {
      var more = document.createElement('div');
      more.className = 'more';
      more.textContent = '… and ' + (state.rows.length - limit) + ' more';
      el.preview.appendChild(more);
    }

    // basic validation: warn about empty required-ish fields (name)
    var missing = state.rows.filter(function (r) { return !String(r.firstName || '').trim() && !String(r.lastName || '').trim(); }).length;
    if (missing) {
      var w = document.createElement('div');
      w.className = 'warn';
      w.textContent = missing + ' row(s) have no name — check that your column headers match the expected columns.';
      el.preview.appendChild(w);
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- generate -------------------------------------------------------------

  function refreshButtons() {
    var ready = !!state.templateId && state.rows.length > 0;
    el.generateBtn.disabled = !ready;
  }

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function generate() {
    if (!state.templateId || !state.rows.length) return;
    el.generateBtn.disabled = true;
    setStatus('Generating ' + state.rows.length + ' certificate(s)…');

    var id = state.templateId;

    Promise.all([loadTemplate(id), loadFonts(), loadSignature()])
      .then(function (res) {
        return CertGen.generate({
          templateId: id,
          templateBytes: res[0],
          fontBytes: res[1],
          signatureBytes: res[2],
          rows: state.rows,
          PDFLib: PDFLib,
          fontkit: fontkit
        });
      })
      .then(function (bytes) {
        if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
        var blob = new Blob([bytes], { type: 'application/pdf' });
        state.pdfUrl = URL.createObjectURL(blob);
        el.frame.style.display = 'block';
        el.frame.src = state.pdfUrl;
        el.downloadBtn.href = state.pdfUrl;
        el.downloadBtn.download = 'certificates-template-' + id + '.pdf';
        el.downloadBtn.classList.remove('disabled');
        el.printBtn.disabled = false;
        setStatus('Done — ' + state.rows.length + ' certificate(s) generated. Preview below.', 'ok');
      })
      .catch(function (err) {
        setStatus('Generation failed: ' + err.message, 'err');
      })
      .finally(function () { el.generateBtn.disabled = false; });
  }

  function printAll() {
    if (!state.pdfUrl) return;
    var f = el.frame;
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch (e) {
      // Some sandboxes block cross-frame print; open in a new tab instead.
      window.open(state.pdfUrl, '_blank');
    }
  }

  // ---- wire up --------------------------------------------------------------

  function init() {
    if (!XLSX || !PDFLib || !fontkit || !CertGen) {
      setStatus('Required libraries failed to load. Check the vendor/ files.', 'err');
      return;
    }
    renderTemplates();
    selectTemplate('1');

    el.browseBtn.addEventListener('click', function () { el.file.click(); });
    el.file.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
    el.sampleLink.addEventListener('click', downloadSample);
    el.generateBtn.addEventListener('click', generate);
    el.printBtn.addEventListener('click', printAll);

    ['dragenter', 'dragover'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('drag'); });
    });
    el.drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    el.drop.addEventListener('click', function (e) {
      if (e.target === el.drop || e.target.classList.contains('drop-inner')) el.file.click();
    });

    el.footnote.textContent = 'Runs entirely in your browser — no data leaves this page.';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
