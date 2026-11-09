// Tutte le frequenze · consultazione dell'archivio radio VHF/UHF
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const CAT_ICONS = {
    "Forze dell'ordine": 'fa-shield-halved',
    'Soccorso ed emergenza': 'fa-truck-medical',
    'Viabilità e trasporti': 'fa-road',
    'Aeronautica e marina': 'fa-plane',
    'Servizi e aziende': 'fa-industry',
    'Civili, satelliti e TV': 'fa-satellite-dish'
  };
  // sigle da tenere maiuscole quando un testo TUTTO MAIUSCOLO viene reso leggibile
  const ACRONYMS = ['MHz', 'VHF', 'UHF', 'VV.FF', 'CRI', 'ANAS', 'A.N.A.S.', 'ENEL', 'RAI', 'SNAM', 'AGIP', 'LPD', 'V.O.R.', 'VOR',
    'NATO', 'S.A.R.', 'F.I.S.', 'VOLMET', 'CAI', 'A.I.B.', 'UHF-VHF', 'VHF-UHF', 'F.S.', 'G.d.F', 'T/B/T', 'UTC', 'FM', 'TV', 'COMPAMARE', 'CIRCOMARE', 'LOCAMARE', 'CTCSS', 'PS', 'CC'];

  const state = { modules: [], cache: new Map(), current: null, scope: 'section', q: '' };

  // logger condiviso (mf-log.js); se manca, i log vengono ignorati
  const noop = () => {};
  const log = window.MFLog || { debug: noop, info: noop, warn: noop, error: noop, time: () => noop };

  /* ---------------- Utilità ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/,/g, '.');

  function readable(text) {
    const t = String(text).trim();
    const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length < 4 || letters !== letters.toUpperCase()) return t;
    let out = t.toLowerCase().replace(/(^|[.:!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    ACRONYMS.forEach(a => {
      const re = new RegExp('(^|[^\\p{L}])' + a.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?=$|[^\\p{L}])', 'giu');
      out = out.replace(re, (m, p) => p + a);
    });
    return out;
  }

  const humanKey = k => k.replace(/_/g, ' ').replace(/\bcc\b/g, 'CC').replace(/\bgdf\b/g, 'GdF').replace(/\buhf\b/g, 'UHF')
    .replace(/\baib\b/g, 'AIB').replace(/^./, c => c.toUpperCase());

  // evidenzia le frequenze (>= 26 MHz) come badge copiabili ed eventualmente la ricerca
  const FREQ_RE = /(^|[^\d.,])(\d{2,4}(?:[.,]\d{1,4}){1,2})(?![\d])/g;
  function fmtCell(text, q) {
    let html = esc(readable(text));
    html = html.replace(FREQ_RE, (m, pre, f) => {
      const v = parseFloat(f.replace(',', '.'));
      if (!(v >= 26 && v <= 3000)) return m;
      return pre + '<span class="mf-freq" data-f="' + f + '" title="Clic per copiare">' + f + '</span>';
    });
    if (q) {
      const words = q.split(/\s+/).filter(w => w.length > 1);
      words.forEach(w => {
        const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'gi');
        html = html.replace(re, '<mark>$1</mark>');
      });
    }
    return html;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1600);
  }

  async function loadModule(m) {
    if (!state.cache.has(m.id)) {
      const end = log.time('dati', 'Caricamento ' + m.file);
      state.cache.set(m.id, fetch(m.file).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' su ' + m.file);
        return r.json();
      }).then(data => {
        end({ sezione: m.id, chiavi: Object.keys(data) });
        return data;
      }).catch(err => {
        // non tenere in cache un errore: al prossimo clic si riprova
        state.cache.delete(m.id);
        log.error('dati', 'Sezione ' + m.id + ' non caricata: ' + err.message);
        throw err;
      }));
    } else {
      log.debug('dati', 'Sezione ' + m.id + ' già in memoria');
    }
    return state.cache.get(m.id);
  }

  /* ---------------- Normalizzazione in tabelle ---------------- */
  // Ogni modulo diventa una lista di "parti": note, tabelle e schede informative
  function toParts(data) {
    const parts = [];
    if (data.dati_provinciali && data.dati_provinciali.length) {
      const rows = [];
      data.dati_provinciali.forEach(p => p.localita.forEach((l, i) => {
        rows.push([i === 0 ? p.provincia : '', l.nome, (l.frequenze || []).join('  '), l.note || '']);
      }));
      parts.push({ type: 'table', title: 'Province e presidi', icon: 'fa-location-dot', cols: ['Provincia', 'Località / presidio', 'Frequenze (MHz)', 'Note'], rows });
    }
    Object.keys(data).forEach(k => {
      const v = data[k];
      if (['dati_provinciali', 'blocchi', 'blocchi_pdf'].includes(k)) return;
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const cols = Object.keys(v[0]);
        parts.push({ type: 'table', title: humanKey(k), icon: 'fa-tower-cell', cols: cols.map(humanKey), rows: v.map(o => cols.map(c => o[c] ?? '')) });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        parts.push({ type: 'info', title: humanKey(k), entries: Object.entries(v).map(([a, b]) => [humanKey(a), b]) });
      }
    });
    if (data.blocchi) parts.push(...blocksToParts(data.blocchi, true));
    if (data.blocchi_pdf) {
      parts.push({ type: 'heading', title: 'Elenco completo dal PDF', icon: 'fa-file-pdf', note: data.blocchi_pdf.fonte });
      parts.push(...blocksToParts(data.blocchi_pdf.blocchi, false));
    }
    return parts;
  }

  function blocksToParts(blocks, skipTitle) {
    const parts = [];
    let notes = [];
    const flush = () => { if (notes.length) parts.push({ type: 'notes', lines: notes }); notes = []; };
    blocks.forEach((b, i) => {
      if (b.nota !== undefined) {
        if (!(skipTitle && i === 0)) notes.push(b.nota);
        return;
      }
      flush();
      const width = Math.max(b.colonne.length, ...b.righe.filter(Array.isArray).map(r => r.length));
      const cols = b.colonne.length ? b.colonne.map(c => readable(c).replace(/^./, x => x.toUpperCase())) : [];
      while (cols.length && cols.length < width) cols.push('');
      parts.push({ type: 'table', cols, rows: b.righe.map(r => Array.isArray(r) ? r : { g: r.g }), width });
    });
    flush();
    return parts;
  }

  /* ---------------- Render ---------------- */
  function renderTable(part, q, filter) {
    const width = part.width || part.cols.length;
    const groups = [];
    part.rows.forEach(r => {
      if (!Array.isArray(r)) { groups.push({ sub: r.g, rows: [] }); return; }
      if (r[0] === '' && groups.length && !groups[groups.length - 1].sub) groups[groups.length - 1].rows.push(r);
      else groups.push({ rows: [r] });
    });
    let shown = 0, html = '';
    groups.forEach(g => {
      if (g.sub) { html += '<tbody><tr class="subhead"><td colspan="' + width + '">' + esc(readable(g.sub)) + '</td></tr></tbody>'; return; }
      if (filter && !g.rows.some(r => norm(r.join(' ')).includes(filter))) return;
      shown += g.rows.length;
      html += '<tbody class="grp">' + g.rows.map((r, i) => {
        const cells = [];
        for (let c = 0; c < width; c++) {
          const isDep = part.cols[c] === 'Località dipendenti';
          cells.push('<td class="' + (c === 0 ? 'first' : '') + (isDep ? ' dep' : '') + '">' + fmtCell(r[c] ?? '', q) + '</td>');
        }
        return '<tr class="' + (i ? 'cont' : '') + '">' + cells.join('') + '</tr>';
      }).join('') + '</tbody>';
    });
    if (filter && !shown) return { html: '', shown: 0 };
    const head = part.cols.some(Boolean) ? '<thead><tr>' + part.cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>' : '';
    const title = part.title ? '<h3 class="block-title"><i class="fa-solid ' + part.icon + '"></i>' + esc(part.title) + '<span class="count">' + shown + ' righe</span></h3>' : '';
    return { html: '<div class="block">' + title + '<div class="mf-table-wrap"><table class="mf-table">' + head + html + '</table></div></div>', shown };
  }

  function renderParts(parts, q) {
    const filter = q ? norm(q) : '';
    let total = 0;
    const html = parts.map(p => {
      if (p.type === 'notes') return filter ? '' : '<div class="notes">' + p.lines.map((l, i) => '<p class="' + (i === 0 ? 'strong' : '') + '">' + fmtCell(l) + '</p>').join('') + '</div>';
      if (p.type === 'heading') return '<h3 class="block-title"><i class="fa-solid ' + p.icon + '"></i>' + esc(p.title) + '<span class="count">' + esc(p.note) + '</span></h3>';
      if (p.type === 'info') {
        if (filter) return '';
        return '<div class="info-grid"><div class="mf-card"><h2><i class="fa-solid fa-circle-info"></i>' + esc(p.title) + '</h2><dl>' +
          p.entries.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + fmtCell(v) + '</dd>').join('') + '</dl></div></div>';
      }
      const r = renderTable(p, q, filter);
      total += r.shown;
      return r.html;
    }).join('');
    return { html, total };
  }

  function sectionHead(m, data) {
    const facts = [];
    if (data.banda_principale) facts.push('<span class="mf-pill"><i class="fa-solid fa-wave-square"></i> Banda ' + esc(data.banda_principale) + '</span>');
    if (data.link_master_uhf) facts.push('<span class="mf-pill"><i class="fa-solid fa-link"></i> Link UHF ' + esc(data.link_master_uhf) + '</span>');
    if (data.ultimo_aggiornamento) facts.push('<span class="mf-pill"><i class="fa-regular fa-calendar"></i> Agg. ' + esc(data.ultimo_aggiornamento) + '</span>');
    const fonte = data.fonte || (data.blocchi_pdf && data.blocchi_pdf.fonte);
    if (fonte) facts.push('<span class="mf-pill"><i class="fa-solid fa-file-pdf"></i> ' + esc(fonte) + '</span>');
    return '<header class="sec-head"><div class="crumb">' + esc(m.categoria) + '</div>' +
      '<h2><span class="ic"><i class="fa-solid ' + m.icon + '"></i></span>' + esc(m.label) + '</h2>' +
      (data.sezione && data.sezione !== m.label ? '<p class="sub">' + esc(data.sezione) + '</p>' : '') +
      '<div class="facts">' + facts.join('') + '</div></header>';
  }

  async function showSection(id) {
    const m = state.modules.find(x => x.id === id) || state.modules[0];
    if (id && m.id !== id) log.warn('sezioni', 'Sezione "' + id + '" inesistente, apro ' + m.id);
    log.info('sezioni', 'Apro ' + m.label + (state.q ? ' (filtro: "' + state.q + '")' : ''));
    state.current = m;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.id === m.id));
    closeDrawer();
    if (state.scope === 'all' && state.q) { renderGlobal(); return; }
    const view = $('#view');
    view.innerHTML = '<div class="empty"><span class="mf-spinner lg"></span></div>';
    try {
      const data = await loadModule(m);
      if (state.current !== m) { log.debug('sezioni', m.id + ' caricata ma nel frattempo è stata aperta un\'altra sezione'); return; }
      if (!m.parts) {
        const endParse = log.time('sezioni', 'Preparazione tabelle di ' + m.id);
        m.parts = toParts(data);
        endParse({ parti: m.parts.length, tabelle: m.parts.filter(p => p.type === 'table').length });
      }
      const t0 = performance.now();
      const r = renderParts(m.parts, state.q);
      log.debug('sezioni', 'Render ' + m.id + ': ' + r.total + ' righe in ' + Math.round(performance.now() - t0) + ' ms');
      view.innerHTML = sectionHead(m, data) + (r.html || empty('Nessun risultato in questa sezione', 'Prova a cercare "Ovunque".'));
      $('#searchInfo').textContent = state.q ? r.total + ' righe trovate in ' + m.label : '';
      document.title = m.label + ' · Tutte le frequenze';
    } catch (e) {
      log.error('sezioni', 'Errore mostrando ' + m.id + ': ' + e.message, e.stack);
      view.innerHTML = '<div class="mf-alert err"><i class="fa-solid fa-triangle-exclamation"></i> Impossibile caricare ' + esc(m.file) + '. Riprova tra poco o ricarica la pagina.</div>';
    }
  }

  async function renderGlobal() {
    const q = state.q;
    const view = $('#view');
    view.innerHTML = '<div class="empty"><span class="mf-spinner lg"></span><p>Cerco in tutte le sezioni…</p></div>';
    const endSearch = log.time('ricerca', 'Ricerca globale "' + q + '"');
    const failed = [];
    await Promise.all(state.modules.map(m => loadModule(m).then(d => { if (!m.parts) m.parts = toParts(d); }).catch(() => failed.push(m.id))));
    if (failed.length) log.warn('ricerca', failed.length + ' sezioni escluse dalla ricerca perché non caricate', failed);
    if (q !== state.q || state.scope !== 'all') { log.debug('ricerca', 'Ricerca "' + q + '" superata da una più recente'); return; }
    let total = 0, sections = 0;
    const html = state.modules.map(m => {
      if (!m.parts) return '';
      const r = renderParts(m.parts.filter(p => p.type === 'table'), q);
      if (!r.total) return '';
      total += r.total; sections++;
      return '<section class="result-group"><h3><i class="fa-solid ' + m.icon + '"></i>' + esc(m.label) +
        '<button class="mf-btn mf-btn-sm" data-goto="' + m.id + '">Apri sezione <i class="fa-solid fa-arrow-right"></i></button></h3>' + r.html + '</section>';
    }).join('');
    $('#searchInfo').textContent = total + ' righe trovate in ' + sections + ' sezioni';
    endSearch({ righe: total, sezioni: sections });
    view.innerHTML = '<header class="sec-head"><div class="crumb">ricerca globale</div><h2><span class="ic"><i class="fa-solid fa-globe"></i></span>«' + esc(q) + '»</h2></header>' +
      (html || empty('Nessun risultato', 'Controlla l\'ortografia o cerca solo una parte della frequenza.'));
  }

  const empty = (t, s) => '<div class="empty"><i class="fa-regular fa-face-meh"></i><strong>' + esc(t) + '</strong><p>' + esc(s) + '</p></div>';

  function buildMenu() {
    const cats = [];
    state.modules.forEach(m => { if (!cats.includes(m.categoria)) cats.push(m.categoria); });
    $('#menu').innerHTML = cats.map(c => '<div class="cat"><div class="cat-title"><i class="fa-solid ' + (CAT_ICONS[c] || 'fa-folder') + '"></i>' + esc(c) + '</div>' +
      state.modules.filter(m => m.categoria === c).map(m =>
        '<button class="nav-item" data-id="' + m.id + '"><i class="fa-solid ' + m.icon + '"></i>' + esc(m.label) + '</button>').join('') + '</div>').join('');
  }

  /* ---------------- Drawer mobile ---------------- */
  function openDrawer() { document.body.classList.add('drawer-open'); $('#btnDrawer').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { document.body.classList.remove('drawer-open'); $('#btnDrawer').setAttribute('aria-expanded', 'false'); }

  /* ---------------- Eventi ---------------- */
  function bind() {
    $('#menu').addEventListener('click', e => {
      const b = e.target.closest('.nav-item');
      if (!b) return;
      if (state.scope === 'all') setScope('section');
      location.hash = b.dataset.id;
    });
    window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));
    $('#btnDrawer').addEventListener('click', openDrawer);
    $('#backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
      if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
    });

    let t;
    $('#q').addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.q = e.target.value.trim();
        if (state.scope === 'all' && state.q) renderGlobal(); else showSection(state.current.id);
      }, 180);
    });
    $$('.scope .mf-chip').forEach(c => c.addEventListener('click', () => {
      setScope(c.dataset.scope);
      if (state.scope === 'all' && state.q) renderGlobal(); else showSection(state.current.id);
    }));

    $('#view').addEventListener('click', e => {
      const f = e.target.closest('.mf-freq');
      if (f) {
        const v = f.dataset.f;
        (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(
          () => toast('Frequenza ' + v + ' MHz copiata'), () => toast(v + ' MHz'));
        return;
      }
      const g = e.target.closest('[data-goto]');
      if (g) { setScope('section'); location.hash = g.dataset.goto; showSection(g.dataset.goto); }
    });
  }

  function setScope(s) {
    state.scope = s;
    $$('.scope .mf-chip').forEach(c => {
      const on = c.dataset.scope === s;
      c.classList.toggle('active', on);
      c.setAttribute('aria-checked', on);
    });
  }

  /* ---------------- Avvio ---------------- */
  const endBoot = log.time('avvio', 'Lettura indice config.json');
  fetch('config.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' su config.json'); return r.json(); })
    .then(cfg => {
      state.modules = cfg.moduli;
      endBoot({ sezioni: state.modules.length });
      buildMenu();
      bind();
      showSection(location.hash.slice(1));
    })
    .catch(err => {
      log.error('avvio', 'Indice non caricato, l\'app non può partire: ' + err.message, err.stack);
      $('#menu').innerHTML = '<div class="mf-alert err"><i class="fa-solid fa-triangle-exclamation"></i> Errore nel caricamento dell\'indice</div>';
    });
})();
