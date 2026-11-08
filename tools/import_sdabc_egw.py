#!/usr/bin/env python3
"""Parse 'SDA Bible Commentary: Comments by EGW' PDFs into one bundle + a verse index (PRIVATE USE ONLY).
Usage: python3 import_sdabc_egw.py out_bundle.json out_index.json vol1.pdf vol2.pdf ...
Each entry keeps its official paragraph id, e.g. '3BC 1128.2' (volume, page, paragraph)."""
import sys, re, json, subprocess, os
sys.path.insert(0, os.path.dirname(__file__))
from import_egw_epub import BOOK, verses_from

ID = re.compile(r"\{(\d+A?BC)\s+(\d+)\.(\d+)\}")
CH = re.compile(r"^(?:Chapter|Psalms?)\s+(\d+)\b")
LEAD = re.compile(r"^\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)\s*(?=[.(])")
SEE = re.compile(r"See EGW on ([^.]*?(?:\.\s?\d[^.]*?)?),\s*Vol\.\s*(\d+),?\s*p\.\s*(\d+)|See EGW on ([^{]+?)\.\s*$")

def pdf_lines(path):
    txt = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True).stdout
    for ln in txt.splitlines():
        s = ln.strip()
        if not s or re.fullmatch(r"\(?\d{1,4}\)?", s) or s.startswith(("Comments by EGW", "S.D.A. Bible Commentary")) \
           or re.match(r"^\d+A?BC - S\.D\.A\.", s) or s == "-":
            continue
        yield re.sub(r"^(\(\d{3,4}\))\s*", "", s)

def parse(path):
    entries, buf, book, chap, section, last = [], [], None, None, None, []
    lines = list(pdf_lines(path))
    i = 0
    while i < len(lines):
        s = lines[i]; i += 1
        if not buf or not entries:  # headers count right after an entry ended (or before the first entry)
            if s.lower() in BOOK:
                book, chap, buf = BOOK[s.lower()], None, []; continue
            m = CH.match(s)
            if m:
                chap, buf = int(m.group(1)), []; continue
            if re.match(r"^Appendix [A-Z] - ", s):
                book, chap, section = None, None, s; continue
        # join a split id like "{3BC\n1128.12}"
        if "{" in s and "}" not in s and i < len(lines):
            s += " " + lines[i]; i += 1
        s = re.sub(r"(\})\s*\d{1,3}\s*$", r"\1", s)  # drop stray line numbers after an id
        buf.append(s)
        joined = " ".join(buf)
        m = ID.search(joined)
        if m:
            text = re.sub(r"\s+", " ", joined[:m.start()]).strip()
            rest = joined[m.end():].strip()
            entries.append(make(m, text, book, chap, section, last))
            last = entries[-1]["_verses"]
            buf = [rest] if rest else []
    return entries

def make(m, text, book, chap, section, last):
    vol, page, para = m.group(1), int(m.group(2)), int(m.group(3))
    heading = re.match(r"^(.{3,160}?)\.\s*--", text)
    lead = LEAD.match(text)
    vs = verses_from(lead.group(1)) if lead else []
    inherited = False
    if not lead and not heading and last:   # continuation paragraph: same verses as the one before
        vs, inherited = last, True
    ids = [f"{book}.{chap}.{v}" for v in vs] if book and chap and vs else ([f"{book}.{chap}"] if book and chap else [])
    see = re.search(r"See EGW on (.+?)(?:,\s*Vol\.\s*(\d+),?\s*p\.\s*(\d+))?\.?\s*$", text) if text[:80].find("See EGW") >= 0 else None
    return {"id": f"{vol} {page}.{para}", "vol": vol, "book": book, "chapter": chap, "section": section,
            "verses": ids, "title": (re.sub(r"^\s*\d+(?:\s*[-–,]\s*\d+)*\s*", "", re.sub(r"\([^)]*\)\s*", "", heading.group(1), count=1)).strip(" .") if heading and not inherited else None),
            "text": text, "see": (see.group(1) if see else None), "_verses": vs}

if __name__ == "__main__":
    out_b, out_i, pdfs = sys.argv[1], sys.argv[2], sys.argv[3:]
    allp = []
    for p in pdfs:
        e = parse(p); allp += e
        mapped = sum(1 for x in e if x["verses"])
        print(f"{os.path.basename(p)[:28]:28} {len(e):5} entries, {mapped:5} mapped to verses")
    for e in allp: e.pop("_verses")
    index = {}
    for e in allp:
        for v in e["verses"]:
            index.setdefault(v, []).append(e["id"])
    json.dump({"id": "SDABC-EGW", "lang": "en", "title": "SDA Bible Commentary: Ellen G. White Comments",
               "license": "Review and Herald / White Estate. Private use only. Written permission required for any sharing.",
               "paras": allp}, open(out_b, "w", encoding="utf8"), ensure_ascii=False)
    json.dump(index, open(out_i, "w"), ensure_ascii=False)
    print(f"total {len(allp)} entries; {len(index)} distinct verse/chapter keys indexed")
