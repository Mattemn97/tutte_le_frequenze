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
    if (!id || id.split('/')[0] === MAP.id) {
      if (state.scope === 'all' && state.q) { state.current = MAP; renderGlobal(); return; }
      return showMap(id && id.split('/')[1]);
    }
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

  /* ---------------- Mappa d'Italia ---------------- */
  const MAP = { id: 'mappa', label: "Mappa d'Italia", icon: 'fa-map-location-dot', categoria: 'Esplora' };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const REGIONI = {
    'Piemonte': 'Torino', "Valle d'Aosta": 'Aosta', 'Lombardia': 'Milano', 'Trentino-Alto Adige': 'Trento', 'Veneto': 'Venezia',
    'Friuli-Venezia Giulia': 'Trieste', 'Liguria': 'Genova', 'Emilia-Romagna': 'Bologna', 'Toscana': 'Firenze', 'Umbria': 'Perugia',
    'Marche': 'Ancona', 'Lazio': 'Roma', 'Abruzzo': "L'Aquila", 'Molise': 'Campobasso', 'Campania': 'Napoli', 'Puglia': 'Bari',
    'Basilicata': 'Potenza', 'Calabria': 'Catanzaro', 'Sicilia': 'Palermo', 'Sardegna': 'Cagliari'
  };
  const STATUTO_SPECIALE = ["Valle d'Aosta", 'Trentino-Alto Adige', 'Friuli-Venezia Giulia', 'Sicilia', 'Sardegna'];
  // nomi alternativi con cui le province compaiono nelle tabelle (capoluoghi, nomi brevi, vecchie province)
  const ALIAS = {
    AO: ['aosta'], BZ: ['bolzano', 'bozen'], RE: ['reggio emilia'], FC: ['forli', 'cesena'], PU: ['pesaro', 'urbino'],
    MS: ['massa', 'carrara'], VB: ['verbania', 'verbano'], MB: ['monza'], BT: ['barletta', 'andria', 'trani'],
    OT: ['olbia', 'tempio pausania', 'olbia tempio'], OG: ['tortoli', 'lanusei'], VS: ['sanluri', 'villacidro'],
    CI: ['iglesias', 'carbonia'], SP: ['spezia'], VV: ['vibo']
  };
  const ALIAS_REG = { 'Trentino-Alto Adige': ['trentino', 'alto adige'], 'Friuli-Venezia Giulia': ['friuli'], "Valle d'Aosta": ['val d\'aosta'] };
  const mapState = { geo: null, geoP: null, index: null, indexP: null, sel: null, vb: null, anim: 0 };
  const nameKey = s => norm(s).replace(/[’`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

  function loadGeo() {
    if (!mapState.geoP) {
      const end = log.time('mappa', 'Caricamento confini');
      mapState.geoP = fetch('dati/mappa_italia.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' su dati/mappa_italia.json');
        return r.json();
      }).then(g => {
        g.bySigla = {};
        g.province.forEach(p => { g.bySigla[p.sigla] = p; });
        mapState.geo = g;
        end({ province: g.province.length });
        return g;
      }).catch(e => { mapState.geoP = null; throw e; });
    }
    return mapState.geoP;
  }

  // Indice provincia → righe di tutte le sezioni. Una riga appartiene a una provincia se riporta la sigla "(MI)",
  // se sta in una colonna "Prov" o se la prima cella inizia con il nome della provincia / di un suo capoluogo.
  function buildIndex(geo) {
    if (mapState.indexP) return mapState.indexP;
    mapState.indexP = (async () => {
      await Promise.all(state.modules.map(m => loadModule(m).then(d => { if (!m.parts) m.parts = toParts(d); }).catch(() => {})));
      const end = log.time('mappa', 'Indicizzazione province');
      const names = new Map();
      geo.province.forEach(p => {
        [p.nome, p.nome_ufficiale, ...(ALIAS[p.sigla] || [])].forEach(n => names.set(nameKey(n), p.sigla));
      });
      const regNames = Object.keys(REGIONI).map(r => [r, [nameKey(r), ...(ALIAS_REG[r] || [])]]);
      const idx = { prov: {}, reg: {} };
      const add = (bucket, key, m, part, rows) => {
        const list = bucket[key] || (bucket[key] = []);
        const last = list[list.length - 1];
        if (last && last.part === part) last.rows.push(...rows);
        else list.push({ m, part, rows: rows.slice() });
      };
      state.modules.forEach(m => (m.parts || []).forEach(part => {
        if (part.type !== 'table') return;
        const provCol = part.cols.findIndex(c => /^prov\b/i.test(c));
        const groups = [];
        part.rows.forEach(r => {
          if (!Array.isArray(r)) { groups.push(null); return; }
          const g = groups[groups.length - 1];
          if (r[0] === '' && g) g.push(r); else groups.push([r]);
        });
        groups.forEach(g => {
          if (!g) return;
          const found = new Set();
          g.forEach(r => r.forEach((c, i) => {
            const s = String(c);
            for (const x of s.matchAll(/\(([A-Z]{2})\)/g)) if (geo.bySigla[x[1]]) found.add(x[1]);
            if (i === provCol && geo.bySigla[s.trim().toUpperCase()]) found.add(s.trim().toUpperCase());
          }));
          if (!found.size) {
            const tok = nameKey(g[0][0] || '').split(' ');
            for (let k = Math.min(4, tok.length); k > 0; k--) {
              const hit = names.get(tok.slice(0, k).join(' '));
              if (hit) { found.add(hit); break; }
            }
          }
          if (found.size) { found.forEach(s => add(idx.prov, s, m, part, g)); return; }
          const text = ' ' + nameKey(g.map(r => r.join(' ')).join(' ')) + ' ';
          regNames.forEach(([r, keys]) => { if (keys.some(k => text.includes(' ' + k + ' '))) add(idx.reg, r, m, part, g); });
        });
      }));
      idx.count = {};
      Object.entries(idx.prov).forEach(([s, l]) => { idx.count[s] = l.reduce((n, e) => n + e.rows.length, 0); });
      end({ province_con_dati: Object.keys(idx.prov).length, regioni_con_dati: Object.keys(idx.reg).length });
      mapState.index = idx;
      return idx;
    })();
    return mapState.indexP;
  }

  async function showMap(sigla) {
    state.current = MAP;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.id === MAP.id));
    closeDrawer();
    document.title = MAP.label + ' · Tutte le frequenze';
    $('#searchInfo').textContent = state.q ? 'Filtro "' + state.q + '" applicato alle frequenze della provincia' : '';
    const view = $('#view');
    if (!view.querySelector('.map-view')) {
      view.innerHTML = '<div class="empty"><span class="mf-spinner lg"></span></div>';
      let geo;
      try { geo = await loadGeo(); } catch (e) {
        log.error('mappa', 'Confini non caricati: ' + e.message);
        view.innerHTML = '<div class="mf-alert err"><i class="fa-solid fa-triangle-exclamation"></i> Impossibile caricare la mappa. Riprova tra poco o ricarica la pagina.</div>';
        return;
      }
      if (state.current !== MAP) return;
      mountMap(geo);
      buildIndex(geo).then(idx => { if (view.querySelector('.map-view')) { paintCounts(idx); renderPanel(); } });
    }
    const s = sigla && mapState.geo.bySigla[sigla.toUpperCase()] ? sigla.toUpperCase() : mapState.sel;
    selectProvince(s, false);
  }

  function mountMap(geo) {
    const view = $('#view');
    view.innerHTML = '<header class="sec-head"><div class="crumb">esplora</div>' +
      '<h2><span class="ic"><i class="fa-solid ' + MAP.icon + '"></i></span>' + MAP.label + '</h2>' +
      '<p class="sub">Clicca una provincia per vedere tutte le frequenze della provincia e della sua regione.</p></header>' +
      '<div class="map-view">' +
      '<div class="mf-card map-card">' +
      '<div class="map-tools">' +
      '<div class="mf-search map-find"><i class="fa-solid fa-location-crosshairs"></i>' +
      '<input id="mapFind" class="mf-input" type="search" autocomplete="off" placeholder="Vai a provincia o sigla (es. MI)…" aria-label="Vai a provincia">' +
      '<ul class="map-sugg" id="mapSugg" role="listbox"></ul></div>' +
      '<button class="mf-icon-btn" id="mapZoomReg" type="button" title="Zoom sulla regione" aria-label="Zoom sulla regione"><i class="fa-solid fa-magnifying-glass-plus"></i></button>' +
      '<button class="mf-icon-btn" id="mapZoomAll" type="button" title="Italia intera" aria-label="Italia intera"><i class="fa-solid fa-expand"></i></button>' +
      '</div>' +
      '<div class="map-stage"><svg id="mapSvg" viewBox="' + geo.viewBox.join(' ') + '" style="aspect-ratio:' + geo.viewBox[2] + '/' + geo.viewBox[3] + '" role="img" aria-label="Mappa delle province italiane"></svg>' +
      '<div class="map-tip" id="mapTip"></div></div>' +
      '<div class="map-legend" id="mapLegend"><span class="mf-spinner"></span> Indicizzo le frequenze di tutte le sezioni…</div>' +
      '<p class="map-src">' + esc(geo.fonte) + '</p>' +
      '</div>' +
      '<aside class="map-panel" id="mapPanel" aria-live="polite"></aside></div>';
    const svg = $('#mapSvg');
    const gp = document.createElementNS(SVGNS, 'g');
    gp.setAttribute('class', 'provs');
    geo.province.forEach(p => {
      const el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', p.d);
      el.dataset.s = p.sigla;
      el.dataset.r = p.regione;
      p.el = el;
      gp.appendChild(el);
    });
    const gr = document.createElementNS(SVGNS, 'g');
    gr.setAttribute('class', 'regs');
    geo.regioni.forEach(r => {
      const el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', r.d);
      r.el = el;
      gr.appendChild(el);
    });
    svg.append(gp, gr);
    mapState.vb = geo.viewBox.slice();
    bindMap(geo);
  }

  function paintCounts(idx) {
    const geo = mapState.geo;
    const max = Math.max(1, ...Object.values(idx.count));
    const steps = [0, 1, 6, 16, 36];
    geo.province.forEach(p => {
      const n = idx.count[p.sigla] || 0;
      p.el.dataset.lv = steps.filter(x => n >= x && x > 0).length;
    });
    const with_ = Object.keys(idx.count).length;
    $('#mapLegend').innerHTML = '<span class="lg-scale">' + ['nessuna', '1–5', '6–15', '16–35', '36+'].map((t, i) =>
      '<span><i class="lv' + i + '"></i>' + t + '</span>').join('') + '</span>' +
      '<span class="muted">righe per provincia · ' + with_ + ' province su ' + geo.province.length + ' con dati (max ' + max + ')</span>';
  }

  function bindMap(geo) {
    const svg = $('#mapSvg'), tip = $('#mapTip'), stage = svg.parentNode;
    svg.addEventListener('pointermove', e => {
      const el = e.target.closest('path[data-s]');
      if (!el) { tip.classList.remove('show'); return; }
      const p = geo.bySigla[el.dataset.s];
      const n = mapState.index ? (mapState.index.count[p.sigla] || 0) + ' righe' : '…';
      tip.innerHTML = '<strong>' + esc(p.nome) + ' <span class="mono">' + p.sigla + '</span></strong><span>' + esc(p.regione) + ' · ' + n + '</span>';
      const b = stage.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      tip.style.transform = 'translate(' + Math.min(x + 14, b.width - tip.offsetWidth - 4) + 'px,' + Math.max(4, y - tip.offsetHeight - 10) + 'px)';
      tip.classList.add('show');
    });
    svg.addEventListener('pointerleave', () => tip.classList.remove('show'));
    svg.addEventListener('click', e => {
      const el = e.target.closest('path[data-s]');
      if (el) selectProvince(el.dataset.s, true);
    });
    svg.addEventListener('dblclick', e => {
      const el = e.target.closest('path[data-s]');
      if (el) { e.preventDefault(); zoomTo(geo.bySigla[el.dataset.s].regione); }
    });
    $('#mapZoomAll').addEventListener('click', () => zoomTo(null));
    $('#mapZoomReg').addEventListener('click', () => { if (mapState.sel) zoomTo(geo.bySigla[mapState.sel].regione); else toast('Seleziona prima una provincia'); });

    const find = $('#mapFind'), sugg = $('#mapSugg');
    const matches = q => {
      const k = nameKey(q);
      if (!k) return [];
      const up = q.trim().toUpperCase();
      return geo.province.map(p => {
        const nk = nameKey(p.nome), alias = (ALIAS[p.sigla] || []);
        let score = p.sigla === up ? 0 : nk.startsWith(k) ? 1 : alias.some(a => a.startsWith(k)) ? 2 : nk.includes(k) ? 3 : nameKey(p.regione).startsWith(k) ? 4 : 9;
        return [score, p];
      }).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].nome.localeCompare(b[1].nome)).slice(0, 7).map(x => x[1]);
    };
    let cur = [], hi = 0;
    const draw = () => {
      sugg.innerHTML = cur.map((p, i) => '<li role="option" class="' + (i === hi ? 'hi' : '') + '" data-s="' + p.sigla + '"><span class="mono">' + p.sigla + '</span>' +
        esc(p.nome) + '<small>' + esc(p.regione) + '</small></li>').join('');
      sugg.classList.toggle('show', cur.length > 0);
    };
    const pick = s => { find.value = ''; cur = []; draw(); selectProvince(s, true); };
    find.addEventListener('input', () => { cur = matches(find.value); hi = 0; draw(); });
    find.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (cur.length) { hi = (hi + (e.key === 'ArrowDown' ? 1 : cur.length - 1)) % cur.length; draw(); } }
      else if (e.key === 'Enter' && cur[hi]) { e.preventDefault(); pick(cur[hi].sigla); }
      else if (e.key === 'Escape') { cur = []; draw(); }
    });
    find.addEventListener('blur', () => setTimeout(() => { cur = []; draw(); }, 150));
    sugg.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(li.dataset.s); } });

    $('#mapPanel').addEventListener('click', e => {
      const c = e.target.closest('[data-prov]');
      if (c) selectProvince(c.dataset.prov, true);
      if (e.target.closest('[data-zoom]')) zoomTo(e.target.closest('[data-zoom]').dataset.zoom);
    });
  }

  function selectProvince(s, user) {
    const geo = mapState.geo;
    mapState.sel = s || null;
    const p = s && geo.bySigla[s];
    geo.province.forEach(x => {
      x.el.classList.toggle('sel', x === p);
      x.el.classList.toggle('same-reg', !!p && x !== p && x.regione === p.regione);
    });
    $('#mapSvg').classList.toggle('has-sel', !!p);
    if (p) p.el.parentNode.appendChild(p.el); // in primo piano per vedere il bordo
    if (user) {
      log.info('mappa', 'Provincia ' + (p ? p.nome + ' (' + s + ')' : 'nessuna'));
      history.replaceState(null, '', '#mappa' + (p ? '/' + s : ''));
      if (window.matchMedia('(max-width: 900px)').matches) $('#mapPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    renderPanel();
  }

  function zoomTo(regione) {
    const geo = mapState.geo;
    let to = geo.viewBox.slice();
    if (regione) {
      const r = geo.regioni.find(x => x.nome === regione);
      if (r) {
        const b = r.el.getBBox(), pad = Math.max(b.width, b.height) * 0.12;
        to = [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2];
      }
    }
    const from = mapState.vb.slice(), svg = $('#mapSvg'), t0 = performance.now(), dur = 450;
    cancelAnimationFrame(mapState.anim);
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      mapState.vb = from.map((v, i) => v + (to[i] - v) * e);
      svg.setAttribute('viewBox', mapState.vb.join(' '));
      if (k < 1) mapState.anim = requestAnimationFrame(step);
    };
    mapState.anim = requestAnimationFrame(step);
  }

  function renderEntries(list, q) {
    const filter = q ? norm(q) : '';
    let total = 0;
    const bySec = [];
    list.forEach(e => {
      let sec = bySec.find(x => x.m === e.m);
      if (!sec) bySec.push(sec = { m: e.m, html: '', n: 0 });
      const r = renderTable({ cols: e.part.cols, rows: e.rows, width: e.part.width }, q, filter);
      sec.html += r.html; sec.n += r.shown;
    });
    const html = bySec.filter(s => s.n).map(s => {
      total += s.n;
      return '<details class="map-sec" open><summary><i class="fa-solid ' + s.m.icon + '"></i><span>' + esc(s.m.label) + '</span>' +
        '<span class="count">' + s.n + '</span><button class="mf-btn mf-btn-sm" data-goto="' + s.m.id + '" title="Apri la sezione completa"><i class="fa-solid fa-arrow-right"></i></button></summary>' + s.html + '</details>';
    }).join('');
    return { html, total, sections: bySec.filter(s => s.n).length };
  }

  function renderPanel() {
    const panel = $('#mapPanel');
    if (!panel) return;
    const geo = mapState.geo, idx = mapState.index, s = mapState.sel, p = s && geo.bySigla[s];
    if (!p) {
      panel.innerHTML = '<div class="mf-card map-hint"><i class="fa-solid fa-hand-pointer"></i><strong>Scegli una provincia</strong>' +
        '<p>Clicca sulla mappa o scrivi il nome nel campo «Vai a provincia». Doppio clic per zoomare sulla regione.</p>' +
        (idx ? '<p class="muted small">Più è intenso il colore, più frequenze sono note per quella provincia.</p>' : '') + '</div>';
      return;
    }
    const sameReg = geo.province.filter(x => x.regione === p.regione).sort((a, b) => a.nome.localeCompare(b.nome));
    const regRows = idx ? sameReg.reduce((n, x) => n + (idx.count[x.sigla] || 0), 0) : 0;
    let html = '<div class="mf-card prov-card">' +
      '<div class="prov-top"><span class="prov-sigla">' + p.sigla + '</span><div><div class="crumb">' + esc(p.regione) + '</div>' +
      '<h3>' + esc(p.nome) + '</h3></div><button class="mf-icon-btn prov-close" data-prov="" aria-label="Deseleziona"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<dl class="prov-facts">' +
      '<div><dt>Ente</dt><dd>' + esc(p.tipo) + '</dd></div>' +
      (p.nome_ufficiale !== p.nome ? '<div><dt>Nome ufficiale</dt><dd>' + esc(p.nome_ufficiale) + '</dd></div>' : '') +
      '<div><dt>Codice ISTAT</dt><dd class="mono">' + esc(p.istat) + '</dd></div>' +
      '<div><dt>Righe trovate</dt><dd>' + (idx ? (idx.count[s] || 0) : '<span class="mf-spinner"></span>') + '</dd></div></dl></div>';

    html += '<div class="mf-card reg-card"><div class="reg-head"><h3><i class="fa-solid fa-map"></i>' + esc(p.regione) + '</h3>' +
      '<button class="mf-btn mf-btn-sm" data-zoom="' + esc(p.regione) + '"><i class="fa-solid fa-magnifying-glass-plus"></i> Zoom</button></div>' +
      '<dl class="prov-facts">' +
      '<div><dt>Capoluogo</dt><dd>' + esc(REGIONI[p.regione] || '—') + '</dd></div>' +
      '<div><dt>Statuto</dt><dd>' + (STATUTO_SPECIALE.includes(p.regione) ? 'Speciale' : 'Ordinario') + '</dd></div>' +
      '<div><dt>Province</dt><dd>' + sameReg.length + '</dd></div>' +
      (idx ? '<div><dt>Righe in regione</dt><dd>' + regRows + '</dd></div>' : '') + '</dl>' +
      '<div class="mf-chips reg-provs">' + sameReg.map(x => '<button class="mf-chip' + (x === p ? ' active' : '') + '" data-prov="' + x.sigla + '">' +
        esc(x.nome) + (idx ? ' <small>' + (idx.count[x.sigla] || 0) + '</small>' : '') + '</button>').join('') + '</div></div>';

    if (!idx) {
      html += '<div class="empty"><span class="mf-spinner lg"></span><p>Raccolgo le frequenze da tutte le sezioni…</p></div>';
    } else {
      const own = renderEntries(idx.prov[s] || [], state.q);
      const reg = renderEntries(idx.reg[p.regione] || [], state.q);
      html += '<h3 class="block-title"><i class="fa-solid fa-tower-broadcast"></i>Frequenze in provincia<span class="count">' + own.total + ' righe · ' + own.sections + ' sezioni</span></h3>' +
        (own.html || '<p class="muted small">' + (state.q ? 'Nessuna riga corrisponde al filtro «' + esc(state.q) + '».' : 'Nessuna riga dell\'archivio cita esplicitamente questa provincia.') + '</p>');
      if (reg.total) html += '<h3 class="block-title"><i class="fa-solid fa-map"></i>Valide per la regione ' + esc(p.regione) + '<span class="count">' + reg.total + ' righe</span></h3>' + reg.html;
    }
    panel.innerHTML = html;
  }

  function buildMenu() {
    const cats = [];
    state.modules.forEach(m => { if (!cats.includes(m.categoria)) cats.push(m.categoria); });
    $('#menu').innerHTML = '<div class="cat"><div class="cat-title"><i class="fa-solid fa-compass"></i>' + esc(MAP.categoria) + '</div>' +
      '<button class="nav-item nav-map" data-id="' + MAP.id + '"><i class="fa-solid ' + MAP.icon + '"></i>' + esc(MAP.label) + '</button></div>' +
      cats.map(c => '<div class="cat"><div class="cat-title"><i class="fa-solid ' + (CAT_ICONS[c] || 'fa-folder') + '"></i>' + esc(c) + '</div>' +
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
