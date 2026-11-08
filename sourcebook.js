// ---------- Source Book (SDA Bible Students' Source Book): topic entries with clickable, stacked Bible passages ----------
// Entry: {id,n,t,s,p:[paragraph],r:[verse ids]}; a paragraph is a string or runs: "text" | ["Dan. 8:14","DAN.8.14|DAN.8.15"].
async function loadSb() {
  R.sb = []; R.sbIdx = {}; R.sbN = {}; R.sbTx = null; R.sbG = {};
  (await tx("sbook", "readonly", o => o.getAll())).forEach(b => R.sb.push(...b.sb.entries));
  R.sb.forEach((e, i) => { if (!(e.n in R.sbN)) R.sbN[e.n] = i; e.r.forEach(v => (R.sbIdx[v] = R.sbIdx[v] || []).push(i)); });
}
const sbFlat = p => typeof p === "string" ? p : p.map(x => typeof x === "string" ? x : x[0]).join("");
function sbMatches(val, max) {   // titles first, then body text; every typed word (stemmed) must match
  if (!R.sb || !R.sb.length) return { list: [], total: 0 };
  const ws = val.toLowerCase().replace(/["]/g, "").split(/\s+/).filter(w => w.length > 2 && !["and", "the", "for", "with"].includes(w)); if (!ws.length || val.trim().length < 3) return { list: [], total: 0 };
  const st = ws.map(w => stem(w));
  if (!R.sbTx) R.sbTx = R.sb.map(e => (e.t + " " + e.p.map(sbFlat).join(" ")).toLowerCase());
  const a = [], b = [];
  R.sb.forEach((e, i) => { if (st.every(w => e.t.toLowerCase().includes(w))) a.push(i); else if (st.every(w => R.sbTx[i].includes(w))) b.push(i); });
  const q0 = ws[0], rk = i => (+!R.sb[i].t.toLowerCase().startsWith(q0)) * 1000 + R.sb[i].t.length; a.sort((x, y) => rk(x) - rk(y));
  const all = a.concat(b); return { list: all.slice(0, max == null ? all.length : max), total: all.length };
}
function sbGroups(e) {   // the entry's distinct quoted passages, in order of appearance
  const g = [], key = {};
  e.p.forEach(p => { if (typeof p !== "string") p.forEach(x => { if (typeof x !== "string") { const k = x[1]; if (!(k in key)) { key[k] = g.length; g.push(k.split("|")); } } }); });
  return { g, key };
}
function sbOpen(i, from) {
  const e = R.sb[i]; if (!e) return; R.sbFrom = from || R.sbFrom || null; const { key } = sbGroups(e);
  let h = (R.sbFrom === "list" ? `<p><button class="a" onclick="sbList(R.sbq,R.sbPage)">‹ Results</button></p>` : "") +
    `<h3>${esc(e.t)}</h3><p class="m">${esc(e.s)}</p>` +
    e.p.map(p => `<p style="line-height:1.55">${typeof p === "string" ? esc(p) : p.map(x => typeof x === "string" ? esc(x) : `<a class="sbr" style="color:var(--ac);text-decoration:underline;cursor:pointer" onclick="sbPass(${i},${key[x[1]]})">${esc(x[0])}</a>`).join("")}</p>`).join("") +
    (e.see && e.see.length ? `<p>See also: ${e.see.filter(n => n in R.sbN).map(n => `<button class="a" style="margin:2px" onclick="sbOpen(${R.sbN[n]})">No. ${n}</button>`).join("")}</p>` : "") +
    (e.r.length > 0 ? `<p class="m">${e.r.length} verses quoted · tap a reference to read just that passage.</p>` : "") +
    `<p><button class="a" onclick="sheet()">Close</button></p>`;
  sheet(h); $r("rgs").hidden = true;
}
function sbPass(i, g) {   // only the quoted passage, with the entry's other passages stacked below; each card opens the whole chapter
  const e = R.sb[i]; if (!e) return; const t = curT(), { g: groups } = sbGroups(e);
  let h = `<p><button class="a" onclick="sbOpen(${i})">‹ Back to entry</button></p><h3>${esc(e.t)}</h3><p class="m">${groups.length > 1 ? "Scroll for the other " + (groups.length - 1) + " passage" + (groups.length > 2 ? "s" : "") + " quoted here. " : ""}Tap a passage to read the whole chapter.</p>`;
  h += groups.map((ids, k) => {
    const body = ids.map(id => { const x = t ? vtext(t, id) : ""; return x ? `<sup>${id.split(".")[2]}</sup> ${esc(x)}` : ""; }).filter(Boolean).join(" ");
    return `<div class="card" id="sbp${k}" ${k === g ? 'style="border-color:var(--ac)"' : ""} onclick="sheet();clearSel();goVerse('${ids[0]}')"><b>${esc(refLabel(sortIds([...ids])))}</b><br>${body || `<small>not in ${esc(t ? t.id : "the installed Bible")}</small>`}<br><small style="color:var(--ac)">Read whole chapter ›</small></div>`;
  }).join("") + `<p><button class="a" onclick="sheet()">Close</button></p>`;
  sheet(h); const el = document.getElementById("sbp" + g); if (el) $r("sheet").scrollTop = el.offsetTop - 8;
}
function sbList(q, page) {
  R.sbq = q; R.sbPage = page = page || 0; const m = sbMatches(q), per = 20, rows = m.list.slice(page * per, page * per + per);
  const h = `<h3>Source Book: “${esc(q)}”</h3><p class="m">${m.total} entries</p>` +
    rows.map(i => { const e = R.sb[i]; return `<div class="card" onclick="sbOpen(${i},'list')"><b>${esc(e.t)}</b><br><small>${esc(sbFlat(e.p[0] || "").slice(0, 130))}…</small></div>`; }).join("") +
    `<p>${page > 0 ? `<button class="a" onclick="sbList(R.sbq,${page - 1})">‹ Previous</button> ` : ""}${(page + 1) * per < m.total ? `<button class="a" onclick="sbList(R.sbq,${page + 1})">Next ›</button> ` : ""}<button class="a" onclick="sheet()">Close</button></p>`;
  sheet(h); $r("rgs").hidden = true;
}
