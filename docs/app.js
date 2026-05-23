// ============================================================
// app.js — Lògica del frontend del Planificador d'Equip
// Sense dependències externes · Vanilla JS
// ============================================================

// URL del desplegament RESTRINGIT (domini xtec.cat) — NOMÉS per al flux d'autenticació.
// El navegador hi accedeix directament (window.location.href), mai via fetch().
const AUTH_URL = "https://script.google.com/a/macros/xtec.cat/s/AKfycbyxf-j6hlCtVn3UxsPm5H0e_4MxNJyZ9Dwi3npvM1XOn8fPpSJ-Mc-DcwhEu1aQYsYi/exec";

// URL del desplegament PÚBLIC ANÒNIM — per a totes les crides fetch() de l'API.
// Crea un segon desplegament: "Executar com: Jo" + "Qui té accés: Qualsevol"
// i substitueix la URL de sota per la que et doni Apps Script.
const API_URL = "https://script.google.com/macros/s/SUBSTITUEIX_PER_LA_URL_ANONIMA/exec";

// Clau localStorage on es guarda el token de sessió
const SESSION_KEY = "planificador_sess_v1";

// ---------- ESTAT GLOBAL ----------
const App = {
  usuari:          null,
  tasques:         [],
  vistaActual:     "tauler",
  ganttMode:       "setmanal",
  ganttFiltre:     "totes",
  ganttSubtasques: true
};

const MEMBRES = ["Albert", "Alexandra", "Marta", "Mercè"];
const ESTATS  = ["Pendent", "En curs", "Bloquejada", "Feta"];

// ============================================================
// GESTIÓ DE SESSIÓ
// ============================================================

function obtenirToken() {
  return localStorage.getItem(SESSION_KEY) || null;
}

function guardarToken(token) {
  localStorage.setItem(SESSION_KEY, token);
}

function esborrarToken() {
  localStorage.removeItem(SESSION_KEY);
}

// Redirigeix el navegador a l'Apps Script perquè Google autentiqui l'usuari.
// Quan torna, porta ?session_token=... a la URL.
function iniciarSessio() {
  // Usa AUTH_URL (domini restringit) per a la redirecció d'autenticació
  const redirectUri = window.location.origin + window.location.pathname;
  window.location.href = AUTH_URL + "?accio=auth&redirect=" + encodeURIComponent(redirectUri);
}

function tancarSessio() {
  esborrarToken();
  App.usuari = null;
  mostrarUINoAutenticat("Has tancat la sessió.");
}

// ============================================================
// CAPES D'API
// ============================================================

async function crideApi(payload) {
  const token = obtenirToken();
  try {
    const res = await fetch(API_URL, {
      method:  "POST",
      // Content-Type: text/plain evita el preflight CORS (Apps Script no suporta OPTIONS)
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body:    JSON.stringify(Object.assign({ session_token: token }, payload))
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { ok: false, error: `Error de xarxa: ${err.message}` };
  }
}

async function apiSessio()         { return crideApi({ accio: "sessio" }); }
async function apiLlistarTasques() { return crideApi({ accio: "llistarTasques" }); }
async function apiObtenirAvisos()  { return crideApi({ accio: "obtenirAvisos" }); }
async function apiSincronitzar()   { return crideApi({ accio: "sincronitzarTasquesDesDeDocs" }); }

async function apiCrearTasca(dades)    { return crideApi(Object.assign({ accio: "crearTasca" }, dades)); }
async function apiCrearSubtasca(dades) { return crideApi(Object.assign({ accio: "crearSubtasca" }, dades)); }
async function apiCanviarEstat(codi, estat) { return crideApi({ accio: "canviarEstat", codi, estat }); }
async function apiArxivarTasca(codi)   { return crideApi({ accio: "arxivarTasca", codi }); }

// ============================================================
// UTILITATS GENERALS
// ============================================================

function formatarData(iso) {
  if (!iso) return "—";
  const [any, mes, dia] = String(iso).split("-");
  return `${dia}/${mes}/${any}`;
}

function avuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function dataATimestamp(iso) {
  return iso ? new Date(iso + "T00:00:00").getTime() : null;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function mostrarCarregant(visible) {
  document.getElementById("overlay-carregant").style.display = visible ? "flex" : "none";
}

function mostrarBanner(missatge, tipus = "info", durada = 4000) {
  const b     = document.getElementById("banner-estat");
  b.textContent = missatge;
  b.className   = `banner-estat banner-${tipus}`;
  b.style.display = "block";
  if (durada > 0) setTimeout(() => { b.style.display = "none"; }, durada);
}

function obtenirSubtasques(codiMare) {
  return App.tasques.filter(t => t.parent_id === codiMare);
}

function tasquesPrincipals() {
  return App.tasques.filter(t => !t.parent_id || t.tipus !== "Subtasca");
}

function progresSubtasques(codiMare) {
  const subs  = obtenirSubtasques(codiMare);
  const fetes = subs.filter(s => s.estat === "Feta").length;
  return { total: subs.length, fetes };
}

// ============================================================
// IU: ESTATS NO AUTENTICAT / AUTENTICAT
// ============================================================

function mostrarUINoAutenticat(missatge) {
  document.getElementById("usuari-nom").textContent    = "No autenticat";
  document.getElementById("btn-sincronitzar").style.display = "none";
  document.getElementById("seccio-entrada").style.display   = "none";
  document.querySelector(".nav-vistes").style.display       = "none";
  document.querySelector(".contingut-principal").style.display = "none";

  const m = missatge || "Inicia sessió per accedir al planificador.";
  mostrarBanner(m + " Fes clic a «Inicia sessió» per continuar.", "info", 0);

  // Mostrar botó de login a la capçalera
  let btnLogin = document.getElementById("btn-login");
  if (!btnLogin) {
    btnLogin = document.createElement("button");
    btnLogin.id        = "btn-login";
    btnLogin.className = "btn btn-primari";
    btnLogin.textContent = "Inicia sessió amb Google";
    btnLogin.addEventListener("click", iniciarSessio);
    document.querySelector(".capcalera-dreta").prepend(btnLogin);
  }
  btnLogin.style.display = "inline-flex";
}

function mostrarUIAutenticat() {
  const btnLogin = document.getElementById("btn-login");
  if (btnLogin) btnLogin.style.display = "none";

  document.getElementById("seccio-entrada").style.display        = "";
  document.querySelector(".nav-vistes").style.display             = "";
  document.querySelector(".contingut-principal").style.display    = "";

  // Afegir botó de tancar sessió si no existeix
  if (!document.getElementById("btn-logout")) {
    const btn = document.createElement("button");
    btn.id        = "btn-logout";
    btn.className = "btn btn-secundari btn-petit";
    btn.textContent = "Surt";
    btn.title     = "Tanca la sessió";
    btn.addEventListener("click", tancarSessio);
    document.querySelector(".capcalera-dreta").appendChild(btn);
  }
}

// ============================================================
// INICIALITZACIÓ
// ============================================================

async function inicialitzar() {
  // Pas 1: comprovar si la URL porta un token de sessió nou (retorn del flux auth)
  const urlParams    = new URLSearchParams(window.location.search);
  const nouToken     = urlParams.get("session_token");
  const authError    = urlParams.get("auth_error");

  if (nouToken) {
    guardarToken(nouToken);
    // Netejar paràmetres de la URL sense recarregar la pàgina
    history.replaceState({}, "", window.location.pathname);
  }

  if (authError) {
    history.replaceState({}, "", window.location.pathname);
    mostrarUINoAutenticat(decodeURIComponent(authError));
    return;
  }

  // Pas 2: verificar sessió actual contra l'API
  const token = obtenirToken();
  if (!token) {
    mostrarUINoAutenticat();
    return;
  }

  mostrarCarregant(true);
  const r = await apiSessio();
  mostrarCarregant(false);

  if (!r.ok) {
    // Token caducat o invàlid
    esborrarToken();
    mostrarUINoAutenticat(r.error || "La sessió ha caducat.");
    return;
  }

  // Sessió vàlida
  App.usuari = r.usuari;
  document.getElementById("usuari-nom").textContent = r.usuari.nom;
  document.getElementById("btn-sincronitzar").style.display = "inline-flex";

  mostrarUIAutenticat();
  configurarEventos();
  await carregarTasques();
}

// ============================================================
// CÀRREGA DE DADES
// ============================================================

async function carregarTasques() {
  mostrarCarregant(true);
  const r = await apiLlistarTasques();
  mostrarCarregant(false);

  if (!r.ok) {
    if (r.error && r.error.includes("Sessió")) {
      esborrarToken();
      mostrarUINoAutenticat(r.error);
      return;
    }
    mostrarBanner(`Error carregant tasques: ${r.error}`, "error");
    return;
  }

  App.tasques = r.tasques || [];
  renderitzarVistaActual();
}

// ============================================================
// GESTIÓ DE VISTES
// ============================================================

function canviarVista(vista) {
  App.vistaActual = vista;
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("actiu", b.dataset.vista === vista);
  });
  document.querySelectorAll(".vista").forEach(v => {
    v.classList.toggle("activa", v.id === `vista-${vista}`);
  });
  renderitzarVistaActual();
}

function renderitzarVistaActual() {
  switch (App.vistaActual) {
    case "tauler":   renderitzarTauler();            break;
    case "gantt":    renderitzarGantt();             break;
    case "persona":  renderitzarPerPersona();        break;
    case "llargues": renderitzarLlargues();          break;
    case "avisos":   carregarIRenderitzarAvisos();   break;
  }
}

// ============================================================
// VISTA: TAULER KANBAN
// ============================================================

function renderitzarTauler() {
  const mapes = {
    "Pendent":    { col: "col-pendent",    compt: "compt-pendent" },
    "En curs":    { col: "col-en-curs",    compt: "compt-en-curs" },
    "Bloquejada": { col: "col-bloquejada", compt: "compt-bloquejada" },
    "Feta":       { col: "col-feta",       compt: "compt-feta" }
  };

  Object.values(mapes).forEach(m => { document.getElementById(m.col).innerHTML = ""; });

  const principals = tasquesPrincipals();

  ESTATS.forEach(estat => {
    const m      = mapes[estat];
    const col    = document.getElementById(m.col);
    const tasques = principals.filter(t => t.estat === estat);
    document.getElementById(m.compt).textContent = tasques.length;

    if (tasques.length === 0) {
      col.innerHTML = `<div class="estat-buit" style="padding:16px"><div class="estat-buit-text">Cap tasca</div></div>`;
      return;
    }
    tasques.forEach(t => col.appendChild(crearTargetaKanban(t)));
  });
}

function crearTargetaKanban(t) {
  const { total, fetes } = progresSubtasques(t.codi);
  const pct = total > 0 ? Math.round((fetes / total) * 100) : 0;

  const div = document.createElement("div");
  div.className      = "targeta";
  div.dataset.estat  = t.estat;
  div.dataset.codi   = t.codi;

  const progresHtml = total > 0
    ? `<div class="barra-progres-contenidor"><div class="barra-progres" style="width:${pct}%"></div></div>
       <div class="text-progres">${fetes}/${total} subtasques fetes</div>`
    : "";

  const btnsEstat = ESTATS
    .filter(e => e !== t.estat)
    .map(e => `<button class="btn-estat btn-estat-${e.toLowerCase().replace(" ","-")}"
                       data-codi="${escHtml(t.codi)}" data-estat="${escHtml(e)}">→ ${escHtml(e)}</button>`)
    .join("");

  div.innerHTML = `
    <div class="targeta-titol">${escHtml(t.tasca)}</div>
    <div class="targeta-meta">
      <div class="targeta-meta-fila"><span>Creador/a:</span> <strong>${escHtml(t.creador)}</strong></div>
      <div class="targeta-meta-fila"><span>Responsable:</span>
        <span class="xip-responsable xip-responsable-${escHtml(t.responsable)}">${escHtml(t.responsable)}</span>
      </div>
      <div class="targeta-meta-fila">
        <span>Inici:</span> ${escHtml(formatarData(t.data_inici))} &nbsp;·&nbsp;
        <span>Fi:</span> ${escHtml(formatarData(t.data_fi))}
      </div>
    </div>
    ${progresHtml}
    <div class="targeta-accions">${btnsEstat}</div>`;

  div.addEventListener("click", e => {
    if (e.target.classList.contains("btn-estat")) return;
    obrirModalTasca(t.codi);
  });
  div.querySelectorAll(".btn-estat").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      accionarCanviEstat(btn.dataset.codi, btn.dataset.estat);
    });
  });
  return div;
}

// ============================================================
// VISTA: GANTT
// ============================================================

function renderitzarGantt() {
  const contenidor = document.getElementById("gantt-contenidor");
  const pxPerDia   = App.ganttMode === "setmanal" ? 40 : 20;

  let visibles = App.tasques.filter(t => t.data_inici && t.data_fi);
  if (App.ganttFiltre !== "totes") visibles = visibles.filter(t => t.responsable === App.ganttFiltre);
  if (!App.ganttSubtasques) visibles = visibles.filter(t => t.tipus !== "Subtasca");

  if (visibles.length === 0) {
    contenidor.innerHTML = `<div class="estat-buit"><div class="estat-buit-icona">📅</div><div class="estat-buit-text">Cap tasca amb dates per mostrar</div></div>`;
    return;
  }

  const ts    = visibles.flatMap(t => [dataATimestamp(t.data_inici), dataATimestamp(t.data_fi)]).filter(Boolean);
  const dMin  = new Date(Math.min(...ts)); dMin.setDate(dMin.getDate() - 3);
  const dMax  = new Date(Math.max(...ts)); dMax.setDate(dMax.getDate() + 7);
  const total = Math.ceil((dMax - dMin) / 86400000) + 1;
  const amp   = total * pxPerDia;

  function px(iso) {
    return Math.max(0, ((new Date(iso + "T00:00:00") - dMin) / 86400000) * pxPerDia);
  }

  const cols  = generarColsDates(dMin, dMax, pxPerDia);
  const avuiX = px(avuiISO());
  const files = construirFilesGantt(visibles);

  let html = `<div class="gantt-taula">
    <div class="gantt-cap">
      <div class="gantt-cap-nom">Tasca</div>
      <div class="gantt-cap-dates" style="width:${amp}px;position:relative;">
        ${cols.map(c => `<div class="gantt-cap-data${c.esAvui?" avui-cap":""}"
          style="position:absolute;left:${c.px}px;width:${c.amplada}px">${escHtml(c.text)}</div>`).join("")}
      </div>
    </div>`;

  files.forEach(({ tasca: t, esSubtasca }) => {
    const esq = px(t.data_inici);
    const bar = Math.max(pxPerDia * 0.5, px(t.data_fi) - esq + pxPerDia);
    html += `
    <div class="gantt-fila${esSubtasca?" gantt-subtasca":""}" data-codi="${escHtml(t.codi)}">
      <div class="gantt-fila-nom" title="${escHtml(t.tasca)} · ${escHtml(t.responsable)}">
        ${esSubtasca ? "└ " : ""}${escHtml(t.tasca)}
      </div>
      <div class="gantt-fila-barra-contenidor" style="width:${amp}px">
        <div class="gantt-linia-avui" style="left:${avuiX}px"></div>
        ${cols.map(c=>`<div class="gantt-cel" style="left:${c.px}px;width:${c.amplada}px"></div>`).join("")}
        <div class="gantt-barra${esSubtasca?" subtasca-barra":""}" data-estat="${escHtml(t.estat)}"
             data-codi="${escHtml(t.codi)}" style="left:${esq}px;width:${bar}px"
             title="${escHtml(t.tasca)} · ${escHtml(formatarData(t.data_inici))} → ${escHtml(formatarData(t.data_fi))}">
          ${escHtml(t.responsable)}
        </div>
      </div>
    </div>`;
  });

  contenidor.innerHTML = html + "</div>";
  contenidor.querySelectorAll(".gantt-barra, .gantt-fila-nom").forEach(el => {
    el.addEventListener("click", () => {
      const codi = el.closest("[data-codi]")?.dataset?.codi || el.dataset?.codi;
      if (codi) obrirModalTasca(codi);
    });
  });
}

function generarColsDates(dMin, dMax, pxPerDia) {
  const cols = [], avui = avuiISO();
  let cursor = new Date(dMin), pxAct = 0;
  const dies = ["Dg","Dl","Dt","Dc","Dj","Dv","Ds"];

  while (cursor <= dMax) {
    const iso = cursor.toISOString().slice(0,10);
    if (pxPerDia >= 30) {
      cols.push({ px: pxAct, amplada: pxPerDia,
        text: `${dies[cursor.getDay()]} ${cursor.getDate()}/${cursor.getMonth()+1}`,
        esAvui: iso === avui });
      pxAct += pxPerDia; cursor.setDate(cursor.getDate() + 1);
    } else {
      const wn = getNumSetmana(cursor);
      cols.push({ px: pxAct, amplada: pxPerDia*7, text: `S${wn}`, esAvui: false });
      pxAct += pxPerDia*7; cursor.setDate(cursor.getDate() + 7);
    }
  }
  return cols;
}

function getNumSetmana(d) {
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dl = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - dl);
  const a1 = new Date(Date.UTC(u.getUTCFullYear(), 0, 4));
  return Math.ceil((((u - a1) / 86400000) + a1.getUTCDay() + 1) / 7);
}

function construirFilesGantt(tasques) {
  const files = [];
  const pr = tasques.filter(t => !t.parent_id || t.tipus !== "Subtasca");
  const sb = tasques.filter(t => t.parent_id  && t.tipus === "Subtasca");
  pr.forEach(t => {
    files.push({ tasca: t, esSubtasca: false });
    if (App.ganttSubtasques) sb.filter(s => s.parent_id === t.codi).forEach(s => files.push({ tasca: s, esSubtasca: true }));
  });
  return files;
}

// ============================================================
// VISTA: PER PERSONA
// ============================================================

function renderitzarPerPersona() {
  const cont = document.getElementById("persona-grups");
  const ini  = { Albert:"AL", Alexandra:"AX", Marta:"MT", Mercè:"MC" };

  cont.innerHTML = MEMBRES.map(membre => {
    const tt = tasquesPrincipals().filter(t => t.responsable === membre && ["Pendent","En curs","Bloquejada"].includes(t.estat));
    return `
    <div class="persona-grup">
      <div class="persona-cap">
        <div class="persona-avatar avatar-${escHtml(membre)}">${ini[membre]||membre.slice(0,2).toUpperCase()}</div>
        <span class="persona-nom">${escHtml(membre)}</span>
        <span class="persona-recompte">${tt.length} tasca${tt.length!==1?"s":""} activa${tt.length!==1?"s":""}</span>
      </div>
      <div class="persona-tasques">
        ${tt.length === 0
          ? `<div class="persona-sense-tasques">Cap tasca activa</div>`
          : tt.map(t => `
            <div class="persona-tasca-fila" data-codi="${escHtml(t.codi)}">
              <span class="btn-estat btn-estat-${t.estat.toLowerCase().replace(" ","-")}">${escHtml(t.estat)}</span>
              <span class="persona-tasca-titol">${escHtml(t.tasca)}</span>
              <span class="persona-tasca-data">Fi: ${escHtml(formatarData(t.data_fi))}</span>
            </div>`).join("")
        }
      </div>
    </div>`;
  }).join("");

  cont.querySelectorAll(".persona-tasca-fila").forEach(f => {
    f.addEventListener("click", () => obrirModalTasca(f.dataset.codi));
  });
}

// ============================================================
// VISTA: TASQUES LLARGUES
// ============================================================

function renderitzarLlargues() {
  const cont    = document.getElementById("llargues-llista");
  const llargues = tasquesPrincipals().filter(t => obtenirSubtasques(t.codi).length > 0);

  if (llargues.length === 0) {
    cont.innerHTML = `<div class="estat-buit"><div class="estat-buit-icona">📂</div><div class="estat-buit-text">Cap tasca amb subtasques</div></div>`;
    return;
  }

  cont.innerHTML = llargues.map(t => {
    const subs = obtenirSubtasques(t.codi);
    const { total, fetes } = progresSubtasques(t.codi);
    const pct = Math.round((fetes / total) * 100);
    const subsHtml = subs.map(s => `
      <div class="llarga-subtasca-item">
        <div class="subtasca-estat-dot dot-${escHtml(s.estat.replace(" ","."))}"></div>
        <span>${escHtml(s.tasca)}</span>
        <span class="persona-tasca-data">${escHtml(s.responsable)}</span>
        <span class="persona-tasca-data">${escHtml(formatarData(s.data_fi))}</span>
      </div>`).join("");

    return `
    <div class="llarga-targeta" data-codi="${escHtml(t.codi)}">
      <div class="llarga-cap">
        <span class="llarga-titol">${escHtml(t.tasca)}</span>
        <span class="llarga-progres-text">${fetes}/${total} fetes (${pct}%)</span>
      </div>
      <div class="llarga-progres-bar"><div class="barra-progres" style="width:${pct}%"></div></div>
      <div class="llarga-subtasques">${subsHtml}</div>
    </div>`;
  }).join("");

  cont.querySelectorAll(".llarga-targeta").forEach(el => {
    el.addEventListener("click", () => obrirModalTasca(el.dataset.codi));
  });
}

// ============================================================
// VISTA: AVISOS
// ============================================================

async function carregarIRenderitzarAvisos() {
  mostrarCarregant(true);
  const r = await apiObtenirAvisos();
  mostrarCarregant(false);

  const cont = document.getElementById("avisos-llista");
  if (!r.ok) { cont.innerHTML = `<div class="estat-buit"><div class="estat-buit-text">Error: ${escHtml(r.error)}</div></div>`; return; }

  const avisos = r.avisos || [];
  if (avisos.length === 0) {
    cont.innerHTML = `<div class="estat-buit"><div class="estat-buit-icona">✅</div><div class="estat-buit-text">Cap avís registrat</div></div>`;
    return;
  }

  cont.innerHTML = avisos.map(a => `
    <div class="avis-targeta ${escHtml(a.tipus)}">
      <div class="avis-cap">
        <span class="avis-tipus">${escHtml(a.tipus)}</span>
        <span class="avis-data">${escHtml(String(a.data).slice(0,10))}</span>
      </div>
      <div class="avis-missatge">${escHtml(a.missatge)}</div>
      ${a.document ? `<div class="avis-document">Document: ${escHtml(a.document)} · Fila: ${escHtml(String(a.fila))}</div>` : ""}
    </div>`).join("");
}

// ============================================================
// MODAL DE DETALL DE TASCA
// ============================================================

function obrirModalTasca(codi) {
  const t = App.tasques.find(t => t.codi === codi);
  if (!t) return;

  const modal     = document.getElementById("modal-tasca");
  const contingut = document.getElementById("modal-contingut");
  const subs      = obtenirSubtasques(t.codi);
  const { total, fetes } = progresSubtasques(t.codi);
  const esSubtasca = t.tipus === "Subtasca";

  const btnsEstat = ESTATS.map(e =>
    `<button class="btn btn-petit${e===t.estat?" btn-primari":" btn-secundari"}"
             data-codi="${escHtml(t.codi)}" data-estat="${escHtml(e)}">${escHtml(e)}</button>`
  ).join("");

  const subsHtml = subs.length > 0
    ? subs.map(s => `
        <div class="modal-subtasca-item">
          <div class="subtasca-estat-dot dot-${escHtml(s.estat.replace(" ","."))}"></div>
          <span class="modal-subtasca-nom">${escHtml(s.tasca)}</span>
          <span class="modal-subtasca-resp">${escHtml(s.responsable)}</span>
          <span class="modal-subtasca-resp">Fi: ${escHtml(formatarData(s.data_fi))}</span>
        </div>`).join("")
    : `<div style="font-size:13px;color:var(--color-text-suau)">Cap subtasca</div>`;

  const progresHtml = total > 0
    ? `<div class="barra-progres-contenidor" style="height:6px;margin:8px 0">
         <div class="barra-progres" style="width:${Math.round(fetes/total*100)}%"></div>
       </div>
       <div class="text-progres">${fetes}/${total} subtasques fetes</div>` : "";

  contingut.innerHTML = `
    <div class="modal-codi">${escHtml(t.codi)}</div>
    <div class="modal-titol">${escHtml(t.tasca)}</div>
    <div class="modal-info-grid">
      <div class="modal-info-grup"><span class="modal-info-label">Creador/a</span><span class="modal-info-valor">${escHtml(t.creador)}</span></div>
      <div class="modal-info-grup"><span class="modal-info-label">Responsable</span>
        <span class="modal-info-valor"><span class="xip-responsable xip-responsable-${escHtml(t.responsable)}">${escHtml(t.responsable)}</span></span></div>
      <div class="modal-info-grup"><span class="modal-info-label">Inici</span><span class="modal-info-valor">${escHtml(formatarData(t.data_inici))}</span></div>
      <div class="modal-info-grup"><span class="modal-info-label">Fi</span><span class="modal-info-valor">${escHtml(formatarData(t.data_fi))}</span></div>
      <div class="modal-info-grup"><span class="modal-info-label">Tipus</span><span class="modal-info-valor">${escHtml(t.tipus)}</span></div>
      <div class="modal-info-grup"><span class="modal-info-label">Prioritat</span><span class="modal-info-valor">${escHtml(t.prioritat)}</span></div>
      ${t.origen_doc_titol ? `<div class="modal-info-grup" style="grid-column:span 2"><span class="modal-info-label">Origen</span><span class="modal-info-valor">${escHtml(t.origen_doc_titol)}</span></div>` : ""}
      ${esSubtasca && t.parent_id ? `<div class="modal-info-grup" style="grid-column:span 2"><span class="modal-info-label">Tasca mare</span>
        <span class="modal-info-valor" style="cursor:pointer;color:var(--color-primari)" data-nav-codi="${escHtml(t.parent_id)}">${escHtml(t.parent_id)}</span></div>` : ""}
    </div>
    <div class="modal-seccio-titol">Estat</div>
    <div class="modal-accions-estat">${btnsEstat}</div>
    ${progresHtml}
    ${!esSubtasca ? `
    <div class="modal-seccio-titol">Subtasques</div>
    <div class="modal-subtasques-llista">${subsHtml}</div>
    <div class="modal-seccio-titol">Afegir subtasca</div>
    <form class="form-subtasca" id="form-nova-subtasca" data-parent="${escHtml(t.codi)}" autocomplete="off">
      <input type="text" class="inp-tasca" id="sub-inp-tasca" placeholder="Nova subtasca…" required maxlength="300"/>
      <select class="inp-select" id="sub-inp-responsable" required>
        <option value="">Responsable</option>
        ${MEMBRES.map(m=>`<option value="${escHtml(m)}">${escHtml(m)}</option>`).join("")}
      </select>
      <input type="date" class="inp-data" id="sub-inp-data-fi" required/>
      <button type="submit" class="btn btn-primari btn-petit">+ Afegir</button>
    </form>` : ""}
    <div class="modal-accio-arxivar">
      <button class="btn btn-perill btn-petit" id="btn-arxivar-modal" data-codi="${escHtml(t.codi)}">Arxivar tasca</button>
    </div>`;

  modal.style.display = "flex";

  contingut.querySelectorAll("[data-nav-codi]").forEach(el => {
    el.addEventListener("click", () => { tancarModal(); obrirModalTasca(el.dataset.navCodi); });
  });
  contingut.querySelectorAll(".modal-accions-estat .btn").forEach(btn => {
    btn.addEventListener("click", () => accionarCanviEstat(btn.dataset.codi, btn.dataset.estat));
  });
  const formSub = document.getElementById("form-nova-subtasca");
  if (formSub) formSub.addEventListener("submit", async e => { e.preventDefault(); await accionarCrearSubtasca(formSub.dataset.parent); });
  document.getElementById("btn-arxivar-modal")?.addEventListener("click", async () => {
    if (!confirm(`Arxivar la tasca "${t.tasca}"?`)) return;
    await accionarArxivar(t.codi);
  });
}

function tancarModal() {
  document.getElementById("modal-tasca").style.display = "none";
}

// ============================================================
// ACCIONS
// ============================================================

async function accionarCanviEstat(codi, estat) {
  mostrarCarregant(true);
  const r = await apiCanviarEstat(codi, estat);
  mostrarCarregant(false);
  if (!r.ok) { mostrarBanner(`Error: ${r.error}`, "error"); return; }
  mostrarBanner(`Estat actualitzat a "${estat}".`, "ok");
  tancarModal();
  await carregarTasques();
}

async function accionarCrearSubtasca(parentId) {
  const tasca       = document.getElementById("sub-inp-tasca")?.value?.trim();
  const responsable = document.getElementById("sub-inp-responsable")?.value;
  const data_fi     = document.getElementById("sub-inp-data-fi")?.value;
  if (!tasca || !responsable || !data_fi) { mostrarBanner("Omple tots els camps de la subtasca.", "error", 3000); return; }
  mostrarCarregant(true);
  const r = await apiCrearSubtasca({ tasca, responsable, data_fi, parent_id: parentId });
  mostrarCarregant(false);
  if (!r.ok) { mostrarBanner(`Error: ${r.error}`, "error"); return; }
  mostrarBanner(`Subtasca creada (${r.codi}).`, "ok");
  tancarModal();
  await carregarTasques();
}

async function accionarArxivar(codi) {
  mostrarCarregant(true);
  const r = await apiArxivarTasca(codi);
  mostrarCarregant(false);
  if (!r.ok) { mostrarBanner(`Error: ${r.error}`, "error"); return; }
  mostrarBanner("Tasca arxivada.", "ok");
  tancarModal();
  await carregarTasques();
}

// ============================================================
// CONFIGURACIÓ D'EVENTS
// ============================================================

function configurarEventos() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => canviarVista(btn.dataset.vista));
  });

  document.getElementById("form-nova-tasca").addEventListener("submit", async e => {
    e.preventDefault();
    const tasca       = document.getElementById("inp-tasca").value.trim();
    const responsable = document.getElementById("inp-responsable").value;
    const data_fi     = document.getElementById("inp-data-fi").value;
    if (!tasca || !responsable || !data_fi) return;

    mostrarCarregant(true);
    const r = await apiCrearTasca({ tasca, responsable, data_fi });
    mostrarCarregant(false);
    if (!r.ok) { mostrarBanner(`Error: ${r.error}`, "error"); return; }
    mostrarBanner(`Tasca creada correctament (${r.codi}).`, "ok");
    document.getElementById("form-nova-tasca").reset();
    await carregarTasques();
  });

  document.getElementById("btn-recarregar").addEventListener("click", () => carregarTasques());

  document.getElementById("btn-sincronitzar").addEventListener("click", async () => {
    if (!confirm("Sincronitzar tasques des de tots els documents de Google Docs?")) return;
    mostrarCarregant(true);
    const r = await apiSincronitzar();
    mostrarCarregant(false);
    if (!r.ok) { mostrarBanner(`Error: ${r.error}`, "error"); return; }
    mostrarBanner(r.missatge, "ok", 6000);
    await carregarTasques();
  });

  document.getElementById("modal-tancar").addEventListener("click", tancarModal);
  document.getElementById("modal-tasca").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-tasca")) tancarModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") tancarModal(); });

  document.getElementById("gantt-setmanal").addEventListener("click", () => {
    App.ganttMode = "setmanal";
    document.getElementById("gantt-setmanal").classList.add("actiu");
    document.getElementById("gantt-mensual").classList.remove("actiu");
    if (App.vistaActual === "gantt") renderitzarGantt();
  });
  document.getElementById("gantt-mensual").addEventListener("click", () => {
    App.ganttMode = "mensual";
    document.getElementById("gantt-mensual").classList.add("actiu");
    document.getElementById("gantt-setmanal").classList.remove("actiu");
    if (App.vistaActual === "gantt") renderitzarGantt();
  });
  document.getElementById("gantt-filtre-persona").addEventListener("change", e => {
    App.ganttFiltre = e.target.value;
    if (App.vistaActual === "gantt") renderitzarGantt();
  });
  document.getElementById("gantt-mostrar-subtasques").addEventListener("change", e => {
    App.ganttSubtasques = e.target.checked;
    if (App.vistaActual === "gantt") renderitzarGantt();
  });

  document.getElementById("btn-recarregar-avisos").addEventListener("click", carregarIRenderitzarAvisos);
}

// ============================================================
// ARRENCADA
// ============================================================
document.addEventListener("DOMContentLoaded", inicialitzar);
