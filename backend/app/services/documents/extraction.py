"""Reads facts from a document's text. Produces observations only; the rules decide what they mean.

Text comes from digital PDFs directly, and from photos and scanned PDFs through OCR (see ocr.py).
Anything that can't be read comes back unread, and the checks ask the applicant to confirm instead of guessing.
"""
import io
import multiprocessing
import re
from datetime import date

from pypdf import PdfReader

from ..rules import ApplicantProfile, ExtractedDocument, valid_sa_id
from . import ocr
from .intake import RejectedFile

MAX_PAGES = 20
MAX_CHARS = 100_000

_MONTHS = {m: i for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), start=1)}
_MONTH = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_PATTERNS = (
    (re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b"), ("y", "m", "d")),
    (re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b"), ("d", "m", "y")),  # South African day-first
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+{_MONTH}\s+(\d{{4}})\b", re.I), ("d", "mon", "y")),
    (re.compile(rf"\b{_MONTH}\s+(\d{{1,2}}),?\s+(\d{{4}})\b", re.I), ("mon", "d", "y")),
)
_ISSUE_WORDS = ("issue", "statement date", "certif", "commissioner", "date of letter", "date printed", "dated", "date:")
_EXPIRY_WORDS = ("expir", "valid until", "valid to", "valid thru")
_IGNORE_WORDS = ("birth", "due date", "closing", "deadline")


def pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise RejectedFile("Password-protected PDFs can't be read. Remove the password and upload again.")
        parts, size = [], 0
        for page in reader.pages[:MAX_PAGES]:
            text = page.extract_text() or ""
            parts.append(text)
            size += len(text)
            if size >= MAX_CHARS:
                break
    except RejectedFile:
        raise
    except Exception as exc:  # pypdf raises many types on damaged files; none of them are safe to continue from
        raise RejectedFile("We couldn't read this PDF. It may be damaged.") from exc
    return re.sub(r"[ \t]+", " ", "\n".join(parts))[:MAX_CHARS]


def _pdf_worker(data: bytes, connection) -> None:
    try:
        connection.send(("ok", pdf_text(data)))
    except RejectedFile as exc:
        connection.send(("rejected", str(exc)))
    finally:
        connection.close()


def pdf_text_bounded(data: bytes, timeout: float = 15) -> str:
    """pdf_text in a child process that is killed after `timeout` seconds, so a crafted PDF
    (deeply nested streams, decompression bombs) cannot hang or exhaust the API process."""
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    worker = context.Process(target=_pdf_worker, args=(data, sender), daemon=True)
    worker.start()
    sender.close()
    try:
        if not receiver.poll(timeout):
            raise RejectedFile("This PDF took too long to read. Try a smaller or simpler file.")
        status, value = receiver.recv()
    except EOFError as exc:  # the worker died, e.g. out of memory
        raise RejectedFile("We couldn't read this PDF. It may be damaged.") from exc
    finally:
        receiver.close()
        worker.join(1)
        if worker.is_alive():
            worker.kill()
    if status != "ok":
        raise RejectedFile(value)
    return value


def _dates(text: str) -> list[tuple[int, date]]:
    found = []
    for pattern, order in _DATE_PATTERNS:
        for match in pattern.finditer(text):
            parts = dict(zip(order, match.groups()))
            try:
                month = _MONTHS[parts["mon"][:3].casefold()] if "mon" in parts else int(parts["m"])
                found.append((match.start(), date(int(parts["y"]), month, int(parts["d"]))))
            except (ValueError, KeyError):
                continue
    return sorted(found)


def _before(text: str, position: int, size: int = 60) -> str:
    """Text just before a match on the same line: a label on another line doesn't describe it."""
    return text[max(0, position - size) : position].rsplit("\n", 1)[-1].casefold()


def _labelled(text: str, dates: list[tuple[int, date]], words: tuple[str, ...]) -> list[date]:
    picked = []
    for position, value in dates:
        before = _before(text, position)
        if any(w in before for w in words) and not any(w in before for w in _IGNORE_WORDS):
            picked.append(value)
    return picked


def _issue_date(text: str, dates: list[tuple[int, date]], today: date) -> date | None:
    labelled = [d for d in _labelled(text, dates, _ISSUE_WORDS) if d <= today]
    if labelled:
        return max(labelled)
    # No labelled date: use the latest past date that is not a birth or expiry date.
    expiry = set(_labelled(text, dates, _EXPIRY_WORDS))
    others = [d for p, d in dates if d <= today and d not in expiry
              and not any(w in _before(text, p) for w in _IGNORE_WORDS)]
    return max(others) if others else None


def _amount(raw: str) -> float | None:
    cleaned = re.sub(r"[\s,]", "", raw).rstrip(".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _profile_tokens_found(text: str, wanted: str, relaxed: bool = False) -> str | None:
    """The applicant's own words that appear in the text. OCR often drops spaces ("MOKOENANames"),
    so `relaxed` matches words of 3+ letters anywhere, ignoring spacing."""
    lowered = text.casefold()
    squashed = re.sub(r"\s+", "", lowered)
    found = [t for t in re.findall(r"[a-z0-9]+", wanted.casefold())
             if re.search(rf"\b{re.escape(t)}\b", lowered) or (relaxed and len(t) >= 3 and t in squashed)]
    return " ".join(found) or None


def read_fields(text: str, document_type: str, profile: ApplicantProfile, today: date,
                from_ocr: bool = False) -> tuple[ExtractedDocument, list[str]]:
    notes: list[str] = []
    fields: dict = {}
    dates = _dates(text)

    candidates = [re.sub(r"\s", "", m) for m in re.findall(r"(?<!\d)(\d{6}\s?\d{4}\s?\d{2}\s?\d)(?!\d)", text)]
    if candidates:
        fields["id_number"] = next((c for c in candidates if valid_sa_id(c) is None), candidates[0])

    # Names and addresses are matched against what the applicant gave us, never guessed from layout.
    if name := _profile_tokens_found(text, profile.full_name, from_ocr):
        fields["holder_name"] = name
    if profile.address and (address := _profile_tokens_found(text, profile.address, from_ocr)):
        fields["address"] = address

    if expiry := _labelled(text, dates, _EXPIRY_WORDS):
        fields["expiry_date"] = max(expiry)

    if m := re.search(r"(?:average|aggregate)[^0-9%\n]{0,30}(\d{1,3}(?:[.,]\d{1,2})?)\s*%", text, re.I):
        value = float(m.group(1).replace(",", "."))
        if 0 <= value <= 100:
            fields["average_percent"] = value
    if m := re.search(r"(?:academic year|results for|examinations?(?: of)?|year)\D{0,15}(20\d{2})\b", text, re.I):
        fields["academic_year"] = int(m.group(1))

    if m := re.search(r"(?:annual|yearly|per annum|p\.a\.)[^R\d\n]{0,40}R\s?(\d[\d\s,]*(?:\.\d{2})?)", text, re.I):
        fields["household_income_annual"] = _amount(m.group(1))
    elif m := re.search(r"(?:gross (?:pay|salary|income|earnings)|total earnings)[^R\d\n]{0,30}R\s?(\d[\d\s,]*(?:\.\d{2})?)", text, re.I):
        if (monthly := _amount(m.group(1))) is not None:
            fields["household_income_annual"] = monthly * 12
            notes.append("Annual income was estimated as 12 times the monthly gross pay on this payslip.")

    issue = _issue_date(text, dates, today)
    return ExtractedDocument(document_type, issue, {k: v for k, v in fields.items() if v is not None}), notes


def extract(data: bytes, content_type: str, document_type: str, profile: ApplicantProfile, today: date,
            timeout: float = 15, ocr_timeout: float = 90) -> tuple[ExtractedDocument, list[str]]:
    if content_type == "application/pdf":
        text = pdf_text_bounded(data, timeout)
        if len(text.strip()) >= 20:
            return read_fields(text, document_type, profile, today)
        images, what = ocr.pdf_page_images(data), "This PDF has no readable text (it may be a scan)"
    else:
        images, what = [data], "Photos can't be read automatically on this server"
    if not ocr.available() or not images:
        return ExtractedDocument(document_type), [f"{what}, so you'll be asked to confirm each detail."]
    text = ocr.read_text(images, timeout=ocr_timeout)
    if len(text.strip()) < 20:
        return ExtractedDocument(document_type), ["We couldn't make out the text in this photo. Retake it flat, in good light and in focus."]
    document, notes = read_fields(text, document_type, profile, today, from_ocr=True)
    return document, ["Read from a photo or scan, which can misread details. Check the results carefully.", *notes]
