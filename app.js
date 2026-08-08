'use strict';

/* ============================================================
   KOZIJNEN — uitgaven bijhouden
   Alle data staat lokaal op dit toestel (localStorage).
   Backup maak je via Instellingen → JSON downloaden.
   ============================================================ */

const STORE_KEY = 'kozijnen-v1';

const DEFAULT_STATE = {
  versie: 1,
  projectNaam: 'Kozijnen plaatsen',
  budget: 0,
  personen: ['Jacky', 'Coen'],
  bedrijven: [],
  categorieen: [
    { id: 'kozijnen',    naam: 'Kozijnen',    emoji: '🪟', budget: 0, telMee: false },
    { id: 'gereedschap', naam: 'Gereedschap', emoji: '🔧', budget: 0, telMee: true  },
    { id: 'materialen',  naam: 'Materialen',  emoji: '🧱', budget: 0, telMee: true  },
    { id: 'huur',        naam: 'Huur',        emoji: '🚚', budget: 0, telMee: true  },
  ],
  uitgaven: []
};

let state = clone(DEFAULT_STATE);
let filters = { categorie: null, persoon: null, bedrijf: null, alleenBuiten: false };
let editId = null;

/* ===== HELPERS ===== */

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
function eur(n) { return eurFmt.format(Number(n) || 0); }

/**
 * Accepteert "1234,56", "1.234,56", "1234.56", "5.000", "€ 1.234,56".
 * Nederlandse invoer: één scheidingsteken met precies 3 cijfers erachter
 * is een duizendtal (5.000 = vijfduizend), 1 of 2 cijfers zijn centen.
 */
function parseBedrag(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw || '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return NaN;

  const komma = s.lastIndexOf(',');
  const punt = s.lastIndexOf('.');

  if (komma > -1 && punt > -1) {
    // Beide aanwezig: het laatste teken is de decimaal.
    s = komma > punt
      ? s.replace(/\./g, '').replace(',', '.')   // 1.234,56
      : s.replace(/,/g, '');                     // 1,234.56
  } else if (komma > -1 || punt > -1) {
    const teken = komma > -1 ? ',' : '.';
    const laatste = Math.max(komma, punt);
    const decimalen = s.length - laatste - 1;
    const meerdere = s.split(teken).length > 2;
    s = (!meerdere && decimalen > 0 && decimalen <= 2)
      ? s.slice(0, laatste) + '.' + s.slice(laatste + 1)
      : s.split(teken).join('');
  }
  return parseFloat(s);
}

function vandaag() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dag = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dag}`;
}

/** Datum-string naar Date zonder tijdzone-verschuiving. */
function toDate(iso) { return new Date(iso + 'T12:00:00'); }

const datumFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
const maandFmt = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
function fmtDatum(iso) { return iso ? datumFmt.format(toDate(iso)) : ''; }
function fmtMaand(iso) {
  const t = maandFmt.format(toDate(iso + '-01'));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cat(id) {
  return state.categorieen.find(c => c.id === id) || { id, naam: 'Onbekend', emoji: '❓', budget: 0, telMee: true };
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

async function kopieer(tekst, melding) {
  try {
    await navigator.clipboard.writeText(tekst);
    toast(melding);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = tekst;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(melding); }
    catch (e) { toast('Kopiëren lukt niet op dit toestel'); }
    document.body.removeChild(ta);
  }
}

function download(naam, inhoud, type) {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ===== OPSLAG ===== */

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state = Object.assign(clone(DEFAULT_STATE), data);
    state.categorieen = Array.isArray(data.categorieen) && data.categorieen.length
      ? data.categorieen : clone(DEFAULT_STATE.categorieen);
    state.personen = Array.isArray(data.personen) && data.personen.length
      ? data.personen : clone(DEFAULT_STATE.personen);
    state.bedrijven = Array.isArray(data.bedrijven) ? data.bedrijven : [];
    state.uitgaven = Array.isArray(data.uitgaven) ? data.uitgaven.map(normaliseer) : [];
  } catch (e) {
    console.warn('Opslag kon niet gelezen worden', e);
  }
}

function normaliseer(u) {
  return {
    id: u.id || uid(),
    datum: u.datum || vandaag(),
    omschrijving: u.omschrijving || '',
    bedrag: Number(u.bedrag) || 0,
    bedrijf: u.bedrijf || '',
    categorie: u.categorie || 'materialen',
    betaaldDoor: u.betaaldDoor || '',
    meetellen: u.meetellen !== false,
    notitie: u.notitie || ''
  };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Opslaan mislukt — geheugen vol?');
  }
}

function onthoudBedrijf(naam) {
  const n = (naam || '').trim();
  if (!n) return;
  if (!state.bedrijven.some(b => b.toLowerCase() === n.toLowerCase())) {
    state.bedrijven.push(n);
    state.bedrijven.sort((a, b) => a.localeCompare(b, 'nl'));
  }
}

/* ===== BEREKENINGEN ===== */

function gesorteerd(list) {
  return list.slice().sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
}

function totalen(list) {
  let mee = 0, buiten = 0;
  list.forEach(u => { if (u.meetellen) mee += u.bedrag; else buiten += u.bedrag; });
  return { mee, buiten, alles: mee + buiten, aantal: list.length };
}

function somPer(list, sleutel) {
  const map = new Map();
  list.forEach(u => {
    const k = u[sleutel] || '';
    const rij = map.get(k) || { sleutel: k, bedrag: 0, aantal: 0 };
    rij.bedrag += u.bedrag;
    rij.aantal += 1;
    map.set(k, rij);
  });
  return Array.from(map.values()).sort((a, b) => b.bedrag - a.bedrag);
}

/* ===== NAVIGATIE ===== */

function switchTab(naam) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + naam));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === naam));
  const actief = document.querySelector('#tab-' + naam + ' .scroll');
  if (actief) actief.scrollTop = 0;
  if (naam === 'overzicht') renderOverzicht();
  if (naam === 'uitgaven') { renderFilters(); renderUitgaven(); }
  if (naam === 'instellingen') renderInstellingen();
}

/* ===== FORMULIER (gedeeld door 'nieuw' en 'bewerken') ===== */

function formHTML(p, u) {
  const isNieuw = !u;
  // Standaard een categorie die wél meetelt — kozijnen zet je bewust apart.
  const standaard = state.categorieen.find(c => c.telMee !== false) || state.categorieen[0];
  const data = u || {
    datum: vandaag(), omschrijving: '', bedrag: '', bedrijf: '',
    categorie: standaard ? standaard.id : '',
    betaaldDoor: state.personen[0] || '',
    meetellen: standaard ? standaard.telMee !== false : true,
    notitie: ''
  };
  const bedragWaarde = data.bedrag === '' ? '' : String(data.bedrag).replace('.', ',');

  const catChips = state.categorieen.map(c =>
    `<button type="button" class="chip-opt${c.id === data.categorie ? ' active' : ''}" data-val="${esc(c.id)}">${esc(c.emoji)} ${esc(c.naam)}</button>`
  ).join('');

  const persoonChips = state.personen.map(n =>
    `<button type="button" class="chip-opt${n === data.betaaldDoor ? ' active' : ''}" data-val="${esc(n)}">${esc(n)}</button>`
  ).join('');

  const bedrijfOpties = state.bedrijven.map(b => `<option value="${esc(b)}"></option>`).join('');

  return `
    <div class="form-group">
      <label>Bedrag *</label>
      <div class="amount-input">
        <span>€</span>
        <input type="text" id="${p}-bedrag" inputmode="decimal" required
               placeholder="0,00" value="${esc(bedragWaarde)}">
      </div>
    </div>

    <div class="form-group">
      <label>Omschrijving *</label>
      <input type="text" id="${p}-omschrijving" required maxlength="80"
             placeholder="bijv. Aanbetaling kozijnen" value="${esc(data.omschrijving)}">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" id="${p}-datum" required value="${esc(data.datum)}">
      </div>
      <div class="form-group">
        <label>Bedrijf</label>
        <input type="text" id="${p}-bedrijf" list="bedrijven-lijst-${p}" autocomplete="off"
               placeholder="bijv. Select Kozijnen" value="${esc(data.bedrijf)}">
        <datalist id="bedrijven-lijst-${p}">${bedrijfOpties}</datalist>
      </div>
    </div>

    <div class="form-group">
      <label>Categorie *</label>
      <div class="chip-group" data-target="${p}-categorie" data-role="categorie" data-auto="${isNieuw ? '1' : '0'}">
        ${catChips}
      </div>
      <input type="hidden" id="${p}-categorie" value="${esc(data.categorie)}">
    </div>

    <div class="form-group">
      <label>Betaald door *</label>
      <div class="chip-group" data-target="${p}-betaaldDoor">${persoonChips}</div>
      <input type="hidden" id="${p}-betaaldDoor" value="${esc(data.betaaldDoor)}">
    </div>

    <div class="form-group">
      <div class="switch-row">
        <div class="switch-text">
          <label for="${p}-meetellen">Meetellen in totaal</label>
          <div class="switch-hint">Zet uit voor de kozijnen zelf — de uitgave blijft in de lijst staan, maar telt niet mee in je totaal.</div>
        </div>
        <span class="switch">
          <input type="checkbox" id="${p}-meetellen" ${data.meetellen ? 'checked' : ''}>
          <span class="track"></span>
        </span>
      </div>
    </div>

    <div class="form-group">
      <label>Notitie <small>(optioneel)</small></label>
      <textarea id="${p}-notitie" rows="2" placeholder="bijv. resterende termijn bij oplevering">${esc(data.notitie)}</textarea>
    </div>

    <button type="submit" class="btn-primary full-width">${isNieuw ? 'Uitgave opslaan' : 'Wijzigingen opslaan'}</button>
    ${isNieuw ? '' : `<button type="button" class="btn-ghost danger full-width" style="margin-top:10px" onclick="verwijderUitgave()">Uitgave verwijderen</button>`}
  `;
}

function leesForm(p) {
  const bedrag = parseBedrag(document.getElementById(p + '-bedrag').value);
  if (!isFinite(bedrag) || bedrag <= 0) {
    toast('Vul een geldig bedrag in');
    return null;
  }
  const omschrijving = document.getElementById(p + '-omschrijving').value.trim();
  if (!omschrijving) { toast('Vul een omschrijving in'); return null; }

  const betaaldDoor = document.getElementById(p + '-betaaldDoor').value;
  if (!betaaldDoor) { toast('Kies wie betaald heeft'); return null; }

  return {
    datum: document.getElementById(p + '-datum').value || vandaag(),
    omschrijving,
    bedrag: Math.round(bedrag * 100) / 100,
    bedrijf: document.getElementById(p + '-bedrijf').value.trim(),
    categorie: document.getElementById(p + '-categorie').value,
    betaaldDoor,
    meetellen: document.getElementById(p + '-meetellen').checked,
    notitie: document.getElementById(p + '-notitie').value.trim()
  };
}

function renderNieuwForm() {
  document.getElementById('add-form').innerHTML = formHTML('a', null);
}

function submitNieuw(e) {
  e.preventDefault();
  const data = leesForm('a');
  if (!data) return;
  state.uitgaven.push(Object.assign({ id: uid() }, data));
  onthoudBedrijf(data.bedrijf);
  save();
  renderNieuwForm();
  toast(`${eur(data.bedrag)} toegevoegd`);
}

/* ===== BEWERKEN ===== */

function openEdit(id) {
  const u = state.uitgaven.find(x => x.id === id);
  if (!u) return;
  editId = id;
  document.getElementById('edit-form').innerHTML = formHTML('e', u);
  document.getElementById('edit-modal').hidden = false;
}

function closeEdit() {
  document.getElementById('edit-modal').hidden = true;
  editId = null;
}

function submitEdit(e) {
  e.preventDefault();
  const data = leesForm('e');
  if (!data) return;
  const i = state.uitgaven.findIndex(x => x.id === editId);
  if (i === -1) return closeEdit();
  state.uitgaven[i] = Object.assign({ id: editId }, data);
  onthoudBedrijf(data.bedrijf);
  save();
  closeEdit();
  renderUitgaven();
  renderOverzicht();
  toast('Opgeslagen');
}

function verwijderUitgave() {
  const u = state.uitgaven.find(x => x.id === editId);
  if (!u) return;
  if (!confirm(`"${u.omschrijving}" (${eur(u.bedrag)}) verwijderen?`)) return;
  state.uitgaven = state.uitgaven.filter(x => x.id !== editId);
  save();
  closeEdit();
  renderUitgaven();
  renderOverzicht();
  toast('Verwijderd');
}

/* ===== OVERZICHT ===== */

function renderOverzicht() {
  const body = document.getElementById('overzicht-body');
  const alle = state.uitgaven;

  if (!alle.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🪟</div>
        <div class="empty-title">Nog geen uitgaven</div>
        <div class="empty-text">Tik op <strong>Nieuw</strong> om je eerste uitgave toe te voegen.</div>
      </div>`;
    return;
  }

  const t = totalen(alle);
  const budget = Number(state.budget) || 0;
  const over = budget - t.mee;
  const pct = budget > 0 ? Math.min(100, (t.mee / budget) * 100) : 0;

  let hero = `
    <div class="hero">
      <div class="hero-label">Totaal uitgegeven</div>
      <div class="hero-amount">${eur(t.mee)}</div>`;

  if (budget > 0) {
    hero += `
      <div class="hero-bar"><div class="hero-bar-fill${over < 0 ? ' over' : ''}" style="width:${pct}%"></div></div>
      <div class="hero-foot">
        <span>${Math.round(budget > 0 ? (t.mee / budget) * 100 : 0)}% van ${eur(budget)}</span>
        <strong>${over >= 0 ? eur(over) + ' over' : eur(-over) + ' te veel'}</strong>
      </div>`;
    if (over < 0) hero += `<div class="hero-warn">⚠️ Je zit ${eur(-over)} boven je budget.</div>`;
  } else {
    hero += `<div class="hero-sub">Stel een budget in bij Instellingen voor een voortgangsbalk.</div>`;
  }
  hero += `</div>`;

  const statRow = `
    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Buiten totaal</div>
        <div class="stat-value">${eur(t.buiten)}</div>
        <div class="stat-note">telt niet mee</div>
      </div>
      <div class="stat">
        <div class="stat-label">Alles samen</div>
        <div class="stat-value">${eur(t.alles)}</div>
        <div class="stat-note">${t.aantal} uitgave${t.aantal === 1 ? '' : 'n'}</div>
      </div>
    </div>`;

  // Per categorie
  const perCat = state.categorieen.map(c => {
    const lijst = alle.filter(u => u.categorie === c.id);
    return { c, bedrag: lijst.reduce((s, u) => s + u.bedrag, 0), aantal: lijst.length };
  }).filter(r => r.aantal > 0).sort((a, b) => b.bedrag - a.bedrag);

  const maxCat = perCat.length ? perCat[0].bedrag : 0;
  const catRijen = perCat.map(r => {
    const cb = Number(r.c.budget) || 0;
    const breedte = cb > 0
      ? Math.min(100, (r.bedrag / cb) * 100)
      : (maxCat > 0 ? (r.bedrag / maxCat) * 100 : 0);
    const teVeel = cb > 0 && r.bedrag > cb;
    const sub = cb > 0
      ? (teVeel ? `${eur(r.bedrag - cb)} boven budget van ${eur(cb)}` : `${eur(cb - r.bedrag)} over van ${eur(cb)}`)
      : `${r.aantal} uitgave${r.aantal === 1 ? '' : 'n'}${r.c.telMee === false ? ' · telt standaard niet mee' : ''}`;
    return `
      <div class="bd-row">
        <div class="bd-head">
          <span class="bd-name">${esc(r.c.emoji)} ${esc(r.c.naam)}</span>
          <span class="bd-amount">${eur(r.bedrag)}</span>
        </div>
        <div class="bd-bar"><div class="bd-bar-fill${teVeel ? ' over' : ''}" style="width:${breedte}%"></div></div>
        <div class="bd-sub${teVeel ? ' over' : ''}">${esc(sub)}</div>
      </div>`;
  }).join('');

  // Betaald door
  const perPersoon = somPer(alle, 'betaaldDoor');
  const maxPersoon = perPersoon.length ? perPersoon[0].bedrag : 0;
  const persoonRijen = perPersoon.map(r => `
    <div class="bd-row">
      <div class="bd-head">
        <span class="bd-name">${esc(r.sleutel || 'Onbekend')}</span>
        <span class="bd-amount">${eur(r.bedrag)}</span>
      </div>
      <div class="bd-bar"><div class="bd-bar-fill accent" style="width:${maxPersoon > 0 ? (r.bedrag / maxPersoon) * 100 : 0}%"></div></div>
      <div class="bd-sub">${r.aantal} uitgave${r.aantal === 1 ? '' : 'n'}</div>
    </div>`).join('');

  // Per bedrijf
  const perBedrijf = somPer(alle.filter(u => u.bedrijf), 'bedrijf');
  const bedrijfRijen = perBedrijf.map(r => `
    <div class="set-row">
      <div class="set-name">${esc(r.sleutel)}
        <div class="set-sub">${r.aantal} uitgave${r.aantal === 1 ? '' : 'n'}</div>
      </div>
      <strong>${eur(r.bedrag)}</strong>
    </div>`).join('');

  // Recent
  const recent = gesorteerd(alle).slice(0, 5).map(itemHTML).join('');

  body.innerHTML = hero + statRow + `
    <div class="card">
      <div class="card-title">Per categorie</div>
      ${catRijen || '<div class="bd-sub">Nog niets uitgegeven.</div>'}
    </div>
    <div class="card">
      <div class="card-title">Betaald door <small style="text-transform:none;letter-spacing:0">(alles samen)</small></div>
      ${persoonRijen}
    </div>
    ${perBedrijf.length ? `<div class="card"><div class="card-title">Per bedrijf</div>${bedrijfRijen}</div>` : ''}
    <div class="card">
      <div class="card-title">Laatste uitgaven</div>
      ${recent}
    </div>`;
}

/* ===== UITGAVEN ===== */

function itemHTML(u) {
  const c = cat(u.categorie);
  const meta = [fmtDatum(u.datum), u.bedrijf].filter(Boolean).join(' · ');
  return `
    <button class="item" type="button" data-id="${esc(u.id)}">
      <span class="item-emoji">${esc(c.emoji)}</span>
      <span class="item-main">
        <span class="item-title">${esc(u.omschrijving)}</span>
        <span class="item-meta">${esc(meta)}</span>
      </span>
      <span class="item-right">
        <span class="item-amount${u.meetellen ? '' : ' excluded'}">${eur(u.bedrag)}</span><br>
        ${u.meetellen
          ? `<span class="badge badge-person">${esc(u.betaaldDoor || '—')}</span>`
          : `<span class="badge badge-excl">buiten totaal</span>`}
      </span>
    </button>`;
}

function renderFilters() {
  const bar = document.getElementById('filters-bar');
  const actief = filters.categorie || filters.persoon || filters.bedrijf || filters.alleenBuiten;
  let html = `<button class="chip${actief ? '' : ' active'}" data-type="reset">Alles</button>`;
  state.categorieen.forEach(c => {
    html += `<button class="chip${filters.categorie === c.id ? ' active' : ''}" data-type="categorie" data-val="${esc(c.id)}">${esc(c.emoji)} ${esc(c.naam)}</button>`;
  });
  state.personen.forEach(n => {
    html += `<button class="chip${filters.persoon === n ? ' active' : ''}" data-type="persoon" data-val="${esc(n)}">${esc(n)}</button>`;
  });
  html += `<button class="chip${filters.alleenBuiten ? ' active' : ''}" data-type="buiten">Buiten totaal</button>`;
  state.bedrijven.forEach(b => {
    html += `<button class="chip${filters.bedrijf === b ? ' active' : ''}" data-type="bedrijf" data-val="${esc(b)}">${esc(b)}</button>`;
  });
  bar.innerHTML = html;
}

function filterUitgaven() {
  const zoek = (document.getElementById('zoek').value || '').trim().toLowerCase();
  return state.uitgaven.filter(u => {
    if (filters.categorie && u.categorie !== filters.categorie) return false;
    if (filters.persoon && u.betaaldDoor !== filters.persoon) return false;
    if (filters.bedrijf && u.bedrijf !== filters.bedrijf) return false;
    if (filters.alleenBuiten && u.meetellen) return false;
    if (zoek) {
      const hooi = `${u.omschrijving} ${u.bedrijf} ${u.notitie} ${cat(u.categorie).naam}`.toLowerCase();
      if (!hooi.includes(zoek)) return false;
    }
    return true;
  });
}

function renderUitgaven() {
  const body = document.getElementById('uitgaven-body');
  const lijst = gesorteerd(filterUitgaven());

  if (!state.uitgaven.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🧾</div>
        <div class="empty-title">Nog geen uitgaven</div>
        <div class="empty-text">Tik onderin op <strong>Nieuw</strong> om te beginnen.</div>
      </div>`;
    return;
  }
  if (!lijst.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Niets gevonden</div>
        <div class="empty-text">Pas je zoekterm of filters aan.</div>
      </div>`;
    return;
  }

  const t = totalen(lijst);
  const samenvatting = `
    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Gefilterd totaal</div>
        <div class="stat-value">${eur(t.mee)}</div>
        <div class="stat-note">${t.aantal} uitgave${t.aantal === 1 ? '' : 'n'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Incl. buiten totaal</div>
        <div class="stat-value">${eur(t.alles)}</div>
        <div class="stat-note">${t.buiten > 0 ? eur(t.buiten) + ' telt niet mee' : 'alles telt mee'}</div>
      </div>
    </div>`;

  let html = samenvatting;
  let maand = '';
  lijst.forEach(u => {
    const m = u.datum.slice(0, 7);
    if (m !== maand) {
      maand = m;
      const maandTotaal = lijst.filter(x => x.datum.slice(0, 7) === m).reduce((s, x) => s + x.bedrag, 0);
      html += `
        <div class="month-head">
          <span class="month-name">${esc(fmtMaand(m))}</span>
          <span class="month-total">${eur(maandTotaal)}</span>
        </div>`;
    }
    html += itemHTML(u);
  });
  body.innerHTML = html;
}

/* ===== INSTELLINGEN ===== */

function renderInstellingen() {
  const body = document.getElementById('instellingen-body');

  const catRijen = state.categorieen.map(c => `
    <div class="set-row">
      <span style="font-size:19px">${esc(c.emoji)}</span>
      <div class="set-name">
        <input type="text" value="${esc(c.naam)}" onchange="setCatNaam('${esc(c.id)}', this.value)">
      </div>
      <input class="set-budget-input" type="text" inputmode="decimal" placeholder="budget"
             value="${c.budget ? String(c.budget).replace('.', ',') : ''}"
             onchange="setCatBudget('${esc(c.id)}', this.value)">
      <button class="icon-btn" onclick="verwijderCategorie('${esc(c.id)}')" title="Verwijderen">🗑️</button>
    </div>`).join('');

  const persoonRijen = state.personen.map((n, i) => `
    <div class="set-row">
      <div class="set-name">
        <input type="text" value="${esc(n)}" onchange="setPersoon(${i}, this.value)">
      </div>
      <button class="icon-btn" onclick="verwijderPersoon(${i})" title="Verwijderen">🗑️</button>
    </div>`).join('');

  const bedrijfRijen = state.bedrijven.length
    ? state.bedrijven.map((b, i) => `
      <div class="set-row">
        <div class="set-name">
          <input type="text" value="${esc(b)}" onchange="setBedrijf(${i}, this.value)">
        </div>
        <button class="icon-btn" onclick="verwijderBedrijf(${i})" title="Verwijderen">🗑️</button>
      </div>`).join('')
    : '<div class="hint">Bedrijven verschijnen hier automatisch zodra je ze bij een uitgave invult.</div>';

  body.innerHTML = `
    <div class="card">
      <div class="card-title">Budget</div>
      <div class="form-group" style="margin:0">
        <label>Totaal budget voor dit project</label>
        <div class="amount-input">
          <span>€</span>
          <input type="text" inputmode="decimal" placeholder="0,00"
                 value="${state.budget ? String(state.budget).replace('.', ',') : ''}"
                 onchange="setBudget(this.value)">
        </div>
        <div class="hint">Laat leeg als je geen voortgangsbalk wilt. Uitgaven met "meetellen in totaal" uit tellen niet mee in dit budget.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Categorieën</div>
      ${catRijen}
      <div class="set-row">
        <input type="text" id="nieuwe-cat" placeholder="Nieuwe categorie…" autocomplete="off">
        <button class="icon-btn" onclick="voegCategorieToe()" title="Toevoegen">➕</button>
      </div>
      <div class="hint">Het bedrag rechts is een optioneel deelbudget per categorie.</div>
    </div>

    <div class="card">
      <div class="card-title">Personen</div>
      ${persoonRijen}
      <div class="set-row">
        <input type="text" id="nieuwe-persoon" placeholder="Naam toevoegen…" autocomplete="off">
        <button class="icon-btn" onclick="voegPersoonToe()" title="Toevoegen">➕</button>
      </div>
      <div class="hint">Naam hernoemen past ook alle bestaande uitgaven aan.</div>
    </div>

    <div class="card">
      <div class="card-title">Bedrijven</div>
      ${bedrijfRijen}
    </div>

    <div class="card">
      <div class="card-title">Backup &amp; export</div>
      <div class="btn-stack">
        <button class="btn-ghost full-width" onclick="exportJSON()">💾 Backup downloaden (JSON)</button>
        <button class="btn-ghost full-width" onclick="document.getElementById('import-input').click()">📥 Backup inladen (JSON)</button>
        <button class="btn-ghost full-width" onclick="exportCSV()">📊 Exporteren naar CSV (Excel)</button>
      </div>
      <div class="hint">Al je gegevens staan alleen op dit toestel. Maak af en toe een backup — bij een nieuwe telefoon laad je die hier weer in.</div>
    </div>

    <div class="card">
      <div class="card-title">Gevaarlijk</div>
      <button class="btn-ghost danger full-width" onclick="wisAlles()">Alle gegevens wissen</button>
    </div>

    <div class="hint" style="text-align:center;padding-bottom:8px">
      ${state.uitgaven.length} uitgave${state.uitgaven.length === 1 ? '' : 'n'} opgeslagen
    </div>`;
}

function setBudget(waarde) {
  const n = parseBedrag(waarde);
  state.budget = isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  save();
  renderInstellingen();
  toast(state.budget ? `Budget: ${eur(state.budget)}` : 'Budget gewist');
}

function setCatNaam(id, waarde) {
  const c = state.categorieen.find(x => x.id === id);
  const naam = waarde.trim();
  if (!c || !naam) return renderInstellingen();
  c.naam = naam;
  save();
  renderInstellingen();
}

function setCatBudget(id, waarde) {
  const c = state.categorieen.find(x => x.id === id);
  if (!c) return;
  const n = parseBedrag(waarde);
  c.budget = isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  save();
  renderInstellingen();
}

function voegCategorieToe() {
  const input = document.getElementById('nieuwe-cat');
  const naam = input.value.trim();
  if (!naam) return;
  state.categorieen.push({ id: uid(), naam, emoji: '📦', budget: 0, telMee: true });
  save();
  renderInstellingen();
  toast(`"${naam}" toegevoegd`);
}

function verwijderCategorie(id) {
  const inGebruik = state.uitgaven.filter(u => u.categorie === id).length;
  if (inGebruik) {
    toast(`Nog ${inGebruik} uitgave${inGebruik === 1 ? '' : 'n'} in deze categorie`);
    return;
  }
  if (state.categorieen.length <= 1) { toast('Je hebt minstens één categorie nodig'); return; }
  const c = state.categorieen.find(x => x.id === id);
  if (!confirm(`Categorie "${c ? c.naam : ''}" verwijderen?`)) return;
  state.categorieen = state.categorieen.filter(x => x.id !== id);
  if (filters.categorie === id) filters.categorie = null;
  save();
  renderInstellingen();
}

function setPersoon(i, waarde) {
  const naam = waarde.trim();
  const oud = state.personen[i];
  if (!naam || naam === oud) return renderInstellingen();
  state.personen[i] = naam;
  state.uitgaven.forEach(u => { if (u.betaaldDoor === oud) u.betaaldDoor = naam; });
  if (filters.persoon === oud) filters.persoon = naam;
  save();
  renderInstellingen();
  toast(`"${oud}" heet nu "${naam}"`);
}

function voegPersoonToe() {
  const input = document.getElementById('nieuwe-persoon');
  const naam = input.value.trim();
  if (!naam) return;
  if (state.personen.some(p => p.toLowerCase() === naam.toLowerCase())) {
    toast('Die naam bestaat al');
    return;
  }
  state.personen.push(naam);
  save();
  renderInstellingen();
}

function verwijderPersoon(i) {
  const naam = state.personen[i];
  const inGebruik = state.uitgaven.filter(u => u.betaaldDoor === naam).length;
  if (inGebruik) {
    toast(`${naam} staat nog bij ${inGebruik} uitgave${inGebruik === 1 ? '' : 'n'}`);
    return;
  }
  if (state.personen.length <= 1) { toast('Je hebt minstens één persoon nodig'); return; }
  state.personen.splice(i, 1);
  save();
  renderInstellingen();
}

function setBedrijf(i, waarde) {
  const naam = waarde.trim();
  const oud = state.bedrijven[i];
  if (!naam || naam === oud) return renderInstellingen();
  state.bedrijven[i] = naam;
  state.uitgaven.forEach(u => { if (u.bedrijf === oud) u.bedrijf = naam; });
  if (filters.bedrijf === oud) filters.bedrijf = naam;
  save();
  renderInstellingen();
  toast(`"${oud}" heet nu "${naam}"`);
}

function verwijderBedrijf(i) {
  const naam = state.bedrijven[i];
  const inGebruik = state.uitgaven.filter(u => u.bedrijf === naam).length;
  if (inGebruik) {
    toast(`${naam} staat nog bij ${inGebruik} uitgave${inGebruik === 1 ? '' : 'n'}`);
    return;
  }
  state.bedrijven.splice(i, 1);
  save();
  renderInstellingen();
}

function wisAlles() {
  if (!confirm('Alle uitgaven, categorieën en instellingen wissen? Dit kan niet ongedaan gemaakt worden.')) return;
  if (!confirm('Heb je een backup? Zeker weten?')) return;
  state = clone(DEFAULT_STATE);
  filters = { categorie: null, persoon: null, bedrijf: null, alleenBuiten: false };
  save();
  renderAlles();
  toast('Alles gewist');
}

/* ===== EXPORT / IMPORT / KOPIËREN ===== */

function bestandsnaam(ext) {
  return `kozijnen-${vandaag()}.${ext}`;
}

function exportJSON() {
  download(bestandsnaam('json'), JSON.stringify(state, null, 2), 'application/json');
  toast('Backup gedownload');
}

function exportCSV() {
  if (!state.uitgaven.length) { toast('Nog geen uitgaven'); return; }
  const kop = ['Datum', 'Omschrijving', 'Bedrijf', 'Categorie', 'Betaald door', 'Bedrag', 'Telt mee', 'Notitie'];
  const veld = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rijen = gesorteerd(state.uitgaven).map(u => [
    u.datum,
    u.omschrijving,
    u.bedrijf,
    cat(u.categorie).naam,
    u.betaaldDoor,
    u.bedrag.toFixed(2).replace('.', ','),
    u.meetellen ? 'ja' : 'nee',
    u.notitie
  ].map(veld).join(';'));
  const csv = '﻿' + [kop.map(veld).join(';')].concat(rijen).join('\r\n');
  download(bestandsnaam('csv'), csv, 'text/csv;charset=utf-8');
  toast('CSV gedownload');
}

function importJSON(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.uitgaven)) throw new Error('geen geldige backup');
      const aantal = data.uitgaven.length;
      if (!confirm(`Backup met ${aantal} uitgave${aantal === 1 ? '' : 'n'} inladen? Je huidige gegevens worden vervangen.`)) return;
      state = Object.assign(clone(DEFAULT_STATE), data);
      state.uitgaven = data.uitgaven.map(normaliseer);
      state.categorieen = Array.isArray(data.categorieen) && data.categorieen.length
        ? data.categorieen : clone(DEFAULT_STATE.categorieen);
      state.personen = Array.isArray(data.personen) && data.personen.length
        ? data.personen : clone(DEFAULT_STATE.personen);
      state.bedrijven = Array.isArray(data.bedrijven) ? data.bedrijven : [];
      save();
      renderAlles();
      toast(`${aantal} uitgave${aantal === 1 ? '' : 'n'} ingeladen`);
    } catch (err) {
      toast('Dit bestand is geen geldige backup');
    }
  };
  reader.readAsText(file);
}

function copyOverzicht() {
  const alle = state.uitgaven;
  if (!alle.length) { toast('Nog geen uitgaven'); return; }
  const t = totalen(alle);
  const budget = Number(state.budget) || 0;
  const regels = [`${state.projectNaam} — ${fmtDatum(vandaag())}`, ''];

  regels.push(`Totaal uitgegeven: ${eur(t.mee)}`);
  if (budget > 0) {
    const over = budget - t.mee;
    regels.push(over >= 0
      ? `Budget: ${eur(budget)} — nog ${eur(over)} over`
      : `Budget: ${eur(budget)} — ${eur(-over)} overschreden`);
  }
  regels.push('');

  regels.push('Per categorie:');
  state.categorieen.forEach(c => {
    const bedrag = alle.filter(u => u.categorie === c.id).reduce((s, u) => s + u.bedrag, 0);
    if (bedrag > 0) regels.push(`• ${c.naam}: ${eur(bedrag)}`);
  });
  regels.push('');

  regels.push('Betaald door:');
  somPer(alle, 'betaaldDoor').forEach(r => regels.push(`• ${r.sleutel || 'Onbekend'}: ${eur(r.bedrag)}`));

  const perBedrijf = somPer(alle.filter(u => u.bedrijf), 'bedrijf');
  if (perBedrijf.length) {
    regels.push('');
    regels.push('Per bedrijf:');
    perBedrijf.forEach(r => regels.push(`• ${r.sleutel}: ${eur(r.bedrag)}`));
  }

  if (t.buiten > 0) {
    regels.push('');
    regels.push(`Buiten het totaal: ${eur(t.buiten)}`);
    regels.push(`Alles samen: ${eur(t.alles)}`);
  }

  kopieer(regels.join('\n'), 'Overzicht gekopieerd');
}

function copyUitgaven() {
  const lijst = gesorteerd(filterUitgaven());
  if (!lijst.length) { toast('Niets om te kopiëren'); return; }
  const t = totalen(lijst);
  const regels = lijst.map(u =>
    `${fmtDatum(u.datum)} — ${u.omschrijving}${u.bedrijf ? ' (' + u.bedrijf + ')' : ''}: ${eur(u.bedrag)}` +
    `${u.betaaldDoor ? ' — betaald door ' + u.betaaldDoor : ''}${u.meetellen ? '' : ' [buiten totaal]'}`
  );
  regels.push('');
  regels.push(`Totaal: ${eur(t.mee)}${t.buiten > 0 ? ` (+ ${eur(t.buiten)} buiten totaal)` : ''}`);
  kopieer(regels.join('\n'), `${lijst.length} uitgave${lijst.length === 1 ? '' : 'n'} gekopieerd`);
}

/* ===== EVENTS ===== */

document.addEventListener('click', e => {
  // Keuze-chips in formulieren
  const opt = e.target.closest('.chip-opt');
  if (opt) {
    const groep = opt.closest('.chip-group');
    if (!groep) return;
    groep.querySelectorAll('.chip-opt').forEach(b => b.classList.toggle('active', b === opt));
    const doel = document.getElementById(groep.dataset.target);
    if (doel) doel.value = opt.dataset.val;
    if (groep.dataset.role === 'categorie' && groep.dataset.auto === '1') {
      const c = cat(opt.dataset.val);
      const schakelaar = document.getElementById('a-meetellen');
      if (schakelaar) schakelaar.checked = c.telMee !== false;
    }
    return;
  }

  // Filterchips
  const chip = e.target.closest('#filters-bar .chip');
  if (chip) {
    const type = chip.dataset.type;
    if (type === 'reset') {
      filters = { categorie: null, persoon: null, bedrijf: null, alleenBuiten: false };
    } else if (type === 'buiten') {
      filters.alleenBuiten = !filters.alleenBuiten;
    } else {
      filters[type] = filters[type] === chip.dataset.val ? null : chip.dataset.val;
    }
    renderFilters();
    renderUitgaven();
    return;
  }

  // Uitgave openen
  const item = e.target.closest('.item');
  if (item && item.dataset.id) {
    openEdit(item.dataset.id);
    return;
  }

  // Modal sluiten door naast het venster te tikken
  if (e.target.id === 'edit-modal') closeEdit();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('edit-modal').hidden) closeEdit();
});

/* ===== START ===== */

function renderAlles() {
  renderNieuwForm();
  renderOverzicht();
  renderFilters();
  renderUitgaven();
  renderInstellingen();
}

load();
renderAlles();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
