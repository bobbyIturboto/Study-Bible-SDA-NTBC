#!/usr/bin/env python3
"""Extract the cross-references (the lettered footnotes) of the NKJV Study Bible EPUB. PRIVATE USE ONLY (copyrighted).
Each footnote is tied to a verse and to the word it follows; references inside [square brackets] are the book's
'compare' references and are kept apart. Usage: python3 build_xrefs.py NKJV_Study_Bible.epub data/XREF-NKJV.json"""
import sys, re, json, zipfile, warnings
from bs4 import BeautifulSoup, NavigableString, XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from import_nkjv_epub import ORDER

HREF = re.compile(r"#v(\d{2})(\d{3})(\d{3})$")
FNID = re.compile(r"^f(\d{2})(\d{3})(\d{3})-")

def vid(b, c, v): return f"{ORDER[int(b) - 1]}.{int(c)}.{int(v)}"

def ref_of(a):
    m = HREF.search(a.get("href", ""))
    if not m: return None
    start = vid(*m.groups()); b, c, v = start.split(".")
    r = re.search(r"[–-]\s*(?:(\d+):)?(\d+)\s*$", a.get_text())
    if r and not r.group(1) and int(r.group(2)) > int(v) and int(r.group(2)) - int(v) < 200:
        return f"{start}-{r.group(2)}"        # same-chapter range, e.g. JHN.1.1-3
    return start

def main(epub, out):
    z = zipfile.ZipFile(epub)
    words, notes = {}, []
    for name in sorted(n for n in z.namelist() if n.endswith(".xhtml")):
        raw = z.read(name).decode("utf8", "ignore")
        if 'class="fnref"' in raw:        # verse pages: remember the word each footnote marker sits before
            for a in BeautifulSoup(raw, "lxml").find_all("a", class_="fnref"):
                nxt = a.next_sibling; t = nxt.get_text() if hasattr(nxt, "get_text") else str(nxt or "")
                m = re.match(r"\W*([\w’'-]+)(?:\s+([\w’'-]+))?", t)
                w = (m.group(1) + (" " + m.group(2) if len(m.group(1)) <= 3 and m.group(2) else "")) if m else ""   # short words get a second word for context
                words[a.get("href", "").split("#")[-1]] = w
        if 'class="fn"' in raw:
            notes.append(raw)
    xr, n_notes = {}, 0
    for raw in notes:
        for p in BeautifulSoup(raw, "lxml").find_all("p", class_="fn"):
            m = FNID.match(p.get("id", ""))
            if not m: continue
            verse, inb, direct, comp = vid(*m.groups()), False, [], []
            for ch in p.children:
                if isinstance(ch, NavigableString):
                    for c in str(ch):
                        if c == "[": inb = True
                        elif c == "]": inb = False
                elif getattr(ch, "name", None) == "a" and "xbr" in ch.get("class", []):
                    r = ref_of(ch)
                    if r: (comp if inb else direct).append(r)
            if direct or comp:
                g = {"k": words.get(p["id"], "")}
                if direct: g["d"] = direct
                if comp: g["c"] = comp
                xr.setdefault(verse, []).append(g); n_notes += 1
    json.dump({"id": "XREF-NKJV", "lang": "en", "private": True,
               "license": "NKJV Study Bible cross-references, HarperCollins/Thomas Nelson. NOT LICENSED YET. Private use only.",
               "xrefs": xr}, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    refs = sum(len(g.get("d", [])) + len(g.get("c", [])) for v in xr.values() for g in v)
    print(f"{len(xr)} verses with cross-references, {n_notes} footnotes, {refs} references")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
