#!/usr/bin/env python3
"""Convert a White Estate EPUB into an app bundle (PRIVATE USE ONLY, see license note).
Usage: python3 import_egw_epub.py Book.epub CODE "Title" lang out.json
Paragraph IDs follow the official rule: page.N, where N counts paragraphs that BEGIN on that page.
"""
import sys, re, json, zipfile
import warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

NAMES = """GEN Genesis|EXO Exodus|LEV Leviticus|NUM Numbers|DEU Deuteronomy|JOS Joshua|JDG Judges|RUT Ruth|1SA 1 Samuel|2SA 2 Samuel|1KI 1 Kings|2KI 2 Kings|1CH 1 Chronicles|2CH 2 Chronicles|EZR Ezra|NEH Nehemiah|EST Esther|JOB Job|PSA Psalms,Psalm|PRO Proverbs|ECC Ecclesiastes|SNG Song of Solomon,Song of Songs,Canticles|ISA Isaiah|JER Jeremiah|LAM Lamentations|EZK Ezekiel|DAN Daniel|HOS Hosea|JOL Joel|AMO Amos|OBA Obadiah|JON Jonah|MIC Micah|NAM Nahum|HAB Habakkuk|ZEP Zephaniah|HAG Haggai|ZEC Zechariah|MAL Malachi|MAT Matthew|MRK Mark|LUK Luke|JHN John|ACT Acts|ROM Romans|1CO 1 Corinthians|2CO 2 Corinthians|GAL Galatians|EPH Ephesians|PHP Philippians|COL Colossians|1TH 1 Thessalonians|2TH 2 Thessalonians|1TI 1 Timothy|2TI 2 Timothy|TIT Titus|PHM Philemon|HEB Hebrews|JAS James|1PE 1 Peter|2PE 2 Peter|1JN 1 John|2JN 2 John|3JN 3 John|JUD Jude|REV Revelation,Revelation of John"""
BOOK = {}
for item in NAMES.split("|"):
    code, rest = item.split(" ", 1)
    for n in rest.split(","):
        BOOK[n.lower()] = code
# common abbreviations seen in running text
for a, c in {"matt": "MAT", "rom": "ROM", "gen": "GEN", "exod": "EXO", "ps": "PSA", "isa": "ISA", "rev": "REV"}.items():
    BOOK[a] = c

def verses_from(spec):
    """'37, 38' / '3-5' / '1, 3-5' -> [37, 38] ... Cross-chapter pieces are ignored."""
    out = []
    spec = spec.split(":")[0] if spec.count(":") else spec
    for part in re.split(r"[,;]", spec):
        part = part.strip().replace("–", "-").replace("—", "-")
        m = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
        if m and 0 <= int(m.group(2)) - int(m.group(1)) <= 200:
            out += list(range(int(m.group(1)), int(m.group(2)) + 1))
        elif re.match(r"^\d+$", part):
            out.append(int(part))
    return out

def parse_ref(title, shown):
    """title like 'Acts 2:37', shown like 'Acts 2:37, 38'. Returns list of canonical verse ids, or ['BOOK.ch'] for chapter-only."""
    m = re.match(r"^\s*((?:[123]\s)?[A-Za-z][A-Za-z ]+?)\s+(\d+)(?::(.+))?\s*$", title or "")
    if not m or m.group(1).lower().strip() not in BOOK:
        return []
    code, ch = BOOK[m.group(1).lower().strip()], int(m.group(2))
    spec = m.group(3)
    s = re.search(r"\b%d:\s*([\d,\s\-–—]+)" % ch, shown or "")
    if s:
        spec = s.group(1)
    if not spec:
        return [f"{code}.{ch}"]
    vs = verses_from(spec) or ([int(re.match(r"\d+", spec).group())] if re.match(r"\d+", spec) else [])
    return [f"{code}.{ch}.{v}" for v in vs] or [f"{code}.{ch}"]

def spine(z):
    opf = [n for n in z.namelist() if n.endswith(".opf")][0]
    base = opf.rsplit("/", 1)[0] + "/" if "/" in opf else ""
    soup = BeautifulSoup(z.read(opf), "xml")
    man = {i["id"]: i["href"] for i in soup.find_all("item")}
    return [base + man[r["idref"]] for r in soup.find_all("itemref") if r["idref"] in man]

def convert(path, code, title, lang):
    z = zipfile.ZipFile(path)
    page, count, paras, chapter, unparsed = 0, {}, [], "", []
    for name in spine(z):
        if not re.search(r"content\d+", name):
            continue  # skip cover, toc, about pages
        soup = BeautifulSoup(z.read(name), "lxml")
        for el in soup.find_all(["h1", "h2", "h3", "h4", "p"]):
            if el.name != "p":
                chapter = el.get_text(" ", strip=True)
                for pb in el.select("span.pagebreak"):
                    page = int(pb.get("title") or page)
                continue
            refs, started, pending_page = [], False, page
            for pb in el.select("span.pagebreak"):  # replace page markers, tracking where they fall
                pb.replace_with(f"\uE000{pb.get('title')}\uE001")
            for sp in el.select("span.bible-kjv"):
                got = parse_ref(sp.get("title"), sp.get_text())
                (refs.extend(got) if got else unparsed.append(sp.get("title")))
            txt = el.get_text()
            # page markers before any text move the start page; later ones only affect following paragraphs
            lead = re.match(r"^\s*((?:\uE000\d+\uE001\s*)+)", txt)
            if lead:
                page = int(re.findall(r"\uE000(\d+)\uE001", lead.group(1))[-1])
            start_page = page
            for p in re.findall(r"\uE000(\d+)\uE001", txt[lead.end():] if lead else txt):
                page = int(p)
            clean = re.sub(r"\s*\uE000\d+\uE001\s*", " ", txt).strip()
            clean = re.sub(r"\s+", " ", clean)
            if not clean or start_page == 0:
                continue
            count[start_page] = count.get(start_page, 0) + 1
            paras.append({"id": f"{code} {start_page}.{count[start_page]}", "page": start_page,
                          "chapter": chapter, "kind": " ".join(el.get("class", [])) or "p",
                          "text": clean, "refs": list(dict.fromkeys(refs))})
    return {"id": code, "lang": lang, "title": title,
            "license": "EGW Writings EULA: personal use only. Do not redistribute.",
            "paras": paras}, unparsed

if __name__ == "__main__":
    epub, code, title, lang, out = sys.argv[1:6]
    bundle, bad = convert(epub, code, title, lang)
    json.dump(bundle, open(out, "w", encoding="utf8"), ensure_ascii=False)
    n = sum(len(p["refs"]) for p in bundle["paras"])
    print(f"{code}: {len(bundle['paras'])} paragraphs, {n} verse links, {len(bad)} refs not parsed")
    if bad:
        print("  e.g.", sorted(set(bad))[:8])
