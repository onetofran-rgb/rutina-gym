/* Plan 18 · Cuaderno — v2 (PWA, IndexedDB). Sin datos personales en el código: todo se guarda en el teléfono. */
(() => {
'use strict';
const APPV = 'e26a733d';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const DOW = ['dom','lun','mar','mié','jue','vie','sáb'];
const fDate = s => { const d = parseYmd(s); return DOW[d.getDay()] + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const fDateLong = s => { const d = parseYmd(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
const fKg = k => (k == null || k === '') ? '' : String(Math.round(k * 100) / 100);
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const fRest = s => s >= 60 ? (s % 60 ? mmss(s) : (s / 60) + ' min') : s + ' s';
const rng = r => r ? (r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]) : '';

let PLAN, EX, DAYS = {};
let sessions = [];
let db;
const SKEY = 'p18.settings';
const S = Object.assign({ theme: 'papel', inicio: null, descargaCada: 8, forzarDescarga: null, partido: {}, dia: {} }, (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })());
const saveS = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };
const ui = { view: 'hoy', sheet: null, tab: 'reg', inp: null, planDay: 'd1' };

/* ---------- IndexedDB ---------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('plan18', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction('sessions', mode); const st = t.objectStore('sessions'); const out = fn(st); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
const dbAll = () => tx('readonly', st => st.getAll());
const dbPut = s => tx('readwrite', st => st.put(s));
const dbDel = id => tx('readwrite', st => st.delete(id));
const sortSessions = () => sessions.sort((a, b) => (b.date.localeCompare(a.date)) || (b.startedAt - a.startedAt));
async function putSession(s) { await dbPut(JSON.parse(JSON.stringify(s))); if (!sessions.includes(s)) sessions.push(s); sortSessions(); }

/* ---------- semana, descarga, partido ---------- */
function inicio() { if (S.inicio) return S.inicio; const d = sessions.map(s => s.date).sort()[0]; return d || today(); }
function weekOf(date) { const diff = Math.floor((parseYmd(date) - parseYmd(inicio())) / 864e5); return Math.max(1, Math.floor(diff / 7) + 1); }
function isDeload(w) { return S.forzarDescarga === w || (w % (S.descargaCada || 8) === 0); }
function ctxFor(date, dayId) { const w = weekOf(date); return { date, week: w, deload: isDeload(w), partido: S.partido[date] || null, dayId }; }

function rx(item, ctx) {
  const e = EX[item.ex]; let series = item.series, rir = item.rir, skip = null; const notes = [];
  if (item.ex === 'nordico') series = ctx.week <= 4 ? 2 : 3;
  if (ctx.week === 1 && rir) rir = '2-3';
  const p = ctx.partido;
  if (p === 'hoy' || p === 'manana') {
    const cu = p === 'hoy' ? 'jugás hoy' : 'jugás mañana';
    if (item.ex === 'nordico') skip = 'Saltealo: ' + cu + ' (nunca nórdico antes de jugar).';
    if (item.ex === 'copenhagen' && p === 'hoy') skip = 'Saltealo: jugás hoy.';
    if (item.ex === 'pmr') notes.push('liviano, a 3 RIR: ' + cu);
    else if (e.pierna && !skip && rir) notes.push('piernas a 3 RIR: ' + cu);
    if (e.pierna && rir) rir = '3';
  }
  if (p === 'ayer' && ctx.dayId === 'd1' && e.pierna && rir) { rir = '3'; notes.push('jugaste ayer: piernas a 3 RIR'); }
  if (ctx.deload) { series = Math.max(1, Math.ceil(series / 2)); if (rir) rir = '3'; notes.push('descarga: mitad de series, mismo peso'); }
  return { series, rir, skip, notes };
}

function suggestedDay(date) {
  const p = S.partido[date]; const wd = parseYmd(date).getDay();
  let base = { 1: 'd2', 3: 'd3', 5: 'd1' }[wd];
  let why = base ? 'semana tipo' : null;
  if (!base) { const last = sessions[0]; const order = ['d2', 'd3', 'd1']; base = last ? order[(order.indexOf(last.dayId) + 1) % 3] : 'd2'; why = 'sigue en la rotación'; }
  if (base === 'd1' && (p === 'hoy' || p === 'manana' || p === 'ayer')) {
    const wk = weekOf(date); const doneWk = new Set(sessions.filter(s => weekOf(s.date) === wk).map(s => s.dayId));
    base = !doneWk.has('d3') ? 'd3' : (!doneWk.has('d2') ? 'd2' : 'd3'); why = 'por el partido, no Día 1';
  }
  return { id: base, why };
}
const selDay = () => S.dia[today()] || suggestedDay(today()).id;

/* ---------- sesión ---------- */
const openSession = (date, dayId) => sessions.find(s => !s.endedAt && s.date === date && s.dayId === dayId);
const doneSession = (date, dayId) => sessions.find(s => s.endedAt && s.date === date && s.dayId === dayId);
const setsOf = (s, ex) => s ? s.sets.filter(x => x.ex === ex) : [];
async function ensureSession(dayId) {
  let s = openSession(today(), dayId);
  if (!s) {
    const c = ctxFor(today(), dayId);
    s = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: today(), dayId, startedAt: Date.now(), endedAt: null, note: '', partido: c.partido, week: c.week, deload: c.deload, sets: [] };
    if (!S.inicio) { S.inicio = today(); saveS(); }
    await putSession(s);
  }
  return s;
}
function lastSets(ex, dayId, exclId) {
  const cand = sessions.filter(s => s.id !== exclId && s.sets.some(x => x.ex === ex));
  const s = cand.find(s => s.dayId === dayId) || cand[0];
  return s ? { s, sets: setsOf(s, ex) } : null;
}
const fmtSets = (sets, e) => {
  if (!sets.length) return '';
  if (e.tipo === 'seg') return sets.map(x => (x.seg || 0) + 's').join(',');
  const runs = []; for (const x of sets) { const k = x.kg || 0; const r = runs[runs.length - 1]; if (r && r.kg === k) r.reps.push(x.reps); else runs.push({ kg: k, reps: [x.reps] }); }
  return runs.map(r => (r.kg ? fKg(r.kg) + 'k' : '') + r.reps.join(',')).join(' / ');
};
function suggest(item, r, dayId, exclId, ctx) {
  const e = EX[item.ex]; const L = lastSets(item.ex, dayId, exclId);
  if (!L) return { kg: null, reps: item.reps ? item.reps[0] : null, seg: item.seg || null, txt: e.sinPeso ? 'Primera vez: priorizá la técnica.' : 'Primera vez: elegí un peso que te deje unas 3 reps en reserva.', first: true };
  const last = 'Última (' + fDate(L.s.date) + '): ' + fmtSets(L.sets, e);
  if (e.tipo === 'seg') { const all = L.sets.length >= item.series && L.sets.every(x => (x.seg || 0) >= item.seg); return { seg: item.seg, txt: (all ? 'Objetivo cumplido; mantené ' + item.seg + ' s con mejor control.' : 'Objetivo: ' + item.seg + ' s.') + ' ' + last }; }
  const kg = Math.max(...L.sets.map(x => x.kg || 0)); const top = item.reps[1], lo = item.reps[0];
  const work = L.sets.filter(x => (x.kg || 0) >= kg);
  const hit = L.sets.length >= item.series && L.sets.every(x => x.reps >= top);
  if (ctx.deload) return { kg, reps: lo, txt: 'Descarga: mismo peso (' + fKg(kg) + ' kg), mitad de series. ' + last };
  if (hit && !e.sinPeso) {
    if (e.lastre && !kg) return { kg: 2.5, reps: lo, up: true, txt: 'Hiciste el tope en todas: sumá 2,5 kg de lastre y volvé a ' + lo + '. ' + last };
    const nk = kg + e.inc; return { kg: nk, reps: lo, up: true, txt: 'Subí a ' + fKg(nk) + ' kg y volvé a ' + lo + ' reps (hiciste el tope en todas). ' + last };
  }
  if (hit && e.sinPeso) return { kg: null, reps: top, txt: 'Tope logrado: hacelo más lento y controlado. ' + last };
  const best = Math.max(...work.map(x => x.reps)); return { kg: kg || null, reps: Math.min(top, Math.max(lo, best)), txt: 'Mismo peso, buscá +1 rep. ' + last };
}

/* ---------- Copiar para Coach ---------- */
function coachText(s) {
  const d = DAYS[s.dayId]; const lines = [];
  lines.push(d.nombre + ' · ' + d.sub + ' — ' + fDateLong(s.date) + ' (semana ' + (s.week || weekOf(s.date)) + (s.deload ? ', descarga' : '') + ')');
  const order = d.items.map(i => i.ex); const exs = [...new Set(s.sets.map(x => x.ex))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  for (const ex of exs) {
    const e = EX[ex]; const ss = setsOf(s, ex); let t = e.corto + ' ' + fmtSets(ss, e);
    const rirs = ss.map(x => x.rir).filter(x => x != null && x !== '');
    if (e.porLado) t += ' por lado';
    if (rirs.length) t += ' (RIR ' + (rirs.length === ss.length && new Set(rirs).size === 1 ? rirs[0] : ss.map(x => x.rir ?? '-').join(',')) + ')';
    lines.push(t);
  }
  const p = { hoy: 'jugaba ese día', manana: 'jugaba al día siguiente', ayer: 'había jugado el día anterior' }[s.partido];
  if (p) lines.push('Partido: ' + p);
  if (s.startedAt && s.endedAt) lines.push('Duración: ' + Math.round((s.endedAt - s.startedAt) / 60000) + ' min');
  if (s.note) lines.push('Nota: ' + s.note.trim());
  return lines.join('\n');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiado. Pegáselo a Coach en el chat.'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) {} ta.remove(); ok ? toast('Copiado. Pegáselo a Coach en el chat.') : prompt('Copiá este texto:', t); }
}

/* ---------- toast, vibración, wake lock, descanso ---------- */
let toastT;
function toast(m, ms = 2400) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms); }
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
let wl = null;
async function wakeLock(on) {
  try {
    if (on && !wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) {}
}
const anyOpenToday = () => sessions.some(s => !s.endedAt && s.date === today());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock(anyOpenToday()); tickRest(); } });

const RKEY = 'p18.rest';
let restI = null;
function startRest(sec, next) { const r = { end: Date.now() + sec * 1000, next: next || '' }; localStorage.setItem(RKEY, JSON.stringify(r)); runRest(); }
function getRest() { try { return JSON.parse(localStorage.getItem(RKEY)); } catch (e) { return null; } }
function runRest() { clearInterval(restI); tickRest(); restI = setInterval(tickRest, 250); }
function tickRest() {
  const r = getRest(); const el = $('#rest');
  if (!r) { el.classList.add('hidden'); clearInterval(restI); return; }
  const left = (r.end - Date.now()) / 1000;
  if (left <= 0) { localStorage.removeItem(RKEY); el.classList.add('hidden'); clearInterval(restI); if (left > -5) { vib([350, 150, 350, 150, 350]); beep(); toast('¡Descanso terminado! A la próxima serie.'); } return; }
  el.classList.remove('hidden'); $('#restT').textContent = mmss(left); $('#restNext').textContent = r.next ? '· ' + r.next : '';
}
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .25); } catch (e) {} }
$('#rest').addEventListener('click', ev => {
  const b = ev.target.closest('[data-r]'); if (!b) return; const r = getRest(); if (!r) return;
  if (b.dataset.r === 'skip') { localStorage.removeItem(RKEY); tickRest(); return; }
  r.end += (+b.dataset.r) * 1000; localStorage.setItem(RKEY, JSON.stringify(r)); tickRest();
});

/* ---------- tema ---------- */
const THEMES = { papel: ['Papel', '#F5F2E9'], tinta: ['Tinta', '#EDEAE1'], carbon: ['Carbón', '#17181A'] };
function applyTheme() { document.body.dataset.theme = S.theme; $('#themeBtn').textContent = THEMES[S.theme][0]; document.querySelector('meta[name=theme-color]').content = THEMES[S.theme][1]; }
$('#themeBtn').onclick = () => { const k = Object.keys(THEMES); S.theme = k[(k.indexOf(S.theme) + 1) % k.length]; saveS(); applyTheme(); };

/* ---------- medios ---------- */
const thumb = e => e.media.tipo === 'video' ? e.media.poster : (e.media.tipo === 'fotos' ? e.media.src[0] : e.media.src);
function mediaHTML(e) {
  const m = e.media;
  if (m.tipo === 'video') return `<div class="media"><video src="${m.src}" poster="${m.poster}" autoplay loop muted playsinline preload="metadata" aria-label="${esc(e.nombre)}"></video></div>`;
  if (m.tipo === 'fotos') return `<div class="media"><img class="fr f0" src="${m.src[0]}" alt="${esc(e.nombre)} inicio"><img class="fr f1" src="${m.src[1]}" alt="${esc(e.nombre)} final"><span class="tag">Foto inicio / fin</span></div>`;
  return `<div class="media"><img src="${m.src}" alt="${esc(e.nombre)}"><span class="tag">Ilustración</span></div>`;
}
const credLine = m => { const c = m.credito; if (!c || !c.url) return c ? esc(c.autor) : ''; return `${esc(c.fuente)} · ${esc(c.autor)} · <a href="${c.licenciaUrl}" target="_blank" rel="noopener">${esc(c.licencia)}</a> · <a href="${c.url}" target="_blank" rel="noopener">fuente</a>${c.cambios ? ' · ' + esc(c.cambios) : ''}`; };

/* ---------- vistas ---------- */
const view = $('#view');
function go(v) { ui.view = v; document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', v.startsWith(b.dataset.go) || (b.dataset.go === 'historial' && v.startsWith('sesion')) || (b.dataset.go === 'plan' && v === 'creditos'))); render(); window.scrollTo(0, 0); }
function render() {
  $('#hdrDate').textContent = fDate(today()) + ' · semana ' + weekOf(today());
  const v = ui.view;
  if (v === 'hoy') view.innerHTML = vHoy();
  else if (v === 'historial') view.innerHTML = vHist();
  else if (v.startsWith('sesion:')) view.innerHTML = vSesion(v.slice(7));
  else if (v === 'plan') view.innerHTML = vPlan();
  else if (v === 'creditos') view.innerHTML = vCreditos();
  wakeLock(anyOpenToday());
}

function itemsHTML(day, ctx, s, clickable) {
  let h = '<div class="list">'; let n = 0, lastSS = null;
  day.items.forEach((it, i) => {
    const e = EX[it.ex]; const r = rx(it, ctx); const done = setsOf(s, it.ex).length;
    let lab;
    if (it.ss) { if (it.ss !== lastSS) { n++; h += `<div class="ssbox"><div class="sslab">Superserie ${n}: A y B seguidas, descanso después del par</div>`; lab = n + 'A'; } else lab = n + 'B'; }
    else { n++; lab = String(n); }
    const target = it.seg ? r.series + ' × ' + it.seg + ' s' + (e.porLado ? '/lado' : '') : r.series + ' × ' + rng(it.reps) + (e.porLado ? '/lado' : '');
    const sg = clickable && !r.skip ? suggest(it, r, day.id, s && s.id, ctx) : null;
    const sgTxt = sg && !sg.first ? (sg.kg ? fKg(sg.kg) + ' kg × ' + sg.reps : (sg.seg ? sg.seg + ' s' : sg.reps + ' reps')) + (sg.up ? ' ↑' : '') : '';
    h += `<button class="item${done >= r.series ? ' done' : ''}${r.skip ? ' skip' : ''}" ${clickable ? `data-act="open" data-i="${i}"` : 'data-act="openplan" data-d="' + day.id + '" data-i="' + i + '"'}>
      <span class="n">${lab}</span><img class="th" src="${thumb(e)}" alt="" loading="lazy">
      <span class="tx"><div class="nm">${esc(e.nombre)}</div><div class="rx">${target}${r.rir ? ' · RIR ' + r.rir : ''}</div>
      ${r.skip ? `<div class="sg accent">${esc(r.skip)}</div>` : (r.notes.length ? `<div class="sg warn">${esc(r.notes.join(' · '))}</div>` : '')}
      ${sgTxt ? `<div class="sg">${sg.up ? '<span class="accent">Subí:</span> ' : 'Hoy: '}${esc(sgTxt)}</div>` : ''}</span>
      <span class="st">${clickable ? (done ? done + '/' + r.series : '') : ''}${done >= r.series && clickable ? '<br><span class="ok">✓</span>' : ''}</span></button>`;
    if (it.ss && (i + 1 >= day.items.length || day.items[i + 1].ss !== it.ss)) h += '</div>';
    lastSS = it.ss || null;
  });
  return h + '</div>';
}

function vHoy() {
  const t = today(); const dayId = selDay(); const day = DAYS[dayId]; const ctx = ctxFor(t, dayId); const sug = suggestedDay(t);
  const s = openSession(t, dayId) || doneSession(t, dayId);
  const p = S.partido[t] || '';
  let h = `${ctx.deload ? '<div class="mono warn">Semana de descarga</div>' : ''}<h1 class="serif">${day.nombre}<br><i class="faint" style="font-size:30px">${esc(day.sub)}</i></h1>`;
  h += `<div class="lab">Partido</div><div class="chips" style="margin-top:6px">${[['', 'No juego'], ['hoy', 'Juego hoy'], ['manana', 'Juego mañana'], ['ayer', 'Jugué ayer']].map(([k, l]) => `<button class="chip small${p === k ? ' on' : ''}" data-act="partido" data-p="${k}">${l}</button>`).join('')}</div>`;
  h += `<div class="seg">${PLAN.dias.map(d => `<button class="${d.id === dayId ? 'on' : ''}" data-act="day" data-d="${d.id}">${d.id === sug.id ? '<span class="sug">sugerido</span>' : ''}<b>${d.nombre.replace('Día ', 'D')}</b><small>${esc(d.sub)} · ${d.dia}</small></button>`).join('')}</div>`;
  if (dayId === sug.id && sug.why) h += `<div class="mono faint" style="margin-top:-4px">Sugerido: ${esc(sug.why)}</div>`;
  if (dayId === 'd1' && (p === 'hoy' || p === 'manana')) h += `<div class="banner"><b>Ojo:</b> el Día 1 (sentadilla pesada + nórdico) no conviene si jugás ${p === 'hoy' ? 'hoy' : 'mañana'}. Mejor Día 2 o 3 con piernas a 3 RIR. <button class="chip small" data-act="day" data-d="${sug.id}">Cambiar a ${DAYS[sug.id].nombre}</button></div>`;
  if (dayId === 'd1' && p === 'ayer') h += `<div class="banner"><b>Ojo:</b> no hagas el Día 1 el día después de jugar. <button class="chip small" data-act="day" data-d="${sug.id}">Cambiar a ${DAYS[sug.id].nombre}</button></div>`;
  if (ctx.week === 1) h += `<div class="banner okb"><b>Semana 1:</b> todo a 2–3 RIR para adaptarte. Vas a sentir que no hiciste nada: está bien.</div>`;
  if (ctx.deload) h += `<div class="banner warnb"><b>Semana de descarga:</b> mismo peso, mitad de las series. Ya está aplicado abajo.</div>`;
  else if (isDeload(ctx.week + 1)) h += `<div class="banner warnb"><b>Aviso:</b> la semana que viene toca descarga (mismo peso, mitad de series).</div>`;
  const other = sessions.find(x => !x.endedAt && x.dayId !== dayId && x.date === t);
  if (other) h += `<div class="banner">Tenés el ${DAYS[other.dayId].nombre} en curso. <button class="chip small" data-act="day" data-d="${other.dayId}">Ir</button></div>`;
  const old = sessions.find(x => !x.endedAt && x.date !== t);
  if (old) h += `<div class="banner">Quedó sin terminar el ${DAYS[old.dayId].nombre} del ${fDate(old.date)}. <button class="chip small" data-act="endold" data-id="${old.id}">Terminarla</button></div>`;
  if (s) {
    const n = s.sets.length;
    if (!s.endedAt) h += `<div class="card"><div class="row between"><span class="mono">En curso · desde ${new Date(s.startedAt).toTimeString().slice(0, 5)}</span><span class="mono">${n} series</span></div>
      <div class="lab">Nota de la sesión</div><textarea data-act="note" data-id="${s.id}" placeholder="Cómo te sentiste, molestias, máquina ocupada…">${esc(s.note)}</textarea>
      <div class="btns2"><button class="btn alt small" data-act="copy" data-id="${s.id}">Copiar para Coach</button><button class="btn small" data-act="end" data-id="${s.id}">Terminar sesión</button></div></div>`;
    else h += `<div class="card"><div class="row between"><span class="mono ok">Sesión guardada ✓</span><span class="mono">${n} series · ${Math.round((s.endedAt - s.startedAt) / 60000)} min</span></div>
      <div class="btns2"><button class="btn small" data-act="copy" data-id="${s.id}">Copiar para Coach</button><button class="btn alt small" data-act="reopen" data-id="${s.id}">Reabrir</button></div></div>`;
  } else h += `<p class="faint" style="font-size:13.5px;margin:10px 0 0">${esc(day.desc)} La sesión arranca sola cuando guardás la primera serie.</p>`;
  h += itemsHTML(day, ctx, s, true);
  return h;
}

function vHist() {
  const wk = weekOf(today()); const thisWk = sessions.filter(s => weekOf(s.date) === wk).length;
  let h = `<div class="mono faint">Historial</div><div class="row" style="gap:18px;margin:6px 0 4px"><div><div class="big">${sessions.length}</div><div class="mono faint">sesiones</div></div><div><div class="big">${thisWk}<span class="faint" style="font-size:28px">/3</span></div><div class="mono faint">esta semana</div></div></div>`;
  if (!sessions.length) return h + '<div class="empty">Todavía no hay sesiones. Guardá tu primera serie en «Hoy».</div>';
  h += '<div class="list">' + sessions.map(s => `<button class="item" data-act="ses" data-id="${s.id}"><span class="tx"><div class="nm">${fDate(s.date)} · ${DAYS[s.dayId].nombre} <span class="faint" style="font-weight:400">${esc(DAYS[s.dayId].sub)}</span></div>
    <div class="rx">${s.sets.length} series · ${new Set(s.sets.map(x => x.ex)).size} ejercicios${s.endedAt ? ' · ' + Math.round((s.endedAt - s.startedAt) / 60000) + ' min' : ' · <span class="accent">sin terminar</span>'}${s.deload ? ' · descarga' : ''}</div>
    ${s.note ? `<div class="sg faint">${esc(s.note.slice(0, 80))}</div>` : ''}</span><span class="st">›</span></button>`).join('') + '</div>';
  return h;
}

function vSesion(id) {
  const s = sessions.find(x => x.id === id); if (!s) return '<div class="empty">No existe.</div>';
  const day = DAYS[s.dayId]; const order = day.items.map(i => i.ex);
  const exs = [...new Set(s.sets.map(x => x.ex))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  let h = `<button class="chip small" data-act="nav" data-v="historial">← Historial</button><h1 class="serif" style="margin-top:12px">${day.nombre} <i class="faint" style="font-size:28px">${esc(day.sub)}</i></h1>
  <div class="row" style="gap:8px;flex-wrap:wrap"><label class="mono faint">Fecha</label><input type="date" value="${s.date}" data-act="sdate" data-id="${s.id}">
  <select data-act="sday" data-id="${s.id}" style="border:1px solid var(--rule);padding:8px">${PLAN.dias.map(d => `<option value="${d.id}"${d.id === s.dayId ? ' selected' : ''}>${d.nombre}</option>`).join('')}</select></div>
  <div class="lab">Nota</div><textarea data-act="note" data-id="${s.id}">${esc(s.note)}</textarea>`;
  for (const ex of exs) {
    const e = EX[ex]; h += `<h2 class="serif" style="font-size:22px">${esc(e.nombre)}</h2><div class="hist-set mono faint"><span>#</span><span>${e.tipo === 'seg' ? 'seg' : 'kg'}</span><span>${e.tipo === 'seg' ? '' : 'reps'}</span><span>RIR</span><span></span></div>`;
    s.sets.forEach((x, k) => { if (x.ex !== ex) return; const n = s.sets.slice(0, k + 1).filter(y => y.ex === ex).length;
      h += `<div class="hist-set"><span class="mono faint">S${n}</span>${e.tipo === 'seg' ? `<input inputmode="numeric" value="${x.seg ?? ''}" data-act="eset" data-id="${s.id}" data-k="${k}" data-f="seg"><span></span>` : `<input inputmode="decimal" value="${fKg(x.kg)}" data-act="eset" data-id="${s.id}" data-k="${k}" data-f="kg"><input inputmode="numeric" value="${x.reps ?? ''}" data-act="eset" data-id="${s.id}" data-k="${k}" data-f="reps">`}<input inputmode="numeric" value="${x.rir ?? ''}" data-act="eset" data-id="${s.id}" data-k="${k}" data-f="rir"><button class="del" data-act="dset" data-id="${s.id}" data-k="${k}" aria-label="Borrar serie">×</button></div>`; });
  }
  if (!exs.length) h += '<div class="empty">Sin series.</div>';
  h += `<div class="btns2" style="margin-top:18px"><button class="btn small" data-act="copy" data-id="${s.id}">Copiar para Coach</button>${s.endedAt ? `<button class="btn alt small" data-act="reopen" data-id="${s.id}">Reabrir</button>` : `<button class="btn alt small" data-act="end" data-id="${s.id}">Terminar</button>`}</div>
  <button class="btn alt small" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="dses" data-id="${s.id}">Borrar sesión</button>`;
  return h;
}

function vPlan() {
  const d = DAYS[ui.planDay];
  let h = `<div class="mono faint">${esc(PLAN.nombre)}</div><h1 class="serif">Plan</h1><div class="seg">${PLAN.dias.map(x => `<button class="${x.id === d.id ? 'on' : ''}" data-act="pday" data-d="${x.id}"><b>${x.nombre.replace('Día ', 'D')}</b><small>${esc(x.sub)} · ${x.dia}</small></button>`).join('')}</div>
  <p class="faint" style="font-size:13.5px">${esc(d.desc)}</p>${itemsHTML(d, ctxFor(today(), d.id), null, false)}`;
  h += '<h2 class="serif">Reglas</h2>' + PLAN.reglas.map(([t, x]) => `<div class="card"><div class="mono">${esc(t)}</div><div style="margin-top:4px;font-size:14px">${esc(x)}</div></div>`).join('');
  const w = weekOf(today());
  h += `<h2 class="serif">Ajustes</h2><div class="lab">Tema</div><div class="chips" style="margin-top:6px">${Object.entries(THEMES).map(([k, [l]]) => `<button class="chip small${S.theme === k ? ' on' : ''}" data-act="theme" data-t="${k}">${l}</button>`).join('')}</div>
  <div class="lab">Inicio del programa (semana 1)</div><input type="date" value="${S.inicio || ''}" data-act="inicio" style="margin-top:6px"><div class="mono faint" style="margin-top:4px">Hoy: semana ${w}</div>
  <div class="lab">Descarga cada</div><div class="chips" style="margin-top:6px">${[7, 8].map(n => `<button class="chip small${(S.descargaCada || 8) === n ? ' on' : ''}" data-act="dcada" data-n="${n}">${n} semanas</button>`).join('')}
  <button class="chip small${S.forzarDescarga === w ? ' on' : ''}" data-act="forzar">Descarga esta semana</button></div>
  <h2 class="serif">Datos</h2><p class="faint" style="font-size:13.5px">Todo queda guardado solo en este teléfono. Hacé un respaldo de vez en cuando.</p>
  <div class="btns2"><button class="btn small" data-act="export">Exportar JSON</button><button class="btn alt small" data-act="import">Importar JSON</button></div><input type="file" id="impFile" accept="application/json,.json" class="hidden">
  <div class="mono faint" style="margin-top:8px" id="persistInfo"></div>
  <h2 class="serif">Más</h2><button class="btn alt small" data-act="nav" data-v="creditos">Créditos y licencias de imágenes</button>
  <p class="mono faint" style="margin-top:14px">v${APPV} · <a href="../" style="color:var(--faint)">versión anterior</a></p>`;
  setTimeout(async () => { const el = $('#persistInfo'); if (!el || !navigator.storage) return; const p = navigator.storage.persisted ? await navigator.storage.persisted() : false; el.textContent = p ? 'Guardado persistente: activado' : 'Guardado persistente: no garantizado por el navegador (instalá la app para mejorar)'; }, 0);
  return h;
}

function vCreditos() {
  const seen = new Set(); let rows = '';
  for (const e of Object.values(EX)) { const c = e.media.credito; if (seen.has(e.id)) continue; seen.add(e.id);
    rows += `<div class="credrow"><b>${esc(e.nombre)}</b> — ${e.media.tipo === 'video' ? 'video' : e.media.tipo === 'fotos' ? 'fotos inicio/fin' : 'ilustración'}<br>${c.url ? `«${esc(c.titulo)}» · ${esc(c.autor)} · ${esc(c.fuente)} · <a href="${c.licenciaUrl}" target="_blank" rel="noopener">${esc(c.licencia)}</a> · <a href="${c.url}" target="_blank" rel="noopener">fuente</a>${c.cambios ? '<br><span class="faint">Cambios: ' + esc(c.cambios) + '</span>' : ''}` : esc(c.autor)}${e.media.nota ? '<br><span class="faint">' + esc(e.media.nota) + '</span>' : ''}</div>`; }
  return `<button class="chip small" data-act="nav" data-v="plan">← Plan</button><h1 class="serif" style="margin-top:12px">Créditos</h1>
  <p style="font-size:14px">Los videos se usan bajo licencias Creative Commons. Los clips derivados de obras <b>CC BY-SA 4.0</b> (wger.de y «Your Move» en Wikimedia Commons) se distribuyen a su vez bajo <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>; los de FitnessScape, bajo <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. Los autores no avalan esta app. Las fotos vienen de free-exercise-db (Unlicense).</p>
  ${rows}
  <div class="credrow"><b>Tipografías</b> — Instrument Serif, Karla e IBM Plex Mono, bajo <a href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License 1.1</a>.</div>
  <div class="credrow"><b>Diseño</b> — basado en el prototipo «Plan 18 · Cuaderno» de Francisco (Claude Design, julio 2026). Textos de técnica adaptados de ese prototipo.</div>`;
}

/* ---------- hoja de ejercicio ---------- */
const sheet = $('#sheet');
function openSheet(i, dayId) { ui.sheet = { i, dayId: dayId || selDay() }; ui.tab = 'reg'; ui.inp = null; renderSheet(); sheet.classList.remove('hidden'); sheet.scrollTop = 0; }
function closeSheet() { ui.sheet = null; sheet.classList.add('hidden'); sheet.innerHTML = ''; render(); }
function initInp(it, r, s, sg) {
  const e = EX[it.ex]; const mine = setsOf(s, it.ex); const prev = mine[mine.length - 1];
  if (prev) return { kg: prev.kg, reps: prev.reps, seg: prev.seg, rir: null };
  return { kg: sg.kg ?? null, reps: sg.reps ?? (it.reps ? it.reps[0] : null), seg: sg.seg ?? it.seg ?? null, rir: null };
}
function renderSheet() {
  const dayId = ui.sheet.dayId; const day = DAYS[dayId]; const ctx = ctxFor(today(), dayId); const i = ui.sheet.i; const it = day.items[i]; const e = EX[it.ex];
  const s = openSession(today(), dayId) || doneSession(today(), dayId); const r = rx(it, ctx); const sg = suggest(it, r, dayId, s && s.id, ctx);
  if (!ui.inp || ui.inp.ex !== it.ex) ui.inp = Object.assign({ ex: it.ex }, initInp(it, r, s, sg));
  const inp = ui.inp; const mine = setsOf(s, it.ex); const n = mine.length; const complete = n >= r.series;
  const partner = it.ss ? day.items.findIndex((x, k) => k !== i && x.ss === it.ss) : -1;
  let h = `<div class="sh-top"><button class="chip small" data-act="close">← Volver</button><span class="mono faint">${i + 1}/${day.items.length}</span><div class="row" style="gap:5px"><button class="chip small" data-act="prev" ${i === 0 ? 'disabled' : ''}>‹</button><button class="chip small" data-act="next" ${i === day.items.length - 1 ? 'disabled' : ''}>›</button></div></div>
  <div class="sh-body"><div class="mono faint" style="margin-top:10px">${day.nombre} · ${it.ss ? 'Superserie ' + (partner > i ? 'A' : 'B') + ' · con ' + esc(EX[day.items[partner].ex].nombre) : esc(day.sub)}</div>
  <h1 class="serif" style="font-size:34px">${esc(e.nombre)}</h1>${mediaHTML(e)}
  <div class="tabs"><button class="${ui.tab === 'reg' ? 'on' : ''}" data-act="tab" data-t="reg">Registro</button><button class="${ui.tab === 'tec' ? 'on' : ''}" data-act="tab" data-t="tec">Técnica</button></div>`;
  if (ui.tab === 'tec') {
    const t = e.tec;
    h += `<div class="tec"><h4>Claves</h4><ol>${t.claves.map(x => `<li>${esc(x)}</li>`).join('')}</ol><h4>Errores comunes</h4><ul>${t.errores.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="kv"><div><div class="mono faint">Tempo</div>${esc(t.tempo)}</div><div><div class="mono faint">Descanso</div>${fRest(it.descanso)}</div></div>
    <h4>Respiración</h4><p style="margin:0">${esc(t.respiracion)}</p><h4>Músculos</h4><p style="margin:0">${esc(t.musculos.join(' · '))}</p>
    ${e.media.nota ? `<p class="cred">${esc(e.media.nota)}</p>` : ''}<p class="cred">${credLine(e.media)}</p></div>`;
  } else {
    h += `<div class="rx-line">${r.series} × ${it.seg ? it.seg + ' s' : rng(it.reps)}${e.porLado ? ' por lado' : ''}${r.rir ? ' · RIR ' + r.rir : ''} · descanso ${fRest(it.descanso)}${it.ss ? ' (después del par)' : ''}</div>`;
    if (r.notes.length) h += `<div class="mono warn" style="font-size:10.5px">${esc(r.notes.join(' · '))}</div>`;
    if (it.nota) h += `<div class="faint" style="font-size:13px">${esc(it.nota)}</div>`;
    if (r.skip) h += `<div class="banner">${esc(r.skip)}</div>`;
    h += `<div class="card" style="margin:10px 0"><div class="mono ${sg.up ? 'accent' : 'faint'}">${sg.up ? 'Subí de peso' : 'Sugerencia'}</div><div style="font-size:14px;margin-top:3px">${esc(sg.txt)}</div></div>`;
    const cnt = Math.max(r.series, n + (complete ? 0 : 0));
    h += '<div class="sets">' + Array.from({ length: cnt }, (_, k) => { const x = mine[k]; return `<div class="s${x ? ' ok' : ''}${k === n ? ' cur' : ''}"><small>S${k + 1}</small><b>${x ? (e.tipo === 'seg' ? x.seg + 's' : (x.kg ? fKg(x.kg) + '×' : '') + x.reps) + (x.rir != null ? ' ·' + x.rir : '') : '—'}</b></div>`; }).join('') + (n > r.series ? mine.slice(r.series).map((x, k) => `<div class="s ok"><small>S${r.series + k + 1}</small><b>${(x.kg ? fKg(x.kg) + '×' : '') + (x.reps ?? x.seg + 's')}</b></div>`).join('') : '') + '</div>';
    if (complete) h += `<div class="banner okb"><b>✓ Listo:</b> ${n} series. ${i < day.items.length - 1 ? `<button class="chip small ink" data-act="next">Siguiente: ${esc(EX[day.items[i + 1].ex].nombre)} ›</button>` : 'Era el último: terminá la sesión en «Hoy».'}</div>`;
    if (!e.sinPeso) h += `<div class="lab"><span>Kilos${e.lastre ? ' (0 = peso corporal; lastre si suma)' : ''}</span><span>± ${fKg(e.paso)}</span></div><div class="stepper"><button data-act="kg" data-d="-1" aria-label="menos">−${fKg(e.paso)}</button><input id="kgIn" inputmode="decimal" value="${fKg(inp.kg)}" placeholder="kg" data-act="kgin"><button data-act="kg" data-d="1" aria-label="más">+${fKg(e.paso)}</button></div>`;
    if (e.tipo === 'seg') { const opts = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90]; h += `<div class="lab"><span>Segundos${e.porLado ? ' por lado' : ''}</span><span>objetivo ${it.seg}</span></div><div class="reps">${opts.map(v => `<button class="${inp.seg === v ? 'on' : ''}${v === it.seg ? ' tgt' : ''}" data-act="seg" data-v="${v}">${v}</button>`).join('')}</div>`; }
    else { const lo = Math.max(1, it.reps[0] - 3); const opts = Array.from({ length: 12 }, (_, k) => lo + k); h += `<div class="lab"><span>Repeticiones${e.porLado ? ' por lado' : ''}</span><span>objetivo ${rng(it.reps)}</span></div><div class="reps">${opts.map(v => `<button class="${inp.reps === v ? 'on' : ''}${v >= it.reps[0] && v <= it.reps[1] ? ' tgt' : ''}" data-act="reps" data-v="${v}">${v}</button>`).join('')}</div>`; }
    if (r.rir || it.rir) h += `<div class="lab"><span>RIR (reps en reserva) · opcional</span><span>meta ${r.rir}</span></div><div class="rir">${['0', '1', '2', '3', '4+'].map(v => `<button class="${String(inp.rir) === v.replace('+', '') ? 'on' : ''}" data-act="rir" data-v="${v.replace('+', '')}">${v}</button>`).join('')}</div>`;
    h += `<button class="btn${complete ? ' alt' : ''}" style="margin-top:14px" data-act="save">${complete ? '+ Serie extra' : 'Guardar serie ' + (n + 1)}${it.ss && partner > i && !complete ? ' → B' : ''}</button>
    <div class="btns2">${n ? `<button class="btn alt small" data-act="same">= Igual que S${n}</button><button class="btn alt small" data-act="undo">Deshacer S${n}</button>` : ''}</div>`;
  }
  h += '</div>';
  sheet.innerHTML = h;
  const v = sheet.querySelector('video'); if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
}
async function saveSet(copyPrev) {
  const dayId = ui.sheet.dayId; const day = DAYS[dayId]; const ctx = ctxFor(today(), dayId); const i = ui.sheet.i; const it = day.items[i]; const e = EX[it.ex];
  const s0 = openSession(today(), dayId); const done0 = doneSession(today(), dayId);
  if (!s0 && done0) { done0.endedAt = null; await putSession(done0); }
  const s = await ensureSession(dayId); const mine = setsOf(s, it.ex);
  let x;
  if (copyPrev) { const p = mine[mine.length - 1]; if (!p) return; x = { ex: it.ex, kg: p.kg, reps: p.reps, seg: p.seg, rir: p.rir, ts: Date.now() }; }
  else {
    const kgIn = $('#kgIn'); const kg = e.sinPeso ? null : (kgIn && kgIn.value !== '' ? parseFloat(kgIn.value.replace(',', '.')) : null);
    if (e.tipo === 'seg') { if (!ui.inp.seg) return toast('Elegí los segundos.'); x = { ex: it.ex, kg: null, reps: null, seg: ui.inp.seg, rir: ui.inp.rir, ts: Date.now() }; }
    else { if (!ui.inp.reps) return toast('Elegí las repeticiones.'); if (!e.sinPeso && !e.lastre && (kg == null || isNaN(kg))) return toast('Poné los kilos.'); x = { ex: it.ex, kg: isNaN(kg) ? null : kg, reps: ui.inp.reps, seg: null, rir: ui.inp.rir, ts: Date.now() }; }
  }
  if (x.rir === '' || x.rir == null) x.rir = null; else x.rir = +x.rir;
  s.sets.push(x); await putSession(s); vib(40);
  ui.inp = { ex: it.ex, kg: x.kg, reps: x.reps, seg: x.seg, rir: null };
  const r = rx(it, ctx); const nNow = mine.length + 1;
  const pi = it.ss ? day.items.findIndex((y, k) => k !== i && y.ss === it.ss) : -1;
  let msg = 'Serie ' + nNow + ' guardada';
  if (pi >= 0) {
    const pIt = day.items[pi]; const pr = rx(pIt, ctx); const pDone = setsOf(s, pIt.ex).length;
    const isA = pi > i;
    if (isA && pDone < nNow && pDone < pr.series) { ui.sheet.i = pi; ui.inp = null; toast(msg + ' · Ahora ' + EX[pIt.ex].nombre + ' (B), sin descanso'); renderSheet(); sheet.scrollTop = 0; return; }
    const aIdx = isA ? i : pi; const aIt = day.items[aIdx]; const aDone = setsOf(s, aIt.ex).length; const ar = rx(aIt, ctx);
    if (aDone < ar.series) { startRest(it.descanso, 'después: ' + EX[aIt.ex].nombre + ' (A)'); ui.sheet.i = aIdx; ui.inp = null; toast(msg + ' · Descansá y volvé a A'); renderSheet(); sheet.scrollTop = 0; return; }
    startRest(it.descanso, 'superserie completa'); toast(msg + ' · Superserie completa'); renderSheet(); return;
  }
  if (nNow < r.series) startRest(it.descanso, 'serie ' + (nNow + 1) + ' de ' + r.series);
  else if (i < day.items.length - 1) startRest(Math.min(it.descanso, 120), 'después: ' + EX[day.items[i + 1].ex].nombre);
  toast(nNow >= r.series ? EX[it.ex].nombre + ' listo ✓' : msg);
  renderSheet();
}
async function undoSet() {
  const dayId = ui.sheet.dayId; const it = DAYS[dayId].items[ui.sheet.i]; const s = openSession(today(), dayId) || doneSession(today(), dayId); if (!s) return;
  for (let k = s.sets.length - 1; k >= 0; k--) if (s.sets[k].ex === it.ex) { const [x] = s.sets.splice(k, 1); ui.inp = { ex: it.ex, kg: x.kg, reps: x.reps, seg: x.seg, rir: x.rir }; break; }
  await putSession(s); localStorage.removeItem(RKEY); tickRest(); toast('Última serie borrada'); renderSheet();
}

/* ---------- eventos ---------- */
document.addEventListener('click', async ev => {
  const nb = ev.target.closest('#nav button'); if (nb) { if (ui.sheet) closeSheet(); go(nb.dataset.go); return; }
  const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const a = b.dataset.act; const id = b.dataset.id;
  const ses = id ? sessions.find(x => x.id === id) : null;
  switch (a) {
    case 'partido': S.partido[today()] = b.dataset.p || undefined; if (!b.dataset.p) delete S.partido[today()]; delete S.dia[today()]; saveS(); render(); break;
    case 'day': S.dia[today()] = b.dataset.d; saveS(); render(); window.scrollTo(0, 0); break;
    case 'open': openSheet(+b.dataset.i); break;
    case 'openplan': openSheet(+b.dataset.i, b.dataset.d); ui.tab = 'tec'; renderSheet(); break;
    case 'close': closeSheet(); break;
    case 'prev': if (ui.sheet.i > 0) { ui.sheet.i--; ui.inp = null; renderSheet(); sheet.scrollTop = 0; } break;
    case 'next': if (ui.sheet.i < DAYS[ui.sheet.dayId].items.length - 1) { ui.sheet.i++; ui.inp = null; renderSheet(); sheet.scrollTop = 0; } break;
    case 'tab': ui.tab = b.dataset.t; renderSheet(); break;
    case 'kg': { const e = EX[DAYS[ui.sheet.dayId].items[ui.sheet.i].ex]; const cur = parseFloat(($('#kgIn').value || '0').replace(',', '.')) || 0; ui.inp.kg = Math.max(0, Math.round((cur + (+b.dataset.d) * e.paso) * 100) / 100); $('#kgIn').value = fKg(ui.inp.kg); vib(10); break; }
    case 'reps': ui.inp.reps = +b.dataset.v; renderSheetKeep(); break;
    case 'seg': ui.inp.seg = +b.dataset.v; renderSheetKeep(); break;
    case 'rir': ui.inp.rir = String(ui.inp.rir) === b.dataset.v ? null : b.dataset.v; renderSheetKeep(); break;
    case 'save': await saveSet(false); break;
    case 'same': await saveSet(true); break;
    case 'undo': await undoSet(); break;
    case 'copy': if (ses) await copyText(coachText(ses)); break;
    case 'end': if (ses) { ses.endedAt = Date.now(); await putSession(ses); localStorage.removeItem(RKEY); tickRest(); toast('Sesión guardada. Copiásela a Coach.'); render(); } break;
    case 'endold': if (ses) { ses.endedAt = ses.sets.length ? Math.max(...ses.sets.map(x => x.ts)) : ses.startedAt; await putSession(ses); render(); } break;
    case 'reopen': if (ses) { ses.endedAt = null; await putSession(ses); render(); } break;
    case 'ses': go('sesion:' + id); break;
    case 'nav': go(b.dataset.v); break;
    case 'dset': if (ses && confirm('¿Borrar esta serie?')) { ses.sets.splice(+b.dataset.k, 1); await putSession(ses); render(); } break;
    case 'dses': if (ses && confirm('¿Borrar la sesión completa? No se puede deshacer.')) { await dbDel(ses.id); sessions = sessions.filter(x => x !== ses); go('historial'); } break;
    case 'pday': ui.planDay = b.dataset.d; render(); break;
    case 'theme': S.theme = b.dataset.t; saveS(); applyTheme(); render(); break;
    case 'dcada': S.descargaCada = +b.dataset.n; saveS(); render(); break;
    case 'forzar': { const w = weekOf(today()); S.forzarDescarga = S.forzarDescarga === w ? null : w; saveS(); render(); break; }
    case 'export': exportJSON(); break;
    case 'import': $('#impFile').click(); break;
  }
});
function renderSheetKeep() { const kg = $('#kgIn'); if (kg) ui.inp.kg = kg.value === '' ? null : parseFloat(kg.value.replace(',', '.')); const y = sheet.scrollTop; renderSheet(); sheet.scrollTop = y; }
let noteT;
document.addEventListener('input', ev => {
  const el = ev.target; const a = el.dataset.act; if (!a) return; const ses = el.dataset.id ? sessions.find(x => x.id === el.dataset.id) : null;
  if (a === 'note' && ses) { ses.note = el.value; clearTimeout(noteT); noteT = setTimeout(() => putSession(ses), 400); }
  if (a === 'kgin' && ui.inp) { const v = parseFloat(el.value.replace(',', '.')); ui.inp.kg = isNaN(v) ? null : v; }
});
document.addEventListener('change', async ev => {
  const el = ev.target; const a = el.dataset.act; const ses = el.dataset.id ? sessions.find(x => x.id === el.dataset.id) : null;
  if (a === 'sdate' && ses && el.value) { ses.date = el.value; await putSession(ses); toast('Fecha actualizada'); }
  if (a === 'sday' && ses) { ses.dayId = el.value; await putSession(ses); render(); }
  if (a === 'eset' && ses) { const x = ses.sets[+el.dataset.k]; const f = el.dataset.f; const v = el.value.trim() === '' ? null : parseFloat(el.value.replace(',', '.')); x[f] = isNaN(v) ? null : v; await putSession(ses); toast('Guardado'); }
  if (a === 'inicio') { S.inicio = el.value || null; saveS(); render(); }
  if (el.id === 'impFile' && el.files[0]) importJSON(el.files[0]);
});

/* ---------- export / import ---------- */
function exportJSON() {
  const data = { app: 'plan18-cuaderno', formato: 1, exportado: new Date().toISOString(), plan: PLAN.version, ajustes: { inicio: S.inicio, descargaCada: S.descargaCada, theme: S.theme }, sesiones: sessions };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plan18-registro-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Respaldo descargado');
}
async function importJSON(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'plan18-cuaderno' || !Array.isArray(d.sesiones)) throw new Error('formato');
    const ok = d.sesiones.filter(s => s && s.id && s.date && DAYS[s.dayId] && Array.isArray(s.sets));
    if (!confirm('Importar ' + ok.length + ' sesiones. Las que tengan el mismo id se reemplazan. ¿Seguir?')) return;
    for (const s of ok) { await dbPut(s); }
    sessions = await dbAll(); sortSessions();
    if (d.ajustes && d.ajustes.inicio && !S.inicio) { S.inicio = d.ajustes.inicio; saveS(); }
    toast('Importadas ' + ok.length + ' sesiones'); render();
  } catch (e) { toast('No pude leer ese archivo (¿es un respaldo de esta app?)'); }
}

/* ---------- arranque ---------- */
async function boot() {
  applyTheme();
  try { PLAN = await (await fetch('plan.json')).json(); } catch (e) { view.innerHTML = '<div class="empty">No pude cargar el plan. Abrí la app con conexión una vez.</div>'; return; }
  EX = PLAN.ejercicios; PLAN.dias.forEach(d => DAYS[d.id] = d);
  db = await openDB(); sessions = await dbAll(); sortSessions();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render(); if (getRest()) runRest();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__p18 = { coachText, sessions: () => sessions };
}
boot();
})();
