// notes.js: Notes tab with shelves. Press-and-hold to select/drag, multi-select, move, copy, delete with undo. Offline (IndexedDB).
// Loaded after reader.js and before the main script. Uses: R, putMany, uid, esc, sheet, toast, refLabel, sortIds, noteIdx, markNotes, openRef, pmap, ORD, BN, tab.
const NS = { sel: new Set(), mode: false, q: "", col: new Set(), undo: null, newColor: "#5aa9f0" };
const SH_COL = ["#5aa9f0", "#6fcf74", "#f5d742", "#f58ab8", "#f5a04a", "#b08af0", "#f06060", "#8bd3dd"];
const INBOX = { id: "inbox", title: "Inbox", color: "#8a8a8f", virtual: true };
const nsApp = () => document.getElementById("app");
const shelves = () => [INBOX, ...[...(R.shelves || [])].sort((a, b) => a.ord - b.ord)];
const nOrd = n => n.ord !== undefined ? n.ord : -n.ts;                       // notes without an order show newest first
const inShelf = id => R.notes.filter(n => (n.shelf || "inbox") === id).sort((a, b) => nOrd(a) - nOrd(b));
const nTitle = n => n.title || n.text.split("\n")[0].slice(0, 40);
const hit = n => !NS.q || ((n.title || "") + " " + n.text + " " + n.tags.join(" ") + " " + mixLabel(n.ids)).toLowerCase().includes(NS.q.toLowerCase());

// ---------- reference parsing for the "Links" field (John 3:16; 1 Cor 13:4-7; DA 530.3) ----------
const NORMB = s => s.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
const ALIAS = { ps: "PSA", jn: "JHN", mt: "MAT", mk: "MRK", lk: "LUK", rev: "REV", gen: "GEN", exo: "EXO", ex: "EXO" };
function bookCode(name) {
  const n = NORMB(name); if (ALIAS[n]) return ALIAS[n];
  const norm = BN.map(NORMB), exact = norm.indexOf(n); if (exact >= 0) return ORD[exact];
  if (n.replace(/^\d/, "").length < 3) return null;
  const c = norm.map((b, i) => b.startsWith(n) ? i : -1).filter(i => i >= 0);
  return c.length === 1 ? ORD[c[0]] : null;
}
function parseRefs(str) {
  const ids = [], bad = [], pm = pmap();
  for (const part of str.split(/;|\n/).map(s => s.trim()).filter(Boolean)) {
    if (pm.has(part.toUpperCase())) { ids.push(part.toUpperCase()); continue; }
    const m = part.match(/^((?:[1-3]\s?)?[A-Za-z][A-Za-z ]*?)\.?\s*(\d+)(?:\s*:\s*([\d,\s\-–]+))?$/), code = m && bookCode(m[1]);
    if (!code) { bad.push(part); continue; }
    const ch = m[2]; let vs = [];
    if (m[3]) for (const p of m[3].split(",")) {
      const r = p.trim().replace("–", "-").match(/^(\d+)(?:-(\d+))?$/); if (!r) continue;
      for (let v = +r[1]; v <= (+r[2] || +r[1]) && v < +r[1] + 200; v++) vs.push(v);
    } else if (R.t && R.t.books[code] && R.t.books[code][ch]) vs = Object.keys(R.t.books[code][ch]).map(Number);
    if (!vs.length) bad.push(part); else vs.forEach(v => ids.push(`${code}.${ch}.${v}`));
  }
  return { ids: [...new Set(ids)], bad };
}

// ---------- view ----------
function cardHtml(n) {
  return `<div class="note${NS.sel.has(n.id) ? " sel" : ""}" data-id="${n.id}">${n.title ? `<b>${esc(n.title)}</b>` : ""}<div class="np">${esc(n.text)}</div>` +
    `<small>${n.tags.map(t => "#" + esc(t)).join(" ")}${n.ids.length ? ` ${n.tags.length ? "· " : ""}${esc(mixLabel(n.ids))}` : ""}</small></div>`;
}
function shelfHtml(sh, list) {
  const c = NS.col.has(sh.id);
  return `<section class="shelf" data-shelf="${sh.id}" style="border-left:5px solid ${sh.color}"><div class="sh"><b onclick="nsCollapse('${sh.id}')">${c ? "▸" : "▾"} ${esc(sh.title)}</b><small>${list.length}</small><span style="flex:1"></span>` +
    `<button class="a" onclick="nsNew('${sh.id}')">+</button>${sh.virtual ? "" : `<button class="a" onclick="nsShelfMenu('${sh.id}')">⋯</button>`}</div>` +
    (c ? "" : `<div class="sb">${list.map(cardHtml).join("") || `<p class="m empty">Hold a note and drop it here</p>`}</div>`) + `</section>`;
}
function selBar() {
  const n = NS.sel.size; if (!n) return "";
  return `<div class="nsbar"><b>${n} selected</b><button class="a" onclick="nsMoveSheet()">Move</button><button class="a" onclick="nsCopySheet()">Copy</button><button class="a" onclick="nsDelete()">Delete</button><button class="a" onclick="nsAll()">All</button><button class="a" onclick="nsClear(true)">✕</button></div>`;
}
function notesView() {
  const all = shelves();
  return `<h2>Notes</h2><div style="display:flex;gap:6px;margin-bottom:10px"><input id="nsq" value="${esc(NS.q)}" placeholder="Search notes" onchange="NS.q=this.value;nsRefresh()" style="flex:1;font-size:16px;padding:8px;border-radius:8px;border:1px solid var(--mut);background:var(--bg);color:var(--fg)"><button class="a" onclick="nsNew('inbox')">+ Note</button><button class="a" onclick="nsShelfEdit('')">+ Shelf</button></div>` +
    `<div id="nsbarwrap">${selBar()}</div>` +
    all.map(sh => { const l = inShelf(sh.id).filter(hit); return NS.q && !l.length ? "" : shelfHtml(sh, l); }).join("");
}
const nsRefresh = () => { nsApp().innerHTML = notesView(); };
function nsSelUpdate() {
  document.querySelectorAll(".note").forEach(e => e.classList.toggle("sel", NS.sel.has(e.dataset.id)));
  const w = document.getElementById("nsbarwrap"); if (w) w.innerHTML = selBar();
}
function nsClear(refresh) { NS.sel.clear(); NS.mode = false; if (refresh) nsSelUpdate(); }
function nsAll() { document.querySelectorAll(".note").forEach(e => NS.sel.add(e.dataset.id)); nsSelUpdate(); }
function nsCollapse(id) { NS.col.has(id) ? NS.col.delete(id) : NS.col.add(id); nsRefresh(); }
function nsTap(id) {
  if (NS.mode) { NS.sel.has(id) ? NS.sel.delete(id) : NS.sel.add(id); if (!NS.sel.size) NS.mode = false; nsSelUpdate(); }
  else nsEdit(id);
}

// ---------- linked passages shown inside an opened note ----------
const trunc = (t, n) => t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "...";
function groupIds(ids) {   // consecutive verses of one chapter become one passage; Ellen White paragraphs stay single
  const out = []; let g = null;
  sortIds([...ids]).forEach(id => {
    if (!isV(id)) { out.push([id]); g = null; return; }
    const [b, c, v] = id.split("."), last = g && g[g.length - 1].split(".");
    if (last && last[0] === b && last[1] === c && +v === +last[2] + 1) g.push(id); else { g = [id]; out.push(g); }
  });
  return out;
}
function linkedHtml(ids) {
  const t = curT(), pm = pmap();
  return `<h4 style="margin:10px 0 4px">Linked passages</h4>` + groupIds(ids).map(g => {
    const txt = isV(g[0]) ? (t ? g.map(i => vtext(t, i)).filter(Boolean).join(" ") : "") : ((pm.get(g[0]) || [])[1] || {}).text || "";
    return `<div class="card" style="cursor:pointer" onclick="sheet();openRef('${g[0]}')"><b>${esc(refLabel(g))}</b><br>${txt ? esc(trunc(txt, 150)) : `<small>not available in the installed books</small>`}</div>`;
  }).join("");
}

// ---------- edit / create ----------
const fld = "width:100%;box-sizing:border-box;font-size:16px;padding:8px;margin:6px 0;background:var(--bg);color:var(--fg);border:1px solid var(--mut);border-radius:8px";
function nsNew(shelfId) { nsForm(null, shelfId); }
function nsEdit(id) { nsForm(R.notes.find(n => n.id === id)); }
function nsForm(n, shelfId) {
  const sid = n ? (n.shelf || "inbox") : (shelfId || "inbox");
  sheet(`<h3>${n ? "Edit note" : "New note"}</h3><input id="ne_t" placeholder="Title (optional)" value="${esc(n ? n.title || "" : "")}" style="${fld}"><textarea id="ne_x" rows="6" placeholder="Note" style="${fld}">${esc(n ? n.text : "")}</textarea>` + (n && n.ids.length ? linkedHtml(n.ids) : "") +
    `<input id="ne_g" placeholder="tags, comma separated" value="${esc(n ? n.tags.join(", ") : "")}" style="${fld}"><input id="ne_r" placeholder="Links: John 3:16; Gen 1:1-3; DA 530.3" value="${esc(n && n.ids.length ? mixLabel(n.ids) : "")}" style="${fld}">` +
    `<select id="ne_s" style="${fld}">${shelves().map(s => `<option value="${s.id}" ${s.id === sid ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select>` +
    `<p><button class="a" onclick="nsSave('${n ? n.id : ""}')">Save</button> ${n ? `<button class="a" onclick="nsDelOne('${n.id}')">Delete</button> ` : ""}<button class="a" onclick="sheet()">Cancel</button></p>`);
}
async function nsSave(id) {
  const text = document.getElementById("ne_x").value.trim(), title = document.getElementById("ne_t").value.trim();
  if (!text && !title) { sheet(); return; }
  const { ids, bad } = parseRefs(document.getElementById("ne_r").value), shelf = document.getElementById("ne_s").value;
  if (bad.length) toast("Not recognized: " + bad.join(", "));
  const old = id ? R.notes.find(n => n.id === id) : null, oldIds = old ? old.ids : [];
  const rec = Object.assign(old || { id: uid(), ts: Date.now() }, { title, text: text || title, tags: document.getElementById("ne_g").value.split(",").map(s => s.trim()).filter(Boolean), ids, shelf });
  if (!old) { rec.ord = -Date.now(); R.notes.push(rec); } else if ((old.shelf || "inbox") !== shelf) rec.ord = -Date.now();
  noteIdx(); markNotes([...oldIds, ...ids]); sheet(); await putMany("note", [rec]); nsRefresh();
}

// ---------- delete (with undo), copy, move ----------
async function nsRemove(ids) {
  const gone = R.notes.filter(n => ids.has(n.id)); if (!gone.length) return;
  R.notes = R.notes.filter(n => !ids.has(n.id)); noteIdx(); markNotes(gone.flatMap(n => n.ids));
  NS.sel.clear(); NS.mode = false; sheet(); nsRefresh(); await putMany("note", gone, true);
  if (NS.undo) clearTimeout(NS.undo.t);
  let u = document.getElementById("undo"); if (!u) { u = document.createElement("div"); u.id = "undo"; document.body.appendChild(u); }
  u.innerHTML = `Deleted ${gone.length} note${gone.length > 1 ? "s" : ""} <button onclick="nsUndo()">Undo</button>`; u.hidden = false;
  NS.undo = { gone, t: setTimeout(() => { u.hidden = true; NS.undo = null; }, 6000) };
}
async function nsUndo() {
  const u = NS.undo; if (!u) return; clearTimeout(u.t); document.getElementById("undo").hidden = true; NS.undo = null;
  R.notes.push(...u.gone); noteIdx(); markNotes(u.gone.flatMap(n => n.ids)); await putMany("note", u.gone); if (tab === "notes") nsRefresh();
}
function nsDelete() {
  const n = NS.sel.size; sheet(`<h3>Delete ${n} note${n > 1 ? "s" : ""}?</h3><p><button class="a" onclick="nsRemove(new Set(NS.sel))">Delete</button> <button class="a" onclick="sheet()">Cancel</button></p>`);
}
const nsDelOne = id => nsRemove(new Set([id]));
function nsOrdered() { return [...document.querySelectorAll(".note")].map(e => e.dataset.id).filter(i => NS.sel.has(i)); }
function nsCopySheet() {
  sheet(`<h3>Copy ${NS.sel.size} note${NS.sel.size > 1 ? "s" : ""}</h3><p>Duplicate into:</p>` + shelves().map(s => `<button class="a" style="margin:4px" onclick="nsCopyTo('${s.id}')">${esc(s.title)}</button>`).join("") +
    `<p><button class="a" onclick="nsCopyText()">Copy text only</button> <button class="a" onclick="sheet()">Cancel</button></p>`);
}
async function nsCopyTo(shelfId) {
  const src = nsOrdered().map(id => R.notes.find(n => n.id === id)).filter(Boolean), copies = [];
  let top = Math.min(0, ...inShelf(shelfId).map(nOrd)) - src.length;
  src.forEach((n, i) => copies.push({ ...n, id: uid(), ts: Date.now(), shelf: shelfId, ord: top + i, title: (n.title || n.text.split("\n")[0].slice(0, 30)) + " (copy)", tags: [...n.tags], ids: [...n.ids] }));
  R.notes.push(...copies); noteIdx(); markNotes(copies.flatMap(n => n.ids)); NS.sel.clear(); NS.mode = false; sheet(); nsRefresh(); await putMany("note", copies); toast(`Copied ${copies.length}`);
}
async function nsCopyText() {
  const txt = nsOrdered().map(id => { const n = R.notes.find(x => x.id === id); return n ? (n.title ? n.title + "\n" : "") + n.text + (n.ids.length ? "\n" + mixLabel(n.ids) : "") : ""; }).join("\n\n");
  try { await navigator.clipboard.writeText(txt); toast("Text copied"); } catch (e) { prompt("Copy:", txt); } sheet();
}
function nsMoveSheet() {
  sheet(`<h3>Move ${NS.sel.size} note${NS.sel.size > 1 ? "s" : ""} to</h3>` + shelves().map(s => `<button class="a" style="margin:4px;border-color:${s.color}" onclick="nsMoveTo('${s.id}')">${esc(s.title)}</button>`).join("") + `<p><button class="a" onclick="sheet()">Cancel</button></p>`);
}
async function nsMoveTo(shelfId) { const ids = new Set(NS.sel), order = nsOrdered(); sheet(); await moveNotes(ids, order, shelfId, null); NS.sel.clear(); NS.mode = false; nsRefresh(); }
async function moveNotes(ids, order, shelfId, beforeId) {  // put the notes into a shelf at a position and renumber that shelf
  const moving = order.map(id => R.notes.find(n => n.id === id)).filter(Boolean);
  const target = inShelf(shelfId).filter(n => !ids.has(n.id));
  let i = beforeId ? target.findIndex(n => n.id === beforeId) : target.length; if (i < 0) i = target.length;
  target.splice(i, 0, ...moving);
  const changed = []; target.forEach((n, k) => { if ((n.shelf || "inbox") !== shelfId || n.ord !== k) { n.shelf = shelfId; n.ord = k; changed.push(n); } });
  await putMany("note", changed);
}

// ---------- shelves ----------
function swatches(cur, fn) { return SH_COL.map(c => `<button class="sw" style="background:${c};${c === cur ? "outline:3px solid var(--fg)" : ""}" onclick="${fn}('${c}')"></button>`).join(" "); }
function nsShelfEdit(id) {
  const s = id ? R.shelves.find(x => x.id === id) : null; NS.newColor = s ? s.color : SH_COL[(R.shelves || []).length % SH_COL.length]; NS.editId = id;
  sheet(`<h3>${s ? "Edit shelf" : "New shelf"}</h3><input id="sh_t" placeholder="Shelf title" value="${esc(s ? s.title : "")}" style="${fld}"><p id="sh_c">${swatches(NS.newColor, "nsPick")}</p><p><button class="a" onclick="nsShelfSave()">Save</button> <button class="a" onclick="sheet()">Cancel</button></p>`);
}
function nsPick(c) { NS.newColor = c; document.getElementById("sh_c").innerHTML = swatches(c, "nsPick"); }
async function nsShelfSave() {
  const title = document.getElementById("sh_t").value.trim(); if (!title) { toast("Give the shelf a title"); return; }
  let s = NS.editId ? R.shelves.find(x => x.id === NS.editId) : null;
  if (s) Object.assign(s, { title, color: NS.newColor }); else { s = { id: uid(), title, color: NS.newColor, ord: Math.max(-1, ...(R.shelves || []).map(x => x.ord)) + 1 }; (R.shelves = R.shelves || []).push(s); }
  sheet(); nsRefresh(); await putMany("shelf", [s]);
}
function nsShelfMenu(id) {
  const s = R.shelves.find(x => x.id === id);
  sheet(`<h3>${esc(s.title)}</h3><p><button class="a" onclick="nsShelfEdit('${id}')">Rename / color</button> <button class="a" onclick="nsShelfMove('${id}',-1)">Move up</button> <button class="a" onclick="nsShelfMove('${id}',1)">Move down</button></p><p><button class="a" onclick="nsShelfDel('${id}')">Delete shelf</button> <button class="a" onclick="sheet()">Close</button></p>`);
}
async function nsShelfMove(id, d) {
  const l = [...R.shelves].sort((a, b) => a.ord - b.ord), i = l.findIndex(x => x.id === id), j = i + d; if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; l.forEach((x, k) => x.ord = k); sheet(); nsRefresh(); await putMany("shelf", l);
}
function nsShelfDel(id) {
  const n = inShelf(id).length;
  sheet(`<h3>Delete this shelf?</h3><p>It has ${n} note${n === 1 ? "" : "s"}.</p><p><button class="a" onclick="nsShelfDo('${id}',false)">Move notes to Inbox</button> <button class="a" onclick="nsShelfDo('${id}',true)">Delete notes too</button> <button class="a" onclick="sheet()">Cancel</button></p>`);
}
async function nsShelfDo(id, withNotes) {
  const ns = inShelf(id), ids = new Set(ns.map(n => n.id));
  R.shelves = R.shelves.filter(x => x.id !== id); await putMany("shelf", [{ id }], true);
  if (withNotes) await nsRemove(ids); else { ns.forEach(n => { n.shelf = "inbox"; n.ord = -n.ts; }); await putMany("note", ns); }
  sheet(); nsRefresh();
}

// ---------- press-and-hold drag and drop (touch and mouse) ----------
let G = null;
const nextUnsel = el => { let x = el.nextElementSibling; while (x && NS.sel.has(x.dataset.id)) x = x.nextElementSibling; return x; };
const firstUnsel = sh => [...sh.querySelectorAll(".note")].find(e => !NS.sel.has(e.dataset.id));
document.addEventListener("contextmenu", e => { if (e.target.closest(".note")) e.preventDefault(); });
document.addEventListener("touchmove", e => { if (G && G.long) e.preventDefault(); }, { passive: false });  // once held, the finger drags instead of scrolling
document.addEventListener("pointerdown", e => {
  if (tab !== "notes" || (e.pointerType === "mouse" && e.button !== 0)) return;
  const c = e.target.closest(".note"); if (!c || e.target.closest("button,a,input,textarea,select")) return;
  G = { id: c.dataset.id, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, long: false, drag: false, tgt: null };
  G.timer = setTimeout(() => {   // press and hold: select this note, then dragging is armed
    if (!G) return; G.long = true; NS.mode = true; NS.sel.add(G.id); nsSelUpdate(); if (navigator.vibrate) navigator.vibrate(15);
  }, 420);
});
document.addEventListener("pointermove", e => {
  if (!G) return; G.x = e.clientX; G.y = e.clientY;
  const far = Math.hypot(G.x - G.x0, G.y - G.y0);
  if (!G.long) { if (far > 10) { clearTimeout(G.timer); G = null; } return; }  // moved before the hold finished: it is a scroll
  if (!G.drag && far > 6) startDrag();
});
document.addEventListener("pointerup", () => {
  if (!G) return; clearTimeout(G.timer); const g = G;
  if (g.drag) { endDrag(true); return; }
  G = null; if (!g.long) nsTap(g.id);
});
document.addEventListener("pointercancel", () => { if (!G) return; clearTimeout(G.timer); if (G.drag) endDrag(false); else G = null; });
function startDrag() {
  G.drag = true; document.body.classList.add("nsdrag");
  const first = document.querySelector(`.note[data-id="${G.id}"]`), g = document.createElement("div");
  g.className = "ghost"; g.innerHTML = (first ? first.innerHTML : "") + (NS.sel.size > 1 ? `<span class="badge">${NS.sel.size}</span>` : ""); document.body.appendChild(g); G.ghost = g;
  document.querySelectorAll(".note.sel").forEach(e => e.classList.add("lift")); dragLoop();
}
function dragLoop() {
  if (!G || !G.drag) return;
  if (G.y < 110) window.scrollBy(0, -14); else if (G.y > innerHeight - 110) window.scrollBy(0, 14);   // auto-scroll near the edges
  dragMove(); requestAnimationFrame(dragLoop);
}
function dragMove() {
  G.ghost.style.transform = `translate3d(${G.x - 70}px,${G.y - 30}px,0)`;
  document.querySelectorAll(".shelf.drop").forEach(e => e.classList.remove("drop"));
  document.querySelectorAll(".note.ib,.note.ia").forEach(e => e.classList.remove("ib", "ia"));
  G.tgt = null; const el = document.elementFromPoint(G.x, G.y), sh = el && el.closest(".shelf"); if (!sh) return;
  sh.classList.add("drop"); const card = el.closest(".note");
  if (card && !NS.sel.has(card.dataset.id)) {
    const r = card.getBoundingClientRect();
    if (G.y > r.top + r.height / 2) { const nx = nextUnsel(card); G.tgt = { shelf: sh.dataset.shelf, before: nx ? nx.dataset.id : null }; card.classList.add("ia"); }
    else { G.tgt = { shelf: sh.dataset.shelf, before: card.dataset.id }; card.classList.add("ib"); }
  } else { const f = el.closest(".sh") ? firstUnsel(sh) : null; G.tgt = { shelf: sh.dataset.shelf, before: f ? f.dataset.id : null }; }
}
async function endDrag(drop) {
  const g = G; G = null; g.ghost.remove(); document.body.classList.remove("nsdrag");
  document.querySelectorAll(".shelf.drop").forEach(e => e.classList.remove("drop"));
  document.querySelectorAll(".note.ib,.note.ia,.note.lift").forEach(e => e.classList.remove("ib", "ia", "lift"));
  if (drop && g.tgt) { const ids = new Set(NS.sel), order = nsOrdered(); await moveNotes(ids, order, g.tgt.shelf, g.tgt.before); NS.sel.clear(); NS.mode = false; nsRefresh(); }
}

// ---------- Quote into a note (from verses, Ellen White paragraphs, or the Study panel) ----------
function quoteBuild(ids) {
  // no extra quotation marks: Bible verses and EGW paragraphs often carry their own
  if (isV(ids[0])) return `${ids.map(i => vtext(R.t, i)).join(" ")}\n— ${refLabel(ids)} (${R.t.id})`;
  const pm = pmap(); return ids.map(i => { const e = pm.get(i); return e ? `${e[1].text}\n— Ellen G. White, ${i}` : i; }).join("\n\n");
}
function shelfName(n) { const s = shelves().find(x => x.id === (n.shelf || "inbox")); return s ? s.title : "Inbox"; }
function quoteOpen(ids, links) {
  ids = sortIds([...(ids || R.sel)]); if (!ids.length) return;
  NS.quote = { ids, links: [...new Set(links || ids)], text: quoteBuild(ids) }; quoteSheet();
}
function quoteCustom(text, links, title) { NS.quote = { ids: [title], links: [...new Set(links)], text }; quoteSheet(); }   // any text (e.g. a Study Bible note)
function quoteSheet() {
  const t = NS.quote.text;
  sheet(`<h3>Quote into a note</h3><div class="card" style="white-space:pre-wrap"><small>${esc(t.length > 260 ? t.slice(0, 260) + "…" : t)}</small></div>` +
    `<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input id="qk" type="checkbox" checked> Link the note to this passage</label>` +
    `<h4>New note in</h4><select id="qs" style="${fld}">${shelves().map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}</select><button class="a" onclick="quoteNew()">Create note</button>` +
    `<h4>Or add to an existing note</h4><input id="qf" placeholder="Search notes" oninput="quoteList()" style="${fld}"><div id="ql"></div><p><button class="a" onclick="sheet()">Cancel</button></p>`);
  quoteList();
}
function quoteList() {
  const q = document.getElementById("qf").value.toLowerCase();
  const l = [...R.notes].sort((a, b) => b.ts - a.ts).filter(n => !q || ((n.title || "") + " " + n.text).toLowerCase().includes(q)).slice(0, 12);
  document.getElementById("ql").innerHTML = l.map(n => `<div class="card" onclick="quoteAdd('${n.id}')"><b>${esc(nTitle(n))}</b> <small>${esc(shelfName(n))}</small></div>`).join("") || `<p class="m">No notes yet. Use "Create note".</p>`;
}
async function quoteNew() {
  const Q = NS.quote, link = document.getElementById("qk").checked, shelf = document.getElementById("qs").value;
  const rec = { id: uid(), ts: Date.now(), title: isV(Q.ids[0]) ? refLabel(Q.ids) : Q.ids[0], text: Q.text, tags: [], ids: link ? [...Q.links] : [], shelf, ord: -Date.now() };
  R.notes.push(rec); noteIdx(); markNotes(rec.ids); await putMany("note", [rec]); quoteDone(shelf, rec.title);
}
async function quoteAdd(id) {
  const Q = NS.quote, link = document.getElementById("qk").checked, n = R.notes.find(x => x.id === id); if (!n) return;
  n.text = (n.text ? n.text + "\n\n" : "") + Q.text; if (link) n.ids = [...new Set([...n.ids, ...Q.links])];
  noteIdx(); markNotes(n.ids); await putMany("note", [n]); quoteDone(n.shelf || "inbox", nTitle(n));
}
function quoteDone(shelf, title) {
  clearSel(); const sh = shelves().find(s => s.id === shelf);
  sheet(`<h3>Added</h3><p>“${esc(title)}” in ${esc(sh ? sh.title : "Inbox")}.</p><p><button class="a" onclick="sheet();setTab('notes')">Open Notes</button> <button class="a" onclick="sheet()">Close</button></p>`);
}
