// reader.js: YouVersion-style reader. Tap to select verses, color highlights, notes, bookmarks, smooth scrolling. Fully offline.
// Loaded BEFORE the main script; uses its globals (S, ORD, bname, esc, vtext, tx, db, tab, render, setTab, openEgw) only inside functions.
const $r = id => document.getElementById(id);
const R = { t: null, have: [], eg: [], sel: new Set(), marks: new Map(), notes: [], ni: new Map(), bms: new Map(), ready: false, go: null, last: null, jumped: false };
const PAL0 = [["y", "Yellow", "#f5d742"], ["g", "Green", "#6fcf74"], ["b", "Blue", "#5aa9f0"], ["p", "Pink", "#f58ab8"], ["o", "Orange", "#f5a04a"], ["v", "Purple", "#b08af0"], ["r", "Red", "#f06060"]].map(([id, name, hex]) => ({ id, name, hex }));
let PAL = JSON.parse(localStorage.getItem("pal") || "null") || PAL0;
const UI = Object.assign({ fs: 19, lh: 1.7, ff: "serif", th: "auto", w: 700, vn: 1, just: 0, sw: 1, nav: ["read", "search", "notes", "egw", "lib", "me"] }, JSON.parse(localStorage.getItem("ui") || "{}"));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- settings: colors and appearance ----------
function palCss() {
  let el = $r("palcss"); if (!el) { el = document.createElement("style"); el.id = "palcss"; document.head.appendChild(el); }
  el.textContent = PAL.map(c => `[data-c="${c.id}"]{--hc:${c.hex}}`).join("");  // recolors every highlight instantly, no DOM walk
}
function savePal() { localStorage.setItem("pal", JSON.stringify(PAL)); palCss(); buildAbar(); }
function applyNav() {   // bottom bar order from the options (Me tab)
  const nav = document.querySelector("nav"); if (!nav) return; const by = {}; nav.querySelectorAll("button").forEach(b => by[b.dataset.t] = b);
  const ord = (UI.nav || []).filter(k => by[k]); Object.keys(by).forEach(k => { if (!ord.includes(k)) ord.push(k); });
  ord.forEach(k => nav.appendChild(by[k]));
}
function navMove(i, d) { const o = [...UI.nav], j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; UI.nav = o; saveUI(); render(); }
window.addEventListener("load", applyNav);
(function () {   // swipe left/right = next/previous tab. Light version: nothing big is moved; a screen-sized "curtain" slides across while the tab switches underneath
  let s = null, busy = false;
  const tabs = () => [...document.querySelectorAll("nav button")];
  document.addEventListener("touchstart", e => {
    const tg = e.target; s = null; if (!UI.sw || busy || e.touches.length !== 1 || !tg.closest) return;
    if (tg.closest("input,select,textarea,#abar,#sheet,nav,#rgs,.rbar,[contenteditable]") || (window.R && R.sel && R.sel.size)) return;
    for (let n = tg; n && n !== document.body; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return;
    s = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener("touchend", async e => {
    if (!s) return; const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t; s = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2.2 || dt > 700) return;
    const bs = tabs(), i = bs.findIndex(b => b.classList.contains("on")), dir = dx < 0 ? 1 : -1, j = i + dir; if (i < 0 || j < 0 || j >= bs.length) return;
    busy = true;   // the old page is copied on top of itself, the tab switches underneath, then the old page slides away and reveals the new one
    const old = tab === "read" ? document.getElementById("reader") : document.getElementById("app"), r0 = old.getBoundingClientRect(), y = scrollY;
    const syncForm = (from, to) => { const f = from.querySelectorAll("select,input,textarea"), t = to.querySelectorAll("select,input,textarea"); f.forEach((el, i) => { if (!t[i]) return; if (el.tagName === "SELECT") t[i].selectedIndex = el.selectedIndex; else if (el.type === "checkbox" || el.type === "radio") t[i].checked = el.checked; else t[i].value = el.value; }); };
    const g = document.createElement("div"); let cl;
    if (tab === "read") {   // chapters have estimated heights off-screen, so copy only what is on screen, each piece at its exact on-screen position
      cl = document.createElement("div"); const W = r0.width, L = r0.left;
      document.querySelectorAll("#rtext section.ch").forEach(sec => { const q = sec.getBoundingClientRect(); if (q.bottom < 0 || q.top > innerHeight) return;
        const c = sec.cloneNode(true); c.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); Object.assign(c.style, { position: "absolute", left: q.left + "px", width: q.width + "px", top: q.top + "px", margin: "0", contentVisibility: "visible" }); cl.appendChild(c); });
      const rb = document.querySelector("#reader .rbar"); if (rb) { const q = rb.getBoundingClientRect(), c = rb.cloneNode(true); syncForm(rb, c); c.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); Object.assign(c.style, { position: "absolute", left: q.left + "px", width: q.width + "px", top: q.top + "px", zIndex: "2", boxSizing: "border-box" }); cl.appendChild(c); }
      Object.assign(cl.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" });
    } else {
      cl = old.cloneNode(true); syncForm(old, cl); cl.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); cl.removeAttribute("id"); cl.hidden = false;
      Object.assign(cl.style, { position: "absolute", left: r0.left + "px", width: r0.width + "px", top: (-y) + "px", margin: "0", animation: "none", transform: "none", opacity: "1" });
    }
    Object.assign(g.style, { position: "fixed", left: "0", right: "0", top: "0", bottom: "calc(50px + env(safe-area-inset-bottom))", overflow: "hidden", background: "var(--bg)", zIndex: "12", pointerEvents: "none", willChange: "transform" });
    g.appendChild(cl); document.body.appendChild(g);
    window.__tabP = null; bs[j].click(); try { await window.__tabP; } catch (e) { }
    await new Promise(r => setTimeout(r, 60)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const wasBusy = R.busy; R.busy = true;
    g.style.transition = "transform .3s cubic-bezier(.45,0,.55,1)"; g.style.transform = `translateX(${-dir * 100}%)`;
    setTimeout(() => { g.remove(); R.busy = wasBusy; busy = false; if (tab === "read") onScroll(); }, 320);
  }, { passive: true });
})();
const NAVN = { read: "Read", search: "Search", notes: "Notes", egw: "EGW", lib: "Library", me: "Me" };
const FONTS = { serif: ["Serif", "Georgia,'Times New Roman',serif"], book: ["Book", "'Palatino Linotype',Palatino,'Book Antiqua',serif"], sans: ["Sans", "system-ui,-apple-system,sans-serif"], mono: ["Typewriter", "'Courier New',ui-monospace,monospace"] };
function applyUI() {
  const r = document.documentElement, s = r.style;
  s.setProperty("--fs", UI.fs + "px"); s.setProperty("--lh", UI.lh); s.setProperty("--ff", (FONTS[UI.ff] || FONTS.serif)[1]); s.setProperty("--tw", UI.w + "px");
  applyNav(); r.dataset.theme = UI.th; r.classList.toggle("nvn", !UI.vn); r.classList.toggle("just", !!UI.just);
}
function saveUI() { localStorage.setItem("ui", JSON.stringify(UI)); applyUI(); }

// ---------- storage ----------
async function putMany(st, arr, del) {
  if (!arr.length) return; const d = await db;
  return new Promise(ok => { const t = d.transaction(st, "readwrite"), s = t.objectStore(st); arr.forEach(o => del ? s.delete(o.id) : s.put(o)); t.oncomplete = () => ok(); });
}
function noteIdx() { R.ni = new Map(); R.notes.forEach(n => n.ids.forEach(i => R.ni.set(i, (R.ni.get(i) || 0) + 1))); }
async function loadXref() {
  R.xr = {}; (await tx("xref", "readonly", o => o.getAll())).forEach(b => Object.assign(R.xr, b.xrefs));
  R.sn = { notes: {}, textual: {} }; R.snIdx = {};   // Study Bible notes; range notes are indexed under every verse they cover
  (await tx("snote", "readonly", o => o.getAll())).forEach(b => { Object.assign(R.sn.notes, b.sn.notes); Object.assign(R.sn.textual, b.sn.textual); });
  for (const [v, list] of Object.entries(R.sn.notes)) { const [b, c, k] = v.split("."); list.forEach((nt, i) => { for (let x = +k; x <= Math.max(+k, nt.e || 0) && x < +k + 200; x++) (R.snIdx[`${b}.${c}.${x}`] = R.snIdx[`${b}.${c}.${x}`] || []).push([v, i]); }); }
}
async function loadUser() {
  const [m, n, b, sh] = await Promise.all(["mark", "note", "bm", "shelf"].map(s => tx(s, "readonly", o => o.getAll())));
  R.marks = new Map(m.map(x => [x.id, x.color])); R.notes = n; R.shelves = sh; await loadXref(); R.bms = new Map(b.map(x => [x.id, x])); await loadSb(); noteIdx();
}

// ---------- helpers ----------
const books = t => ORD.filter(b => t.books[b]);
const chapters = (t, b) => Object.keys(t.books[b] || {}).sort((a, c) => a - c);
function nextCh(t, b, c) { const cs = chapters(t, b), i = cs.indexOf(c); if (i < cs.length - 1) return { b, c: cs[i + 1] }; const bs = books(t), j = bs.indexOf(b); return j < bs.length - 1 ? { b: bs[j + 1], c: chapters(t, bs[j + 1])[0] } : null; }
function prevCh(t, b, c) { const cs = chapters(t, b), i = cs.indexOf(c); if (i > 0) return { b, c: cs[i - 1] }; const bs = books(t), j = bs.indexOf(b); if (j > 0) { const pc = chapters(t, bs[j - 1]); return { b: bs[j - 1], c: pc[pc.length - 1] }; } return null; }
function sortIds(a) {   // verses in reading order, then Ellen White paragraph ids
  const vs = a.filter(isV).sort((x, y) => { const [b1, c1, v1] = x.split("."), [b2, c2, v2] = y.split("."); return ORD.indexOf(b1) - ORD.indexOf(b2) || c1 - c2 || v1 - v2; });
  return vs.concat(a.filter(i => !isV(i)).sort());
}
function mixLabel(ids) { const v = sortIds(ids.filter(isV)), p = ids.filter(i => !isV(i)).sort(); return [v.length ? refLabel(v) : "", ...p].filter(Boolean).join("; "); }
function refLabel(ids) {
  if (ids.length && !isV(ids[0])) return ids.join("; ");
  const out = []; let g = null;
  ids.forEach(id => { const [b, c, v] = id.split("."), n = +v; if (g && g.b === b && g.c === c && n === g.e + 1) g.e = n; else { g = { b, c, s: n, e: n }; out.push(g); } });
  return out.map(g => `${bname(g.b)} ${g.c}:${g.s}${g.e > g.s ? "-" + g.e : ""}`).join("; ");
}
const curT = () => R.t || (R.have || []).find(h => h.id === S.tr) || (R.have || [])[0];
const isV = id => /^[0-9A-Z]{3}\.\d+\.\d+$/.test(id);
const vEl = id => document.querySelector(`[data-id="${id}"]`);  // verse span or Ellen White paragraph card
function pmap() { if (R.pmFor !== R.eg) { R.pm = new Map(); R.eg.forEach(x => x.paras.forEach(p => R.pm.set(p.id, [x, p]))); R.pmFor = R.eg; } return R.pm; }
function openRef(id) { if (isV(id)) goVerse(id); else { const e = pmap().get(id); if (e) openEgw(e[0].id, id); } }
async function ensureUser() { if (!R.ready) { await loadUser(); palCss(); applyUI(); buildShell(); R.ready = true; } }
function toggleSel(el) { const id = el.dataset.id; if (R.sel.has(id)) { R.sel.delete(id); el.classList.remove("sel"); } else { R.sel.add(id); el.classList.add("sel"); } abar(); }
function toast(m) { const e = $r("toast"); e.textContent = m; e.style.opacity = 1; clearTimeout(R.tt); R.tt = setTimeout(() => e.style.opacity = 0, 1400); }

// ---------- chapter rendering ----------
function chHtml(t, b, c) {
  const vs = t.books[b][c], ids = Object.keys(vs).sort((x, y) => x - y);
  return `<section class="ch" data-b="${b}" data-c="${c}"><h2>${bname(b)} ${c} <button class="chb" onclick="event.stopPropagation();chStudy('${b}','${c}')" aria-label="Ellen White and Commentary on this chapter">EGW</button></h2><div class="txt">` + ids.map(n => {
    const id = `${b}.${c}.${n}`, m = R.marks.get(id);
    return `<span class="v${m ? " hl" : ""}${R.ni.has(id) ? " hn" : ""}${R.bms.has(id) ? " hb" : ""}${R.sel.has(id) ? " sel" : ""}" data-id="${id}"${m ? ` data-c="${m}"` : ""}><sup class="n">${n}</sup>${esc(vs[n])} </span>`;
  }).join("") + `</div></section>`;
}
function openCh(b, c, verse) {  // load one chapter fresh (used for jumps, chapter picker and arrows)
  const t = R.t; if (!t.books[b] || !t.books[b][c]) { b = books(t)[0]; c = chapters(t, b)[0]; }
  S.bk = b; S.ch = c; save();
  $r("rtext").innerHTML = chHtml(t, b, c); R.last = { b, c }; syncBar(); window.scrollTo(0, 0);
  if (verse) { const el = vEl(`${b}.${c}.${verse}`); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800); } }
  R.io && (R.io.unobserve($r("rend")), R.io.observe($r("rend")));
  setTimeout(less, 0);   // there is always a chapter above to scroll into
}
function more() {  // continuous scrolling: append the next chapter below; drop old ones above
  const t = R.t; if (!t || !R.last || R.busy) return; const n = nextCh(t, R.last.b, R.last.c); if (!n) return;
  R.busy = true; $r("rtext").insertAdjacentHTML("beforeend", chHtml(t, n.b, n.c)); R.last = n;
  const secs = $r("rtext").children;
  while (secs.length > 6 && secs[0].getBoundingClientRect().bottom < -2500) { const h = secs[0].getBoundingClientRect().height; secs[0].remove(); window.scrollBy(0, -h); }   // drop chapters far above
  R.busy = false; R.io.unobserve($r("rend")); R.io.observe($r("rend"));
}
// ---------- "Ellen White on this chapter": every EGW paragraph, Commentary entry and Source Book entry tied to any verse of the chapter ----------
function chHits(b, c) {
  const pre = `${b}.${c}.`, whole = `${b}.${c}`, lang = R.t.lang, out = { e: [], c: [], s: [] };
  R.eg.forEach(x => { if (x.lang !== lang) return; const k = x.id === "SDABC-EGW" ? "c" : "e"; if (!(k === "c" ? S.com[lang] : S.egw[lang])) return;
    x.paras.forEach(p => { const r = (p.refs || []).filter(i => i.startsWith(pre) || i === whole); if (r.length) out[k].push({ x, p, r, n: Math.min(...r.map(i => +i.split(".")[2] || 0)) }); }); });
  Object.keys(out).forEach(k => out[k].sort((a, z) => a.n - z.n));
  if (S.com[lang] && R.sbIdx) { const seen = new Set(); Object.keys(R.sbIdx).forEach(v => { if (v.startsWith(pre)) R.sbIdx[v].forEach(i => { if (!seen.has(i)) { seen.add(i); out.s.push({ i, n: +v.split(".")[2] }); } }); }); out.s.sort((a, z) => a.n - z.n); }
  return out;
}
function chStudy(b, c, k, lim) {
  const H = chHits(b, c); k = k || (H.e.length ? "e" : H.c.length ? "c" : H.s.length ? "s" : "e"); lim = lim || 25;
  const tabs = [["e", "Ellen White"], ["c", "Commentary"], ["s", "Source Book"]].map(([key, n]) => `<button class="a" style="margin:2px;${k === key ? "background:var(--ac);color:var(--bg)" : ""}" onclick="chStudy('${b}','${c}','${key}')">${n} (${H[key].length})</button>`).join("");
  const rows = H[k].slice(0, lim).map(h => k === "s" ? `<div class="card" onclick="sbOpen(${h.i})"><small>${bname(b)} ${c}:${h.n}</small><br><b>${esc(R.sb[h.i].t)}</b></div>`
    : `<div class="card"><small>${esc(h.p.id)} · ${esc(refLabel(sortIds(h.r)))}</small><br>${esc(h.p.text.slice(0, 220))}… <button class="a" onclick="sheet();openEgw('${h.x.id}','${h.p.id}')">Open</button> <button class="a" onclick="goVerse('${sortIds(h.r)[0]}');sheet()">Verse</button></div>`).join("");
  sheet(`<h3>${bname(b)} ${c}</h3><p>${tabs}</p>` + (rows || `<p class="m">Nothing linked to this chapter${R.eg.length ? "" : ". Import the Ellen White files in Library"}.</p>`) +
    (H[k].length > lim ? `<p><button class="a" onclick="chStudy('${b}','${c}','${k}',${lim + 25})">Show more</button></p>` : "") + `<p><button class="a" onclick="sheet()">Close</button></p>`);
}
function less() {   // continuous scrolling upwards: put the previous chapter above and keep the view exactly where it was
  const t = R.t, rt = $r("rtext"); if (!t || R.busy || !rt) return; const first = rt.firstElementChild; if (!first) return;
  const p = prevCh(t, first.dataset.b, first.dataset.c); if (!p) return;
  R.busy = true; const before = document.documentElement.scrollHeight;
  rt.insertAdjacentHTML("afterbegin", chHtml(t, p.b, p.c)); rt.firstElementChild.style.contentVisibility = "visible";   // real height right away (an estimated one would make the page jump)
  window.scrollBy(0, document.documentElement.scrollHeight - before);
  while (rt.children.length > 6 && rt.lastElementChild.getBoundingClientRect().top > innerHeight + 3500) { rt.lastElementChild.remove(); const l = rt.lastElementChild; R.last = { b: l.dataset.b, c: l.dataset.c }; }   // drop chapters far below
  R.busy = false; R.io && (R.io.unobserve($r("rend")), R.io.observe($r("rend")));
}
function onScroll() {
  if (R.tick) return; R.tick = true;
  requestAnimationFrame(() => {
    R.tick = false; if (tab !== "read" || !R.t) return;
    if (window.scrollY < 1500) less();
    for (const s of $r("rtext").children) if (s.getBoundingClientRect().bottom > 110) {
      if (s.dataset.b !== S.bk || s.dataset.c !== S.ch) { S.bk = s.dataset.b; S.ch = s.dataset.c; syncBar(); clearTimeout(R.sv); R.sv = setTimeout(save, 600); }
      break;
    }
  });
}

// ---------- toolbar ----------
function fillBar() {
  const t = R.t;
  $r("rtr").innerHTML = R.have.map(h => `<option ${h.id === t.id ? "selected" : ""}>${h.id}</option>`).join("");
  $r("rbk").innerHTML = books(t).map(b => `<option value="${b}">${bname(b)}</option>`).join(""); $r("rch").dataset.b = ""; syncBar();
}
function syncBar() {
  const t = R.t; if (!t) return; $r("rbk").value = S.bk;
  const sel = $r("rch"); if (sel.dataset.b !== S.bk) { sel.innerHTML = chapters(t, S.bk).map(c => `<option>${c}</option>`).join(""); sel.dataset.b = S.bk; }
  sel.value = S.ch;
}
const chTr = id => { S.tr = id; save(); render(); };
const chBk = b => openCh(b, chapters(R.t, b)[0]);
function stepCh(d) { const n = (d > 0 ? nextCh : prevCh)(R.t, S.bk, S.ch); if (n) openCh(n.b, n.c); }

// ---------- Go-to box: "jn 3:16", "ps 23", "1 cor 13:4-7", "2. Mose 20", "йоан 3:16" ----------
const BN_DE = "1. Mose,2. Mose,3. Mose,4. Mose,5. Mose,Josua,Richter,Rut,1. Samuel,2. Samuel,1. Könige,2. Könige,1. Chronik,2. Chronik,Esra,Nehemia,Ester,Hiob,Psalm,Sprüche,Prediger,Hohelied,Jesaja,Jeremia,Klagelieder,Hesekiel,Daniel,Hosea,Joel,Amos,Obadja,Jona,Micha,Nahum,Habakuk,Zephanja,Haggai,Sacharja,Maleachi,Matthäus,Markus,Lukas,Johannes,Apostelgeschichte,Römer,1. Korinther,2. Korinther,Galater,Epheser,Philipper,Kolosser,1. Thessalonicher,2. Thessalonicher,1. Timotheus,2. Timotheus,Titus,Philemon,Hebräer,Jakobus,1. Petrus,2. Petrus,1. Johannes,2. Johannes,3. Johannes,Judas,Offenbarung".split(",");
const BN_BG = "Битие,Изход,Левит,Числа,Второзаконие,Исус Навин,Съдии,Рут,1 Царе,2 Царе,3 Царе,4 Царе,1 Летописи,2 Летописи,Ездра,Неемия,Естир,Йов,Псалми,Притчи,Еклисиаст,Песен на песните,Исая,Йеремия,Плач на Йеремия,Йезекиил,Даниил,Осия,Йоил,Амос,Авдий,Йона,Михей,Наум,Авакум,Софония,Агей,Захария,Малахия,Матей,Марк,Лука,Йоан,Деяния,Римляни,1 Коринтяни,2 Коринтяни,Галатяни,Ефесяни,Филипяни,Колосяни,1 Солуняни,2 Солуняни,1 Тимотей,2 Тимотей,Тит,Филимон,Евреи,Яков,1 Петър,2 Петър,1 Йоан,2 Йоан,3 Йоан,Юда,Откровение".split(",");
const GO_ALIAS = { gen: "GEN", ex: "EXO", exod: "EXO", lev: "LEV", num: "NUM", deut: "DEU", dt: "DEU", josh: "JOS", judg: "JDG", jdg: "JDG", rth: "RUT", "1sam": "1SA", "2sam": "2SA", "1kgs": "1KI", "2kgs": "2KI", "1ki": "1KI", "2ki": "2KI", "1chr": "1CH", "2chr": "2CH", neh: "NEH", esth: "EST", ps: "PSA", pss: "PSA", prov: "PRO", pr: "PRO", eccl: "ECC", song: "SNG", sos: "SNG", isa: "ISA", is: "ISA", jer: "JER", lam: "LAM", ezek: "EZK", eze: "EZK", dan: "DAN", hos: "HOS", joel: "JOL", obad: "OBA", jon: "JON", mic: "MIC", nah: "NAM", hab: "HAB", zeph: "ZEP", hag: "HAG", zech: "ZEC", mal: "MAL", matt: "MAT", mt: "MAT", mk: "MRK", mrk: "MRK", lk: "LUK", jn: "JHN", rom: "ROM", rm: "ROM", "1cor": "1CO", "2cor": "2CO", gal: "GAL", eph: "EPH", phil: "PHP", php: "PHP", col: "COL", "1thess": "1TH", "2thess": "2TH", "1tim": "1TI", "2tim": "2TI", tit: "TIT", phlm: "PHM", philem: "PHM", heb: "HEB", jas: "JAS", jm: "JAS", "1pet": "1PE", "2pet": "2PE", "1jn": "1JN", "2jn": "2JN", "3jn": "3JN", rev: "REV", rv: "REV" };
const gnorm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\s]/g, "");
function goCandidates(name) {
  const n = gnorm(name); if (!n) return [];
  if (GO_ALIAS[n]) return [GO_ALIAS[n]];
  const lists = [BN, BN_DE, BN_BG], lang = R.t && R.t.lang, order = lang === "de" ? [1, 0, 2] : lang === "bg" ? [2, 0, 1] : [0, 1, 2], exact = [], pref = [];
  for (const li of order) lists[li].forEach((nm, i) => { const k = gnorm(nm); if (k === n) exact.push(ORD[i]); else if (n.replace(/^\d/, "").length >= 2 && k.startsWith(n)) pref.push(ORD[i]); });
  const u = a => [...new Set(a)]; return u(exact).length ? u(exact) : u(pref);
}
function goParse(str) {
  const m = str.trim().match(/^((?:[1-3]\.?\s*)?[^\d]*?)\s*(?:(\d+)(?:\s*[:.,\s]\s*(\d+))?(?:\s*[-–]\s*(\d+))?)?\s*$/);
  if (!m || !m[1].trim()) return null;
  return { cands: goCandidates(m[1]), ch: m[2] ? +m[2] : 0, v: m[3] ? +m[3] : 0, v2: m[3] && m[4] ? +m[4] : 0 };
}
const tq = n => encodeURIComponent(n).replace(/'/g, "%27");
function topicMap() { if (R.tpFor !== R.tp) { R.tpFor = R.tp; R.tmap = typeof topicsOf === "function" && R.tp && R.tp.length ? topicsOf(R.tp) : {}; } return R.tmap; }
function topicMatches(val) {   // topic names (and Bulgarian titles) that contain every typed word, best first
  const T = topicMap(), q = val.toLowerCase().replace(/["]/g, "").trim(); if (q.length < 3) return [];
  const ws = q.split(/\s+/).filter(w => w.length > 1 && !["and", "or", "not", "the", "of"].includes(w)); if (!ws.length) return [];
  const st = ws.map(w => stem(w));
  const sub = k => k.includes("›");   // main topics first, then sub-topics; names that are just verse numbers are skipped
  const names = Object.keys(T).filter(k => T[k].refs.length && !/\d+\s*:\s*\d+/.test(k) && st.every((w, i) => k.toLowerCase().includes(w) || (T[k].bg || "").toLowerCase().includes(ws[i])))
    .sort((x, y) => (+sub(x) - +sub(y)) || (+y.toLowerCase().startsWith(q) - +x.toLowerCase().startsWith(q)) || (+!!T[y].note - +!!T[x].note) || x.length - y.length).slice(0, 6);
  if (names.length >= 6) return names;
  const inNote = Object.keys(T).filter(k => T[k].refs.length && T[k].note && !names.includes(k) && st.every((w, i) => T[k].note.toLowerCase().includes(w)))   // second tier: the explanation mentions the words
    .sort((x, y) => (+sub(x) - +sub(y)) || x.length - y.length).slice(0, 6 - names.length);
  return names.concat(inNote);
}
function goSuggest(val) {
  R.pick = null; const box = $r("rgs"), p = goParse(val), books = p && R.t ? p.cands.slice(0, 8) : [];
  const tops = p && p.ch ? [] : topicMatches(val);   // "john 3" is a verse jump, not a topic search
  const sbs = p && p.ch ? { list: [], total: 0 } : sbMatches(val, 4);
  if (!books.length && !tops.length && !sbs.list.length) { box.hidden = true; return; }
  let h = books.map(c => `<div onmousedown="event.preventDefault()" onclick="${p.ch ? `goRef('${c}',${p.ch},${p.v},${p.v2})` : `goPickBook('${c}')`}">${esc(bname(c))}${p.ch ? " " + p.ch + (p.v ? ":" + p.v + (p.v2 ? "-" + p.v2 : "") : "") : ` <small style="float:right;color:var(--mut)">chapters ›</small>`}</div>`).join("");
  if (tops.length) { const T = topicMap(); h += `<div class="gt">Topics</div>` + tops.map(k => `<div onmousedown="event.preventDefault()" onclick="topicOpen(decodeURIComponent('${tq(k)}'))">${esc(k)} <small style="float:right;color:var(--mut)">${T[k].refs.length} verses ›</small></div>`).join(""); }
  if (sbs.list.length) h += `<div class="gt">Source Book</div>` + sbs.list.map(i => `<div onmousedown="event.preventDefault()" onclick="sbOpen(${i})">${esc(R.sb[i].t)}</div>`).join("") + (sbs.total > sbs.list.length ? `<div onmousedown="event.preventDefault()" onclick="sbList(decodeURIComponent('${tq(val.trim())}'),0)"><b>All results (${sbs.total}) ›</b></div>` : "");
  box.innerHTML = h; box.hidden = false;
}
function goEnter(val) {
  const p = goParse(val), books = p && R.t ? p.cands : [], tops = p && p.ch ? [] : topicMatches(val);
  if (books.length === 1) { if (p.ch) goRef(books[0], p.ch, p.v, p.v2); else goPickBook(books[0]); return; }
  const exact = tops.find(k => k.toLowerCase() === val.trim().toLowerCase());   // typed the full topic name: open it
  if (!books.length && (tops.length === 1 || exact)) { topicOpen(exact || tops[0]); return; }
  if (!books.length && !tops.length) { const sb = sbMatches(val); if (sb.total) { sb.total === 1 ? sbOpen(sb.list[0]) : sbList(val.trim(), 0); return; } }
  if (!books.length && !tops.length) { toast(Object.keys(topicMap()).length ? "No book or topic found" : "Book not recognized (import a topic file in Library to search topics)"); return; }
  toast("Pick one from the list");
}
// ---- topic view (bottom sheet): explanation, see-also, verses in Bible order or timeline ----
function topicOpen(name) { R.tnow = name; R.tlim = 30; R.tord = R.tord || "bible"; $r("rgs").hidden = true; topicRender(false); }
function topicRender(keep) {
  const T = topicMap(), t = curT(), tt = T[R.tnow]; if (!tt) return;
  let ids = [...tt.refs];
  if (R.tord === "time" && typeof TIME !== "undefined") ids.sort((x, y) => TIME.indexOf(x.split(".")[0]) - TIME.indexOf(y.split(".")[0]) || +x.split(".")[1] - +y.split(".")[1] || +x.split(".")[2] - +y.split(".")[2]);
  else ids = sortIds(ids);
  const shown = ids.slice(0, R.tlim);
  let h = `<h3>${esc(R.tnow)}${tt.bg ? ` <small>(${esc(tt.bg)})</small>` : ""}</h3>` +
    (tt.note ? `<div class="card" style="font-size:15.5px;line-height:1.5">${esc(tt.note)}<br><small>${esc(tt.src || "")} · ${esc(tt.status || "")}</small></div>` : tt.status === "not translated yet" ? `<p class="m">English explanation not written yet. Source: ${esc(tt.src || "")}</p>` : "") +
    (tt.see && tt.see.length ? `<p>See also: ${tt.see.filter(x => T[x]).map(x => `<button class="a" style="margin:2px" onclick="R.tlim=30;topicOpen(decodeURIComponent('${tq(x)}'))">${esc(x)}</button>`).join("")}</p>` : "") +
    `<p class="m">${ids.length} verses · <select onchange="R.tord=this.value;R.tlim=30;topicRender(false)"><option value="bible">Bible order</option><option value="time" ${R.tord === "time" ? "selected" : ""}>Timeline (approx.)</option></select></p>` +
    shown.map(id => { const x = t ? vtext(t, id) : ""; return x ? `<div class="card" onclick="sheet();clearSel();goVerse('${id}')"><b>${esc(refLabel([id]))}</b><br>${esc(typeof trunc === "function" ? trunc(x, 150) : x.slice(0, 150))}</div>` : ""; }).join("") +
    (ids.length > shown.length ? `<p><button class="a" onclick="R.tlim+=40;topicRender(true)">Show more</button></p>` : "") + `<p><button class="a" onclick="sheet()">Close</button></p>`;
  const sh = $r("sheet"), y = keep ? sh.scrollTop : 0; sheet(h); if (keep) sh.scrollTop = y;
}
function goRef(code, ch, v, v2) {
  const t = R.t; if (!t) return;
  if (!t.books[code]) { toast(bname(code) + " is not in " + t.id); return; }
  const chs = chapters(t, code); ch = ch || 1;
  if (!chs.includes(String(ch))) { toast(`${bname(code)} has ${chs.length} chapters`); return; }
  clearSel(); openCh(code, String(ch), v || 0);
  if (v && v2 > v) { for (let x = v; x <= Math.min(v2, v + 60); x++) { const id = `${code}.${ch}.${x}`, el = vEl(id); if (el) { R.sel.add(id); el.classList.add("sel"); } } abar(); }
  const g = $r("rgo"); g.value = ""; R.pick = null; $r("rgs").hidden = true; g.blur();
}

// chapter grid -> verse grid (the verse step is the default; "Whole chapter" skips it)
function goPickBook(code) {
  const t = R.t; if (!t) return;
  if (!t.books[code]) { toast(bname(code) + " is not in " + t.id); return; }
  R.pick = { b: code, c: null }; goGrid(); $r("rgo").blur();   // blur closes the phone keyboard while I pick
}
function goPickCh(c) { R.pick.c = c; goGrid(); }
function goBack() {
  if (R.pick && R.pick.c !== null) { R.pick.c = null; goGrid(); return; }
  R.pick = null; const v = $r("rgo").value; if (v) goSuggest(v); else $r("rgs").hidden = true;
}
function goClose() { R.pick = null; $r("rgs").hidden = true; }
function goGrid() {
  const t = R.t, { b, c } = R.pick, box = $r("rgs"), here = S.bk === b;
  const head = (back, title, extra) => `<div class="gh"><button class="a" onclick="goBack()">${back}</button><b>${esc(title)}</b>${extra}<button class="a" onclick="goClose()" aria-label="Close">✕</button></div>`;
  if (c === null) {
    const chs = chapters(t, b);
    box.innerHTML = head("‹ Books", bname(b), `<small style="flex:1;color:var(--mut)">${chs.length} chapter${chs.length > 1 ? "s" : ""}</small>`) +
      `<div class="gg">${chs.map(n => `<button class="gb${here && n === S.ch ? " on" : ""}" onclick="goPickCh('${n}')">${n}</button>`).join("")}</div>`;
  } else {
    const vs = Object.keys(t.books[b][c]).sort((x, y) => x - y);
    box.innerHTML = head("‹ Chapters", `${bname(b)} ${c}`, `<span style="flex:1"></span><button class="a" onclick="goRef('${b}',${c},0,0)">Whole chapter</button>`) +
      `<div class="gg">${vs.map(n => `<button class="gb${here && c === S.ch && false ? " on" : ""}" onclick="goRef('${b}',${c},${n},0)">${n}</button>`).join("")}</div>`;
  }
  box.hidden = false; box.scrollTop = 0;
}
document.addEventListener("click", e => {   // tap outside closes the picker
  if (!R.pick) return;
  // composedPath is fixed when the tap starts, so it still works after the tapped button was replaced by the next grid
  const inside = (e.composedPath ? e.composedPath() : []).some(n => n && (n.id === "rgs" || n.id === "rgo"));
  if (!inside) goClose();
});

// ---------- selection, action bar, sheet ----------
const ab = (label, d, fn, cls) => `<button class="ab ${cls || ""}" onclick="${fn}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg><span>${label}</span></button>`;
function buildAbar() {
  const a = $r("abar"); if (!a) return;
  const sw = c => `<button class="sw pop" style="background:${c.hex}" data-c="${c.id}" onclick="paint('${c.id}')" aria-label="${esc(c.name)}"></button>`;
  const main = PAL.slice(0, 3), rest = PAL.slice(3);   // 3 main colors; the 4th is the rest stacked on top of each other, tap to open all
  const colors = R.palOpen || !rest.length ? PAL.map(sw).join("") + (rest.length ? `<button class="sw more" onclick="palToggle()" aria-label="Fewer colors">‹</button>` : "")
    : main.map(sw).join("") + `<button class="stack" onclick="palToggle()" aria-label="More colors" style="width:${34 + (rest.length - 1) * 10}px">${rest.map((c, i) => `<i data-c="${c.id}" style="background:${c.hex};left:${i * 10}px;z-index:${9 - i}"></i>`).join("")}</button>`;
  a.innerHTML = `<div class="top" id="atop"><div class="grab2"></div><div class="sl" id="sl"></div></div><div class="ar">` + colors + `` +
    ab("Save", "M6 3h12v18l-6-4-6 4z", "bmToggle()", "vo") + ab("Note", "M4 20h4L19 9l-4-4L4 16z M13 7l4 4", "noteOpen()") + ab("Reference", "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1", "xrefOpen()", "vo") +
    ab("Copy", "M9 9h11v11H9z M5 15V4h11", "copySel()") + ab("Share", "M12 15V3 M7 8l5-5 5 5 M5 14v6h14v-6", "copySel(true)") + `</div><div class="hint">⌃ Swipe up for more</div>`;
}
function abar() { const a = $r("abar"); if (a) { a.hidden = !(R.sel.size && (tab === "read" || tab === "egw")); a.dataset.mode = tab; ticks(); selLabel(); } }
function selLabel() {   // what is selected, shown above the colors
  const el = $r("sl"); if (!el || !R.sel.size) return; const ids = sortIds([...R.sel]), t = R.t;
  el.innerHTML = `<b>${esc(refLabel(ids))}</b>`;   // reference only, e.g. John 3:3-4
}
function palToggle() { R.palOpen = !R.palOpen; buildAbar(); abar(); }
function ticks() {   // a tick on the color that every selected verse already has; tapping that color again removes it
  const ids = [...R.sel]; document.querySelectorAll("#abar .sw").forEach(b => { const on = ids.length && ids.every(i => R.marks.get(i) === b.dataset.c); b.textContent = on ? "✓" : ""; b.classList.toggle("tk", !!on); });
  document.querySelectorAll("#abar .stack i").forEach(i => { const on = ids.length && ids.every(x => R.marks.get(x) === i.dataset.c); i.textContent = on ? "✓" : ""; i.classList.toggle("tk", !!on); });
}
(function () {   // gestures: drag UP on the action bar pulls the Study sheet up under the finger; drag DOWN on a sheet slides it away
  let m = null;
  const sh = () => document.getElementById("sheet"), fin = (el, to, done) => { el.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)"; el.style.transform = `translateY(${to}px)`; { const a = $r("abar"); if (a && !a.hidden) { a.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)"; a.style.transform = `translateY(${barShift(to)}px)`; } } setTimeout(() => { el.style.transition = ""; el.style.transform = ""; done && done(); }, 230); };
  document.addEventListener("touchstart", e => {
    const t = e.touches[0], tg = e.target.closest ? e.target : null; if (!tg) return;
    const open = !sh().hidden;
    if (tg.closest("#atop") && R.sel.size) m = { k: open ? "down" : "bar", top: !open, y: t.clientY, x: t.clientX, on: false };   // pull down from the strip above the colors
    else if (tg.closest("#abar") && !open && tab === "read" && R.sel.size) m = { k: "up", y: t.clientY, x: t.clientX, on: false };
    else if (tg.closest("#sheet") && sh().scrollTop <= 0) m = { k: "down", y: t.clientY, x: t.clientX, on: false };
    else m = null;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!m) return; const t = e.touches[0], dy = t.clientY - m.y, dx = t.clientX - m.x, s = sh();
    if (!m.on) {
      if (Math.abs(dy) < 10 || Math.abs(dx) > Math.abs(dy)) return;
      if (m.k === "bar" && m.top && dy < 0 && tab === "read") m.k = "up";   // the strip above the colors: up opens Study, down hides the bar
      if (m.k === "up" && dy < 0) { s.classList.remove("up"); s.style.transition = "none"; s.style.transform = "translateY(100vh)"; window.__noAnim = true; study(); window.__noAnim = false; m.on = true; m.h = s.offsetHeight; m.dy0 = dy; $r("abar").style.zIndex = 26; }
      else if (m.k === "bar" && dy > 0) { m.on = true; }
      else if (m.k === "down" && dy > 0 && s.scrollTop <= 0) { m.on = true; m.h = s.offsetHeight; s.style.transition = "none"; }
      else { m = null; return; }
    }
    if (e.cancelable) e.preventDefault();
    if (m.k === "bar") { const a = $r("abar"); m.dy = Math.max(0, dy); a.style.transition = "none"; a.style.transform = `translateY(${m.dy}px)`; return; }
    const d = m.k === "up" ? dy - (m.dy0 || 0) : dy; m.dy = d;
    const yy = m.k === "up" ? Math.max(0, m.h + d) : Math.max(0, d); s.style.transform = `translateY(${yy}px)`; { const a = $r("abar"); a.style.transition = "none"; a.style.transform = `translateY(${barShift(yy)}px)`; }
  }, { passive: false });
  document.addEventListener("touchend", () => {
    if (!m || !m.on) { m = null; return; } const s = sh(), k = m.k, dy = m.dy || 0, h = m.h; m = null;
    if (k === "bar") {   // second tier: the colors bar itself slides away and the selection is cleared
      const a = $r("abar"); a.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)";
      if (dy > 50) { a.style.transform = `translateY(${a.offsetHeight + 120}px)`; setTimeout(() => { a.style.transition = "none"; a.style.transform = ""; clearSel(); }, 230); } else a.style.transform = "translateY(0)";
      return;
    }
    const open = k === "up" ? -dy > Math.min(70, h * .3) : dy < 90;
    if (open) fin(s, 0); else fin(s, h, () => { s.hidden = true; barRide(null); });
  }, { passive: true });
})();
function clearSel() { document.querySelectorAll(".sel[data-id]").forEach(e => e.classList.remove("sel")); R.sel.clear(); abar(); }
function hideBars() { const a = $r("abar"); if (a) a.hidden = true; sheet(); }
function sheet(html) {
  const s = $r("sheet"); if (html === undefined) { s.hidden = true; barRide(null); return; }
  const was = s.hidden; s.innerHTML = `<div class="grab"></div>` + html; s.hidden = false; s.scrollTop = 0;
  s.classList.remove("up"); if (was && !window.__noAnim) { void s.offsetWidth; s.classList.add("up"); s.onanimationend = () => s.classList.remove("up"); }   // slide up only when it opens, not on every refresh
  if (!window.__noAnim) barRide(0, was);
}
function barShift(y) { const s = $r("sheet"), a = $r("abar"); return Math.min(0, -(s.offsetHeight - y - (parseFloat(getComputedStyle(a).bottom) || 0))); }
function barRide(y, anim) {   // the color/action bar rides on the top edge of the sheet and goes with it; null = back to its normal place
  const a = $r("abar"); if (!a) return;
  if (y === null) { a.style.transition = "none"; a.style.transform = ""; a.style.zIndex = ""; return; }
  if (a.hidden) return; a.style.zIndex = 26;
  if (anim) { a.style.transition = "none"; a.style.transform = `translateY(${barShift($r("sheet").offsetHeight)}px)`; void a.offsetWidth; a.style.transition = "transform .28s cubic-bezier(.2,.8,.2,1)"; }
  else a.style.transition = "none";
  a.style.transform = `translateY(${barShift(y)}px)`;
}

async function paint(cid) {  // same color again removes it, like YouVersion
  const ids = [...R.sel], remove = cid === "none" || ids.every(i => R.marks.get(i) === cid), put = [], del = [];
  ids.forEach(i => {
    const el = vEl(i);
    if (remove) { if (R.marks.has(i)) del.push({ id: i }); R.marks.delete(i); if (el) { el.classList.remove("hl"); el.removeAttribute("data-c"); } }
    else { R.marks.set(i, cid); put.push({ id: i, color: cid, ts: Date.now() }); if (el) { el.classList.add("hl"); el.dataset.c = cid; } }
  });
  ticks(); await putMany("mark", put); await putMany("mark", del, true);
}
function noteOpen() {
  const ids = sortIds([...R.sel]), ex = R.notes.find(n => ids.every(i => n.ids.includes(i))) || null; R.nids = ids;
  sheet(`<h3>${esc(refLabel(ids))}</h3><textarea id="nt" rows="6" style="width:100%;font-size:17px;box-sizing:border-box;background:var(--bg);color:var(--fg);border:1px solid var(--ac);border-radius:8px;padding:8px">${esc(ex ? ex.text : "")}</textarea>` +
    `<input id="ng" placeholder="tags, comma separated" value="${esc(ex ? ex.tags.join(", ") : "")}" style="width:100%;font-size:16px;box-sizing:border-box;margin:8px 0;padding:8px;background:var(--bg);color:var(--fg);border:1px solid var(--mut);border-radius:8px">` +
    (() => {   // put the note on a shelf right away: arrow menu with the shelves that already exist
      const list = typeof shelves === "function" ? shelves() : [], last = localStorage.getItem("lastShelf") || "inbox", cur = ex ? (ex.shelf || "inbox") : (list.some(s => s.id === last) ? last : "inbox");
      return `<div style="display:flex;align-items:center;gap:8px;margin:8px 0"><label for="nsh" style="white-space:nowrap">Shelf</label><select id="nsh" onchange="$r('nshn').hidden=this.value!=='__new';barRide(0)" style="flex:1;font-size:16px;padding:9px 10px;border-radius:8px;border:1px solid var(--mut);background:var(--bg);color:var(--fg)">` +
        list.map(s => `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>▾ ${esc(s.title)}</option>`).join("") + `<option value="__new">＋ New shelf…</option></select></div>` +
        `<input id="nshn" hidden placeholder="New shelf title" style="width:100%;font-size:16px;box-sizing:border-box;margin:0 0 8px;padding:8px;background:var(--bg);color:var(--fg);border:1px solid var(--ac);border-radius:8px">`;
    })() +
    `<p><button class="a" onclick="noteSave('${ex ? ex.id : ""}')">Save</button> ${ex ? `<button class="a" onclick="noteDel('${ex.id}')">Delete</button>` : ""} <button class="a" onclick="sheet()">Cancel</button></p>`);
}
function markNotes(ids) { ids.forEach(i => { const el = vEl(i); if (el) el.classList.toggle("hn", R.ni.has(i)); }); }
async function noteSave(exId) {
  const text = $r("nt").value.trim(), tags = $r("ng").value.split(",").map(s => s.trim()).filter(Boolean);
  if (!text) { if (exId) return noteDel(exId); return sheet(); }
  const ex0 = R.notes.find(n => n.id === exId), rec = Object.assign({}, ex0 || {}, { id: exId || uid(), ids: R.nids, text, tags, ts: Date.now() });
  let shelf = $r("nsh") ? $r("nsh").value : (rec.shelf || "inbox"), newShelf = null;
  if (shelf === "__new") {   // create the shelf on the spot
    const title = $r("nshn").value.trim(); if (!title) { toast("Give the new shelf a title"); return; }
    const cols = typeof SH_COL !== "undefined" ? SH_COL : ["#5aa9f0"];
    newShelf = { id: uid(), title, color: cols[(R.shelves || []).length % cols.length], ord: Math.max(-1, ...(R.shelves || []).map(x => x.ord)) + 1 }; (R.shelves = R.shelves || []).push(newShelf); shelf = newShelf.id;
  }
  if (!ex0 || (ex0.shelf || "inbox") !== shelf) rec.ord = -Date.now();   // newest at the top of the shelf
  rec.shelf = shelf; try { localStorage.setItem("lastShelf", shelf); } catch (e) { }
  R.notes = R.notes.filter(n => n.id !== rec.id).concat(rec); noteIdx(); markNotes(rec.ids); clearSel(); sheet();
  if (newShelf) await putMany("shelf", [newShelf]); await putMany("note", [rec]);
  const sn = (typeof shelves === "function" ? shelves().find(s => s.id === shelf) : null); toast("Saved to " + (sn ? sn.title : "Inbox")); if (tab === "notes" && window.nsRefresh) nsRefresh();
}
async function noteDel(id) {
  const n = R.notes.find(x => x.id === id); R.notes = R.notes.filter(x => x.id !== id); noteIdx(); if (n) markNotes(n.ids);
  clearSel(); sheet(); await putMany("note", [{ id }], true); if (tab === "me") render();
}
async function bmToggle() {
  const id = sortIds([...R.sel])[0], el = vEl(id);
  if (R.bms.has(id)) { R.bms.delete(id); if (el) el.classList.remove("hb"); await putMany("bm", [{ id }], true); toast("Bookmark removed"); }
  else { const label = prompt("Bookmark label (optional)"); if (label === null) return; const r = { id, label, ts: Date.now() }; R.bms.set(id, r); if (el) el.classList.add("hb"); await putMany("bm", [r]); toast("Bookmarked"); }
  clearSel();
}
async function copySel(share) {
  const ids = sortIds([...R.sel]), pm = pmap();
  const txt = isV(ids[0]) ? `${ids.map(i => vtext(R.t, i)).join(" ")}\n${refLabel(ids)} (${R.t.id})`
    : ids.map(i => { const e = pm.get(i); return e ? `${e[1].text}\n- Ellen G. White, ${i}` : i; }).join("\n\n");
  if (share && navigator.share) { try { await navigator.share({ text: txt }); } catch (e) { } }
  else { try { await navigator.clipboard.writeText(txt); toast("Copied"); } catch (e) { prompt("Copy:", txt); } }
  clearSel();
}
function study() {  // linked Ellen White paragraphs and Commentary entries (respects the per-language switches in Me)
  const ids = sortIds([...R.sel]), [b, c] = ids[0].split("."), lang = R.t.lang; let h = `<h3>${esc(refLabel(ids))}</h3><p><button class="a" onclick="quoteOpen()">Quote</button> <button class="a" onclick="snOpen()">Study Bible</button></p>`;
  for (const [key, name, on] of [["e", "Ellen G. White", S.egw[lang]], ["c", "SDA Bible Commentary", S.com[lang]]]) {
    if (!on) continue; const hits = [];
    R.eg.forEach(x => { if (x.lang !== lang || (x.id === "SDABC-EGW") !== (key === "c")) return; x.paras.forEach(p => { const r = p.refs || []; if (ids.some(i => r.includes(i)) || r.includes(b + "." + c)) hits.push([x, p]); }); });
    h += `<h4>${name} (${hits.length})</h4>` + (hits.slice(0, 25).map(([x, p]) => `<div class="card"><small>${esc(p.id)}</small><br>${esc(p.text.slice(0, 200))}… <button class="a" onclick="sheet();openEgw('${x.id}','${p.id}')">Open</button> <button class="a" onclick="quoteOpen(['${p.id}'],['${p.id}',...R.sel])">Quote</button></div>`).join("") || `<p class="m">Nothing linked to this verse.</p>`);
  }
  if (S.com[lang] && R.sbIdx) { const hit = [...new Set(ids.flatMap(i => R.sbIdx[i] || []))]; if (hit.length) h += `<h4>Source Book (${hit.length})</h4>` + hit.slice(0, 15).map(i => `<div class="card" onclick="sbOpen(${i})"><b>${esc(R.sb[i].t)}</b></div>`).join(""); }
  if (!S.egw[lang] && !S.com[lang]) h += `<p class="m">Study sources are off for this language (Me tab).</p>`;
  sheet(h + `<p><button class="a" onclick="sheet()">Close</button></p>`);
}

// ---------- cross-references (NKJV Study Bible footnotes) ----------
function xrefIds(x) { const m = x.match(/^(.+)\.(\d+)\.(\d+)-(\d+)$/); if (!m) return [x]; const o = []; for (let v = +m[3]; v <= +m[4] && o.length < 40; v++) o.push(`${m[1]}.${m[2]}.${v}`); return o; }
function xrefRow(x) {
  const ids = xrefIds(x), t = R.t, txt = ids.slice(0, 4).map(i => vtext(t, i)).filter(Boolean).join(" "), q = ids.slice(0, 8);
  return `<div class="card" onclick="sheet();clearSel();goVerse('${ids[0]}')"><b>${esc(refLabel(sortIds([...ids])))}</b><br>${txt ? esc(txt.length > 230 ? txt.slice(0, 230) + "…" : txt) : `<small>not in ${esc(t.id)}</small>`}<br><button class="a" onclick="event.stopPropagation();quoteOpen(${JSON.stringify(q).replace(/"/g, "'")},${JSON.stringify([...q, ...R.sel]).replace(/"/g, "'")})">Quote</button></div>`;
}
function xrefOpen() {
  const ids = sortIds([...R.sel]).slice(0, 4); if (!ids.length) return; let h = "";
  for (const id of ids) {
    const gs = (R.xr || {})[id]; h += `<h3>${esc(refLabel([id]))}</h3>`;
    if (!gs) { h += `<p class="m">No cross-references for this verse${R.xr && Object.keys(R.xr).length ? "" : ". Import XREF-NKJV.json in Library"}.</p>`; continue; }
    for (const g of gs) {
      h += `<h4>${g.k ? "“" + esc(g.k) + "”" : "Cross-references"}</h4>`;
      (g.d || []).forEach(x => h += xrefRow(x));
      if (g.c) h += `<p class="m">Compare:</p>` + g.c.map(xrefRow).join("");
    }
  }
  if (R.sel.size > 4) h += `<p class="m">Showing the first 4 selected verses.</p>`;
  sheet(h + `<p><button class="a" onclick="sheet()">Close</button></p>`);
}

// ---------- Study Bible notes and textual notes ----------
function runsHtml(runs) {
  return runs.map(([t, st, ref]) => { let h = esc(t); if (st & 1) h = `<b>${h}</b>`; if (st & 2) h = `<i>${h}</i>`; return ref ? `<a style="color:var(--ac);text-decoration:underline" onclick="sheet();clearSel();goVerse('${ref}')">${h}</a>` : h; }).join("");
}
const runsText = runs => runs.map(r => r[0]).join("");
function snOpen() {
  const ids = sortIds([...R.sel]).slice(0, 3); if (!ids.length) return;
  const have = R.sn && (Object.keys(R.sn.notes).length || Object.keys(R.sn.textual).length); let h = "", seen = new Set();
  for (const id of ids) {
    h += `<h3>${esc(refLabel([id]))}</h3>`; let any = false;
    for (const [v, i] of (R.snIdx || {})[id] || []) {
      if (seen.has(v + "#" + i)) continue; seen.add(v + "#" + i); any = true; const nt = R.sn.notes[v][i];
      h += `<div class="card" style="font-size:15.5px;line-height:1.5">${runsHtml(nt.t)}<br><button class="a" style="margin-top:6px" onclick="snQuote('${v}',${i})">Quote</button></div>`;
    }
    const tx2 = (R.sn && R.sn.textual[id]) || [];
    if (tx2.length) { any = true; h += `<h4>Textual notes</h4>` + tx2.map(x => `<p style="margin:4px 0">${x.k ? "<b>" + esc(x.k) + "</b>: " : ""}${runsHtml(x.t)}</p>`).join(""); }
    if (!any) h += `<p class="m">${have ? "No Study Bible note for this verse." : "No Study Bible notes installed. Import NOTES-NKJV.json in Library."}</p>`;
  }
  if (R.sel.size > 3) h += `<p class="m">Showing the first 3 selected verses.</p>`;
  sheet(h + `<p><button class="a" onclick="sheet()">Close</button></p>`);
}
function snQuote(v, i) {
  const nt = R.sn.notes[v][i]; quoteCustom(`${runsText(nt.t)}\n— NKJV Study Bible, note on ${refLabel([v])}`, [...R.sel], refLabel([v]) + " (study note)");
}

// ---------- reader shell (built once; never wiped by render) ----------
function buildShell() {
  $r("reader").innerHTML = `<div class="rbar"><input id="rgo" placeholder="Go to or topic… (jn 3:16, ps 23, grace)" autocomplete="off" autocapitalize="off" autocorrect="off" oninput="goSuggest(this.value)" onkeydown="if(event.key===\'Enter\')goEnter(this.value)" onblur="setTimeout(()=>{const g=$r(\'rgs\');if(g&&!R.pick)g.hidden=true},250)" style="flex:1 1 100%;font-size:16px;padding:9px 14px;border-radius:20px;border:1px solid var(--ac);background:var(--card);color:var(--fg)"><div id="rgs" hidden></div><select id="rtr" onchange="chTr(this.value)"></select><select id="rbk" onchange="chBk(this.value)"></select><select id="rch" onchange="openCh(S.bk,this.value)"></select><button class="a" onclick="stepCh(-1)">‹</button><button class="a" onclick="stepCh(1)">›</button></div>` +
    `<div id="rtext"></div><div id="rend" style="height:1px"></div>`;
  document.body.insertAdjacentHTML("beforeend", `<div id="abar" hidden title="Drag up for Ellen White and Commentary"></div><div id="sheet" hidden></div><div id="toast"></div>`);
  buildAbar();
  { const g = $r("rgs"); if (g) new MutationObserver(() => { if (!g.hidden) { const r = $r("rgo").getBoundingClientRect(); g.style.top = Math.max(8, r.bottom + 6) + "px"; } }).observe(g, { attributes: true, attributeFilter: ["hidden"] }); }
  $r("rtext").addEventListener("click", e => {
    const v = e.target.closest(".v"); if (v) toggleSel(v);
  });
  document.getElementById("app").addEventListener("click", e => { const c = e.target.closest(".pc"); if (c && !e.target.closest("button,a,input,select,textarea")) toggleSel(c); });  // Ellen White paragraphs
  R.io = new IntersectionObserver(es => { if (es[0].isIntersecting) more(); }, { rootMargin: "0px 0px 1500px 0px" });
  R.io.observe($r("rend")); window.addEventListener("scroll", onScroll, { passive: true });
}
async function readerShow(have, eg) {
  R.have = have; R.eg = eg;
  await ensureUser();
  const t = have.find(h => h.id === S.tr) || have[0];
  if (!t) { $r("rtext").innerHTML = `<p style="padding:16px">No Bible installed yet. Open <b>Library</b> to download or import one.</p>`; R.t = null; return; }
  if (R.t !== t) { R.t = t; S.tr = t.id; save(); fillBar(); openCh(S.bk, S.ch); }
  if (R.go) { const g = R.go; R.go = null; openCh(g.b, g.c, g.n); R.jumped = true; }
  abar();
}

// ---------- "Me" tab: colors, highlights, notes, bookmarks, backup ----------
let MF = { color: "all", q: "" };
async function storFill() {
  const e = document.getElementById("stor"); if (!e) return;
  let p = false, u = "", q = ""; try { p = await navigator.storage.persisted(); const x = await navigator.storage.estimate(); u = (x.usage / 1048576).toFixed(0) + " MB used"; q = " of about " + (x.quota / 1048576 / 1024).toFixed(1) + " GB"; } catch (err) { }
  e.innerHTML = `Everything is stored only in this browser on this device. ${u}${q}. Protection against automatic cleanup: <b>${p ? "on" : "not granted"}</b>. ${p ? "" : "Export a backup now and then."}`;
}
function meOptions() {
  const sl = (label, key, min, max, step, fmt) => `<label style="display:block;margin:12px 0">${label} <b>${fmt ? fmt(UI[key]) : UI[key]}</b><input type="range" min="${min}" max="${max}" step="${step}" value="${UI[key]}" style="width:100%" oninput="UI.${key}=+this.value;saveUI();this.previousElementSibling.textContent=this.dataset.f?this.value+'px':this.value" ${key === "fs" || key === "w" ? 'data-f="1"' : ""}></label>`;
  const seg = (label, key, opts) => `<div style="margin:12px 0"><div>${label}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${opts.map(([v, n]) => `<button class="a" style="${String(UI[key]) === String(v) ? "background:var(--ac);color:var(--bg)" : ""}" onclick="UI.${key}=${typeof v === "number" ? v : `'${v}'`};saveUI();render()">${n}</button>`).join("")}</div></div>`;
  const tog = (label, key) => `<label style="display:flex;justify-content:space-between;align-items:center;margin:12px 0">${label}<input type="checkbox" ${UI[key] ? "checked" : ""} onchange="UI.${key}=this.checked?1:0;saveUI()"></label>`;
  return `<h2>Reading options</h2><div class="card">` +
    `<div id="prev" style="padding:10px 12px;border:1px solid var(--card);border-radius:8px;font:var(--fs,19px)/var(--lh,1.7) var(--ff);margin-bottom:6px"><sup style="color:var(--ac);font-size:.65em">1</sup>This is how your reading text will look. <sup style="color:var(--ac);font-size:.65em">2</sup>Adjust the size, spacing and font below.</div>` +
    sl("Text size", "fs", 14, 32, 1, v => v + "px") + sl("Line spacing", "lh", 1.3, 2.3, 0.1) +
    seg("Font", "ff", Object.entries(FONTS).map(([k, v]) => [k, v[0]])) + seg("Theme", "th", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"], ["sepia", "Sepia"]]) +
    seg("Text width", "w", [[560, "Narrow"], [700, "Normal"], [900, "Wide"]]) + tog("Show verse numbers", "vn") + tog("Justify text", "just") + tog("Swipe left/right to change tabs", "sw") +
    `<div style="margin:12px 0"><div>Bottom bar order</div>${UI.nav.map((k, i) => `<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="flex:1">${NAVN[k] || k}</span><button class="a" ${i ? "" : "disabled"} onclick="navMove(${i},-1)">▲</button><button class="a" ${i < UI.nav.length - 1 ? "" : "disabled"} onclick="navMove(${i},1)">▼</button></div>`).join("")}</div>` +
    `<button class="a" onclick="Object.assign(UI,{fs:19,lh:1.7,ff:'serif',th:'auto',w:700,vn:1,just:0,nav:['read','search','notes','egw','lib','me']});saveUI();render()">Reset</button></div>`;
}
function meMarks() {
  setTimeout(storFill, 0);
  const t = R.t, rows = [...R.marks].filter(([id, c]) => (MF.color === "all" || c === MF.color) && t && (isV(id) ? vtext(t, id) : pmap().has(id)));
  const hs = sortIds(rows.map(r => r[0])).slice(0, 150), notes = R.notes.filter(n => !MF.q || (n.text + n.tags.join(" ")).toLowerCase().includes(MF.q.toLowerCase()));
  return `<h2>My marks</h2><p id="stor" class="m"></p><div class="card"><b>Highlight colors</b>` +
    PAL.map((c, i) => `<div style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="color" value="${c.hex}" onchange="PAL[${i}].hex=this.value;savePal()"><input value="${esc(c.name)}" onchange="PAL[${i}].name=this.value;savePal()" style="flex:1;font-size:16px;padding:6px;background:var(--bg);color:var(--fg);border:1px solid var(--mut);border-radius:6px"><button class="a" onclick="palMove(${i},-1)">↑</button><button class="a" onclick="palMove(${i},1)">↓</button><button class="a" onclick="palDel(${i})">✕</button></div>`).join("") +
    `<button class="a" onclick="palAdd()">Add color</button> <button class="a" onclick="PAL=JSON.parse(JSON.stringify(PAL0));savePal();render()">Reset</button></div>` +
    `<div class="card"><b>Highlights</b> <select onchange="MF.color=this.value;render()"><option value="all">All colors</option>${PAL.map(c => `<option value="${c.id}" ${MF.color === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` +
    (hs.map(id => `<div class="card" onclick="openRef('${id}')"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${(PAL.find(c => c.id === R.marks.get(id)) || {}).hex}"></span> <b>${esc(refLabel([id]))}</b><br>${esc(isV(id) ? vtext(t, id) : pmap().get(id)[1].text.slice(0, 220) + "…")}</div>`).join("") || `<p class="m">Nothing marked yet. Tap a verse in Read, then a color.</p>`) + `</div>` +
    `<div class="card"><b>Notes (${R.notes.length})</b><input placeholder="Search notes" value="${esc(MF.q)}" onchange="MF.q=this.value;render()" style="width:100%;box-sizing:border-box;font-size:16px;padding:8px;margin:8px 0;background:var(--bg);color:var(--fg);border:1px solid var(--mut);border-radius:8px">` +
    (notes.map(n => `<div class="card"><b>${esc(mixLabel(n.ids))}</b> <small>${esc(n.tags.join(", "))}</small><br>${esc(n.text)}<br>${n.ids.length ? `<button class="a" onclick="openRef('${sortIds([...n.ids])[0]}')">Open</button> ` : ""}<button class="a" onclick="noteDel('${n.id}')">Delete</button></div>`).join("") || `<p class="m">No notes.</p>`) + `</div>` +
    `<div class="card"><b>Bookmarks (${R.bms.size})</b>` + ([...R.bms.values()].map(b => `<div class="card" onclick="goVerse('${b.id}')"><b>${esc(refLabel([b.id]))}</b> ${esc(b.label || "")}</div>`).join("") || `<p class="m">No bookmarks.</p>`) + `</div>` +
    `<div class="card"><b>Backup (works offline)</b><p class="m">One file with your highlights, notes, bookmarks and colors.</p><button class="a" onclick="backup()">Export backup</button> <label style="display:block;margin-top:8px">Restore<input type="file" accept=".json" onchange="restore(this)"></label></div>`;
}
function palMove(i, d) { const j = i + d; if (j < 0 || j >= PAL.length) return; [PAL[i], PAL[j]] = [PAL[j], PAL[i]]; savePal(); render(); }
function palDel(i) { if (PAL.length > 1 && confirm("Remove this color? Verses keep their marks but show no color.")) { PAL.splice(i, 1); savePal(); render(); } }
function palAdd() { PAL.push({ id: "c" + uid(), name: "New color", hex: "#8bd3dd" }); savePal(); render(); }
function backup() {
  const o = { type: "backup", v: 1, marks: [...R.marks].map(([id, color]) => ({ id, color })), notes: R.notes, shelves: R.shelves, bms: [...R.bms.values()], pal: PAL, ui: UI };
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: "application/json" })); a.download = "bible-marks-backup.json"; a.click();
}
async function restore(inp) {
  const f = inp.files[0]; if (!f) return;
  try {
    const o = JSON.parse(await f.text()); if (o.type !== "backup") throw 0;
    if (o.pal) { PAL = o.pal; savePal(); } Object.assign(UI, o.ui || {}); saveUI();
    await putMany("mark", o.marks.map(m => ({ ...m, ts: 0 }))); await putMany("note", o.notes); await putMany("shelf", o.shelves || []); await putMany("bm", o.bms);
    await loadUser(); R.t = null; toast("Backup restored");
  } catch (e) { toast("Not a valid backup file"); }
  render();
}
