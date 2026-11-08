#!/usr/bin/env python3
"""Build an offline topic index from the NKJV Study Bible EPUB (Subject Index + thematic lists).
Every reference in that EPUB is an anchor like href="...#v43015004", so no guessing is needed.
PRIVATE USE ONLY (copyrighted). Usage: python3 build_topics.py NKJV_Study_Bible.epub data/NKJV.json data/TOPICS-NKJV.json"""
import sys, re, json, zipfile, warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from import_nkjv_epub import ORDER

HREF = re.compile(r"#v(\d{2})(\d{3})(\d{3})$")
FILES = {  # file -> kind
    "hcp-nkjvsb18-0353.xhtml": "Subject", "hcp-nkjvsb18-0354.xhtml": "Subject",
    "hcp-nkjvsb18-0347.xhtml": "Teachings of Christ", "hcp-nkjvsb18-0351.xhtml": "Prayers of the Bible",
    "hcp-nkjvsb18-0348.xhtml": "Messianic prophecies", "hcp-nkjvsb18-0349.xhtml": "Parables of Jesus",
    "hcp-nkjvsb18-0350.xhtml": "Miracles of Jesus"}

def expand(a, bible, topics_cache={}):
    m = HREF.search(a.get("href", ""))
    if not m:
        return []
    book, ch, v = ORDER[int(m.group(1)) - 1], int(m.group(2)), int(m.group(3))
    shown = a.get_text()
    end = v
    r = re.search(r"[–-]\s*(?:(\d+):)?(\d+)\s*$", shown)  # '2–5' or '1:1–2:3'
    if r and not r.group(1):
        end = int(r.group(2))
    last = max((int(k) for k in bible.get(book, {}).get(str(ch), {"1": 1})), default=v)
    end = min(max(end, v), last, v + 120)
    return [f"{book}.{ch}.{x}" for x in range(v, end + 1)]

def add(T, name, refs, see=()):
    name = re.sub(r"\s+", " ", name).strip(" :;,—-")
    if not name:
        return
    t = T.setdefault(name, {"refs": [], "see": []})
    t["refs"] += [r for r in refs if r not in t["refs"]]
    t["see"] += [s for s in see if s not in t["see"]]

def main(epub, nkjv, out):
    bible = json.load(open(nkjv, encoding="utf8"))["books"]
    z = zipfile.ZipFile(epub)
    T = {}
    for fname, kind in FILES.items():
        soup = BeautifulSoup(z.read("OEBPS/" + fname), "lxml")
        main_topic = None
        for p in soup.find_all("p"):
            cls = p.get("class", [""])[0]
            anchors = [a for a in p.find_all("a", class_="xbr")]
            refs = [r for a in anchors for r in expand(a, bible)]
            if kind == "Subject":
                if cls == "in":  # main heading
                    main_topic = p.get_text(" ", strip=True); add(T, main_topic, [])
                elif cls in ("in1", "in2") and main_topic:
                    see = [a.get_text(strip=True) for a in p.find_all("a", class_="xref")]
                    label = p.get_text(" ", strip=True)
                    label = re.split(r"\s+(?=[1-3]?\s?[A-Z][a-z]*\.?\s\d)", label, 1)[0].rstrip(",: ") if anchors else ""
                    if anchors and label and not label.lower().startswith("(see"):
                        add(T, f"{main_topic} › {label}", refs)
                    add(T, main_topic, refs, see)
            else:
                if not anchors:
                    continue
                label = p.get_text(" ", strip=True).split(anchors[0].get_text(strip=True))[0].rstrip(": —-")
                if label:
                    add(T, label, refs)
                    add(T, kind, refs)           # list-level topic, e.g. "Parables of Jesus"
                    add(T, f"{kind} › {label}", refs)
    T = {k: v for k, v in T.items() if v["refs"] or v["see"]}
    json.dump({"id": "TOPICS-NKJV", "lang": "en", "private": True,
               "license": "NKJV Study Bible, HarperCollins/Thomas Nelson. NOT LICENSED YET. Private use only.",
               "topics": T}, open(out, "w", encoding="utf8"), ensure_ascii=False)
    print(f"{len(T)} topics, {sum(len(v['refs']) for v in T.values())} verse links")

if __name__ == "__main__":
    main(*sys.argv[1:4])
