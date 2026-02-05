'use strict';

/** =========================
 *  CONFIG
 *  Pega aquí tu URL /exec de Apps Script
========================= */
const API_BASE = 'https://script.google.com/macros/s/AKfycbx9JhyQzseQ4FV3m_gX462nTyfjRkPM5xLy4e4u6AWP6I3ielwdJRvxt8HAR66grnBI/exec';

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

let STATE = {
  config: null,
  schedule: null,
  totals: null,
};

function setStatus(msg){
  const el = $('#status');
  if(el) el.textContent = msg;
}

function apiUrl(action, params = {}){
  const u = new URL(API_BASE);
  u.searchParams.set('action', action);
  for(const [k,v] of Object.entries(params)){
    if(v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function apiGet(action, params){
  const res = await fetch(apiUrl(action, params), { method:'GET' });
  if(!res.ok) throw new Error(`HTTP ${res.status} (${action})`);
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || 'API error');
  return data;
}

async function apiPost(action, payload){
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status} (${action})`);
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || 'API error');
  return data;
}

function formatHours(x){
  const n = Number(x || 0);
  return (Math.round(n*100)/100).toString();
}

function parseHours(v){
  const s = String(v ?? '').trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function safeCenterName(id){
  const c = (STATE.config?.centers || []).find(x => x.centroId === id);
  return c ? c.nombre : id;
}

/* =========================
   FECHA + DÍA (es-CO)
   - Evita corrimientos por timezone
========================= */
function weekdayEs(isoDate){
  // isoDate: "YYYY-MM-DD"
  const dt = new Date(isoDate + 'T00:00:00');
  return new Intl.DateTimeFormat('es-CO', { weekday:'long' }).format(dt); // "lunes"...
}
function dateWithWeekday(isoDate){
  return `${isoDate} · ${weekdayEs(isoDate)}`;
}

function mountTabs(){
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.tab;
      ['base','cronograma','ajustes','totales'].forEach(k=>{
        $('#tab-' + k).classList.toggle('hidden', k !== key);
      });
    });
  });
}

async function loadAll(){
  try{
    if(!API_BASE || API_BASE.includes('PASTE_')){
      setStatus('Pega tu URL /exec en app.js (API_BASE).');
      renderSetupHint();
      return;
    }

    const apiLink = $('#btnOpenApi');
    if(apiLink) apiLink.href = apiUrl('config');

    setStatus('Cargando config…');
    STATE.config = await apiGet('config');

    setStatus('Cargando cronograma…');
    STATE.schedule = await apiGet('schedule', {
      year: STATE.config.year,
      from: STATE.config.range.start,
      to: STATE.config.range.end,
    });

    setStatus('Cargando totales…');
    STATE.totals = await apiGet('totals', {
      year: STATE.config.year,
      from: STATE.config.range.start,
      to: STATE.config.range.end,
      groupBy: 'center',
    });

    renderBase();
    renderCronograma();
    renderAjustes();
    renderTotales();

    setStatus('Listo ✅');
  }catch(err){
    console.error(err);
    setStatus('Error cargando: ' + (err?.message || err));
    // deja una pista en UI en lugar de quedar vacío
    renderSetupHint('No pude cargar el API. Revisa la URL /exec, permisos, o que el Web App esté “cualquiera”.');
  }
}

function renderSetupHint(extraMsg=''){
  $('#tab-base').innerHTML = `
    <div class="box">
      <div class="badge">⚠️ Falta conectar / cargar el API</div>
      <p class="small" style="margin-top:10px">
        Abre <b>app.js</b> y pega tu URL de Apps Script (la que termina en <b>/exec</b>)
        en la constante <b>API_BASE</b>.
      </p>
      ${extraMsg ? `<p class="small" style="margin-top:10px">${extraMsg}</p>` : ``}
    </div>
  `;
  $('#tab-cronograma').innerHTML = '';
  $('#tab-ajustes').innerHTML = '';
  $('#tab-totales').innerHTML = '';
}

// ---------- BASE SEMANAL ----------
function renderBase(){
  const cfg = STATE.config;
  const centers = cfg.centers.filter(c => c.activo);
  const dow = cfg.dow;

  const base = cfg.base || {}; // {centroId:{dow:horas}}
  const rows = centers.map(c=>{
    const cells = dow.map(d=>{
      const v = (base[c.centroId] && base[c.centroId][d.dow] != null) ? base[c.centroId][d.dow] : 0;
      return `<td><input class="inp" data-centro="${c.centroId}" data-dow="${d.dow}" value="${formatHours(v)}" /></td>`;
    }).join('');
    return `<tr><td>${c.nombre}</td>${cells}</tr>`;
  }).join('');

  const head = dow.map(d=>`<th>${d.label}</th>`).join('');

  $('#tab-base').innerHTML = `
    <div class="grid">
      <div class="box">
        <div class="kpi"><span>Año</span><b>${cfg.year}</b></div>
        <div style="height:10px"></div>
        <div class="kpi"><span>Rango</span><b>${cfg.range.start} → ${cfg.range.end}</b></div>
        <div style="height:10px"></div>
        <div class="small">
          ✔️ Soporta medias horas (0.5).<br>
          ✔️ Domingos siempre 0.<br>
          ✔️ Festivos + cierres en 0 (a menos que metas override).
        </div>
        <div style="height:12px"></div>
        <button class="btn" id="btnSaveBase">Guardar base</button>
      </div>

      <div class="box">
        <div class="badge">Base semanal (Lun–Sáb)</div>
        <div style="height:10px"></div>
        <table class="table">
          <thead>
            <tr><th>Centro</th>${head}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="small" style="margin-top:10px">
          Tip: usa 0; 0.5; 1; 1.5; 2; 3.5… lo que necesites.
        </div>
      </div>
    </div>
  `;

  $('#btnSaveBase').addEventListener('click', saveBaseFromUI);
}

async function saveBaseFromUI(){
  try{
    setStatus('Guardando base…');
    const inputs = $$('#tab-base input[data-centro][data-dow]');
    const rows = inputs.map(inp=>({
      centroId: inp.dataset.centro,
      dow: Number(inp.dataset.dow),
      horas: parseHours(inp.value),
    }));
    await apiPost('savebase', { rows });

    // recargar config y schedule
    STATE.config = await apiGet('config');
    STATE.schedule = await apiGet('schedule', {
      year: STATE.config.year,
      from: STATE.config.range.start,
      to: STATE.config.range.end,
    });
    STATE.totals = await apiGet('totals', {
      year: STATE.config.year,
      from: STATE.config.range.start,
      to: STATE.config.range.end,
      groupBy: 'center',
    });

    renderBase();
    renderCronograma();
    renderAjustes();
    renderTotales();
    setStatus('Base guardada ✅');
  }catch(err){
    console.error(err);
    setStatus('Error: ' + (err?.message || err));
  }
}

// ---------- CRONOGRAMA ----------
function renderCronograma(){
  const cfg = STATE.config;
  const items = STATE.schedule.items || [];
  const centers = cfg.centers.filter(c=>c.activo);

  // selector de centro + mes
  const months = monthList(cfg.range.start, cfg.range.end);
  const centerOpts = [`<option value="">Todos los centros</option>`]
    .concat(centers.map(c=>`<option value="${c.centroId}">${c.nombre}</option>`))
    .join('');
  const monthOpts = months.map(m=>`<option value="${m}">${m}</option>`).join('');

  $('#tab-cronograma').innerHTML = `
    <div class="box">
      <div class="row">
        <div>
          <div class="small">Centro</div>
          <select id="schCenter">${centerOpts}</select>
        </div>
        <div>
          <div class="small">Mes</div>
          <select id="schMonth">${monthOpts}</select>
        </div>
      </div>
      <div style="height:12px"></div>
      <div id="schOut"></div>
    </div>
  `;

  const schCenter = $('#schCenter');
  const schMonth = $('#schMonth');

  const draw = ()=>{
    const cid = schCenter.value || '';
    const ym = schMonth.value || months[0] || '';
    if(!ym){
      $('#schOut').innerHTML = `<div class="small">Sin rango de meses.</div>`;
      return;
    }

    const list = items.filter(it => it.fecha?.startsWith(ym) && (!cid || it.centroId === cid));

    // columnas
    const cols = cid
      ? [{centroId: cid, nombre: safeCenterName(cid)}]
      : centers.map(c=>({centroId:c.centroId, nombre:c.nombre}));

    // index para lookup rápido: "fecha|centroId" -> item
    const idx = new Map();
    for(const it of list){
      idx.set(`${it.fecha}|${it.centroId}`, it);
    }

    // fechas ordenadas
    const dates = Array.from(new Set(list.map(x=>x.fecha))).sort();

    const head = cols.map(c=>`<th>${c.nombre}</th>`).join('');

    const body = dates.map(d=>{
      const row = cols.map(c=>{
        const it = idx.get(`${d}|${c.centroId}`);
        const h = it ? Number(it.horas||0) : 0;
        const tag = it && it.fuente !== 'base' && h !== 0 ? `<span class="pill">${it.fuente}</span>` : '';
        return `<td>${formatHours(h)} ${tag}</td>`;
      }).join('');
      // ✅ fecha con día
      return `<tr><td class="datecell">${dateWithWeekday(d)}</td>${row}</tr>`;
    }).join('');

    const total = round2(list.reduce((a,x)=>a+(Number(x.horas)||0),0));

    $('#schOut').innerHTML = `
      <div class="kpi"><span>Total ${ym}</span><b>${formatHours(total)} h</b></div>
      <div style="height:10px"></div>
      <table class="table">
        <thead><tr><th>Fecha</th>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols.length+1}">Sin datos</td></tr>`}</tbody>
      </table>
      <div class="small" style="margin-top:10px">
        Nota: el “pill” aparece cuando la fuente no es base (override, holiday, closure, etc.).
      </div>
    `;
  };

  schCenter.addEventListener('change', draw);
  schMonth.addEventListener('change', draw);

  // default: primer mes del rango
  schMonth.value = months[0] || '';
  draw();
}

// ---------- AJUSTES (Overrides) ----------
function renderAjustes(){
  const cfg = STATE.config;
  const centers = cfg.centers.filter(c=>c.activo);

  const centerOpts = centers.map(c=>`<option value="${c.centroId}">${c.nombre}</option>`).join('');

  $('#tab-ajustes').innerHTML = `
    <div class="grid">
      <div class="box">
        <div class="badge">Crear / actualizar ajuste</div>
        <div style="height:10px"></div>

        <div class="small">Fecha (YYYY-MM-DD)</div>
        <input class="inp" id="ovDate" placeholder="2026-03-05" />

        <div style="height:10px"></div>
        <div class="small">Centro</div>
        <select id="ovCenter">${centerOpts}</select>

        <div style="height:10px"></div>
        <div class="small">Horas (puede ser 0.5)</div>
        <input class="inp" id="ovHours" placeholder="2.5" />

        <div style="height:10px"></div>
        <div class="small">Motivo (opcional)</div>
        <input class="inp" id="ovReason" placeholder="Reprogramación / evento / etc." />

        <div style="height:12px"></div>
        <button class="btn" id="btnSaveOv">Guardar ajuste</button>
        <div style="height:10px"></div>
        <button class="btn ghost" id="btnDelOv">Eliminar ajuste</button>

        <div class="small" style="margin-top:12px">
          Override gana incluso sobre festivo/cierre si necesitan dictar excepcionalmente.
        </div>
      </div>

      <div class="box">
        <div class="badge">Tips</div>
        <div style="height:10px"></div>
        <div class="small">
          - Si cancelan: pon horas = 0.<br>
          - Si fue media jornada: 1.5 o 2.5, etc.<br>
          - Si el día cae en cierre/festivo pero trabajaron: override con horas reales.
        </div>
      </div>
    </div>
  `;

  $('#btnSaveOv').addEventListener('click', saveOverrideFromUI);
  $('#btnDelOv').addEventListener('click', deleteOverrideFromUI);
}

async function saveOverrideFromUI(){
  try{
    const fecha = $('#ovDate').value.trim();
    const centroId = $('#ovCenter').value.trim();
    const horas = parseHours($('#ovHours').value);
    const motivo = $('#ovReason').value.trim();

    if(!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)){
      setStatus('Pon una fecha válida (YYYY-MM-DD).');
      return;
    }
    if(!centroId){
      setStatus('Selecciona un centro.');
      return;
    }

    setStatus('Guardando ajuste…');
    await apiPost('saveoverride', { fecha, centroId, horas, motivo });

    // recargar schedule + totals
    const cfg = STATE.config;
    STATE.schedule = await apiGet('schedule', { year: cfg.year, from: cfg.range.start, to: cfg.range.end });
    STATE.totals = await apiGet('totals', { year: cfg.year, from: cfg.range.start, to: cfg.range.end, groupBy:'center' });

    renderCronograma();
    renderTotales();
    setStatus('Ajuste guardado ✅');
  }catch(err){
    console.error(err);
    setStatus('Error: ' + (err?.message || err));
  }
}

async function deleteOverrideFromUI(){
  try{
    const fecha = $('#ovDate').value.trim();
    const centroId = $('#ovCenter').value.trim();

    if(!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)){
      setStatus('Pon una fecha válida (YYYY-MM-DD).');
      return;
    }
    if(!centroId){
      setStatus('Selecciona un centro.');
      return;
    }

    setStatus('Eliminando ajuste…');
    await apiPost('deleteoverride', { fecha, centroId });

    const cfg = STATE.config;
    STATE.schedule = await apiGet('schedule', { year: cfg.year, from: cfg.range.start, to: cfg.range.end });
    STATE.totals = await apiGet('totals', { year: cfg.year, from: cfg.range.start, to: cfg.range.end, groupBy:'center' });

    renderCronograma();
    renderTotales();
    setStatus('Ajuste eliminado ✅');
  }catch(err){
    console.error(err);
    setStatus('Error: ' + (err?.message || err));
  }
}

// ---------- TOTALES ----------
function renderTotales(){
  const cfg = STATE.config;
  const rows = STATE.totals.rows || [];
  const total = STATE.totals.total || 0;

  const body = rows.map(r => `<tr><td>${r.centro}</td><td>${formatHours(r.horas)}</td></tr>`).join('');

  $('#tab-totales').innerHTML = `
    <div class="grid">
      <div class="box">
        <div class="kpi"><span>Total (rango)</span><b>${formatHours(total)} h</b></div>
        <div style="height:10px"></div>
        <button class="btn" id="btnCsv">Exportar CSV (por centro)</button>
        <div class="small" style="margin-top:10px">
          Rango: ${cfg.range.start} → ${cfg.range.end}<br>
          Cierres y festivos ya están en 0.
        </div>
      </div>

      <div class="box">
        <div class="badge">Horas por centro</div>
        <div style="height:10px"></div>
        <table class="table">
          <thead><tr><th>Centro</th><th>Horas</th></tr></thead>
          <tbody>${body || `<tr><td colspan="2">Sin datos</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  $('#btnCsv').addEventListener('click', ()=> exportCsv(rows));
}

function exportCsv(rows){
  const lines = [];
  lines.push(['Centro','Horas'].join(','));
  for(const r of rows){
    const centro = `"${String(r.centro).replaceAll('"','""')}"`;
    lines.push([centro, String(r.horas)].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'horas_por_centro_2026.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- misc ----------
function monthList(fromISO, toISO){
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  const out = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth(), 1);
  while(cur <= end){
    out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
    cur.setMonth(cur.getMonth()+1);
  }
  return out;
}
function round2(n){ return Math.round((Number(n)||0)*100)/100; }

// ---------- init ----------
mountTabs();
const btnReload = $('#btnReload');
if(btnReload) btnReload.addEventListener('click', loadAll);
loadAll();
