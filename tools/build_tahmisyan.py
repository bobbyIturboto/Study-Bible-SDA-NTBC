#!/usr/bin/env python3
"""Extract topics and Bible references from 'Основни учения на Библията' (Agop Tahmisyan, 2018).
The book is copyrighted (written consent of the author needed to publish): PRIVATE USE ONLY.
Usage: python3 build_tahmisyan.py book.pdf out_chapters.json
Output keeps the Bulgarian text, English titles, and verse ids parsed from the in-text references."""
import sys, re, json, subprocess

# (start page, Bulgarian title, English title). Digit-for-letter glitches in the PDF titles are fixed here by hand.
TOC = [
 (5, "Въведение", "Introduction"), (7, "Има ли Бог", "Is there a God?"), (13, "Библията", "The Bible"),
 (19, "Вяра и религия", "Faith and religion"), (25, "Бъдещето на света", "The future of the world"),
 (32, "Второто пришествие", "The Second Coming"), (38, "Белези на последното време", "Signs of the last days"),
 (45, "Хилядогодишнината (милениумът)", "The Millennium"), (52, "Новият свят", "The new world"),
 (58, "Спасителният план", "The plan of salvation"), (66, "Най-важният въпрос", "The most important question"),
 (73, "Божият закон", "God's law"), (82, "Оправдание чрез вяра", "Justification by faith"),
 (87, "Почивният ден", "The day of rest (Sabbath)"), (93, "„Аргументи“ в полза на неделята", "Arguments for Sunday"),
 (99, "Практическо освещаване на съботата", "Keeping the Sabbath in practice"),
 (104, "Как е въведен неделният празник", "How Sunday observance was introduced"),
 (111, "Божият печат и белегът на звяра", "God's seal and the mark of the beast"),
 (118, "Състоянието на мъртвите", "The state of the dead"), (125, "Ад, пъкъл, рай", "Hell and paradise"),
 (133, "Произход на злото", "The origin of evil"), (141, "Спиритизъм", "Spiritualism"),
 (149, "Светилище и свещенство", "The sanctuary and priesthood"), (156, "Изследователният съд", "The investigative judgment"),
 (163, "2 300 денонощия", "The 2,300 days"), (170, "Адвентизъм", "Adventism"),
 (177, "Тройната ангелска вест", "The three angels' messages"), (183, "Белези на истинската църква", "Marks of the true church"),
 (189, "Духът на пророчеството", "The Spirit of prophecy"), (197, "Здравословен живот", "Healthful living"),
 (205, "Библейско кръщение", "Biblical baptism"), (210, "Светото причастие", "Holy Communion"),
 (215, "Молитвата", "Prayer"), (220, "Библейският пост", "Biblical fasting"), (226, "Дар за Господа", "Gifts for the Lord (tithes and offerings)"),
 (232, "Християнски образци", "Christian standards"), (237, "Християнски социални отношения", "Christian social relationships"),
 (243, "Божието триединство", "The Godhead (Trinity)"), (249, "Светият Дух", "The Holy Spirit"),
 (256, "Еволюция или сътворение", "Evolution or creation"), (263, "Езици, ръкописи и канон на Библията", "Languages, manuscripts and canon of the Bible"),
]
END_PAGE = 268

BG = {  # Bulgarian book names (full and abbreviated forms used in the text) -> canonical code
 "Битие": "GEN", "Изход": "EXO", "Левит": "LEV", "Числа": "NUM", "Второзаконие": "DEU", "Исус Навин": "JOS", "Съдии": "JDG", "Рут": "RUT",
 "1 Царе": "1SA", "2 Царе": "2SA", "3 Царе": "1KI", "4 Царе": "2KI", "1 Летописи": "1CH", "2 Летописи": "2CH", "Ездра": "EZR", "Неемия": "NEH",
 "Естир": "EST", "Йов": "JOB", "Псалми": "PSA", "Псалом": "PSA", "Притчи": "PRO", "Еклисиаст": "ECC", "Песен": "SNG", "Исая": "ISA", "Йеремия": "JER",
 "Пл. Йеремия": "LAM", "Йезекиил": "EZK", "Даниил": "DAN", "Осия": "HOS", "Йоил": "JOL", "Амос": "AMO", "Авдий": "OBA", "Йона": "JON",
 "Михей": "MIC", "Наум": "NAM", "Авакум": "HAB", "Софония": "ZEP", "Агей": "HAG", "Захария": "ZEC", "Малахия": "MAL",
 "Матей": "MAT", "Марк": "MRK", "Лука": "LUK", "Йоан": "JHN", "Деяния": "ACT", "Яков": "JAS", "1 Петър": "1PE", "2 Петър": "2PE",
 "1 Йоан": "1JN", "2 Йоан": "2JN", "3 Йоан": "3JN", "Юда": "JUD", "Римляни": "ROM", "1 Коринтяни": "1CO", "2 Коринтяни": "2CO",
 "Галатяни": "GAL", "Ефесяни": "EPH", "Филипяни": "PHP", "Колосяни": "COL", "1 Солуняни": "1TH", "2 Солуняни": "2TH", "1 Солунци": "1TH", "2 Солунци": "2TH",
 "1 Тимотей": "1TI", "2 Тимотей": "2TI", "Тит": "TIT", "Филимон": "PHM", "Евреи": "HEB", "Откровение": "REV"}
NAME = "|".join(sorted((re.escape(k).replace(r"\ ", r"\s?") for k in BG), key=len, reverse=True))
REF = re.compile(rf"(?:(?P<n>{NAME})\s?)?(?P<ch>\d{{1,3}}):(?P<vs>\d{{1,3}}(?:\s?[-–]\s?\d{{1,3}})?(?:\s?,\s?\d{{1,3}}(?:\s?[-–]\s?\d{{1,3}})?)*)")
NORM = {re.sub(r"\s", "", k): v for k, v in BG.items()}

def verses(spec):
    out = []
    for part in re.split(r"\s?,\s?", spec):
        m = re.match(r"(\d+)\s?[-–]\s?(\d+)$", part.strip())
        if m and 0 <= int(m.group(2)) - int(m.group(1)) <= 60:
            out += range(int(m.group(1)), int(m.group(2)) + 1)
        elif part.strip().isdigit():
            out.append(int(part))
    return out

def refs_in(text):
    ids, unknown, book = [], 0, None
    for m in REF.finditer(text):
        if m.group("n"):
            book = NORM.get(re.sub(r"\s", "", m.group("n")))
        elif not (book and text[max(0, m.start() - 2):m.start()] in ("; ", ", ", ";")):
            continue  # a bare 12:30 is a time or something else
        if not book:
            unknown += 1; continue
        ids += [f"{book}.{m.group('ch')}.{v}" for v in verses(m.group("vs"))]
    return list(dict.fromkeys(ids)), unknown

def clean(page):
    page = re.sub(r"3(?=[а-я])", "З", page)   # the PDF prints some Cyrillic З as the digit 3 (3акон, 3ахария)
    t = re.sub(r"-\n\s*", "", page)           # join words hyphenated at line ends
    t = re.sub(r"\s*\n\s*", " ", t)
    return re.sub(r"\s{2,}", " ", t).strip()

def main(pdf, out):
    raw = subprocess.run(["pdftotext", pdf, "-"], capture_output=True, text=True).stdout.split("\f")
    chapters = []
    for i, (start, bg, en) in enumerate(TOC):
        end = (TOC[i + 1][0] - 1) if i + 1 < len(TOC) else END_PAGE
        text = " ".join(clean(raw[p - 1]) for p in range(start, end + 1) if p - 1 < len(raw))
        ids, unk = refs_in(text)
        chapters.append({"n": i + 1, "pages": [start, end], "bg": bg, "en": en, "verses": ids, "text_bg": text, "unmapped_refs": unk})
    json.dump(chapters, open(out, "w", encoding="utf8"), ensure_ascii=False)
    for c in chapters:
        print(f"{c['n']:2} p{c['pages'][0]:>3}-{c['pages'][1]:<3} {c['en'][:42]:42} {len(c['verses']):4} verses  ({len(c['text_bg'])//1000}k chars, unmapped {c['unmapped_refs']})")

def expand(r):
    """'EXO.16.14-31' -> list of verse ids"""
    b, c, v = r.split(".")
    if "-" in v:
        a, z = v.split("-"); return [f"{b}.{c}.{x}" for x in range(int(a), int(z) + 1)]
    return [r]

def emit(chapters_json, curated_json, out):
    """Topic bundle for the app: one topic per chapter (verses parsed automatically; English note when I have written it) plus curated sub-topics."""
    ch, cur, T = json.load(open(chapters_json, encoding="utf8")), json.load(open(curated_json, encoding="utf8")), {}
    src = "Agop Tahmisyan, Fundamental Teachings of the Bible (Основни учения на Библията), 6th ed., 2018"
    for c in ch:
        k = cur.get(str(c["n"]), {})
        T[c["en"]] = {"refs": c["verses"], "see": [], "bg": c["bg"], "note": k.get("note"), "src": f"{src}, pp. {c['pages'][0]}-{c['pages'][1]}", "status": "draft translation" if k.get("note") else "not translated yet"}
        for name, v in k.get("subtopics", {}).items():
            T[name] = {"refs": [i for r in v["refs"] for i in expand(r)], "see": [c["en"]], "bg": c["bg"], "note": v["note"], "src": T[c["en"]]["src"], "status": "draft translation"}
        if k.get("subtopics"):
            T[c["en"]]["see"] = list(k["subtopics"])
    json.dump({"id": "TOPICS-TAHMISYAN", "lang": "en", "private": True,
               "license": "Book is copyrighted (author's written consent needed to publish). English notes are my draft translations/summaries. Private use only.",
               "topics": T}, open(out, "w", encoding="utf8"), ensure_ascii=False)
    print(f"{len(T)} topics, {sum(len(t['refs']) for t in T.values())} verse links, {sum(1 for t in T.values() if t['note'])} with English notes")

if __name__ == "__main__":
    if sys.argv[1] == "emit":
        emit(*sys.argv[2:5])
    else:
        main(sys.argv[1], sys.argv[2])
