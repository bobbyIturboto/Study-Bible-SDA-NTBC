#!/usr/bin/env python3
"""Import the 'Seventh-day Adventist Bible Students' Source Book' (pdftotext output) into data/SOURCEBOOK.json.
PRIVATE USE ONLY (copyrighted). Entries are anchored on their 'SOURCE:' lines (heading = the lines just above it),
because the printed numbering has gaps and glitches. Bible references are parsed and validated against NKJV.json.
Usage: pdftotext -layout? no: plain  ->  python3 import_sourcebook.py sb.txt data/NKJV.json data/SOURCEBOOK.json"""
import sys, re, json
from collections import Counter

BOOKS = {  # abbreviations used in the Source Book -> canonical code
 "Gen":"GEN","Genesis":"GEN","Ex":"EXO","Exod":"EXO","Exodus":"EXO","Lev":"LEV","Leviticus":"LEV","Num":"NUM","Numbers":"NUM",
 "Deut":"DEU","Deuteronomy":"DEU","Josh":"JOS","Joshua":"JOS","Judg":"JDG","Judges":"JDG","Ruth":"RUT",
 "1 Sam":"1SA","2 Sam":"2SA","1 Kings":"1KI","2 Kings":"2KI","1 Kgs":"1KI","2 Kgs":"2KI","1 Chron":"1CH","2 Chron":"2CH","1 Chr":"1CH","2 Chr":"2CH",
 "Ezra":"EZR","Neh":"NEH","Nehemiah":"NEH","Esther":"EST","Esth":"EST","Job":"JOB","Ps":"PSA","Psalm":"PSA","Psalms":"PSA","Prov":"PRO","Proverbs":"PRO",
 "Eccl":"ECC","Ecclesiastes":"ECC","Song of Solomon":"SNG","Song":"SNG","Isa":"ISA","Isaiah":"ISA","Jer":"JER","Jeremiah":"JER","Lam":"LAM",
 "Ezek":"EZK","Ezekiel":"EZK","Dan":"DAN","Daniel":"DAN","Hos":"HOS","Hosea":"HOS","Joel":"JOL","Amos":"AMO","Obad":"OBA","Jonah":"JON",
 "Micah":"MIC","Mic":"MIC","Nahum":"NAM","Nah":"NAM","Hab":"HAB","Habakkuk":"HAB","Zeph":"ZEP","Hag":"HAG","Haggai":"HAG","Zech":"ZEC","Mal":"MAL","Malachi":"MAL",
 "Matt":"MAT","Matthew":"MAT","Mark":"MRK","Luke":"LUK","John":"JHN","Acts":"ACT","Rom":"ROM","Romans":"ROM",
 "1 Cor":"1CO","2 Cor":"2CO","Gal":"GAL","Eph":"EPH","Phil":"PHP","Col":"COL","1 Thess":"1TH","2 Thess":"2TH","1 Tim":"1TI","2 Tim":"2TI",
 "Titus":"TIT","Philem":"PHM","Heb":"HEB","Hebrews":"HEB","James":"JAS","Jas":"JAS","1 Peter":"1PE","2 Peter":"2PE","1 Pet":"1PE","2 Pet":"2PE",
 "1 John":"1JN","2 John":"2JN","3 John":"3JN","Jude":"JUD","Rev":"REV","Revelation":"REV"}
ROMAN = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,"XI":11,"XII":12,"XIII":13,"XIV":14,"XV":15,"XVI":16,"XVII":17,"XVIII":18,
         "XIX":19,"XX":20,"XXI":21,"XXII":22,"XXIII":23,"XXIV":24,"XXV":25,"XXVI":26,"XXVII":27,"XXVIII":28}
NAMES = "|".join(sorted((re.escape(k).replace(r"\ ", r"\s") for k in BOOKS), key=len, reverse=True))
NORM = {re.sub(r"\s+", " ", k): v for k, v in BOOKS.items()}
VS = r"\d{1,3}(?:[a-c])?(?:\s?[-–—]\s?\d{1,3})?(?:\s?,\s?\d{1,3}(?:\s?[-–—]\s?\d{1,3})?)*"
# 'Dan. 11:2', 'Dan. 11:2, 3', then '; Rev. 13:1' or '; 14:6' (inherit book)
ARAB = re.compile(rf"(?<![\w])(?:(?P<b>{NAMES})\.?\s)?(?P<c>\d{{1,3}}):(?P<v>{VS})")
ROM_REF = re.compile(rf"(?<![\w])(?P<b>{NAMES})\.?\s(?P<c>[IVXL]{{1,6}}),\s?(?P<v>{VS})")
SRC = re.compile(r"^SOURCES?(?! BOOK)\b[: ]")
HEAD = re.compile(r"^(\d{1,4})\.?\s+(\S.*)$")
PAGE = re.compile(r"\s*\[p\. ?\d+\]\s*")

def vlist(spec):
    out = []
    for part in re.split(r"\s?,\s?", spec):
        part = re.sub(r"[a-c]$", "", part.strip())
        m = re.match(r"(\d+)\s?[-–—]\s?(\d+)$", part)
        if m and 0 <= int(m.group(2)) - int(m.group(1)) <= 80: out += range(int(m.group(1)), int(m.group(2)) + 1)
        elif part.isdigit(): out.append(int(part))
    return out

def parse_refs(text, bible):
    """-> list of (start, end, [ids]) for every valid reference in text (valid = verse exists in NKJV)."""
    spans, book = [], None
    for m in sorted([*ARAB.finditer(text), *ROM_REF.finditer(text)], key=lambda m: m.start()):
        if spans and m.start() < spans[-1][1]: continue
        roman = "c" in m.groupdict() and m.group("c")[0] in "IVXL"
        if m.group("b"):
            book = NORM.get(re.sub(r"\s+", " ", m.group("b")))
        elif not (book and text[max(0, m.start() - 2):m.start()] in ("; ", ", ", ";") ):
            continue
        if not book: continue
        ch = ROMAN.get(m.group("c")) if roman else int(m.group("c"))
        if not ch: continue
        ids = [f"{book}.{ch}.{v}" for v in vlist(m.group("v"))]
        ids = [i for i in ids if i.split(".")[2] in bible.get(book, {}).get(str(ch), {})]
        if ids: spans.append((m.start(), m.end(), ids))
    return spans

def paragraphs(lines):
    """Join wrapped lines into paragraphs: blank line = break; a short line ending in terminal punctuation followed by an indent-less
    capital also breaks when the previous line is clearly short."""
    paras, cur = [], []
    for l in lines:
        if not l.strip():
            if cur: paras.append(cur); cur = []
        else: cur.append(l.strip())
    if cur: paras.append(cur)
    return paras

def main(txt, nkjv, out):
    bible = json.load(open(nkjv, encoding="utf8"))["books"]
    L = open(txt, encoding="utf8").read().replace("\f", "\n").split("\n")
    # corpus word frequency for de-hyphenation
    freq = Counter(w.lower() for l in L for w in re.findall(r"[A-Za-z]+", l))
    src_at = [i for i, l in enumerate(L) if SRC.match(l)]
    # index of authors/sources at the end: cut after the last body paragraph = the last SOURCE entry's body ends at 'Index'
    starts = []
    for k in src_at:      # heading = non-blank lines directly above (max 3), until a blank line
        j, t = k - 1, []
        while j >= 0 and L[j].strip() == "" and k - j < 3: j -= 1   # tolerate one blank between title and SOURCE
        while j >= 0 and L[j].strip() and len(t) < 3:
            t.insert(0, L[j].strip()); j -= 1
            if HEAD.match(t[0]): break
        starts.append((j + 1, t))
    entries, expected = [], 0
    for idx, k in enumerate(src_at):
        hstart, t = starts[idx]
        end = starts[idx + 1][0] - len(starts[idx + 1][1]) if idx + 1 < len(src_at) else len(L)
        end = max(end, k + 1)
        while t and not HEAD.match(t[0]) and len(t) > 1: t.pop(0)   # keep only from the numbered line when present
        title = " ".join(t)
        m = HEAD.match(title)
        num = int(m.group(1)) if m else None
        if m: title = m.group(2)
        # the source citation: from the SOURCE line to the next blank line
        s, j = [], k
        while j < len(L) and L[j].strip(): s.append(L[j].strip()); j += 1
        source = re.sub(r"^SOURCES?:?\s*", "", " ".join(s))
        body = L[j:end]
        # a trailing page of the next heading may leak: cut at a numbered heading line that is the next entry's title
        if idx + 1 < len(src_at):
            body = L[j:starts[idx + 1][0]]
        expected = num if num else expected + 1
        entries.append({"n": expected, "t": re.sub(r"\s+", " ", title).strip(), "s": source, "raw": body})
    # the author index sits after the last entry: drop trailing body lines from 'Index' on
    last = entries[-1]["raw"]
    for i, l in enumerate(last):
        if re.match(r"^\s*(INDEX|Index of|AUTHORS?|Index)\b", l) and i > 3: entries[-1]["raw"] = last[:i]; break
    totals = Counter()
    for e in entries:
        paras = []
        for ls in paragraphs(e.pop("raw")):
            text = ""
            for l in ls:
                if text.endswith("-") and re.match(r"[a-z]", l):      # dehyphenate when the joined word exists elsewhere
                    a = re.search(r"([A-Za-z]+)-$", text)
                    joined = (a.group(1) + re.match(r"[A-Za-z]+", l).group(0)).lower() if a else ""
                    text = text[:-1] + l if freq[joined] >= 2 else text + l
                else: text = (text + " " + l) if text else l
            text = PAGE.sub(" ", text).strip()
            if text and not re.fullmatch(r"\d{1,4}", text): paras.append(text)
        e["p"], refs = [], []
        for text in paras:
            spans, runs, pos = parse_refs(text, bible), [], 0
            for a, b, ids in spans:
                if a > pos: runs.append(text[pos:a])
                runs.append([text[a:b], "|".join(ids)]); refs += ids; pos = b
            if pos < len(text): runs.append(text[pos:])
            e["p"].append(runs if spans else text)
            totals["refs"] += len(spans)
        e["r"] = list(dict.fromkeys(refs))
        e["see"] = [int(x) for x in re.findall(r"[Ss]ee (?:also )?(?:No\. )?(\d{1,4})\b", " ".join(p if isinstance(p, str) else "".join(x if isinstance(x, str) else x[0] for x in p) for p in e["p"]))]
        e["id"] = len([1 for _ in ()])  # placeholder, replaced below
    for i, e in enumerate(entries): e["id"] = i + 1
    json.dump({"id": "SOURCEBOOK", "lang": "en", "private": True,
               "license": "Seventh-day Adventist Bible Students' Source Book, Review and Herald. NOT LICENSED YET. Private use only.",
               "sb": {"entries": entries}}, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(entries)} entries, {totals['refs']} linked references, {sum(1 for e in entries if e['r'])} entries with Bible verses")

if __name__ == "__main__":
    main(*sys.argv[1:4])
