#!/usr/bin/env python3
"""Convert the HarperCollins NKJV Study Bible EPUB (verse anchors like v01001001) to a plain-text Bible bundle.
Only the Bible text is extracted (no study notes). PRIVATE USE ONLY until a license is obtained.
Usage: python3 import_nkjv_epub.py NKJV.epub data/NKJV.json"""
import sys, re, json, zipfile, warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

ORDER = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO "
         "OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE "
         "1JN 2JN 3JN JUD REV").split()
SKIP_P = {"ah", "ahaft", "bh", "bhaft", "cn", "cs", "ch", "chaft", "dt", "dtsub"}  # headings, cross-ref blurbs, psalm titles, chapter labels
VID = re.compile(r"^v(\d{2})(\d{3})(\d{3})$")

def main(epub, out):
    z = zipfile.ZipFile(epub)
    books, current = {}, None
    names = sorted(n for n in z.namelist() if n.endswith(".xhtml"))
    for name in names:
        raw = z.read(name).decode("utf8", "ignore")
        if not re.search(r'id="v\d{8}"', raw):
            continue
        soup = BeautifulSoup(raw, "lxml")
        for p in soup.find_all("p"):
            if SKIP_P & set(p.get("class", [])):
                continue
            for junk in p.select("a.fnref, a.enref, span.idx, a.xbr, sup"):
                junk.decompose()
            # walk again, splitting text at verse markers
            for el in p.children:
                if getattr(el, "name", None) == "span" and any(c.startswith("ver") for c in el.get("class", [])) and VID.match(el.get("id", "")):
                    m = VID.match(el.get("id", ""))
                    current = (ORDER[int(m.group(1)) - 1], int(m.group(2)), int(m.group(3))) if m else None
                    continue
                txt = el.get_text() if hasattr(el, "get_text") else str(el)
                if current and txt:
                    b, c, v = current
                    d = books.setdefault(b, {}).setdefault(str(c), {})
                    d[str(v)] = (d.get(str(v), "") + txt)
            if current:  # paragraph/line break counts as a space
                b, c, v = current
                d = books.setdefault(b, {}).setdefault(str(c), {})
                d[str(v)] = d.get(str(v), "") + " "
    for b in books.values():
        for c in b.values():
            for v in c:
                c[v] = re.sub(r"\s+", " ", c[v]).strip()
    bundle = {"id": "NKJV", "lang": "en", "name": "New King James Version", "private": True,
              "license": "NOT LICENSED YET. HarperCollins/Thomas Nelson. Private use only. Do not share.",
              "books": books}
    json.dump(bundle, open(out, "w", encoding="utf8"), ensure_ascii=False)
    n = sum(len(c) for b in books.values() for c in b.values())
    print(f"{len(books)} books, {sum(len(b) for b in books.values())} chapters, {n} verses")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
