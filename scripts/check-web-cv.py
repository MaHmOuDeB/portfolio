"""Checks the web CV PDF before it is published, and fails closed on anything it cannot prove.

    python3 scripts/check-web-cv.py PDF [options]

Options:
  --claims-out PATH     write the parsed claims as {"claims": [{"id", "normalizedClaim"}]} to PATH,
                        which must lie outside this repository
  --manifest PATH       the claim layout (default scripts/cv/claim-layout.json)
  --records PATH        the numeral approval records (default scripts/cv/numeral-allowlist.json)
  --facts PATH          the generated facts module (default src/lib/facts/facts.generated.ts)
  --expect-sha256 HEX   fail unless the PDF's SHA-256 is HEX
  --meta PATH           check the PDF's metadata file ({"sha256", "renderedAt", "web": true})
  --lint-only           only the text, metadata and link checks: no layout and no numeral rule
  --if-present         an absent PDF passes (checker-only mode) instead of failing

What it checks, on the text pdftotext -layout extracts, the document metadata pdfinfo reports and
every link and action inside the file (compressed object streams included):

- privacy: no phone number, street address with a house number, postcode with a city, residence or
  work-authorisation term, or "tel:" link; no deny-list term (TRUTH_DENYLIST, one term per line,
  required whenever a PDF is checked, reported by its 1-based index only);
- wording: no banned phrase, no significance threshold, no German level above B1, no page-number
  footer;
- links: only https and mailto links, each listed in the manifest's "links"; no JavaScript, launch,
  form, embedded-file or other active content, no annotation other than a link, no encryption;
- structure: every section, entry and claim of the manifest is found once, in order, on its page,
  with its bullet marker; a page continuation only where the manifest declares it;
- numerals: every numeral (digits or a number word) that is not a date, a year or a CEFR level is
  covered by exactly one approval record bound to that exact claim, subject and span; a figure from
  the facts must print as that fact's display.

Findings name the rule and where it fired (page, line, claim id, span), never the matched text.
Exit 0 when every check passes, 1 on any finding or when the PDF cannot be inspected, 2 on usage.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
import zlib
from pathlib import Path

NAME = "check-web-cv"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "scripts/cv/claim-layout.json"
DEFAULT_RECORDS = ROOT / "scripts/cv/numeral-allowlist.json"
DEFAULT_FACTS = ROOT / "src/lib/facts/facts.generated.ts"

BULLETS = set("•◦▪▫●○■□‣⁃∙·*-–—")
ID = re.compile(r"^[a-z][a-z0-9-]*$")
INVISIBLE = re.compile("[​-‍⁠﻿­]")
MONTHS = {
    m.lower()
    for m in "Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec January February March April June July "
    "August September October November December".split()
}
YEAR_PREFIX_WORDS = {"in", "since", "from", "until"}
YEAR_NEXT_WORDS = {"as", "and", "or", "with", "for", "at", "on", "when", "after", "before", "to", "the", "a", "an", "i", "we"}
LANGUAGES = (
    "English|German|French|Arabic|Spanish|Italian|Portuguese|Dutch|Deutsch|Englisch|Französisch|Arabisch|Spanisch"
)
LANGUAGE = re.compile(rf"\b(?:{LANGUAGES})\b", re.I)

DIGIT_TOKEN = re.compile(r"\d+(?:[.,]\d+)*(?:\+|%|k(?![A-Za-z]))?(?:/\d+(?:[.,]\d+)*)?")
NUMBER_WORDS = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds thousand "
    "thousands million millions dozen dozens"
).split()
WORD_TOKEN = re.compile(rf"\b(?:{'|'.join(NUMBER_WORDS)})\b", re.I)

# Privacy and wording lints. Each is (rule id, pattern); they run on page text, claims, metadata and
# link targets after invisible characters are removed.
PHONE_PREFIXED = re.compile(r"(?:\+|\b00)\d[\d \t().\/-]{5,}\d")
PHONE_RUN = re.compile(r"\d[\d \t().\/-]{6,}\d")
STREET = [
    re.compile(r"\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|allee|platz|gasse|damm|chaussee)\s*\d{1,4}\s?[a-z]?\b"),
    re.compile(r"\b(?:Straße|Strasse|Str\.|Allee|Weg|Platz|Gasse|Damm|Ufer|Ring|Chaussee)\s+\d{1,4}[a-z]?\b"),
    re.compile(r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Lane|Boulevard|Blvd\.|Drive)\b"),
]
POSTCODE_CITY = re.compile(r"\b(?:D-)?\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+")
RESIDENCE = re.compile(
    r"\bvisa\b|\bwork[\s-]+permit|\bresidence[\s-]+permit|AufenthG|Aufenthalts\w*|Arbeitserlaubnis|"
    r"Beschäftigungserlaubnis|Niederlassungserlaubnis|Fiktionsbescheinigung|\bblue[\s-]+card\b|\bblaue[\s-]+karte\b|"
    r"\bauthori[sz]ed\s+to\s+work\b|\bwork\s+authori[sz]ation\b|\bright\s+to\s+work\b|\bsponsorship\b",
    re.I,
)
BANNED = re.compile(r"\bAI[\s\-‐-―−]*powered\b|\bpassionate\b|\brockstar\b", re.I)
SIGNIFICANCE = re.compile(
    r"\bp(?:[\s-]*value)?\s*[<≤=]\s*0?[.,]?\d|\bsignificance\s+(?:threshold|level)\b|\balpha\s*=|α\s*=", re.I
)
GERMAN_ABOVE_B1 = re.compile(
    r"\b(?:B2|C1|C2|fluent|native|proficient|advanced|business[\s-]+fluent|verhandlungssicher|fließend|"
    r"Muttersprache|Muttersprachler\w*)\b",
    re.I,
)
GERMAN_ABOVE_B1_BEFORE = re.compile(
    r"\b(?:B2|C1|C2|fluent|native|proficient|advanced|business[\s-]+fluent)\s+(?:in\s+)?(?:German|Deutsch)\b", re.I
)
PAGE_OF = re.compile(r"\b(?:Page|Seite)\s+\d+\s+(?:of|von)\s+\d+\b", re.I)
FOOTER_FRACTION = re.compile(r"(?:^|\s)\d+\s*/\s*\d+\s*$")

ACTIONS = (
    "Launch JavaScript GoToR GoToE SubmitForm ImportData ResetForm Hide Named Rendition Sound Movie "
    "RichMediaExecute SetOCGState Trans GoTo3DView Thread"
).split()
FORBIDDEN_KEYS = re.compile(
    rb"/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia\w*|AcroForm|XFA|AA|Encrypt|OpenAction)(?![A-Za-z0-9])"
)
ANNOT_SUBTYPES = (
    "Text FreeText FileAttachment Widget Screen Popup Sound Movie RichMedia Redact Stamp Ink Caret Highlight "
    "Underline Squiggly StrikeOut Line Square Circle Polygon PolyLine Watermark 3D TrapNet PrinterMark Projection"
).split()


class Fail(Exception):
    """A check that cannot run: the PDF, a tool or an input is missing or broken."""


def fail(msg: str) -> "Fail":
    return Fail(msg)


# ───────────────────────────── text helpers ─────────────────────────────
def clean(s: str) -> str:
    return INVISIBLE.sub("", unicodedata.normalize("NFC", s))


def collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def numeral_tokens(s: str) -> list[tuple[int, int]]:
    spans = [(m.start(), m.end()) for m in DIGIT_TOKEN.finditer(s)]
    spans += [(m.start(), m.end()) for m in WORD_TOKEN.finditer(s)]
    return sorted(spans)


def _prev_word(s: str, i: int) -> str:
    m = re.search(r"([A-Za-zÀ-ÿ]+)\W*$", s[:i])
    return m.group(1).lower() if m else ""


def _prev_char(s: str, i: int) -> str:
    t = s[:i].rstrip()
    return t[-1] if t else ""


def _next_char(s: str, j: int) -> str:
    t = s[j:].lstrip()
    return t[0] if t else ""


def _next_word(s: str, j: int) -> str:
    m = re.match(r"\s*([A-Za-zÀ-ÿ]+)", s[j:])
    return m.group(1).lower() if m else ""


def exempt(s: str, start: int, end: int) -> bool:
    """A date, a year or a CEFR level: the only numerals that need no approval record."""
    tok = s[start:end]
    if re.fullmatch(r"(?:19|20)\d\d", tok):
        prev_c, next_c = _prev_char(s, start), _next_char(s, end)
        if re.search(r"([A-Za-z]+)\.?\s+$", s[:start]) and _prev_word(s, start) in MONTHS:
            return True
        if prev_c in "(–—-" or next_c in "–—-)" or next_c == "":
            return True
        before = s[:start]
        if re.search(r"\b(?:in|since|from|until)\s+$", before, re.I):
            nxt = _next_word(s, end)
            if next_c in ".,;:" or nxt in YEAR_NEXT_WORDS:
                return True
        return False
    if re.fullmatch(r"(?:0?[1-9]|1[0-2])/(?:19|20)\d\d", tok):
        return True
    if re.fullmatch(r"(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d\d", tok):
        return True
    if re.fullmatch(r"0?[1-9]|[12]\d|3[01]", tok):
        if re.match(r"\s+([A-Za-z]+)\.?\s+(?:19|20)\d\d\b", s[end:]) and _next_word(s, end) in MONTHS:
            return True
    if tok in ("1", "2") and start >= 1 and s[start - 1] in "ABC":
        before_ok = start < 2 or not s[start - 2].isalnum()
        after_ok = end >= len(s) or not s[end].isalnum()
        if before_ok and after_ok and LANGUAGE.search(s[max(0, start - 41) : start - 1]):
            return True
    return False


# ───────────────────────────── lints ─────────────────────────────
def german_above_b1(s: str) -> bool:
    if GERMAN_ABOVE_B1_BEFORE.search(s):
        return True
    for m in re.finditer(r"\b(?:German|Deutsch)\b", s):
        tail = s[m.end() : m.end() + 25]
        nxt = LANGUAGE.search(tail)
        if nxt:
            tail = tail[: nxt.start()]
        if GERMAN_ABOVE_B1.search(tail):
            return True
    return False


def phone(s: str) -> bool:
    for pattern, minimum in ((PHONE_PREFIXED, 7), (PHONE_RUN, 9)):
        for m in pattern.finditer(s):
            if sum(c.isdigit() for c in m.group(0)) >= minimum:
                return True
    return bool(re.search(r"\btel:", s, re.I))


def lint(s: str, denylist: list[str]) -> list[str]:
    """Rule ids that fire on s (each once); a deny-list hit is 'denylist #i'."""
    s = clean(s)
    hits = []
    if phone(s):
        hits.append("phone")
    if any(p.search(s) for p in STREET):
        hits.append("street-address")
    if POSTCODE_CITY.search(s):
        hits.append("postcode-city")
    if RESIDENCE.search(s):
        hits.append("residence-term")
    if BANNED.search(s):
        hits.append("banned-phrase")
    if SIGNIFICANCE.search(s):
        hits.append("significance-threshold")
    if german_above_b1(s):
        hits.append("german-above-b1")
    if PAGE_OF.search(s):
        hits.append("page-footer")
    norm = collapse(s.lower())
    for i, term in enumerate(denylist):
        if term and term in norm:
            hits.append(f"denylist #{i + 1}")
    return hits


def parse_denylist(raw: str | None) -> list[str]:
    return [collapse(clean(t).lower()) for t in (raw or "").split("\n") if t.strip()]


# ───────────────────────────── PDF inspection ─────────────────────────────
def run_tool(args: list[str]) -> str:
    try:
        r = subprocess.run(args, capture_output=True, check=False, timeout=120)
    except FileNotFoundError:
        raise fail(f"{args[0]} not found (install poppler-utils)")
    except subprocess.TimeoutExpired:
        raise fail(f"{args[0]} timed out")
    if r.returncode != 0:
        raise fail(f"{args[0]} failed with exit code {r.returncode}: the PDF is unreadable or invalid")
    return r.stdout.decode("utf8", "replace")


def pdf_literal(data: bytes, i: int) -> tuple[bytes, int]:
    """The PDF literal string starting at data[i] == '(' and the index after it."""
    out, depth, i = bytearray(), 1, i + 1
    while i < len(data):
        c = data[i]
        if c == 0x5C:
            i += 1
            if i >= len(data):
                break
            e = data[i]
            simple = {0x6E: 0x0A, 0x72: 0x0D, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0C, 0x28: 0x28, 0x29: 0x29, 0x5C: 0x5C}
            if e in simple:
                out.append(simple[e])
            elif 0x30 <= e <= 0x37:
                digits = data[i : i + 3]
                m = re.match(rb"[0-7]{1,3}", digits)
                out.append(int(m.group(0), 8) & 0xFF)
                i += len(m.group(0)) - 1
            elif e in (0x0A, 0x0D):
                if e == 0x0D and data[i + 1 : i + 2] == b"\n":
                    i += 1
            else:
                out.append(e)
        elif c == 0x28:
            depth += 1
            out.append(c)
        elif c == 0x29:
            depth -= 1
            if depth == 0:
                return bytes(out), i + 1
            out.append(c)
        else:
            out.append(c)
        i += 1
    raise fail("unterminated string in the PDF")


def pdf_text_string(b: bytes) -> str:
    if b.startswith(b"\xfe\xff"):
        return b[2:].decode("utf-16-be", "replace")
    if b.startswith(b"\xef\xbb\xbf"):
        return b[3:].decode("utf8", "replace")
    return b.decode("latin-1")


def pdf_string_at(data: bytes, i: int) -> tuple[str, int] | None:
    while i < len(data) and data[i : i + 1].isspace():
        i += 1
    if data[i : i + 1] == b"(":
        b, j = pdf_literal(data, i)
        return pdf_text_string(b), j
    if data[i : i + 1] == b"<" and data[i : i + 2] != b"<<":
        j = data.find(b">", i)
        if j < 0:
            raise fail("unterminated hex string in the PDF")
        hexs = re.sub(rb"\s", b"", data[i + 1 : j])
        if len(hexs) % 2:
            hexs += b"0"
        try:
            return pdf_text_string(bytes.fromhex(hexs.decode("ascii"))), j + 1
        except ValueError:
            raise fail("malformed hex string in the PDF")
    return None


def decode_names(data: bytes) -> bytes:
    """Resolve #xx escapes inside PDF names, so /Java#53cript reads as /JavaScript."""
    return re.sub(
        rb"/[^\s/<>\[\]()%{}]+",
        lambda m: re.sub(rb"#([0-9A-Fa-f]{2})", lambda h: bytes([int(h.group(1), 16)]), m.group(0)),
        data,
    )


def object_bytes(data: bytes) -> tuple[bytes, list[str]]:
    """The PDF's object syntax with stream bodies removed and object streams inflated, plus the
    text of any XMP metadata stream."""
    if not data.startswith(b"%PDF-"):
        raise fail("not a PDF (no %PDF- header)")
    parts, xmp, pos = [], [], 0
    for m in re.finditer(rb"stream\r?\n", data):
        if m.start() < pos or data[max(0, m.start() - 3) : m.start()] == b"end":
            continue
        head_at = data.rfind(b"obj", 0, m.start())
        head = data[head_at : m.start()] if head_at >= 0 else b""
        end = data.find(b"endstream", m.end())
        if end < 0:
            raise fail("unterminated stream in the PDF")
        body = data[m.end() : end].rstrip(b"\r\n")
        parts.append(data[pos : m.start()])
        pos = end + len(b"endstream")
        head_n = decode_names(head)
        filters = re.findall(rb"/(\w+Decode)\b", head_n)
        is_objstm = re.search(rb"/Type\s*/ObjStm\b", head_n) is not None
        is_xmp = re.search(rb"/Type\s*/Metadata\b", head_n) is not None
        if not (is_objstm or is_xmp):
            continue
        if filters and filters != [b"FlateDecode"]:
            raise fail("an object or metadata stream uses a filter the checker cannot read")
        if filters and re.search(rb"/DecodeParms", head_n):
            raise fail("an object or metadata stream uses decode parameters the checker cannot read")
        try:
            inflated = zlib.decompressobj().decompress(body) if filters else body
        except zlib.error:
            raise fail("an object or metadata stream does not inflate")
        if is_objstm:
            parts.append(b"\n" + inflated + b"\n")
        else:
            xmp.append(inflated.decode("utf8", "replace"))
    parts.append(data[pos:])
    return decode_names(b"".join(parts)), xmp


def inspect_objects(data: bytes) -> tuple[list[str], list[str], list[str]]:
    """(problems, link targets, XMP texts) from the PDF's objects."""
    objs, xmp = object_bytes(data)
    problems = []
    for m in FORBIDDEN_KEYS.finditer(objs):
        problems.append(f"active or hidden content ({m.group(0).decode('latin-1')})")
    for m in re.finditer(rb"/S\s*/(\w+)", objs):
        if m.group(1).decode("latin-1") in ACTIONS:
            problems.append(f"action type not allowed ({m.group(1).decode('latin-1')})")
    for m in re.finditer(rb"/Subtype\s*/(\w+)", objs):
        if m.group(1).decode("latin-1") in ANNOT_SUBTYPES:
            problems.append(f"annotation type not allowed ({m.group(1).decode('latin-1')})")
    uris = []
    for m in re.finditer(rb"/URI(?![A-Za-z0-9])", objs):
        rest = objs[m.end() :].lstrip()
        if rest.startswith(b"/"):
            continue  # the action type in /S /URI; its target follows as the next /URI key
        got = pdf_string_at(objs, m.end())
        if got is None:
            problems.append("a link target the checker cannot read")
            continue
        uris.append(got[0])
    return sorted(set(problems)), uris, xmp


def pdfinfo_urls(pdf: Path) -> list[str]:
    out = run_tool(["pdfinfo", "-url", str(pdf)])
    urls = []
    for line in out.splitlines()[1:]:
        cols = line.split(None, 2)
        if len(cols) == 3:
            urls.append(cols[2].strip())
        elif line.strip():
            raise fail("pdfinfo -url printed a line the checker cannot read")
    return urls


def check_link(url: str, allowed: set[str] | None, denylist: list[str]) -> list[str]:
    problems = []
    if not re.match(r"^(?:https://|mailto:)[^\s]+$", url):
        problems.append("link scheme not allowed")
    for rule in lint(url, denylist):
        problems.append(f"link target: {rule}")
    if re.search(r"\d{7,}|\d[\d\-.]{8,}\d", url):
        problems.append("link target: phone")
    if allowed is not None and url not in allowed:
        problems.append("link not listed in the manifest")
    return sorted(set(problems))


# ───────────────────────────── manifest and records ─────────────────────────────
def load_json(path: Path, what: str):
    try:
        return json.loads(path.read_text("utf8"))
    except FileNotFoundError:
        raise fail(f"{what} not found")
    except (OSError, ValueError):
        raise fail(f"{what} is not valid JSON")


def keys_ok(obj, required: set[str], optional: set[str], where: str):
    if not isinstance(obj, dict):
        raise fail(f"{where} must be an object")
    extra = set(obj) - required - optional
    missing = required - set(obj)
    if extra or missing:
        raise fail(f"{where} has unknown keys {sorted(extra)} or lacks {sorted(missing)}")


def nonempty_str(v, where: str) -> str:
    if not isinstance(v, str) or not v.strip() or v != v.strip():
        raise fail(f"{where} must be a non-empty string without surrounding spaces")
    return v


def load_manifest(path: Path) -> dict:
    m = load_json(path, "manifest")
    keys_ok(m, {"version", "sections", "summaryBindings"}, {"links"}, "manifest")
    if m["version"] != 1:
        raise fail("manifest version must be 1")
    ids, headings = set(), {}

    def new_id(v, where):
        v = nonempty_str(v, where)
        if not ID.match(v):
            raise fail(f"{where} must match [a-z][a-z0-9-]*")
        if v in ids:
            raise fail(f"duplicate id in the manifest ({where})")
        ids.add(v)
        return v

    def new_heading(v, where):
        v = nonempty_str(v, where)
        if collapse(clean(v)) != v:
            raise fail(f"{where} must be normalized (single spaces)")
        if v in headings:
            raise fail(f"duplicate heading in the manifest ({where})")
        headings[v] = where
        return v

    if not isinstance(m["sections"], list) or not m["sections"]:
        raise fail("manifest sections must be a non-empty list")
    entries, claims, sections = {}, {}, {}
    for si, s in enumerate(m["sections"]):
        w = f"sections[{si}]"
        keys_ok(s, {"sectionId", "heading"}, {"subject", "entries"}, w)
        new_id(s["sectionId"], f"{w}.sectionId")
        new_heading(s["heading"], f"{w}.heading")
        if "subject" in s:
            nonempty_str(s["subject"], f"{w}.subject")
        s.setdefault("entries", [])
        if not isinstance(s["entries"], list):
            raise fail(f"{w}.entries must be a list")
        sections[s["sectionId"]] = s
        for ei, e in enumerate(s["entries"]):
            we = f"{w}.entries[{ei}]"
            keys_ok(e, {"entryId", "heading", "subject", "claims"}, set(), we)
            new_id(e["entryId"], f"{we}.entryId")
            new_heading(e["heading"], f"{we}.heading")
            nonempty_str(e["subject"], f"{we}.subject")
            if not isinstance(e["claims"], list):
                raise fail(f"{we}.claims must be a list")
            e["section"] = s["sectionId"]
            entries[e["entryId"]] = e
            for ci, c in enumerate(e["claims"]):
                wc = f"{we}.claims[{ci}]"
                keys_ok(c, {"claimId", "bulletMarker", "page"}, {"continuation"}, wc)
                new_id(c["claimId"], f"{wc}.claimId")
                if c["bulletMarker"] not in BULLETS or len(c["bulletMarker"]) != 1:
                    raise fail(f"{wc}.bulletMarker must be one bullet character")
                if not isinstance(c["page"], int) or isinstance(c["page"], bool) or c["page"] < 1:
                    raise fail(f"{wc}.page must be a page number")
                if "continuation" in c:
                    k = c["continuation"]
                    keys_ok(k, {"fromPage", "toPage"}, set(), f"{wc}.continuation")
                    if k["fromPage"] != c["page"] or k["toPage"] != c["page"] + 1:
                        raise fail(f"{wc}.continuation must run from its page to the next page")
                c["entry"] = e["entryId"]
                claims[c["claimId"]] = c
    if not isinstance(m["summaryBindings"], list):
        raise fail("manifest summaryBindings must be a list")
    bindings = {}
    for bi, b in enumerate(m["summaryBindings"]):
        w = f"summaryBindings[{bi}]"
        keys_ok(b, {"bindingId", "sectionId", "normalizedClaim", "subject"}, set(), w)
        new_id(b["bindingId"], f"{w}.bindingId")
        if b["sectionId"] not in sections:
            raise fail(f"{w}.sectionId names no section")
        if sections[b["sectionId"]]["entries"]:
            raise fail(f"{w}.sectionId names a section with entries")
        nc = nonempty_str(b["normalizedClaim"], f"{w}.normalizedClaim")
        if collapse(clean(nc)) != nc:
            raise fail(f"{w}.normalizedClaim must be normalized")
        if any(o["sectionId"] == b["sectionId"] and o["normalizedClaim"] == nc for o in bindings.values()):
            raise fail(f"{w} duplicates another binding's claim")
        nonempty_str(b["subject"], f"{w}.subject")
        bindings[b["bindingId"]] = b
    links = m.get("links", [])
    if not isinstance(links, list) or any(not isinstance(u, str) or not re.match(r"^(?:https://|mailto:)\S+$", u) for u in links):
        raise fail("manifest links must be https or mailto URLs")
    if len(set(links)) != len(links):
        raise fail("manifest links repeat")
    return {"raw": m, "sections": sections, "entries": entries, "claims": claims, "bindings": bindings, "links": set(links)}


def format_fact(f: dict) -> str | None:
    unit, value, decimals = f.get("unit"), f.get("value"), f.get("decimals", 0)
    if unit == "date" or not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    scaled = value * 100 if unit == "share" else value / {"k": 1e3, "M": 1e6}[f["scale"]] if f.get("scale") else value
    digits = f"{abs(scaled):,.{decimals}f}"
    negative = scaled < 0 and re.search(r"[1-9]", digits)
    if unit != "share" and f.get("scale"):
        digits += f["scale"]
    if f.get("suffix"):
        digits += f["suffix"]
    body = f"{digits}%" if unit == "share" else f"£{digits}" if unit == "gbp" else f"{digits} km/h" if unit == "kmh" else digits
    return f"−{body}" if negative else body


def load_facts(path: Path) -> dict[str, str | None]:
    try:
        text = path.read_text("utf8")
    except OSError:
        raise fail("facts module not found")
    facts = {}
    for m in re.finditer(r'^\s*"([a-z][\w.]*)": (\{.*\}),?\s*$', text, re.M):
        try:
            facts[m.group(1)] = format_fact(json.loads(m.group(2)))
        except ValueError:
            raise fail("facts module has a fact the checker cannot read")
    if not facts:
        raise fail("facts module has no facts")
    return facts


def load_records(path: Path, manifest: dict, facts: dict) -> dict[str, list[dict]]:
    """Records grouped by the claim key they bind ('claim:<claimId>' or 'summary:<bindingId>')."""
    r = load_json(path, "records")
    keys_ok(r, {"entries"}, set(), "records")
    if not isinstance(r["entries"], list):
        raise fail("records entries must be a list")
    seen, grouped = set(), {}
    for i, rec in enumerate(r["entries"]):
        w = f"records.entries[{i}]"
        keys_ok(rec, {"id", "bindingId", "token", "span", "normalizedClaim", "subject", "meaning"}, {"claimId", "factId"}, w)
        for k in ("id", "bindingId", "token", "normalizedClaim", "subject", "meaning"):
            nonempty_str(rec[k], f"{w}.{k}")
        if rec["id"] in seen:
            raise fail(f"{w}.id repeats")
        seen.add(rec["id"])
        span = rec["span"]
        keys_ok(span, {"start", "end"}, set(), f"{w}.span")
        if not all(isinstance(span[k], int) and not isinstance(span[k], bool) for k in ("start", "end")):
            raise fail(f"{w}.span must hold integers")
        nc = rec["normalizedClaim"]
        if collapse(clean(nc)) != nc:
            raise fail(f"{w}.normalizedClaim must be normalized")
        if not (0 <= span["start"] < span["end"] <= len(nc)) or nc[span["start"] : span["end"]] != rec["token"]:
            raise fail(f"{w}.span does not hold its token in its claim")
        if (span["start"], span["end"]) not in numeral_tokens(nc) or exempt(nc, span["start"], span["end"]):
            raise fail(f"{w}.span is not a numeral that needs a record")
        b, in_entry = rec["bindingId"], rec["bindingId"] in manifest["entries"]
        if in_entry == (b in manifest["bindings"]):
            raise fail(f"{w}.bindingId resolves to no entry or summary binding")
        if in_entry:
            entry = manifest["entries"][b]
            cid = rec.get("claimId")
            if cid is None or manifest["claims"].get(cid, {}).get("entry") != b:
                raise fail(f"{w}.claimId must name a claim of its entry")
            if rec["subject"] != entry["subject"]:
                raise fail(f"{w}.subject does not match its entry")
            key = f"claim:{cid}"
        else:
            binding = manifest["bindings"][b]
            if "claimId" in rec:
                raise fail(f"{w}.claimId is not allowed on a summary binding")
            if nc != binding["normalizedClaim"] or rec["subject"] != binding["subject"]:
                raise fail(f"{w} does not match its summary binding")
            key = f"summary:{b}"
        if "factId" in rec:
            if rec["factId"] not in facts:
                raise fail(f"{w}.factId is not a fact")
            if facts[rec["factId"]] != rec["token"]:
                raise fail(f"{w}.token is not the display of its fact")
        group = grouped.setdefault(key, [])
        for other in group:
            if other["normalizedClaim"] != nc:
                raise fail(f"{w} conflicts with record {other['id']} on the same claim")
            if span["start"] < other["span"]["end"] and other["span"]["start"] < span["end"]:
                raise fail(f"{w} overlaps record {other['id']}")
        group.append(rec)
    return grouped


# ───────────────────────────── layout parse ─────────────────────────────
def pages_of(text: str) -> list[list[str]]:
    pages = text.split("\f")
    if pages and pages[-1].strip() == "":
        pages = pages[:-1]
    out = []
    for p in pages:
        lines = [clean(l.rstrip()) for l in p.split("\n")]
        while lines and not lines[-1].strip():
            lines.pop()  # the newline before a form feed is not a blank line inside the page
        out.append(lines)
    return out


def parse_layout(pages: list[list[str]], manifest: dict) -> tuple[list[dict], list[dict], list[str]]:
    """(claims, plain lines, problems). Each claim is {"key", "id", "text", "page", "lines"}; plain
    lines are every other text line {"page", "line", "text"}."""
    sections = manifest["raw"]["sections"]
    by_heading = {}
    for s in sections:
        by_heading[s["heading"]] = ("section", s)
        for e in s["entries"]:
            by_heading[e["heading"]] = ("entry", e)
    problems, claims, plain = [], [], []
    seen_headings = set()
    sec_i, section, entry, entry_claims = -1, None, None, []
    open_claim, open_indent, summary_par = None, 0, None
    suspended = None  # a claim left open at a page break

    def close_claim():
        nonlocal open_claim
        if open_claim:
            claims.append(open_claim)
        open_claim = None

    def close_summary():
        nonlocal summary_par
        if summary_par:
            claims.append(summary_par)
        summary_par = None

    def finish_entry():
        if entry is not None and entry_claims:
            problems.append(f"entry {entry['entryId']}: {len(entry_claims)} manifest claim(s) not found")

    for pi, lines in enumerate(pages, start=1):
        if open_claim:
            suspended, open_claim = open_claim, None
        for li, raw in enumerate(lines, start=1):
            if not raw.strip():
                if suspended is None:
                    close_claim()
                close_summary()
                continue
            norm = collapse(raw)
            indent = len(raw) - len(raw.lstrip())
            kind = by_heading.get(norm)
            if kind and kind[0] == "section":
                if norm in seen_headings:
                    problems.append(f"page {pi} line {li}: heading repeats")
                    continue
                seen_headings.add(norm)
                if suspended:
                    claims.append(suspended)
                    suspended = None
                close_claim()
                close_summary()
                finish_entry()
                s = kind[1]
                expected = sections[sec_i + 1] if sec_i + 1 < len(sections) else None
                if s is not expected:
                    problems.append(f"page {pi} line {li}: section {s['sectionId']} out of order")
                sec_i = sections.index(s)
                section, entry, entry_claims = s, None, []
                continue
            if kind and kind[0] == "entry":
                if norm in seen_headings:
                    problems.append(f"page {pi} line {li}: heading repeats")
                    continue
                seen_headings.add(norm)
                if suspended:
                    claims.append(suspended)
                    suspended = None
                close_claim()
                close_summary()
                finish_entry()
                e = kind[1]
                if section is None or e not in section["entries"]:
                    problems.append(f"page {pi} line {li}: entry {e['entryId']} is not under its section")
                    entry, entry_claims = None, []
                    continue
                idx = section["entries"].index(e)
                prior = section["entries"][:idx]
                if any(p["heading"] not in seen_headings for p in prior):
                    problems.append(f"page {pi} line {li}: entry {e['entryId']} out of order")
                entry, entry_claims = e, list(e["claims"])
                continue
            stripped = raw.lstrip()
            marker = stripped[0]
            if suspended is not None:
                c = manifest["claims"].get(suspended["id"]) if suspended["key"].startswith("claim:") else None
                is_cont = indent > suspended["indent"] and marker not in BULLETS
                declared = c is not None and c.get("continuation", {}).get("toPage") == pi
                if is_cont and declared:
                    suspended["lines"].append((pi, li))
                    suspended["text"] = collapse(suspended["text"] + " " + raw)
                    suspended["continued"] = True
                    open_claim, suspended = suspended, None
                    continue
                if is_cont:
                    problems.append(f"page {pi} line {li}: undeclared page continuation of claim {suspended['id']}")
                claims.append(suspended)
                suspended = None
            if open_claim and indent > open_indent and marker not in BULLETS:
                open_claim["lines"].append((pi, li))
                open_claim["text"] = collapse(open_claim["text"] + " " + raw)
                continue
            close_claim()
            if entry is not None and marker in BULLETS and len(stripped) > 1 and stripped[1] == " ":
                if not entry_claims:
                    problems.append(f"page {pi} line {li}: bullet not in the manifest (entry {entry['entryId']})")
                    plain.append({"page": pi, "line": li, "text": raw})
                    continue
                c = entry_claims.pop(0)
                if marker != c["bulletMarker"]:
                    problems.append(f"page {pi} line {li}: claim {c['claimId']} has the wrong bullet marker")
                if pi != c["page"]:
                    problems.append(f"page {pi} line {li}: claim {c['claimId']} is not on page {c['page']}")
                open_claim = {
                    "key": f"claim:{c['claimId']}", "id": c["claimId"], "text": collapse(stripped[1:]),
                    "page": pi, "lines": [(pi, li)], "indent": indent, "continued": False,
                }
                open_indent = indent
                continue
            if section is not None and not section["entries"] and any(
                b["sectionId"] == section["sectionId"] for b in manifest["bindings"].values()
            ):
                if summary_par is None:
                    summary_par = {"key": "summary:?", "id": None, "text": norm, "page": pi, "lines": [(pi, li)], "indent": indent}
                else:
                    summary_par["text"] = collapse(summary_par["text"] + " " + raw)
                    summary_par["lines"].append((pi, li))
                continue
            plain.append({"page": pi, "line": li, "text": raw})
        if open_claim:
            suspended, open_claim = open_claim, None
        close_summary()
    if suspended:
        claims.append(suspended)
    close_claim()
    close_summary()
    finish_entry()

    for s in sections:
        if s["heading"] not in seen_headings:
            problems.append(f"section {s['sectionId']} not found")
        for e in s["entries"]:
            if e["heading"] not in seen_headings:
                problems.append(f"entry {e['entryId']} not found")

    # Claims with declared continuations must have continued; summary paragraphs bind once each.
    out = []
    used = set()
    for c in claims:
        if c["key"].startswith("claim:"):
            mc = manifest["claims"][c["id"]]
            if "continuation" in mc and not c.get("continued"):
                problems.append(f"claim {c['id']}: declared page continuation not found")
            out.append(c)
            continue
        matches = [b for b in manifest["bindings"].values() if b["normalizedClaim"] == c["text"]]
        page_line = f"page {c['page']} line {c['lines'][0][1]}"
        if len(matches) != 1:
            problems.append(f"{page_line}: summary paragraph matches no single summary binding")
            continue
        b = matches[0]
        if b["bindingId"] in used:
            problems.append(f"{page_line}: summary binding {b['bindingId']} repeats")
            continue
        used.add(b["bindingId"])
        c["key"], c["id"] = f"summary:{b['bindingId']}", b["bindingId"]
        out.append(c)
    for b in manifest["bindings"].values():
        if b["bindingId"] not in used:
            problems.append(f"summary binding {b['bindingId']} not found")
    return out, plain, problems


# ───────────────────────────── checks ─────────────────────────────
def numeral_findings_plain(text: str) -> list[tuple[int, int]]:
    return [(a, b) for a, b in numeral_tokens(text) if not exempt(text, a, b)]


def check_pdf(args) -> list[str]:
    pdf = Path(args.pdf)
    data = pdf.read_bytes()
    if not data:
        raise fail("the PDF is empty")
    findings = []
    if args.expect_sha256 and hashlib.sha256(data).hexdigest() != args.expect_sha256.lower():
        findings.append("hash: the PDF's SHA-256 is not the expected one")
    if args.meta:
        meta = load_json(Path(args.meta), "metadata file")
        if not isinstance(meta, dict) or set(meta) != {"sha256", "renderedAt", "web"} or meta.get("web") is not True:
            findings.append("meta: the metadata file must hold exactly sha256, renderedAt and web: true")
        elif meta["sha256"] != hashlib.sha256(data).hexdigest():
            findings.append("meta: the metadata file names another PDF")
        elif not isinstance(meta["renderedAt"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", meta["renderedAt"]):
            findings.append("meta: renderedAt must be an ISO UTC timestamp")
        if re.search(r"/Users/|/home/|private", json.dumps(meta)):
            findings.append("meta: the metadata file names a local path")

    denylist = parse_denylist(os.environ.get("TRUTH_DENYLIST"))
    text = run_tool(["pdftotext", "-layout", str(pdf), "-"])
    info = run_tool(["pdfinfo", str(pdf)])
    if not re.search(r"^Pages:\s+[1-9]\d*\s*$", info, re.M):
        raise fail("pdfinfo reports no pages")
    if re.search(r"^Encrypted:\s+yes", info, re.M):
        findings.append("pdf: encrypted")
    meta_texts = [info, run_tool(["pdfinfo", "-meta", str(pdf)])]

    problems, uris, xmp = inspect_objects(data)
    findings += [f"pdf: {p}" for p in problems]
    listed = pdfinfo_urls(pdf)
    if any(u not in uris for u in listed):
        findings.append("links: pdfinfo lists a link the object scan did not find")
    manifest = None if args.lint_only else load_manifest(Path(args.manifest))
    allowed = None if manifest is None else manifest["links"]
    for i, u in enumerate(sorted(set(uris))):
        for p in check_link(u, allowed, denylist):
            findings.append(f"links: link {i + 1}: {p}")
    # pdfinfo's technical lines (dates, sizes, versions) are not text anyone wrote; every other
    # metadata field, the XMP packet included, is linted like page text.
    technical = re.compile(
        r"^(?:CreationDate|ModDate|PDF version|Page size|File size|Pages|Page rot|Optimized|Tagged|"
        r"UserProperties|Suspects|Form|JavaScript|Encrypted|Custom Metadata|Metadata Stream):.*$",
        re.M,
    )
    for t in [technical.sub("", info)] + meta_texts[1:] + xmp:
        for rule in lint(t, denylist):
            findings.append(f"metadata: {rule}")

    pages = pages_of(text)
    if not any(l.strip() for p in pages for l in p):
        raise fail("the PDF has no extractable text")
    for pi, lines in enumerate(pages, start=1):
        nonblank = [(li, l) for li, l in enumerate(lines, start=1) if l.strip()]
        if nonblank and FOOTER_FRACTION.search(nonblank[-1][1]):
            findings.append(f"page {pi} line {nonblank[-1][0]}: page-footer")
        for li, l in nonblank:
            for rule in lint(l, denylist):
                findings.append(f"page {pi} line {li}: {rule}")
        # Rules that may span a wrapped line: run them on the page joined into one line as well.
        joined = collapse(" ".join(l for _, l in nonblank))
        line_rules = set()
        for li, l in nonblank:
            line_rules.update(lint(l, denylist))
        for rule in lint(joined, denylist):
            # Number runs from neighbouring lines join into false phone numbers; only a prefixed
            # number counts across lines.
            if rule == "phone" and not PHONE_PREFIXED.search(joined):
                continue
            if rule not in line_rules:
                findings.append(f"page {pi}: {rule} across lines")

    claims_out = []
    if manifest is not None:
        facts = load_facts(Path(args.facts))
        records = load_records(Path(args.records), manifest, facts)
        claims, plain, problems = parse_layout(pages, manifest)
        findings += [f"layout: {p}" for p in problems]
        for c in claims:
            claims_out.append({"id": c["id"], "normalizedClaim": c["text"]})
            where = f"{'claim' if c['key'].startswith('claim:') else 'summary binding'} {c['id']}"
            for rule in lint(c["text"], denylist):
                findings.append(f"{where}: {rule}")
            recs = records.get(c["key"], [])
            if any(r["normalizedClaim"] != c["text"] for r in recs):
                findings.append(f"{where}: the claim text differs from its approved records")
                continue
            need = [(a, b) for a, b in numeral_tokens(c["text"]) if not exempt(c["text"], a, b)]
            have = {(r["span"]["start"], r["span"]["end"]): r for r in recs}
            for a, b in need:
                if (a, b) not in have:
                    findings.append(f"{where}: numeral at {a}-{b} has no approval record")
            for (a, b), r in have.items():
                if (a, b) not in need:
                    findings.append(f"{where}: record {r['id']} names no numeral occurrence")
        matched = {c["key"] for c in claims}
        for key in records:
            if key not in matched:
                findings.append(f"records: {key} binds a claim that was not found")
        for p in plain:
            for a, b in numeral_findings_plain(p["text"]):
                findings.append(f"page {p['page']} line {p['line']}: numeral at column {a} outside any approved claim")

    if args.claims_out and manifest is not None:
        out = Path(args.claims_out).resolve()
        if out.is_relative_to(ROOT):
            raise fail("--claims-out must lie outside this repository")
        out.write_text(json.dumps({"claims": claims_out}, ensure_ascii=False, indent=1) + "\n", "utf8")
    return findings


class Args:
    pdf: str
    claims_out = None
    manifest = str(DEFAULT_MANIFEST)
    records = str(DEFAULT_RECORDS)
    facts = str(DEFAULT_FACTS)
    expect_sha256 = None
    meta = None
    lint_only = False
    if_present = False


def parse_args(argv: list[str]) -> Args | None:
    a, rest, i = Args(), [], 0
    valued = {"--claims-out": "claims_out", "--manifest": "manifest", "--records": "records", "--facts": "facts",
              "--expect-sha256": "expect_sha256", "--meta": "meta"}
    flags = {"--lint-only": "lint_only", "--if-present": "if_present"}
    while i < len(argv):
        x = argv[i]
        if x in valued:
            if i + 1 >= len(argv):
                return None
            setattr(a, valued[x], argv[i + 1])
            i += 2
        elif x in flags:
            setattr(a, flags[x], True)
            i += 1
        elif x.startswith("-"):
            return None
        else:
            rest.append(x)
            i += 1
    if len(rest) != 1:
        return None
    if a.lint_only and a.claims_out:
        return None
    a.pdf = rest[0]
    return a


def main(argv: list[str]) -> int:
    args = parse_args(argv[1:])
    if args is None:
        print(f"usage: python3 scripts/{NAME}.py PDF [--claims-out PATH] [--manifest PATH] [--records PATH] "
              "[--facts PATH] [--expect-sha256 HEX] [--meta PATH] [--lint-only] [--if-present]", file=sys.stderr)
        return 2
    pdf = Path(args.pdf)
    if not pdf.exists():
        if args.if_present:
            print(f"{NAME}: no PDF at the given path; checker-only mode, nothing checked")
            return 0
        print(f"{NAME}: FAIL the PDF does not exist", file=sys.stderr)
        return 1
    if not pdf.is_file():
        print(f"{NAME}: FAIL the PDF is not a regular file", file=sys.stderr)
        return 1
    if not parse_denylist(os.environ.get("TRUTH_DENYLIST")):
        print(f"{NAME}: FAIL TRUTH_DENYLIST is missing or empty; a PDF is never checked without it", file=sys.stderr)
        return 1
    try:
        findings = check_pdf(args)
    except Fail as e:
        print(f"{NAME}: FAIL {e}", file=sys.stderr)
        return 1
    if findings:
        for f in findings:
            print(f"{NAME}: FAIL {f}", file=sys.stderr)
        print(f"{NAME}: {len(findings)} finding(s)", file=sys.stderr)
        return 1
    print(f"{NAME}: PASS sha256 {hashlib.sha256(pdf.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
