#!/usr/bin/env python3
"""Extract the verse-by-verse Study Bible notes (class 'com') and the textual notes (class 'en') from the NKJV Study Bible EPUB.
PRIVATE USE ONLY (copyrighted). Text is stored as small 'runs' [text, style, ref] (style 0 plain, 1 bold, 2 italic, 3 both;
ref = verse id for a tappable reference), so the app never has to insert raw HTML.
Usage: python3 build_studynotes.py NKJV_Study_Bible.epub data/NOTES-NKJV.json"""
import sys, re, json, zipfile, warnings
from bs4 import BeautifulSoup, NavigableString, XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from import_nkjv_epub import ORDER

HREF = re.compile(r"#v(\d{2})(\d{3})(\d{3})$")
COMID = re.compile(r"^com(\d{2})(\d{3})(\d{3})$")
ENID = re.compile(r"^e(\d{2})(\d{3})(\d{3})-")
BOILER = "Words in italic type have been added"

def vid(b, c, v): return f"{ORDER[int(b) - 1]}.{int(c)}.{int(v)}"

def runs(el, skip_first_ref):
    out, first = [], [skip_first_ref]
    def walk(node, st):
        for ch in node.children:
            if isinstance(ch, NavigableString):
                t = re.sub(r"\s+", " ", str(ch))
                if t: out.append([t, st, ""])
            elif ch.name in ("b", "strong"): walk(ch, st | 1)
            elif ch.name in ("i", "em"): walk(ch, st | 2)
            elif ch.name == "a" and "xbr" in ch.get("class", []):
                m = HREF.search(ch.get("href", ""))
                ref = "" if (first[0] and not out) else (vid(*m.groups()) if m else "")
                out.append([ch.get_text(), st, ref]); first[0] = False
            elif ch.name in ("a", "span"): walk(ch, st)
            else: walk(ch, st)
    walk(el, 0)
    merged = []
    for r in out:   # merge neighbours with the same style and no reference
        if merged and not r[2] and not merged[-1][2] and merged[-1][1] == r[1]: merged[-1][0] += r[0]
        else: merged.append(r)
    for r in merged:
        if not r[2]: r.pop()
    if merged: merged[0][0] = merged[0][0].lstrip(); merged[-1][0] = merged[-1][0].rstrip()
    return [r for r in merged if r[0]]

def main(epub, out):
    z = zipfile.ZipFile(epub); notes, textual, nn, nt, words = {}, {}, 0, 0, {}
    names = sorted(n for n in z.namelist() if n.endswith(".xhtml"))
    for name in names:   # pass 1: the word each textual-note marker sits before (e.g. 'souls')
        raw = z.read(name).decode("utf8", "ignore")
        if 'class="enref"' in raw:
            for a in BeautifulSoup(raw, "lxml").find_all("a", class_="enref"):
                nxt = a.next_sibling; t = nxt.get_text() if hasattr(nxt, "get_text") else str(nxt or "")
                m = re.match(r"\W*([\w’'-]+)", t); words[a.get("href", "").split("#")[-1]] = m.group(1) if m else ""
    for name in names:
        raw = z.read(name).decode("utf8", "ignore")
        if 'class="com"' not in raw and 'class="en"' not in raw: continue
        for p in BeautifulSoup(raw, "lxml").find_all("p", class_=["com", "en"]):
            if "com" in p.get("class", []):
                m = COMID.match(p.get("id", ""))
                if not m: continue
                a = p.find("a", class_="xbr"); end = None
                if a:
                    r = re.search(r"[–—-]\s*(\d+)\s*$", a.get_text())
                    if r and ":" not in a.get_text().split("–")[-1] and int(r.group(1)) > int(m.group(3)): end = int(r.group(1))
                d = {"t": runs(p, True)}
                if end: d["e"] = end
                notes.setdefault(vid(*m.groups()), []).append(d); nn += 1
            else:
                m = ENID.match(p.get("id", ""))
                if not m: continue
                t = runs(p, False)
                if t: t[0][0] = re.sub(r"^\d+\s*", "", t[0][0])      # drop the printed footnote number
                t = [r for r in t if r[0]]
                if t and re.fullmatch(r"\d+:\d+(?:[–-]\d+)?", t[0][0].strip()): t = t[1:]   # drop the verse label, the app shows it
                if t: t[0][0] = t[0][0].lstrip()
                if t and BOILER not in "".join(x[0] for x in t):
                    textual.setdefault(vid(*m.groups()), []).append({"k": words.get(p.get("id", ""), ""), "t": t}); nt += 1
    json.dump({"id": "NOTES-NKJV", "lang": "en", "private": True,
               "license": "NKJV Study Bible notes, HarperCollins/Thomas Nelson. NOT LICENSED YET. Private use only.",
               "sn": {"notes": notes, "textual": textual}}, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{nn} study notes on {len(notes)} verses, {nt} textual notes on {len(textual)} verses")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
