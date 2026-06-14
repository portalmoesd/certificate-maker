/* app.js — browser UI for the Certificate Maker. Uses certgen.js for all PDF work. */
(function () {
  'use strict';

  var XLSX = window.XLSX;
  var PDFLib = window.PDFLib;
  var fontkit = window.fontkit;
  var qrcode = window.qrcode;
  var CertGen = window.CertGen;
  var BadgeGen = window.BadgeGen;

  // Registry endpoint (Wix Velo backend). It assigns the certificate numbers
  // server-side and stores each issued certificate, so numbering is automatic
  // and never collides across branches/computers. window.REGISTRY_URL can
  // override it (used by the test harness).
  var REGISTRY_URL = window.REGISTRY_URL || 'https://www.levels.ge/_functions/issue';

  var state = {
    mode: 'cert',      // 'cert' (certificates) | 'badge' (name badges)
    templateId: null,
    academy: null,     // badge mode: 'E' | 'A'
    rows: [],          // mapped rows
    rawRows: [],       // original sheet rows (for preview)
    fileName: '',
    pdfUrl: null
  };

  // simple in-memory caches so we don't re-fetch assets
  var templateCache = {};
  var fontBytesPromise = null;

  var el = {
    modes: document.getElementById('modes'),
    appTitle: document.getElementById('appTitle'),
    appSub: document.getElementById('appSub'),
    pickHeading: document.getElementById('pickHeading'),
    stepNumbering: document.getElementById('stepNumbering'),
    stepGenNo: document.getElementById('stepGenNo'),
    templates: document.getElementById('templates'),
    colsNote: document.getElementById('colsNote'),
    sampleLink: document.getElementById('sampleLink'),
    drop: document.getElementById('drop'),
    file: document.getElementById('file'),
    browseBtn: document.getElementById('browseBtn'),
    dropFile: document.getElementById('dropFile'),
    preview: document.getElementById('preview'),
    branch: document.getElementById('branch'),
    accessCode: document.getElementById('accessCode'),
    numPrev: document.getElementById('numPrev'),
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

  function loadBadgeTemplate(code) {
    var key = 'badge:' + code;
    if (templateCache[key]) return Promise.resolve(templateCache[key]);
    var file = BadgeGen.ACADEMIES[code].file;
    return fetchBytes('./badges/' + file).then(function (bytes) {
      templateCache[key] = bytes; return bytes;
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
          '<span class="lang">' + (t.lang === 'ka' ? 'Georgian · course only' : (t.variant === 'courseonly' ? 'Course only' : 'Course + Level + Hours')) + '</span>' +
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
    renderColumns();
    // re-map any already-loaded rows to this template's schema
    if (state.rawRows.length) mapAndPreview();
    renderNumbering();
    refreshButtons();
    // warm caches in the background
    loadTemplate(id).catch(function () {});
    loadFonts().catch(function () {});
  }

  // ---- mode (certificates / badges) ----------------------------------------

  function setMode(mode) {
    state.mode = mode;
    var badge = mode === 'badge';
    Array.prototype.forEach.call(el.modes.children, function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    el.appTitle.textContent = badge ? 'Badge Maker' : 'Certificate Maker';
    el.appSub.textContent = badge
      ? 'Upload an Excel file of names and ages, pick the academy, and generate name badges (8 per A4 sheet).'
      : 'Upload an Excel file, pick a template, and generate every certificate as one print-ready PDF.';
    el.pickHeading.textContent = badge ? 'Choose the academy' : 'Choose a template';
    el.stepNumbering.style.display = badge ? 'none' : '';
    el.stepGenNo.textContent = badge ? '3' : '4';
    el.generateBtn.textContent = badge ? 'Generate badges' : 'Generate certificates';
    document.title = (badge ? 'Levels Academy — Badge Maker' : 'Levels Academy — Certificate Maker');
    resetOutput();
    if (badge) { renderAcademies(); selectAcademy(state.academy || 'E'); }
    else { renderTemplates(); selectTemplate(state.templateId || '1'); }
  }

  function renderAcademies() {
    el.templates.innerHTML = '';
    Object.keys(BadgeGen.ACADEMIES).forEach(function (code) {
      var a = BadgeGen.ACADEMIES[code];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'tpl';
      card.dataset.id = code;
      card.innerHTML =
        '<div class="bar" style="background:' + a.accent + '"></div>' +
        '<div class="body">' +
          '<div class="name">' + a.label + '</div>' +
          '<div class="meta">' + a.accentName + ' accent</div>' +
          '<span class="lang">8 badges per A4 sheet</span>' +
        '</div>';
      card.addEventListener('click', function () { selectAcademy(code); });
      el.templates.appendChild(card);
    });
  }

  function selectAcademy(code) {
    state.academy = code;
    document.documentElement.style.setProperty('--accent', BadgeGen.ACADEMIES[code].accent);
    Array.prototype.forEach.call(el.templates.children, function (c) {
      c.classList.toggle('active', c.dataset.id === code);
    });
    renderColumns();
    if (state.rawRows.length) mapAndPreview();
    refreshButtons();
    loadBadgeTemplate(code).catch(function () {});
    loadFonts().catch(function () {});
  }

  // The active spreadsheet columns for the current mode/selection.
  function activeCols() {
    if (state.mode === 'badge') return BadgeGen.COLUMNS;
    return CertGen.COLUMNS[CertGen.TEMPLATES[state.templateId].variant];
  }

  // Whether a template/academy has been picked in the current mode.
  function picked() {
    return state.mode === 'badge' ? !!state.academy : !!state.templateId;
  }

  // --- certificate numbering (server-assigned) ------------------------------
  // The registry assigns the running sequence, so there is nothing to track on
  // the device. We only remember the branch and the staff access code locally.

  function safeStore(get) { try { return get(window.localStorage); } catch (e) { return null; } }

  // The distinct number prefixes a batch will use, e.g. ["LVE-2026"]. Usually one,
  // but a batch spanning two completion years would have two.
  function batchPrefixes() {
    if (!state.templateId || !state.rows.length) return [];
    var seen = {}, out = [];
    CertGen.certPrefixes(state.templateId, state.rows, el.branch.value).forEach(function (p) {
      if (!seen[p]) { seen[p] = true; out.push(p); }
    });
    return out;
  }

  // Show which prefix(es) the batch will use (the sequence comes from the registry).
  function renderNumbering() {
    if (!el.numPrev) return;
    var prefixes = batchPrefixes();
    if (!prefixes.length) { el.numPrev.innerHTML = ''; return; }
    el.numPrev.innerHTML = 'Numbers: <b>' + prefixes.map(function (p) { return p + '-####'; }).join(', ') +
      '</b> <span style="color:#777">(assigned automatically)</span>';
  }

  // Reserve numbers + store the batch in the registry. Resolves to
  // { numbers, tokens } in row order (numbers -> printed no.; tokens -> QR).
  function issueViaRegistry(rows, branch, code) {
    var prefixes = CertGen.certPrefixes(state.templateId, rows, branch);
    var groups = {}; // prefix -> array of original row indices
    prefixes.forEach(function (p, i) { (groups[p] = groups[p] || []).push(i); });

    var numbers = new Array(rows.length), tokens = new Array(rows.length);
    var pending = Object.keys(groups).map(function (prefix) {
      var idx = groups[prefix];
      var payload = {
        code: code, prefix: prefix,
        rows: idx.map(function (i) {
          var r = rows[i];
          return {
            firstName: r.firstName || '', lastName: r.lastName || '', course: r.course || '',
            level: r.level || '', hours: r.hours == null ? '' : String(r.hours),
            startDate: CertGen.toISO(r.startDate), endDate: CertGen.toISO(r.endDate),
            branch: branch, templateId: state.templateId
          };
        })
      };
      return fetch(REGISTRY_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error === 'wrong access code'
            ? 'Wrong access code.' : (data.error || ('registry error ' + res.status)));
          if (!data.numbers || data.numbers.length !== idx.length || !data.tokens || data.tokens.length !== idx.length) {
            throw new Error('Registry returned a bad response.');
          }
          idx.forEach(function (rowIndex, k) { numbers[rowIndex] = data.numbers[k]; tokens[rowIndex] = data.tokens[k]; });
        });
      });
    });
    return Promise.all(pending).then(function () { return { numbers: numbers, tokens: tokens }; });
  }

  function renderColumns() {
    var cols = activeCols();
    el.colsNote.innerHTML = '<span style="font-size:13px;color:#555;margin-right:4px">Expected columns:</span>';
    cols.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'col-chip';
      chip.textContent = c.label;
      el.colsNote.appendChild(chip);
    });
  }

  // ---- sample excel ---------------------------------------------------------

  function buildSampleWorkbook() {
    var badge = state.mode === 'badge';
    var sample = badge ? BadgeGen.sampleRows() : CertGen.sampleRows(state.templateId);
    var ws = XLSX.utils.aoa_to_sheet([sample.headers].concat(sample.rows));
    ws['!cols'] = sample.headers.map(function () { return { wch: 22 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, badge ? 'Badges' : 'Certificates');
    return wb;
  }

  function downloadSample(e) {
    e.preventDefault();
    if (!picked()) { setStatus('Pick ' + (state.mode === 'badge' ? 'an academy' : 'a template') + ' first.', 'err'); return; }
    var name = state.mode === 'badge'
      ? 'name-badges-sample.xlsx'
      : 'certificate-template-' + state.templateId + '-sample.xlsx';
    XLSX.writeFile(buildSampleWorkbook(), name);
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
    if (!picked()) { renderPreview(); refreshButtons(); return; }
    if (state.mode === 'badge') {
      state.rows = BadgeGen.mapRows(state.rawRows);
    } else {
      state.rows = CertGen.mapRows(state.rawRows, CertGen.TEMPLATES[state.templateId].variant);
      renderNumbering();
    }
    renderPreview();
    refreshButtons();
  }

  function renderPreview() {
    el.preview.innerHTML = '';
    if (!state.rawRows.length) return;
    if (!picked()) {
      el.preview.innerHTML = '<div class="warn">Choose ' + (state.mode === 'badge' ? 'an academy' : 'a template') +
        ' above to map these columns.</div>';
      return;
    }
    var badge = state.mode === 'badge';
    var cols = activeCols();
    var lang = badge ? 'ka' : (CertGen.TEMPLATES[state.templateId].lang || 'en');
    var noun = badge ? 'badge' : 'certificate';

    var count = document.createElement('div');
    count.className = 'count';
    count.textContent = state.rows.length + ' ' + noun + (state.rows.length === 1 ? '' : 's') + ' ready';
    el.preview.appendChild(count);

    var table = document.createElement('table');
    var thead = '<tr>' + cols.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr>';
    var limit = Math.min(state.rows.length, 8);
    var body = '';
    for (var i = 0; i < limit; i++) {
      var r = state.rows[i];
      body += '<tr>' + cols.map(function (c) {
        var v = r[c.key];
        if ((c.key === 'startDate' || c.key === 'endDate')) v = CertGen.formatDate(v, lang);
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
    el.generateBtn.disabled = !(picked() && state.rows.length > 0);
  }

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  // Show a freshly generated PDF in the preview frame + wire up download/print.
  function showPdf(bytes, filename) {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    state.pdfUrl = URL.createObjectURL(blob);
    el.frame.style.display = 'block';
    el.frame.src = state.pdfUrl;
    el.downloadBtn.href = state.pdfUrl;
    el.downloadBtn.download = filename;
    el.downloadBtn.classList.remove('disabled');
    el.printBtn.disabled = false;
  }

  function resetOutput() {
    if (state.pdfUrl) { URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null; }
    el.frame.style.display = 'none';
    el.frame.removeAttribute('src');
    el.downloadBtn.classList.add('disabled');
    el.downloadBtn.removeAttribute('href');
    el.printBtn.disabled = true;
    setStatus('');
  }

  function generateBadges() {
    if (!state.academy || !state.rows.length) return;
    el.generateBtn.disabled = true;
    setStatus('Generating ' + state.rows.length + ' badge(s)…');
    Promise.all([loadBadgeTemplate(state.academy), loadFonts()])
      .then(function (res) {
        return BadgeGen.generate({
          academy: state.academy,
          templateBytes: res[0],
          fontBytes: res[1],
          rows: state.rows,
          PDFLib: PDFLib,
          fontkit: fontkit
        });
      })
      .then(function (bytes) {
        showPdf(bytes, 'name-badges-' + state.academy + '.pdf');
        var sheets = Math.ceil(state.rows.length / BadgeGen.PER_SHEET);
        setStatus('Done — ' + state.rows.length + ' badge(s) on ' + sheets + ' sheet(s). Preview below.', 'ok');
      })
      .catch(function (err) { setStatus('Generation failed: ' + err.message, 'err'); })
      .finally(function () { el.generateBtn.disabled = false; });
  }

  function generate() {
    if (state.mode === 'badge') return generateBadges();
    if (!state.templateId || !state.rows.length) return;
    var code = (el.accessCode.value || '').trim();
    if (!code) { setStatus('Enter the staff access code first.', 'err'); el.accessCode.focus(); return; }

    el.generateBtn.disabled = true;
    setStatus('Assigning numbers from the registry…');

    var id = state.templateId, numbers;

    issueViaRegistry(state.rows, el.branch.value, code)
      .then(function (assigned) {
        numbers = assigned.numbers;
        setStatus('Generating ' + state.rows.length + ' certificate(s)…');
        return Promise.all([loadTemplate(id), loadFonts()]).then(function (res) { return [res, assigned]; });
      })
      .then(function (pair) {
        var res = pair[0], assigned = pair[1];
        return CertGen.generate({
          templateId: id,
          templateBytes: res[0],
          fontBytes: res[1],
          rows: state.rows,
          branch: el.branch.value,
          numbers: assigned.numbers,
          tokens: assigned.tokens,
          PDFLib: PDFLib,
          fontkit: fontkit,
          qrcode: qrcode
        });
      })
      .then(function (bytes) {
        showPdf(bytes, 'certificates-template-' + id + '.pdf');
        setStatus('Done — ' + state.rows.length + ' certificate(s) generated (' +
          numbers[0] + (numbers.length > 1 ? ' … ' + numbers[numbers.length - 1] : '') +
          '). Preview below.', 'ok');
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
    if (!XLSX || !PDFLib || !fontkit || !qrcode || !CertGen || !BadgeGen) {
      setStatus('Required libraries failed to load. Check the vendor/ files.', 'err');
      return;
    }
    // restore last-used branch + remembered access code
    var savedBranch = safeStore(function (s) { return s.getItem('certmaker:branch'); });
    if (savedBranch && CertGen.BRANCHES[savedBranch]) el.branch.value = savedBranch;
    var savedCode = safeStore(function (s) { return s.getItem('certmaker:code'); });
    if (savedCode) el.accessCode.value = savedCode;
    setMode('cert');

    Array.prototype.forEach.call(el.modes.children, function (b) {
      b.addEventListener('click', function () { if (state.mode !== b.dataset.mode) setMode(b.dataset.mode); });
    });
    el.browseBtn.addEventListener('click', function () { el.file.click(); });
    el.file.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
    el.sampleLink.addEventListener('click', downloadSample);
    el.branch.addEventListener('change', function () {
      safeStore(function (s) { s.setItem('certmaker:branch', el.branch.value); return true; });
      renderNumbering();
    });
    el.accessCode.addEventListener('change', function () {
      safeStore(function (s) { s.setItem('certmaker:code', el.accessCode.value.trim()); return true; });
    });
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
