"use strict";
// RDS client: single-page app, hash routing, all data via /api (server enforces every permission).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#root");
let ME = null;

const STATUS = { C: "Compliant", P: "Partially Compliant", N: "Non-Compliant", NA: "Not Applicable" };
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const ROLE = { ac: "Area Coordinator", iaqc: "IAQC Coordinator", cmd: "CMD — Super Admin" };

async function api(path, body, method) {
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/login") { ME = null; location.hash = "#/login"; }
  if (!r.ok) { const e = new Error(d.error || "Request failed"); e.status = r.status; throw e; }
  return d;
}

function toast(msg, bad) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.innerHTML = icon(bad ? "alert" : "tick") + `<span>${esc(msg)}</span>`;
  t.setAttribute("role", bad ? "alert" : "status");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

const fmtDate = d => d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const pct = v => v == null ? "—" : (+v).toFixed(2) + "%";
const today = () => new Date().toISOString().slice(0, 10);
const catClass = c => ({ Green: "b-green", Yellow: "b-yellow", Red: "b-red" }[c] || "b-grey");
const catLabel = c => ({ Green: "Green · Low risk", Yellow: "Yellow · Moderate", Red: "Red · High risk" }[c] || c);
const badge = c => `<span class="badge ${catClass(c)}">${esc(catLabel(c))}</span>`;
const catColor = c => ({ Green: "var(--green-mark)", Yellow: "var(--amber-mark)", Red: "var(--red-mark)" }[c] || "var(--grey-mark)");
const alertTag = n => n ? `<span class="alert" title="Reported critical violation — pending verification">${icon("alert")}${n > 1 ? n + " " : ""}Critical</span>` : "";
const needsRemark = (c, st) => st === "N" || (st === "P" && (c.critical || c.priority === "Critical" || c.priority === "High"));

const ICONS = {
  dash: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  list: "M4 6h16M4 12h16M4 18h10",
  centre: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6",
  check: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  log: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8",
  rank: "M8 21V10M12 21V4M16 21v-7M4 21h16",
  alert: "M12 3.5 2.5 20h19L12 3.5zM12 10v4.5M12 17.2v.3",
  tick: "M5 12.5l4.5 4.5L19 7.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  system: "M3 5h18v11H3zM8 20h8M12 16v4",
  key: "M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7zM16 9.5v.01",
  logout: "M15 4h4v16h-4M10 17l5-5-5-5M15 12H3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.01",
};
const icon = k => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

// ---------------- Theme: light / dark / follow system ----------------
const THEMES = [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Auto", "system"]];
const mq = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(pref) {
  document.documentElement.dataset.themePref = pref;
  document.documentElement.dataset.theme = pref === "dark" || (pref === "system" && mq.matches) ? "dark" : "light";
  $$(".theme button").forEach(b => b.setAttribute("aria-pressed", b.dataset.theme === pref));
}
mq.addEventListener("change", () => applyTheme(document.documentElement.dataset.themePref || "system"));
const themeSwitch = () => `<div class="theme" role="group" aria-label="Colour theme">${THEMES.map(([k, l, i]) =>
  `<button type="button" data-theme="${k}" aria-pressed="${document.documentElement.dataset.themePref === k}" title="${l} theme">${icon(i)}<span>${l}</span></button>`).join("")}</div>`;
document.addEventListener("click", e => {
  const b = e.target.closest(".theme button");
  if (!b) return;
  try { localStorage.setItem("rds-theme", b.dataset.theme); } catch { /* storage unavailable */ }
  applyTheme(b.dataset.theme);
});

const NAV = {
  iaqc: [["", "Risk Dashboard", "dash"], ["assessments", "Assessments", "list"], ["centres", "Centres", "centre"], ["users", "Users", "users"],
         ["checklist", "Checklist", "check"], ["scoring", "Scoring Rules", "sliders"], ["audit", "Audit Log", "log"]],
  cmd: [["", "Executive Overview", "dash"], ["ranking", "Centre Ranking", "rank"], ["assessments", "Assessment History", "list"]],
  ac: [["", "My Centres", "centre"]],
};

// Page heading block: serif title, optional one-line context, optional actions on the right.
const ph = (title, sub = "", actions = "") => `<div class="ph"><div class="grow"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions}</div>`;

function shell(title, content, actions = "") {
  const cur = location.hash.slice(2).split(/[/?]/)[0];
  const initials = ME.name.replace(/\(.*\)/, "").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  document.title = `${title} · RDS`;
  root.innerHTML = `<div class="app">
    <header class="mast"><div class="mast-in">
      <a class="brand" href="#/"><b>RDS</b><small>Risk Detection System<br>Internal Audit &amp; Quality Control</small></a>
      <nav class="nav" aria-label="Main">${NAV[ME.role].map(([h, l, i]) => `<a href="#/${h}" class="${cur === h || (cur === "scorecard" && h === (ME.role === "cmd" ? "ranking" : "")) ? "on" : ""}" ${cur === h ? 'aria-current="page"' : ""}>${icon(i)}${l}</a>`).join("")}</nav>
      <div class="mast-end">${ME.role === "cmd" ? '<span class="stamp ro">Read-only</span>' : ""}<span class="stamp" title="All records are fictional demonstration data">Demo data</span>
        <div class="user" id="user"><button type="button" aria-haspopup="true" aria-expanded="false" id="userBtn"><span class="avatar">${esc(initials)}</span><span class="who"><b>${esc(ME.name)}</b><span>${ROLE[ME.role]}</span></span></button>
          <div class="menu" role="menu"><div class="head"><b>${esc(ME.name)}</b><span>${ROLE[ME.role]} · ${esc(ME.username)}</span></div>
            <button class="item" role="menuitem" id="pwBtn">${icon("key")}Change password</button>
            <button class="item" role="menuitem" id="logoutBtn">${icon("logout")}Sign out</button>
            <div class="lbl">Appearance</div>${themeSwitch()}</div></div></div>
    </div></header>
    <main class="main"><div class="content" id="view">${content}</div></main></div>`;
  const user = $("#user"), ub = $("#userBtn");
  const setOpen = o => { user.classList.toggle("open", o); ub.setAttribute("aria-expanded", o); };
  ub.onclick = e => { e.stopPropagation(); setOpen(!user.classList.contains("open")); };
  document.onclick = e => { if (!user.contains(e.target)) setOpen(false); };
  user.onkeydown = e => { if (e.key === "Escape") { setOpen(false); ub.focus(); } };
  $("#logoutBtn").onclick = async () => { await api("/logout", {}); ME = null; location.hash = "#/login"; };
  $("#pwBtn").onclick = () => { setOpen(false); changePassword(); };
  return $("#view");
}

function modal(title, html, onSubmit, submitLabel = "Save") {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hd"><h2>${esc(title)}</h2><span class="spacer"></span><button type="button" class="btn sm" data-x aria-label="Close">${icon("close")}</button></div>
    <div class="bd">${html}<div class="err" data-err></div></div>
    <div class="ft"><button type="button" class="btn" data-x>Cancel</button>${onSubmit ? `<button class="btn primary">${submitLabel}</button>` : ""}</div></form>`;
  document.body.appendChild(bg);
  const form = $("form", bg), close = () => bg.remove();
  $$("[data-x]", bg).forEach(b => b.onclick = close);
  bg.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $(".ft .primary", bg);
    btn.classList.add("loading");
    try { await onSubmit(form); close(); } catch (err) { $("[data-err]", bg).textContent = err.message; } finally { btn.classList.remove("loading"); }
  };
  const first = $("input,select,textarea", form);
  if (first) first.focus();
  return form;
}
const fd = form => Object.fromEntries(new FormData(form));

function changePassword() {
  modal("Change password", `<label class="f"><span>Current password</span><input type="password" name="current" required autocomplete="current-password"></label>
    <label class="f"><span>New password (min 8 characters)</span><input type="password" name="new" minlength="8" required autocomplete="new-password"></label>`,
    async f => { await api("/me/password", fd(f)); toast("Password changed"); });
}

// ---------------- Charts (inline SVG / CSS, no libraries) ----------------

function trendChart(hist, th) {
  const pts = hist.filter(h => h.score != null);
  if (!pts.length) return `<div class="empty">No scored assessments yet.</div>`;
  const W = 640, H = 220, L = 40, R = 16, T = 14, B = 30;
  const lo = Math.max(0, Math.min(50, Math.floor(Math.min(...pts.map(p => p.score)) / 10) * 10 - 10));
  const t = pts.map(p => +new Date(p.visit_date)), t0 = Math.min(...t), t1 = Math.max(...t);
  const x = v => pts.length === 1 ? (L + W - R) / 2 : L + (v - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (100 - v) / (100 - lo) * (H - T - B);
  const band = (a, b, cls) => `<rect class="${cls}" x="${L}" width="${W - L - R}" y="${y(Math.min(b, 100))}" height="${Math.max(0, y(Math.max(a, lo)) - y(Math.min(b, 100)))}"/>`;
  const ticks = [];
  for (let v = lo; v <= 100; v += 10) ticks.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Compliance score trend">
    ${band(th.green, 100, "band-g")}${band(th.yellow, th.green, "band-y")}${band(lo, th.yellow, "band-r")}${ticks.join("")}
    <path class="ln" d="${line}"/>
    ${pts.map((p, i) => `<circle class="pt" cx="${x(t[i])}" cy="${y(p.score)}" r="4.5" style="stroke:${catColor(p.category)}"><title>${fmtDate(p.visit_date)}: ${pct(p.score)} (${p.category})</title></circle>
      <text class="lbl" x="${x(t[i])}" y="${y(p.score) - 11}" text-anchor="middle">${p.score.toFixed(1)}</text>
      <text class="tick" x="${x(t[i])}" y="${H - 10}" text-anchor="middle">${fmtDate(p.visit_date)}</text>`).join("")}
  </svg>`;
}

const scoreBar = (v, c) => `<div class="bar" title="${pct(v)}"><i style="width:${v ?? 0}%;background:${catColor(c)}"></i></div>`;

function trendCell(r) {
  if (r.trend == null) return `<span class="faint">—</span>`;
  if (r.trend < 0) return `<span class="trend trend-up" title="Compliance fell ${Math.abs(r.trend).toFixed(2)} pts since the previous visit">${icon("up")}Risk +${Math.abs(r.trend).toFixed(1)}</span>`;
  if (r.trend > 0) return `<span class="trend trend-down" title="Compliance improved ${r.trend.toFixed(2)} pts since the previous visit">${icon("down")}Risk −${r.trend.toFixed(1)}</span>`;
  return `<span class="faint small">No change</span>`;
}

// ---------------- Login ----------------

function renderLogin() {
  const demo = [["iaqc", "Iaqc@Demo2026", "IAQC Coordinator"], ["cmd", "Cmd@Demo2026", "CMD (Super Admin)"], ["arjun.ac", "Arjun@Demo2026", "Area Coordinator — Arjun Menon"],
                ["priya.ac", "Priya@Demo2026", "Area Coordinator — Priya Nair"], ["rahul.ac", "Rahul@Demo2026", "Area Coordinator — Rahul Das"]];
  const now = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  root.innerHTML = `<div class="login">
    <section class="cover">
      <div class="cover-mast"><b>RDS</b><span class="stamp">Demonstration</span></div>
      <div class="title"><span class="code">INTERNAL AUDIT &amp; QUALITY CONTROL</span>
        <h1>Risk Detection <em>System</em></h1>
        <p>Identify, evaluate, rank and monitor franchise centres against brand standards, operational policy, academic procedure and financial transparency.</p></div>
      <dl><dt>Scope</dt><dd>Franchise centres — compliance and risk ranking</dd><dt>Edition</dt><dd>${now}</dd>
        <dt>Data</dt><dd>Fictional demonstration records. Checklist criteria are sample, configurable policy requirements.</dd></dl>
    </section>
    <section class="form">${themeSwitch()}<form class="box" id="loginForm" novalidate>
      <h2>Sign in</h2><p class="muted" style="margin:0 0 24px">Use the account issued by your IAQC Coordinator.</p>
      <label class="f"><span>Username</span><input name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label>
      <label class="f"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <div class="err" id="loginErr" role="alert"></div>
      <button class="btn primary" id="loginBtn" style="width:100%;padding:10px">Sign in</button>
      <div class="demo-acc"><div class="h">Demo accounts — select to fill</div>
        ${demo.map(([u, p, l]) => `<button type="button" data-u="${u}" data-p="${p}"><span>${l}</span><span>${u}</span></button>`).join("")}</div>
    </form></section></div>`;
  $$("[data-u]").forEach(b => b.onclick = () => { $("[name=username]").value = b.dataset.u; $("[name=password]").value = b.dataset.p; $("#loginBtn").focus(); });
  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const v = fd(e.target), btn = $("#loginBtn");
    if (!v.username.trim() || !v.password) { $("#loginErr").textContent = "Enter your username and password."; return; }
    btn.classList.add("loading");
    try { ME = await api("/login", v); Object.assign(F, { q: "", district: "", ac: "", cat: "", from: "", to: "", sort: null }); location.hash = "#/"; route(); }
    catch (err) { $("#loginErr").textContent = err.message; btn.classList.remove("loading"); }
  };
}

// ---------------- Router ----------------

async function route() {
  const [path, qs] = location.hash.slice(1).split("?");
  const parts = (path || "/").split("/").filter(Boolean);
  const q = new URLSearchParams(qs || "");
  if (ME === null) ME = await api("/me").catch(() => null);
  if (!ME || parts[0] === "login") return ME ? (location.hash = "#/") : renderLogin();
  const views = {
    ac: { "": acHome, visit: acVisit, done: acDone },
    iaqc: { "": dashboard, assessments, centres, users, checklist, scoring, audit: auditLog, scorecard },
    cmd: { "": cmdOverview, ranking: dashboard, assessments, scorecard },
  }[ME.role];
  const fn = views[parts[0] || ""];
  if (!fn) return shell("Not available", `<div class="card"><div class="empty">This page is not available for your role.</div></div>`);
  try { await fn(parts[1], q); }
  catch (e) { if (e.status !== 401) shell("Error", `<div class="card"><div class="empty">${esc(e.message)}</div></div>`); }
}
window.addEventListener("hashchange", route);

// ---------------- Area Coordinator ----------------

const draftKey = cid => `rds-draft-${ME.id}-${cid}`;
const loadDraft = cid => { try { return JSON.parse(localStorage.getItem(draftKey(cid))); } catch { return null; } };
const saveDraft = (cid, d) => { try { localStorage.setItem(draftKey(cid), JSON.stringify(d)); } catch { /* storage unavailable */ } };
const dropDraft = cid => { try { localStorage.removeItem(draftKey(cid)); } catch { /* ignore */ } };

async function acHome() {
  const cs = await api("/centres");
  shell("My Centres", `<div class="ac-wrap">
    ${ph("My centres", `${cs.length} centre${cs.length === 1 ? "" : "s"} assigned to you. Drafts are kept on this device until submitted; submitted reports are final.`)}
    ${cs.length ? `<div class="centre-cards">${cs.map(c => `<div class="card"><div class="bd">
      <div class="code">${esc(c.code)}</div><h2 style="margin:4px 0 6px">${esc(c.name)}</h2>
      <div class="small muted" style="margin-bottom:14px">${esc(c.location)}, ${esc(c.district)}<br>Last visit ${fmtDate(c.last_visit)}</div>
      ${loadDraft(c.id) ? '<span class="draft">Draft in progress</span>' : ""}
      <a class="btn ${loadDraft(c.id) ? "" : "primary"}" href="#/visit/${c.id}">${loadDraft(c.id) ? "Continue report" : "Start visit report"}${icon("right")}</a></div></div>`).join("")}</div>`
      : `<div class="card"><div class="empty"><b>No centres assigned</b>Please contact the IAQC Coordinator to have centres assigned to your account.</div></div>`}</div>`);
}

async function acVisit(cid) {
  const [cs, list, settings] = await Promise.all([api("/centres"), api("/checklist"), api("/settings")]);
  const centre = cs.find(c => String(c.id) === cid);
  if (!centre) return shell("Visit report", `<div class="card"><div class="empty">This centre is not assigned to you.</div></div>`);
  const secs = list.filter(s => s.criteria.length);
  const crits = secs.flatMap(s => s.criteria);
  let d = loadDraft(cid);
  if (!d) d = { version: settings.checklist_version, date: today(), responses: {}, general: "", step: 0 };
  if (d.version !== settings.checklist_version) Object.assign(d, { version: settings.checklist_version, changed: true, step: 0 });
  if (!secs.length) return shell("Visit report", `<div class="card"><div class="empty">The checklist has no active criteria. Please contact the IAQC Coordinator.</div></div>`);
  const persist = () => saveDraft(cid, d);
  const answered = c => { const r = d.responses[c.id]; return r && r.status && !(needsRemark(c, r.status) && !(r.remark || "").trim()) && !(c.mandatory && r.status === "NA"); };
  const secDone = s => s.criteria.every(answered);

  const view = shell("Centre visit report", `<div class="ac-wrap" id="visit"></div>`);
  const host = $("#visit", view);
  function progress() {
    const done = crits.filter(answered).length;
    $("#progTxt").textContent = `${done} of ${crits.length} criteria completed`;
    $("#progPct").textContent = Math.round(done / crits.length * 100) + "%";
    $("#progBar").style.width = done / crits.length * 100 + "%";
  }

  function render() {
    const done = crits.filter(answered).length, total = crits.length, review = d.step === secs.length;
    host.innerHTML = `
      <div class="ph" style="margin-bottom:8px"><div class="grow"><a href="#/" class="small">${icon("left")}My centres</a><h1 style="margin-top:8px">${esc(centre.name)}</h1><div class="sub">${esc(centre.code)} · ${esc(centre.location)}, ${esc(centre.district)}</div></div>
        <label class="f" style="margin:0;min-width:170px"><span>Visit date</span><input type="date" id="vdate" value="${esc(d.date)}" max="${today()}"></label></div>
      ${d.changed ? `<div class="banner warn small">${icon("info")}<div>The checklist was updated by the IAQC Coordinator since this draft was started. Your existing answers were kept — please check every section before submitting.</div></div>` : ""}
      <div class="sticky-prog"><div class="row small" style="margin-bottom:8px"><b id="progTxt">${done} of ${total} criteria completed</b><span class="spacer"></span><span class="faint" id="progPct">${Math.round(done / total * 100)}%</span></div>
        <div class="progress"><i id="progBar" style="width:${done / total * 100}%"></i></div>
        <div class="steps" style="margin-top:12px">${secs.map((s, i) => `<button data-step="${i}" class="${i === d.step ? "on" : secDone(s) ? "done" : ""}">${secDone(s) ? icon("tick") : ""}${esc(s.name)}</button>`).join("")}
          <button data-step="${secs.length}" class="${review ? "on" : ""}">Review &amp; submit</button></div></div>
      <div id="stepBody">${review ? reviewHtml() : sectionHtml(secs[d.step])}</div>`;
    $("#vdate").onchange = e => { d.date = e.target.value; persist(); };
    $$("[data-step]", host).forEach(b => b.onclick = () => { d.step = +b.dataset.step; persist(); render(); window.scrollTo(0, 0); });
    $$(".opts input", host).forEach(inp => inp.onchange = () => {
      const id = inp.name.slice(2);
      d.responses[id] = { ...(d.responses[id] || {}), status: inp.value };
      persist(); render();
    });
    $$("textarea[data-rem]", host).forEach(t => t.oninput = () => {
      const id = t.dataset.rem;
      d.responses[id] = { ...(d.responses[id] || {}), remark: t.value };
      persist();
      const c = crits.find(c => String(c.id) === id);
      t.closest(".crit-card").classList.toggle("missing", !answered(c));
      progress();
    });
    const gen = $("#general", host);
    if (gen) gen.oninput = () => { d.general = gen.value; persist(); };
    const sub = $("#submitBtn", host);
    if (sub) sub.onclick = submit;
  }

  function sectionHtml(s) {
    return `<div class="row" style="margin:10px 0 14px;align-items:baseline"><h2 class="grow">${esc(s.name)}</h2><span class="small faint">Section ${d.step + 1} of ${secs.length}</span></div>${s.criteria.map(c => {
      const r = d.responses[c.id] || {};
      const req = r.status && needsRemark(c, r.status);
      return `<div class="crit-card ${r.status && !answered(c) ? "missing" : ""}">
        <div class="q">${esc(c.text)}</div>${c.description ? `<div class="small muted" style="margin-top:2px">${esc(c.description)}</div>` : ""}
        <div class="row" style="gap:6px;margin-top:8px"><span class="chip ${c.priority}">${c.priority} priority</span>${c.critical ? '<span class="chip crit">Critical item</span>' : ""}${c.mandatory ? '<span class="chip mand">Mandatory</span>' : ""}</div>
        <div class="opts" role="radiogroup" aria-label="${esc(c.text)}">${Object.entries(STATUS).map(([k, l]) => {
          const dis = k === "NA" && c.mandatory;
          return `<label class="${k}${dis ? " disabled" : ""}" title="${dis ? "Mandatory criteria cannot be marked Not Applicable" : ""}"><input type="radio" name="r-${c.id}" value="${k}" ${r.status === k ? "checked" : ""} ${dis ? "disabled" : ""}>${l}</label>`;
        }).join("")}</div>
        <label class="small" style="display:block"><span class="muted" style="font-weight:600">Remarks and observations</span> ${req ? '<span class="req">Required</span>' : '<span class="faint">Optional</span>'}
          <textarea data-rem="${c.id}" style="margin-top:5px" placeholder="${req ? "What was observed, the evidence seen, and who was present" : "Add an observation"}">${esc(r.remark || "")}</textarea></label>
      </div>`;
    }).join("")}
    <div class="row" style="margin-top:18px">${d.step > 0 ? `<button class="btn" data-step="${d.step - 1}">${icon("left")}Previous</button>` : ""}<span class="spacer"></span>
      <button class="btn primary" data-step="${d.step + 1}">${d.step === secs.length - 1 ? "Review report" : "Next section"}${icon("right")}</button></div>`;
  }

  function reviewHtml() {
    const missing = crits.filter(c => !answered(c));
    const cnt = { C: 0, P: 0, N: 0, NA: 0 };
    crits.forEach(c => { const s = d.responses[c.id]?.status; if (s) cnt[s]++; });
    return `<div class="card"><div class="hd"><h2>Final review</h2></div><div class="bd">
      ${missing.length ? `<div class="banner warn">${icon("alert")}<div><b>${missing.length} item${missing.length === 1 ? " needs" : "s need"} attention before submission.</b><br>Every criterion must be answered. Remarks are required for Non-Compliant responses and for Partially Compliant responses on Critical or High priority items.</div></div>` : `<div class="banner info">${icon("tick")}<div>All criteria are complete. Check your answers below, then submit.</div></div>`}
      <div class="row small" style="gap:18px;margin-bottom:14px">${Object.entries(cnt).map(([k, v]) => `<span class="st-${k}">${STATUS[k]}: ${v}</span>`).join("")}</div>
      ${secs.map((s, i) => `<h3 style="margin:14px 0 6px">${i + 1}. ${esc(s.name)} <button class="btn sm" data-step="${i}">Edit</button></h3>
        <div class="tw"><table><tbody>${s.criteria.map(c => { const r = d.responses[c.id] || {}; return `<tr class="${answered(c) ? "" : "alert-row"}"><td>${esc(c.text)}</td>
          <td class="nowrap">${r.status ? `<span class="st-${r.status}">${STATUS[r.status]}</span>` : '<span class="req">Not answered</span>'}</td>
          <td class="small muted">${esc(r.remark || "")}${r.status && !answered(c) ? '<div class="req">Remark required</div>' : ""}</td></tr>`; }).join("")}</tbody></table></div>`).join("")}
      <label class="f mt"><span>General remarks (optional)</span><textarea id="general">${esc(d.general)}</textarea></label>
      <div class="row"><span class="small muted">Once submitted, this report is final and cannot be edited.</span><span class="spacer"></span>
        <button class="btn primary" id="submitBtn" ${missing.length ? "disabled" : ""}>Submit visit report</button></div></div></div>`;
  }

  async function submit() {
    const btn = $("#submitBtn");
    btn.disabled = true;
    try {
      const res = await api("/assessments", { centre_id: +cid, visit_date: d.date, responses: d.responses, general_remarks: d.general, checklist_version: d.version });
      dropDraft(cid);
      sessionStorage.setItem("rds-last", JSON.stringify({ ...res, centre: centre.name, code: centre.code, date: d.date }));
      location.hash = "#/done/" + res.id;
    } catch (e) {
      toast(e.message, true);
      if (e.status === 409) acVisit(cid); else btn.disabled = false;
    }
  }
  render();
}

function acDone() {
  let r = {};
  try { r = JSON.parse(sessionStorage.getItem("rds-last")) || {}; } catch { /* ignore */ }
  shell("Report submitted", `<div class="ac-wrap" style="max-width:560px"><div class="card"><div class="bd center" style="padding:44px 28px">
    <div class="done-mark">${icon("tick")}</div>
    <h1>Report submitted</h1><p class="muted" style="margin:10px auto 0;max-width:40ch">Your centre visit report has been recorded and sent to the IAQC Coordinator for review.</p>
    <dl class="info-list" style="max-width:340px;margin:26px auto;text-align:left;padding:16px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)"><dt>Reference</dt><dd>${esc(r.reference || "—")}</dd>
      <dt>Centre</dt><dd>${esc(r.centre || "—")}</dd><dt>Visit date</dt><dd>${fmtDate(r.date)}</dd><dt>Submitted</dt><dd>${fmtDT(r.submitted_at)}</dd></dl>
    <a class="btn primary" href="#/">${icon("left")}Back to my centres</a></div></div></div>`);
}

// ---------------- Ranking dashboard (IAQC + CMD) ----------------

const F = { q: "", district: "", ac: "", cat: "", from: "", to: "", sort: null, dir: 1 };

function summaryCards(cs) {
  const n = k => cs.filter(c => c.category === k).length;
  return `<div class="kpis">
    <div class="kpi"><div class="l">Active centres</div><div class="v">${cs.length}</div></div>
    <div class="kpi"><div class="l">Assessed</div><div class="v">${cs.filter(c => c.assessment_id).length}</div></div>
    <div class="kpi g"><div class="l">Green</div><div class="v">${n("Green")}</div></div>
    <div class="kpi y"><div class="l">Yellow</div><div class="v">${n("Yellow")}</div></div>
    <div class="kpi r"><div class="l">Red</div><div class="v">${n("Red")}</div></div>
    <div class="kpi c"><div class="l">Critical alerts</div><div class="v">${cs.filter(c => c.alerts.length).length}</div></div>
    <div class="kpi"><div class="l">Pending visits</div><div class="v">${cs.filter(c => c.due).length}</div><div class="small faint">outside visit cycle</div></div>
  </div>`;
}

// Right-hand rail for ranking pages: what needs eyes first.
function riskRail(cs) {
  const crit = cs.filter(c => c.alerts.length), rising = cs.filter(c => c.trend < 0).sort((a, b) => a.trend - b.trend);
  const cats = ["Green", "Yellow", "Red", "Not Assessed"].map(k => [k, cs.filter(c => c.category === k).length]);
  return `<aside class="rail">
    <div class="card" style="border-color:var(--crit-rule)"><div class="hd" style="background:var(--crit-soft);color:var(--crit)">${icon("alert")}<h3>Critical alerts</h3><span class="spacer"></span><span class="num" style="font-size:18px">${crit.length}</span></div><div class="bd">
      ${crit.length ? `<ul class="mini-list">${crit.map(c => `<li><a href="#/scorecard/${c.id}">${esc(c.name)}</a><div class="muted" style="margin-top:2px">${c.alerts.map(a => esc(a.text)).join("; ")}</div><div class="small faint" style="margin-top:4px">${esc(c.alerts[0].verification || "Reported - Pending Verification")}</div></li>`).join("")}</ul>
        <p class="small faint" style="margin:14px 0 0">A critical alert is a reported issue for management review. It does not by itself establish misconduct.</p>` : '<p class="small muted" style="margin:0">No open critical alerts.</p>'}</div></div>
    <div class="card"><div class="hd"><h3>Risk distribution</h3></div><div class="bd">
      <div class="dist">${cats.filter(([, n]) => n).map(([k, n]) => `<i style="width:${n / cs.length * 100}%;background:${catColor(k)}" title="${k}: ${n}"></i>`).join("")}</div>
      <div class="legend">${cats.map(([k, n]) => `<span style="--c:${catColor(k)}">${k} <b>${n}</b></span>`).join("")}</div></div></div>
    <div class="card"><div class="hd"><h3>Rising risk</h3><span class="spacer"></span><span class="small faint">since previous visit</span></div><div class="bd">
      ${rising.length ? `<ul class="mini-list">${rising.map(c => `<li class="row" style="flex-wrap:nowrap"><a class="grow" href="#/scorecard/${c.id}">${esc(c.name)}</a>${trendCell(c)}</li>`).join("")}</ul>` : '<p class="small muted" style="margin:0">No centre has declined since its previous visit.</p>'}</div></div>
  </aside>`;
}

async function dashboard() {
  const isCmd = ME.role === "cmd";
  if (F.sort === null) { F.sort = "rank"; F.dir = isCmd && location.hash.startsWith("#/ranking") ? -1 : 1; }
  const data = await api(`/ranking?from=${F.from}&to=${F.to}`);
  const cs = data.centres, th = data.settings.thresholds;
  const districts = [...new Set(cs.map(c => c.district))].sort(), acs = [...new Set(cs.map(c => c.ac_name).filter(Boolean))].sort();
  const crit = cs.filter(c => c.alerts.length);
  const latest = cs.map(c => c.last_visit).filter(Boolean).sort().pop();
  const view = shell(isCmd ? "Centre Ranking" : "Risk Dashboard", `
    ${ph(isCmd ? "Centre ranking" : "Risk ranking", `${cs.length} active centres · latest assessment ${fmtDate(latest)}`, '<button class="btn no-print" onclick="window.print()">' + icon("print") + "Print</button>")}
    ${summaryCards(cs)}
    <div class="with-rail"><div>
    <div class="card"><div class="filters">
      <div class="search">${icon("search")}<input type="search" id="fq" placeholder="Search centre, code or location" value="${esc(F.q)}" aria-label="Search centres"></div>
      <select id="fd" aria-label="District"><option value="">All districts</option>${districts.map(d => `<option ${F.district === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select id="fa" aria-label="Area Coordinator"><option value="">All Area Coordinators</option>${acs.map(d => `<option ${F.ac === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select id="fc" aria-label="Risk category"><option value="">All categories</option>${["Red", "Yellow", "Green", "Not Assessed", "Critical alert", "Rising risk", "Visit overdue"].map(d => `<option ${F.cat === d ? "selected" : ""}>${d}</option>`).join("")}</select>
      <span class="small faint">Period</span><input type="date" id="ff" value="${F.from}" aria-label="Period from"><span class="small faint">to</span><input type="date" id="ft" value="${F.to}" aria-label="Period to">
      <button class="btn sm quiet" id="fx">Reset filters</button><span class="spacer"></span><span class="small faint" id="fcount"></span>
    </div><div class="tw" id="rankTable"></div></div>
    <p class="small faint" style="margin-top:14px;max-width:110ch">Ranking places centres with critical alerts first, then the lowest compliance score (highest risk). Centres without a valid assessment are shown as <b>Not Assessed</b>, never as low risk.
      Thresholds: Green ≥ ${th.green}%, Yellow ≥ ${th.yellow}%, Red below ${th.yellow}%.${F.from || F.to ? " Period filter applied: scores use the latest assessment within the selected period." : ""}</p>
    </div>${riskRail(cs)}</div>`);

  const cols = [["rank", "Rank"], ["name", "Centre"], ["district", "District"], ["score", "Compliance"], ["category", "Risk indicator"],
                ["trend", "Trend"], ["last_visit", "Last assessed"], ["ac_name", "Area Coordinator"], [null, ""]];
  function table() {
    const q = F.q.toLowerCase();
    let rs = cs.filter(c => (!q || `${c.name} ${c.code} ${c.location}`.toLowerCase().includes(q)) && (!F.district || c.district === F.district) && (!F.ac || c.ac_name === F.ac)
      && (!F.cat || c.category === F.cat || (F.cat === "Critical alert" && c.alerts.length) || (F.cat === "Rising risk" && c.trend < 0) || (F.cat === "Visit overdue" && c.due)));
    const k = F.sort;
    rs = rs.slice().sort((a, b) => {
      // Not Assessed centres always sink to the bottom so they never read as "low risk".
      const na = (a.score == null) - (b.score == null);
      if (na && ["rank", "risk", "score", "category"].includes(k)) return na;
      let x = a[k], y = b[k];
      if (k === "risk") { x = x ?? -1; y = y ?? -1; return (y - x) * F.dir; }
      if (k === "score" || k === "trend") { x = x ?? 999; y = y ?? 999; return (x - y) * F.dir; }
      return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * F.dir;
    });
    $("#fcount").textContent = `${rs.length} of ${cs.length} centres`;
    $("#rankTable").innerHTML = rs.length ? `<table><thead><tr>${cols.map(([k, l]) => `<th class="${k ? "sort" : ""}${F.sort === k && k ? " sorted" : ""}${k === "score" ? " right" : ""}" data-k="${k || ""}" ${k ? `aria-sort="${F.sort === k ? (F.dir > 0 ? "ascending" : "descending") : "none"}" tabindex="0"` : ""}>${l}${F.sort === k && k ? icon(F.dir > 0 ? "up" : "down") : ""}</th>`).join("")}</tr></thead><tbody>
      ${rs.map(c => `<tr class="${c.alerts.length ? "alert-row" : ""}">
        <td><span class="rank">${c.rank}</span></td>
        <td><a href="#/scorecard/${c.id}"><b>${esc(c.name)}</b></a><div class="code">${esc(c.code)}</div></td>
        <td>${esc(c.district)}<div class="small faint">${esc(c.location)}</div></td>
        <td class="right"><span class="num" style="font-size:16px">${pct(c.score)}</span>${c.score != null ? scoreBar(c.score, c.category) + `<div class="small faint" style="margin-top:3px">Risk ${pct(c.risk)}</div>` : ""}</td>
        <td><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">${badge(c.category)}${alertTag(c.alerts.length)}</div></td>
        <td>${trendCell(c)}</td>
        <td class="nowrap">${fmtDate(c.last_visit)}${c.due ? '<div class="small" style="color:var(--amber)">Visit due</div>' : ""}</td>
        <td>${esc(c.reported_by || c.ac_name || "—")}</td>
        <td class="right"><a class="btn sm" href="#/scorecard/${c.id}">Scorecard</a></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><b>No matching centres</b>Adjust or reset the filters to see more centres.</div>`;
    $$("th.sort", view).forEach(th => {
      th.onclick = () => { const k = th.dataset.k; F.dir = F.sort === k ? -F.dir : 1; F.sort = k; table(); };
      th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); } };
    });
  }
  table();
  $("#fq").oninput = e => { F.q = e.target.value; table(); };
  $("#fd").onchange = e => { F.district = e.target.value; table(); };
  $("#fa").onchange = e => { F.ac = e.target.value; table(); };
  $("#fc").onchange = e => { F.cat = e.target.value; table(); };
  $("#ff").onchange = e => { F.from = e.target.value; dashboard(); };
  $("#ft").onchange = e => { F.to = e.target.value; dashboard(); };
  $("#fx").onclick = () => { Object.assign(F, { q: "", district: "", ac: "", cat: "", from: "", to: "" }); dashboard(); };
}

// ---------------- CMD executive overview ----------------

async function cmdOverview() {
  const data = await api("/ranking");
  const cs = data.centres, th = data.settings.thresholds;
  const scored = cs.filter(c => c.score != null);
  const avg = scored.length ? scored.reduce((a, c) => a + c.score, 0) / scored.length : null;
  const cats = ["Green", "Yellow", "Red", "Not Assessed"].map(k => [k, cs.filter(c => c.category === k).length]);
  const attention = cs.filter(c => c.alerts.length || c.category === "Red" || c.trend < 0 || c.category === "Not Assessed");
  // Section-wise summary: average of each section's score across centres' latest assessments.
  const secMap = {};
  scored.forEach(c => c.sections.forEach(s => {
    const m = secMap[s.name] ||= { sum: 0, n: 0, red: 0, viol: 0 };
    if (s.score != null) { m.sum += s.score; m.n++; if (s.category === "Red") m.red++; }
    m.viol += s.violations;
  }));
  const secs = Object.entries(secMap).map(([name, m]) => ({ name, avg: m.n ? m.sum / m.n : null, red: m.red, viol: m.viol })).sort((a, b) => a.avg - b.avg);
  const cat = v => v == null ? "Unscorable" : v >= th.green ? "Green" : v >= th.yellow ? "Yellow" : "Red";
  const byDistrict = {};
  cs.forEach(c => { const d = byDistrict[c.district] ||= { n: 0, s: 0, k: 0, red: 0, alerts: 0 }; d.n++; if (c.score != null) { d.s += c.score; d.k++; } if (c.category === "Red") d.red++; if (c.alerts.length) d.alerts++; });
  const ranked = scored.slice().sort((a, b) => a.score - b.score);
  const latest = cs.map(c => c.last_visit).filter(Boolean).sort().pop();

  shell("Executive Overview", `
    ${ph("Executive overview", `Compliance position as of ${fmtDate(latest)} · ${cs.length} active centres`, `<button class="btn no-print" onclick="window.print()">${icon("print")}Print summary</button>`)}
    <div class="card" style="margin-bottom:22px"><div class="split">
      <div><p class="statement">Across the ${scored.length} assessed centres, average compliance stands at <strong>${avg == null ? "—" : avg.toFixed(1) + "%"}</strong>, within the ${esc(cat(avg))} band.
        <strong>${attention.length} centre${attention.length === 1 ? "" : "s"}</strong> require management attention: ${cs.filter(c => c.alerts.length).length} with reported critical alerts, ${cs.filter(c => c.category === "Red").length} rated Red, ${cs.filter(c => c.trend < 0).length} with rising risk and ${cs.filter(c => c.category === "Not Assessed").length} not yet assessed.</p></div>
      <div><div class="small faint">Average compliance</div><div class="row" style="align-items:baseline;margin:6px 0 4px"><span class="big-score">${avg == null ? "—" : avg.toFixed(1)}<small>%</small></span>${badge(cat(avg))}</div>
        <div class="small faint" style="margin-bottom:18px">Average risk ${avg == null ? "—" : (100 - avg).toFixed(1) + "%"}</div>
        <div class="dist">${cats.filter(([, n]) => n).map(([k, n]) => `<i style="width:${n / cs.length * 100}%;background:${catColor(k)}" title="${k}: ${n}"></i>`).join("")}</div>
        <div class="legend">${cats.map(([k, n]) => `<span style="--c:${catColor(k)}">${k} <b>${n}</b></span>`).join("")}</div></div>
    </div></div>
    ${summaryCards(cs)}
    <div class="card"><div class="hd"><h2>Centres requiring management attention</h2></div><div class="tw"><table><thead><tr><th>Centre</th><th>District</th><th class="right">Compliance</th><th>Indicator</th><th>Reason</th><th></th></tr></thead><tbody>
      ${attention.map(c => `<tr class="${c.alerts.length ? "alert-row" : ""}"><td><a href="#/scorecard/${c.id}"><b>${esc(c.name)}</b></a><div class="code">${esc(c.code)}</div></td><td>${esc(c.district)}</td><td class="right"><span class="num" style="font-size:16px">${pct(c.score)}</span></td><td>${badge(c.category)}</td>
        <td class="small">${[c.alerts.length ? `${alertTag(c.alerts.length)} ${c.alerts.map(a => esc(a.text)).join("; ")}` : "", c.category === "Red" ? "Compliance below " + th.yellow + "%" : "",
          c.trend < 0 ? `Compliance fell ${Math.abs(c.trend).toFixed(1)} pts since previous visit` : "", c.category === "Not Assessed" ? "No assessment on record" : ""].filter(Boolean).join("<br>")}</td>
        <td class="right"><a class="btn sm" href="#/scorecard/${c.id}">Scorecard</a></td></tr>`).join("") || `<tr><td colspan="6" class="empty">No centres currently require attention.</td></tr>`}</tbody></table></div></div>
    <div class="cols mt">
      <div class="card"><div class="hd"><h2>Section-wise risk summary</h2><span class="small muted">average across latest assessments</span></div><div class="tw"><table><thead><tr><th>Section</th><th>Avg compliance</th><th></th><th class="right">Centres red</th><th class="right">Violations</th></tr></thead><tbody>
        ${secs.map(s => `<tr><td>${esc(s.name)}</td><td class="mono"><b>${s.avg == null ? "—" : s.avg.toFixed(1) + "%"}</b></td><td style="width:28%">${scoreBar(s.avg, cat(s.avg))}</td><td class="right mono">${s.red}</td><td class="right mono">${s.viol}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><div class="hd"><h2>District summary</h2></div><div class="tw"><table><thead><tr><th>District</th><th class="right">Centres</th><th class="right">Avg compliance</th><th class="right">Red</th><th class="right">Alerts</th></tr></thead><tbody>
        ${Object.entries(byDistrict).sort().map(([d, v]) => `<tr><td>${esc(d)}</td><td class="right mono">${v.n}</td><td class="right mono">${v.k ? (v.s / v.k).toFixed(1) + "%" : "—"}</td><td class="right mono">${v.red}</td><td class="right mono">${v.alerts}</td></tr>`).join("")}</tbody></table></div></div>
    </div>
    <div class="cols mt">
      <div class="card"><div class="hd"><h2>Highest-risk centres</h2></div><div class="bd">${ranked.slice(0, 5).map(c => rankLine(c)).join("")}</div></div>
      <div class="card"><div class="hd"><h2>Lowest-risk centres</h2></div><div class="bd">${ranked.slice(-5).reverse().map(c => rankLine(c)).join("")}</div></div>
    </div>
    <p class="small mt"><a href="#/ranking">View the full centre ranking ${icon("right")}</a></p>`);
}
const rankLine = c => `<a href="#/scorecard/${c.id}" class="line">
  <span class="grow"><b>${esc(c.name)}</b><span class="small faint" style="display:block">${esc(c.district)}</span></span>${alertTag(c.alerts.length)}<span class="num" style="font-size:16px;min-width:70px;text-align:right">${pct(c.score)}</span><span style="min-width:120px">${badge(c.category)}</span></a>`;

// ---------------- Scorecard ----------------

async function scorecard(cid, q) {
  const sc = await api(`/centres/${cid}/scorecard`);
  const c = sc.centre, hist = sc.history;
  const aid = q.get("a") || (hist.length ? hist[hist.length - 1].id : null);
  const a = aid ? await api(`/assessments/${aid}`) : null;
  const back = ME.role === "cmd" ? "#/ranking" : "#/";
  const isLatest = a && hist.length && String(hist[hist.length - 1].id) === String(a.id);
  const html = `
    <div class="ph"><div class="grow"><a href="${back}" class="back no-print">${icon("left")}Back to ranking</a>
        <div class="code">${esc(c.code)}${c.demo ? " · DEMO DATA" : ""}${c.active ? "" : " · INACTIVE"}</div><h1 style="margin-top:6px">${esc(c.name)}</h1>
        <div class="sub">${esc(c.location)}, ${esc(c.district)} · Area Coordinator: ${esc(c.ac_name || "Unassigned")}</div></div>
      <div class="row no-print">${hist.length ? `<label class="small faint" style="display:flex;align-items:center;gap:8px">Assessment <select id="aSel" style="width:auto">${hist.slice().reverse().map(h => `<option value="${h.id}" ${String(h.id) === String(aid) ? "selected" : ""}>${fmtDate(h.visit_date)} — ${pct(h.score)}</option>`).join("")}</select></label>` : ""}
        <button class="btn" onclick="window.print()">${icon("print")}Print report</button></div></div>
    ${!a ? `<div class="card"><div class="empty"><b>Not assessed</b>No assessment has been submitted for this centre. It is not treated as low risk.</div></div>` : `
    <div class="card" style="margin-bottom:22px"><div class="bd"><div class="row" style="align-items:stretch;gap:28px">
      <dl class="info-list grow" style="min-width:280px"><dt>Assessment date</dt><dd>${fmtDate(a.visit_date)} <span class="chip ${isLatest ? "ok" : ""}">${isLatest ? "Latest" : "Historical"}</span></dd>
        <dt>Reported by</dt><dd>${esc(a.ac_name)}</dd><dt>Submitted</dt><dd>${fmtDT(a.submitted_at)} · Ref RDS-${String(a.id).padStart(5, "0")}</dd>
        <dt>Status</dt><dd>${a.status === "Scored" ? "Submitted and scored" : esc(a.status)} · ${a.reviews.length ? "Reviewed by IAQC" : "Awaiting IAQC review"}</dd>
        <dt>Checklist</dt><dd>Version ${a.checklist_version} <span class="small faint">— scored with the rules in force at submission</span></dd></dl>
      <div class="score-col"><div class="small faint">Compliance score</div><div class="big-score" style="margin:6px 0 10px">${a.score == null ? "—" : a.score.toFixed(2)}<small>%</small></div>
        <div class="row" style="gap:10px">${badge(a.category)}${alertTag(a.alerts.length)}</div>
        <div class="small muted" style="margin-top:10px">Risk <b>${pct(a.risk)}</b> · ${a.earned} of ${a.max} applicable points</div></div>
    </div></div></div>`}` + (a ? assessmentDetail(a, sc) : "");
  shell("Centre Scorecard", html);
  const sel = $("#aSel");
  if (sel) sel.onchange = () => location.hash = `#/scorecard/${cid}?a=${sel.value}`;
  if (a) wireDetail(a, cid);
}

function assessmentDetail(a, sc) {
  const k = a.counts;
  const hist = sc.history;
  return `
    ${a.alerts.length ? `<div class="banner crit">${icon("alert")}<div><b>Critical-risk alert${a.alerts.length > 1 ? "s" : ""} — a reported issue, not an established finding</b>
      ${a.alerts.map(al => `<div style="margin-top:8px"><b>${esc(al.text)}</b> <span class="small">· ${esc(al.section)} · ${esc(al.verification)}</span><div class="small" style="opacity:.85;margin-top:2px">${esc(al.remark)}</div></div>`).join("")}</div></div>` : ""}
    <div class="kpis">
      <div class="kpi g"><div class="l">Compliant</div><div class="v">${k.C}</div></div><div class="kpi y"><div class="l">Partially compliant</div><div class="v">${k.P}</div></div>
      <div class="kpi r"><div class="l">Non-compliant</div><div class="v">${k.N}</div></div><div class="kpi"><div class="l">Not applicable</div><div class="v">${k.NA}</div><div class="small faint">excluded from maximum</div></div>
      <div class="kpi"><div class="l">Criteria assessed</div><div class="v">${a.assessed}</div><div class="small faint">of ${a.assessed + k.NA} on checklist</div></div>
    </div>
    <div class="with-rail"><div>
    <div class="card"><div class="hd"><h2>Section analysis</h2></div><div class="tw"><table><thead><tr><th>Section</th><th class="right">Earned</th><th class="right">Max</th><th class="right">Compliance</th><th>Indicator</th><th class="right">Violations</th></tr></thead><tbody>
      ${a.sections.map(s => `<tr><td>${esc(s.name)}</td><td class="right mono">${s.earned}</td><td class="right mono">${s.max}</td><td class="right"><span class="num" style="font-size:15px">${pct(s.score)}</span>${scoreBar(s.score, s.category)}</td><td>${badge(s.category)}</td><td class="right mono">${s.violations}</td></tr>`).join("")}
      <tr class="total"><td>Overall</td><td class="right mono">${a.earned}</td><td class="right mono">${a.max}</td><td class="right"><span class="num" style="font-size:15px">${pct(a.score)}</span></td><td>${badge(a.category)}</td><td class="right mono">${k.N + k.P}</td></tr></tbody></table></div>
      <div class="formula">Compliance = earned ÷ applicable maximum × 100 = ${a.earned} ÷ ${a.max} × 100 = <b>${pct(a.score)}</b>. Risk = 100 − compliance = <b>${pct(a.risk)}</b>.
        Each response earns a share of the criterion weight — Compliant ${a.factors.C}%, Partially ${a.factors.P}%, Non-compliant ${a.factors.N}%. Not Applicable is excluded from the maximum. Thresholds: Green ≥ ${a.thresholds.green}%, Yellow ≥ ${a.thresholds.yellow}%.</div></div>
    <div class="card"><div class="hd"><h2>Checklist responses</h2><span class="spacer"></span><label class="check small no-print" style="margin:0"><input type="checkbox" id="onlyViol"> Violations only</label></div><div class="tw" id="itemsTable">${itemsTable(a, false)}</div></div>
    ${a.general_remarks ? `<div class="card"><div class="hd"><h2>General remarks</h2><span class="small faint">from the Area Coordinator</span></div><div class="bd"><p class="statement" style="font-size:17px">${esc(a.general_remarks)}</p></div></div>` : ""}
    </div><aside class="rail">
      <div class="card"><div class="hd"><h3>Score history</h3></div><div class="bd" style="padding:14px 12px 4px">${trendChart(hist, a.thresholds)}</div>
        <ul class="mini-list" style="padding:4px 20px 16px">${hist.slice().reverse().map((h, i, arr) => { const p = arr[i + 1]; const ch = p && p.category !== h.category ? `${esc(p.category)} → ${esc(h.category)}` : "";
          return `<li class="row" style="flex-wrap:nowrap;gap:10px">${String(h.id) === String(a.id) ? `<b class="grow">${fmtDate(h.visit_date)}</b>` : `<a class="grow" style="font-weight:500" href="#/scorecard/${h.centre_id}?a=${h.id}">${fmtDate(h.visit_date)}</a>`}
            <span class="small faint">${ch}</span><span class="mono">${pct(h.score)}</span><span class="badge ${catClass(h.category)}" title="${esc(h.category)}"></span></li>`; }).join("")}</ul></div>
      <div class="card"><div class="hd"><h3>Unresolved concerns</h3></div><div class="bd">
        ${sc.unresolved.length ? `<ul class="mini-list">${sc.unresolved.map(u => `<li>${alertTag(1)}<div style="margin-top:6px;font-weight:600">${esc(u.text)}</div><div class="small faint">Reported ${fmtDate(u.visit_date)} · ${esc(u.verification)}</div></li>`).join("")}</ul>` : '<p class="small muted" style="margin:0">No open critical alerts.</p>'}
        <div class="small faint" style="margin:18px 0 8px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:10.5px">Recurring non-compliance</div>
        ${sc.recurring.length ? `<ul class="mini-list">${sc.recurring.map(r => `<li><span class="st-N">${esc(r.text)}</span><div class="small faint">${esc(r.section)} · first reported ${fmtDate(r.first_reported)} · ${r.times} visits</div></li>`).join("")}</ul>` : '<p class="small muted" style="margin:0">Nothing non-compliant across consecutive visits.</p>'}
      </div></div>
      <div class="card"><div class="hd"><h3>Verification record</h3><span class="spacer"></span>${ME.role === "iaqc" ? `<button class="btn sm no-print" id="addReview">${icon("plus")}Add note</button>` : ""}</div><div class="bd">
        <p class="small faint" style="margin:0 0 12px">Kept separately. The Area Coordinator's original report is never changed.</p>
        ${a.reviews.length ? `<ul class="mini-list">${a.reviews.map(r => `<li><div class="row" style="gap:8px"><span class="chip">${esc(r.outcome)}</span><span class="small faint">${fmtDT(r.at)}</span></div>
          <div class="small" style="margin-top:6px;font-weight:600">${esc(a.items.find(i => i.id === r.criterion_id)?.text || "Whole report")}</div>
          <div class="small muted" style="margin-top:2px">${esc(r.note)}</div>${r.corrected_status ? `<div class="small" style="margin-top:4px">Corrected status: <span class="st-${r.corrected_status}">${STATUS[r.corrected_status]}</span></div>` : ""}
          <div class="small faint" style="margin-top:4px">${esc(r.reviewer)}</div></li>`).join("")}</ul>` : '<p class="small muted" style="margin:0">No verification notes yet.</p>'}
      </div></div>
    </aside></div>`;
}

function itemsTable(a, onlyViol) {
  let sec = null;
  const rows = a.items.filter(i => !onlyViol || i.status === "N" || i.status === "P").map(i => {
    const head = i.section !== sec ? `<tr class="group"><td colspan="7">${esc(sec = i.section)}</td></tr>` : "";
    return head + `<tr class="${i.alert ? "alert-row" : ""}"><td>${esc(i.text)}${i.mandatory ? ' <span class="chip mand">Mandatory</span>' : ""}</td><td><span class="chip ${i.priority}">${i.priority}</span></td>
      <td class="right mono">${i.weight}</td><td class="nowrap">${i.status ? `<span class="st-${i.status}">${STATUS[i.status]}</span>` : '<span class="req">Unanswered</span>'}</td>
      <td class="right mono">${i.points == null ? '<span class="faint">excl.</span>' : `${+i.points.toFixed(2)} / ${i.weight}`}</td><td class="small">${esc(i.remark) || '<span class="faint">—</span>'}</td>
      <td>${i.alert ? alertTag(1) : i.critical ? '<span class="chip crit" title="Critical criterion">Critical item</span>' : ""}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Criterion</th><th>Priority</th><th class="right">Weight</th><th>Response</th><th class="right">Points</th><th>Area Coordinator's remarks</th><th>Flag</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">No violations.</td></tr>'}</tbody></table>`;
}

function wireDetail(a, cid) {
  $("#onlyViol").onchange = e => $("#itemsTable").innerHTML = itemsTable(a, e.target.checked);
  const btn = $("#addReview");
  if (btn) btn.onclick = () => modal("Add verification note", `
    <div class="banner info small">This note is stored separately. The original submitted responses and score are preserved unchanged.</div>
    <label class="f"><span>Criterion (optional)</span><select name="criterion_id"><option value="">Whole report</option>
      ${a.items.filter(i => i.status === "N" || i.status === "P").map(i => `<option value="${i.id}">${i.alert ? "[Critical alert] " : ""}${esc(i.text)} (${STATUS[i.status]})</option>`).join("")}
      <optgroup label="Other criteria">${a.items.filter(i => i.status !== "N" && i.status !== "P").map(i => `<option value="${i.id}">${esc(i.text)}</option>`).join("")}</optgroup></select></label>
    <label class="f"><span>Outcome</span><select name="outcome">${["Note", "Verified - Confirmed", "Verified - Not Substantiated", "Correction Recorded", "Resolved"].map(o => `<option>${o}</option>`).join("")}</select></label>
    <label class="f"><span>Corrected status (only for "Correction Recorded")</span><select name="corrected_status"><option value="">—</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
    <label class="f"><span>Note</span><textarea name="note" required placeholder="Evidence reviewed, persons contacted, conclusion"></textarea></label>`,
    async f => { const v = fd(f); await api(`/assessments/${a.id}/reviews`, { ...v, criterion_id: v.criterion_id ? +v.criterion_id : null }); toast("Verification note added"); scorecard(cid, new URLSearchParams("a=" + a.id)); }, "Add note");
}

// ---------------- Assessments history ----------------

async function assessments() {
  const list = await api("/assessments");
  const view = shell(ME.role === "cmd" ? "Assessment History" : "Assessments", `<div class="card"><div class="filters">
    <input type="search" id="aq" placeholder="Search centre, code or Area Coordinator" aria-label="Search">
    <select id="ac"><option value="">All categories</option>${["Red", "Yellow", "Green", "Unscorable"].map(c => `<option>${c}</option>`).join("")}</select>
    <label class="check small" style="margin:0"><input type="checkbox" id="aa"> Critical alerts only</label>
    <span class="spacer"></span><span class="small muted">${list.length} submitted reports · all reports are preserved unchanged</span></div><div class="tw" id="aTable"></div></div>`);
  const draw = () => {
    const q = $("#aq").value.toLowerCase(), c = $("#ac").value, al = $("#aa").checked;
    const rs = list.filter(a => (!q || `${a.centre_name} ${a.code} ${a.ac_name}`.toLowerCase().includes(q)) && (!c || a.category === c) && (!al || a.alerts.length));
    $("#aTable", view).innerHTML = rs.length ? `<table><thead><tr><th>Ref</th><th>Visit date</th><th>Centre</th><th>District</th><th>Area Coordinator</th><th>Compliance</th><th>Indicator</th><th>Alert</th><th class="right">Assessed / N/A</th><th>Checklist</th><th></th></tr></thead><tbody>
      ${rs.map(a => `<tr><td class="mono small">RDS-${String(a.id).padStart(5, "0")}</td><td class="nowrap">${fmtDate(a.visit_date)}</td><td><b>${esc(a.centre_name)}</b><div class="small muted mono">${esc(a.code)}</div></td><td>${esc(a.district)}</td><td>${esc(a.ac_name)}</td>
        <td class="mono"><b>${pct(a.score)}</b></td><td>${badge(a.category)}</td><td>${alertTag(a.alerts.length)}</td><td class="right mono">${a.assessed} / ${a.counts.NA}</td><td class="small">v${a.checklist_version}</td>
        <td><a class="btn sm" href="#/scorecard/${a.centre_id}?a=${a.id}">Open</a></td></tr>`).join("")}</tbody></table>` : '<div class="empty">No assessments match.</div>';
  };
  $("#aq").oninput = draw; $("#ac").onchange = draw; $("#aa").onchange = draw;
  draw();
}

// ---------------- IAQC: centres ----------------

async function centres() {
  const [cs, us] = await Promise.all([api("/centres"), api("/users")]);
  const acs = us.filter(u => u.role === "ac");
  const view = shell("Centre Management", `<div class="card"><div class="filters">
    <input type="search" id="cq" placeholder="Search name, code, location, district" aria-label="Search">
    <select id="cs"><option value="">All statuses</option><option value="1">Active</option><option value="0">Inactive</option></select><span class="spacer"></span>
    <button class="btn primary" id="addC">+ Add centre</button></div><div class="tw" id="cTable"></div></div>`);
  const form = c => `<div class="grid2"><label class="f"><span>Centre code</span><input name="code" required value="${esc(c.code)}" placeholder="e.g. TVM-03"></label>
    <label class="f"><span>Centre name</span><input name="name" required value="${esc(c.name)}"></label>
    <label class="f"><span>Location</span><input name="location" required value="${esc(c.location)}"></label>
    <label class="f"><span>District</span><input name="district" required value="${esc(c.district)}" list="dlist"><datalist id="dlist">${[...new Set(cs.map(x => x.district))].map(d => `<option value="${esc(d)}">`).join("")}</datalist></label></div>
    <label class="f"><span>Assigned Area Coordinator</span><select name="ac_id"><option value="">— Unassigned —</option>${acs.map(u => `<option value="${u.id}" ${c.ac_id === u.id ? "selected" : ""} ${u.active ? "" : "disabled"}>${esc(u.name)} (${esc(u.username)})${u.active ? "" : " — inactive"}</option>`).join("")}</select></label>
    <label class="check"><input type="checkbox" name="active" ${c.active !== 0 ? "checked" : ""}> Active centre</label>`;
  const save = id => async f => {
    const v = fd(f);
    const payload = { ...v, ac_id: v.ac_id ? +v.ac_id : null, active: !!v.active };
    if (id) await api(`/centres/${id}`, payload, "PUT"); else await api("/centres", payload);
    toast(id ? "Centre updated" : "Centre created"); centres();
  };
  const draw = () => {
    const q = $("#cq").value.toLowerCase(), s = $("#cs").value;
    const rs = cs.filter(c => (!q || `${c.name} ${c.code} ${c.location} ${c.district}`.toLowerCase().includes(q)) && (s === "" || String(c.active) === s));
    $("#cTable", view).innerHTML = `<table><thead><tr><th>Code</th><th>Centre</th><th>Location</th><th>District</th><th>Area Coordinator</th><th>Last visit</th><th>Status</th><th></th></tr></thead><tbody>
      ${rs.map(c => `<tr class="${c.active ? "" : "inactive"}"><td class="mono">${esc(c.code)}</td><td><b>${esc(c.name)}</b>${c.demo ? ' <span class="chip">DEMO</span>' : ""}</td><td>${esc(c.location)}</td><td>${esc(c.district)}</td>
        <td>${esc(c.ac_name || "—")}</td><td class="nowrap">${fmtDate(c.last_visit)}</td><td>${c.active ? '<span class="badge b-green">Active</span>' : '<span class="badge b-grey">Inactive</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-edit="${c.id}">Edit</button> <button class="btn sm" data-tog="${c.id}">${c.active ? "Deactivate" : "Activate"}</button> <a class="btn sm" href="#/scorecard/${c.id}">Scorecard</a></td></tr>`).join("") || '<tr><td colspan="8" class="empty">No centres.</td></tr>'}</tbody></table>`;
    $$("[data-edit]", view).forEach(b => b.onclick = () => { const c = cs.find(x => x.id === +b.dataset.edit); modal("Edit centre", form(c), save(c.id)); });
    $$("[data-tog]", view).forEach(b => b.onclick = async () => {
      const c = cs.find(x => x.id === +b.dataset.tog);
      try { await api(`/centres/${c.id}`, { ...c, active: !c.active }, "PUT"); toast(c.active ? "Centre deactivated" : "Centre activated"); centres(); } catch (e) { toast(e.message, true); }
    });
  };
  $("#cq").oninput = draw; $("#cs").onchange = draw;
  $("#addC").onclick = () => modal("Add franchise centre", form({ active: 1 }), save(null), "Create centre");
  draw();
}

// ---------------- IAQC: users ----------------

async function users() {
  const [us, cs] = await Promise.all([api("/users"), api("/centres")]);
  const view = shell("User Management", `<div class="banner info small">Only Area Coordinator accounts are managed here. Each account can access only the centres assigned to it. IAQC and CMD accounts are fixed system accounts in this prototype.</div>
    <div class="card"><div class="hd"><h2>Accounts</h2><span class="spacer"></span><button class="btn primary" id="addU">+ Create Area Coordinator</button></div><div class="tw"><table>
    <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Area</th><th>Assigned centres</th><th>Status</th><th></th></tr></thead><tbody>
    ${us.map(u => `<tr class="${u.active ? "" : "inactive"}"><td><b>${esc(u.name)}</b></td><td class="mono">${esc(u.username)}</td><td>${ROLE[u.role]}</td><td class="small">${esc(u.area)}</td>
      <td class="small">${u.role === "ac" ? (u.centres.map(c => esc(c.code)).join(", ") || '<span class="faint">None</span>') : '<span class="faint">All (role-based)</span>'}</td>
      <td>${u.active ? '<span class="badge b-green">Active</span>' : '<span class="badge b-grey">Inactive</span>'}</td>
      <td class="nowrap">${u.role === "ac" ? `<button class="btn sm" data-edit="${u.id}">Edit</button> <button class="btn sm" data-reset="${u.id}">Reset password</button> <button class="btn sm" data-tog="${u.id}">${u.active ? "Deactivate" : "Activate"}</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></div>`);
  const tmp = () => "Temp@" + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);
  const centrePick = sel => `<div class="f"><span class="small muted" style="font-weight:600">Assigned centres</span><div style="max-height:180px;overflow:auto;border:1px solid var(--rule-2);border-radius:var(--r);padding:8px 10px;margin-top:4px">
    ${cs.map(c => `<label class="check small" style="margin-bottom:4px"><input type="checkbox" name="centre" value="${c.id}" ${sel.includes(c.id) ? "checked" : ""}> ${esc(c.code)} — ${esc(c.name)} <span class="muted">(${esc(c.district)}${c.ac_name && !sel.includes(c.id) ? ", now: " + esc(c.ac_name) : ""})</span></label>`).join("")}</div></div>`;
  const ids = f => $$("[name=centre]:checked", f).map(i => +i.value);
  $("#addU").onclick = () => {
    const pw = tmp();
    modal("Create Area Coordinator", `<div class="grid2"><label class="f"><span>Full name</span><input name="name" required></label><label class="f"><span>Username</span><input name="username" required pattern="[A-Za-z0-9._]+" placeholder="e.g. meera.ac"></label></div>
      <label class="f"><span>Area / districts</span><input name="area" placeholder="e.g. Kozhikode, Kannur"></label>
      <label class="f"><span>Temporary password (share securely; min 8 characters)</span><input name="password" required minlength="8" value="${pw}"></label>${centrePick([])}`,
      async f => { await api("/users", { ...fd(f), centre_ids: ids(f) }); toast("Area Coordinator created"); users(); }, "Create account");
  };
  $$("[data-edit]", view).forEach(b => b.onclick = () => {
    const u = us.find(x => x.id === +b.dataset.edit);
    modal("Edit Area Coordinator", `<label class="f"><span>Full name</span><input name="name" required value="${esc(u.name)}"></label>
      <label class="f"><span>Area / districts</span><input name="area" value="${esc(u.area)}"></label>${centrePick(u.centres.map(c => c.id))}
      <label class="check"><input type="checkbox" name="active" ${u.active ? "checked" : ""}> Active account</label>`,
      async f => { const v = fd(f); await api(`/users/${u.id}`, { name: v.name, area: v.area, active: !!v.active, centre_ids: ids(f) }, "PUT"); toast("User updated"); users(); });
  });
  $$("[data-reset]", view).forEach(b => b.onclick = () => {
    const u = us.find(x => x.id === +b.dataset.reset);
    modal(`Reset password — ${u.name}`, `<label class="f"><span>New temporary password</span><input name="password" required minlength="8" value="${tmp()}"></label><p class="small muted">Share the new password with the user through a secure channel.</p>`,
      async f => { await api(`/users/${u.id}/reset`, fd(f)); toast("Password reset"); }, "Reset password");
  });
  $$("[data-tog]", view).forEach(b => b.onclick = async () => {
    const u = us.find(x => x.id === +b.dataset.tog);
    try { await api(`/users/${u.id}`, { name: u.name, area: u.area, active: !u.active }, "PUT"); toast(u.active ? "User deactivated" : "User activated"); users(); } catch (e) { toast(e.message, true); }
  });
}

// ---------------- IAQC: checklist ----------------

async function checklist() {
  const [secs, st] = await Promise.all([api("/checklist?all=1"), api("/settings")]);
  const active = secs.filter(s => s.active);
  const maxOf = s => s.criteria.filter(c => c.active).reduce((a, c) => a + c.weight, 0);
  const total = active.reduce((a, s) => a + maxOf(s), 0);
  const view = shell("Checklist Management", `
    <div class="banner info small"><div>Current checklist version <b>v${st.checklist_version}</b>. Changes apply to <b>future assessments only</b>; submitted reports keep the checklist and scoring rules they were submitted with.
      Criteria shown are <b>sample, configurable organisational policy requirements</b> — not verified existing organisational rules.</div></div>
    <div class="kpis"><div class="kpi b"><div class="l">Active sections</div><div class="v">${active.length}</div></div>
      <div class="kpi b"><div class="l">Active criteria</div><div class="v">${active.reduce((a, s) => a + s.criteria.filter(c => c.active).length, 0)}</div></div>
      <div class="kpi c"><div class="l">Critical criteria</div><div class="v">${active.reduce((a, s) => a + s.criteria.filter(c => c.active && c.critical).length, 0)}</div></div>
      <div class="kpi"><div class="l">Maximum checklist score</div><div class="v">${total}</div><div class="small faint">points</div></div></div>
    <div class="row" style="margin-bottom:14px"><span class="spacer"></span><button class="btn" id="addS">+ Add section</button><button class="btn primary" id="addCr">+ Add criterion</button></div>
    ${secs.map(s => `<div class="card ${s.active ? "" : "inactive"}" style="${s.active ? "" : "opacity:.6"}"><div class="hd"><h2>${esc(s.name)}</h2>${s.active ? "" : '<span class="chip">Inactive section</span>'}
      <span class="small muted">Max ${maxOf(s)} pts · ${s.criteria.filter(c => c.active).length} active criteria · order ${s.sort}</span><span class="spacer"></span>
      <button class="btn sm" data-es="${s.id}">Edit section</button><button class="btn sm" data-ac="${s.id}">+ Criterion</button></div>
      <div class="tw"><table><thead><tr><th>#</th><th>Criterion</th><th>Priority</th><th class="right">Weight</th><th>Flags</th><th>Status</th><th></th></tr></thead><tbody>
      ${s.criteria.map(c => `<tr class="${c.active ? "" : "inactive"}"><td class="mono small">${c.sort}</td><td>${esc(c.text)}${c.description ? `<div class="small muted">${esc(c.description)}</div>` : ""}</td>
        <td><span class="chip ${c.priority}">${c.priority}</span></td><td class="right mono">${c.weight}</td>
        <td>${c.critical ? '<span class="chip crit">Critical alert</span> ' : ""}${c.mandatory ? '<span class="chip mand">Mandatory</span>' : ""}</td>
        <td>${c.active ? "Active" : '<span class="faint">Inactive</span>'}</td><td class="nowrap"><button class="btn sm" data-ec="${c.id}">Edit</button> <button class="btn sm" data-tc="${c.id}">${c.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">No criteria in this section.</td></tr>'}
      </tbody></table></div></div>`).join("")}`);
  const allC = secs.flatMap(s => s.criteria);
  const sectionForm = s => `<label class="f"><span>Section name</span><input name="name" required value="${esc(s.name)}"></label><label class="f"><span>Display order</span><input type="number" name="sort" value="${s.sort ?? secs.length + 1}"></label>
    <label class="check"><input type="checkbox" name="active" ${s.active !== 0 ? "checked" : ""}> Active section</label>`;
  const critForm = c => `<label class="f"><span>Section</span><select name="section_id">${secs.map(s => `<option value="${s.id}" ${c.section_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
    <label class="f"><span>Criterion</span><input name="text" required value="${esc(c.text)}"></label>
    <label class="f"><span>Description / guidance for Area Coordinators (optional)</span><textarea name="description">${esc(c.description)}</textarea></label>
    <div class="grid2"><label class="f"><span>Priority</span><select name="priority" id="prio">${PRIORITIES.map(p => `<option ${c.priority === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label class="f"><span>Weight (points)</span><input type="number" step="0.5" min="0.5" max="100" name="weight" id="wt" required value="${c.weight ?? st.priority_weights[c.priority || "Medium"]}"></label></div>
    <label class="f"><span>Display order</span><input type="number" name="sort" value="${c.sort ?? 99}"></label>
    <label class="check"><input type="checkbox" name="critical" ${c.critical ? "checked" : ""}> Critical — a Non-Compliant response raises a critical-risk alert</label>
    <label class="check"><input type="checkbox" name="mandatory" ${c.mandatory ? "checked" : ""}> Mandatory — cannot be marked Not Applicable</label>
    <label class="check"><input type="checkbox" name="active" ${c.active !== 0 ? "checked" : ""}> Active</label>
    <p class="small muted">Default weights: ${PRIORITIES.map(p => `${p} ${st.priority_weights[p]}`).join(" · ")}. Changing priority applies its default weight; you can override it.</p>`;
  const wirePrio = f => { $("#prio", f).onchange = e => $("#wt", f).value = st.priority_weights[e.target.value]; };
  const critPayload = f => { const v = fd(f); return { ...v, section_id: +v.section_id, weight: +v.weight, sort: +v.sort, critical: !!v.critical, mandatory: !!v.mandatory, active: !!v.active }; };
  $("#addS").onclick = () => modal("Add section", sectionForm({}), async f => { const v = fd(f); await api("/sections", { ...v, active: true }); toast("Section added"); checklist(); });
  $$("[data-es]", view).forEach(b => b.onclick = () => { const s = secs.find(x => x.id === +b.dataset.es);
    modal("Edit section", sectionForm(s), async f => { const v = fd(f); await api(`/sections/${s.id}`, { ...v, active: !!v.active }, "PUT"); toast("Section updated"); checklist(); }); });
  const newCrit = sid => wirePrio(modal("Add criterion", critForm({ section_id: sid, priority: "Medium" }), async f => { await api("/criteria", critPayload(f)); toast("Criterion added"); checklist(); }));
  $("#addCr").onclick = () => newCrit(secs[0]?.id);
  $$("[data-ac]", view).forEach(b => b.onclick = () => newCrit(+b.dataset.ac));
  $$("[data-ec]", view).forEach(b => b.onclick = () => { const c = allC.find(x => x.id === +b.dataset.ec);
    wirePrio(modal("Edit criterion", critForm(c), async f => { await api(`/criteria/${c.id}`, critPayload(f), "PUT"); toast("Criterion updated"); checklist(); })); });
  $$("[data-tc]", view).forEach(b => b.onclick = async () => { const c = allC.find(x => x.id === +b.dataset.tc);
    try { await api(`/criteria/${c.id}`, { ...c, active: !c.active }, "PUT"); toast(c.active ? "Criterion deactivated" : "Criterion activated"); checklist(); } catch (e) { toast(e.message, true); } });
}

// ---------------- IAQC: scoring rules ----------------

async function scoring() {
  const st = await api("/settings");
  const view = shell("Scoring Rules", `<div class="cols"><form class="card" id="sForm"><div class="hd"><h2>Risk thresholds &amp; scoring</h2></div><div class="bd">
      <h3 style="margin-bottom:10px">Risk indicator thresholds (compliance %)</h3>
      <div class="grid2"><label class="f"><span>Green — minimum score</span><input type="number" step="0.01" name="green" value="${st.thresholds.green}" required></label>
        <label class="f"><span>Yellow — minimum score</span><input type="number" step="0.01" name="yellow" value="${st.thresholds.yellow}" required></label></div>
      <p class="small muted" style="margin-top:-6px">Scores below the Yellow minimum are Red.</p>
      <h3 style="margin:16px 0 10px">Response scoring (% of criterion weight)</h3>
      <div class="grid2"><label class="f"><span>Compliant</span><input type="number" name="C" value="${st.factors.C}" readonly></label>
        <label class="f"><span>Partially Compliant</span><input type="number" step="1" min="0" max="100" name="P" value="${st.factors.P}" required></label>
        <label class="f"><span>Non-Compliant</span><input type="number" step="1" min="0" max="100" name="N" value="${st.factors.N}" required></label>
        <label class="f"><span>Not Applicable</span><input value="Excluded from maximum" disabled></label></div>
      <h3 style="margin:16px 0 10px">Default weight by priority</h3>
      <div class="grid2">${PRIORITIES.map(p => `<label class="f"><span>${p}</span><input type="number" step="0.5" min="0.5" name="w_${p}" value="${st.priority_weights[p]}" required></label>`).join("")}</div>
      <p class="small muted" style="margin-top:-6px">Defaults are applied when creating criteria or changing priority; existing criterion weights are not changed automatically.</p>
      <label class="f"><span>Visit cycle (days) — centres not visited within this period are shown as pending</span><input type="number" min="1" name="cycle" value="${st.visit_cycle_days}" required></label>
      <div class="err" id="sErr"></div><button class="btn primary">Save scoring rules</button></div></form>
    <div class="card"><div class="hd"><h2>How the score is calculated</h2></div><div class="bd small">
      <div class="formula"><b>Compliance Score (%)</b> = Earned Points ÷ Applicable Maximum Points × 100<br><b>Risk Percentage</b> = 100 − Compliance Score</div>
      <ul style="padding-left:18px;line-height:1.7">
        <li>Each criterion carries a weight. Earned points = weight × response %.</li>
        <li><b>Not Applicable</b> responses are excluded from the maximum. Mandatory criteria cannot be marked Not Applicable.</li>
        <li>Unanswered criteria are never treated as compliant: incomplete reports cannot be submitted and receive no score.</li>
        <li>If every criterion is Not Applicable, the report is shown as <b>Unscorable</b>, not 100%.</li>
        <li>A Non-Compliant response on a <b>critical</b> criterion raises a critical-risk alert regardless of the overall score. Alerts are labelled <i>Reported — Pending Verification</i> until reviewed.</li>
        <li>Remarks are required for Non-Compliant responses and for Partially Compliant responses on Critical/High priority criteria.</li>
        <li>Centres without a valid assessment are <b>Not Assessed</b>, never low risk.</li>
        <li>Changes to thresholds or response scoring create a new checklist version and apply to future reports only.</li>
      </ul></div></div></div>`);
  $("#sForm", view).onsubmit = async e => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api("/settings", { thresholds: { green: +v.green, yellow: +v.yellow }, factors: { C: 100, P: +v.P, N: +v.N },
        priority_weights: Object.fromEntries(PRIORITIES.map(p => [p, +v["w_" + p]])), visit_cycle_days: +v.cycle }, "PUT");
      toast("Scoring rules saved — they apply to future assessments"); scoring();
    } catch (err) { $("#sErr").textContent = err.message; }
  };
}

// ---------------- IAQC: audit log ----------------

async function auditLog() {
  const log = await api("/audit");
  shell("Audit Log", `<div class="card"><div class="hd"><h2>Administrative actions</h2><span class="small muted">most recent 500 entries</span></div><div class="tw"><table>
    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>
    ${log.map(l => `<tr><td class="nowrap small">${fmtDT(l.at)}</td><td class="mono small">${esc(l.username || "—")}</td><td><span class="chip ${/DENIED|FAILED/.test(l.action) ? "Critical" : ""}">${esc(l.action)}</span></td><td class="small">${esc(l.detail)}</td></tr>`).join("")}
    </tbody></table></div></div>`);
}

route();
