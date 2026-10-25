import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from ..models import CheckResultStatus


@dataclass(frozen=True)
class ApplicantProfile:
    """What the applicant told us, to compare against what documents say."""

    full_name: str
    id_number: str
    address: str


@dataclass(frozen=True)
class ExtractedDocument:
    """Facts read from a document. Holds extraction output only, never an acceptance decision.

    `fields` uses keys such as holder_name, id_number, address, expiry_date, average_percent,
    academic_year and household_income_annual; a missing key means it could not be read.
    """

    document_type: str
    issue_date: date | None = None
    fields: dict[str, Any] | None = None

    def get(self, key: str) -> Any:
        return (self.fields or {}).get(key)


@dataclass(frozen=True)
class Outcome:
    result: CheckResultStatus
    explanation: str
    suggested_fix: str | None = None


def _pass(text: str) -> Outcome:
    return Outcome(CheckResultStatus.passed, text)


def _fail(text: str, fix: str) -> Outcome:
    return Outcome(CheckResultStatus.failed, text, fix)


def _confirm(text: str, fix: str) -> Outcome:
    return Outcome(CheckResultStatus.needs_confirmation, text, fix)


def _unreadable(what: str) -> Outcome:
    return _confirm(f"We could not read {what} on this document.", "Confirm it manually or upload a clearer copy.")


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.casefold())


def _is_date(year: int, month: int, day: int) -> bool:
    try:
        datetime(year, month, day)
    except ValueError:
        return False
    return True


def valid_sa_id(number: str) -> str | None:
    """Return None when a 13-digit South African ID number is well formed, else the reason."""
    if not re.fullmatch(r"\d{13}", number):
        return "it is not 13 digits"
    yy, mm, dd = int(number[:2]), int(number[2:4]), int(number[4:6])
    # The century is not encoded in YYMMDD; either century giving a real date is acceptable.
    if not any(_is_date(century + yy, mm, dd) for century in (1900, 2000)):
        return "the date of birth inside it is not a real date"
    if number[10] not in "01":
        return "its citizenship digit is invalid"
    total = 0
    for index, char in enumerate(reversed(number)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    if total % 10 != 0:
        return "its check digit does not match"
    return None


@dataclass(frozen=True)
class MaxAge:
    """Document must be recent, e.g. proof of residence or a certified copy within 3 months."""

    max_days: int
    key = "max_age"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, today: date) -> Outcome:
        if doc.issue_date is None:
            return _unreadable("an issue or certification date")
        age = (today - doc.issue_date).days
        if age < 0:
            return _confirm("The date on this document is in the future.", "Check the date was read correctly.")
        if age > self.max_days:
            return _fail(f"Dated {age} days ago; it must be at most {self.max_days} days old.", "Upload a newer copy.")
        return _pass(f"Dated {age} days ago, within the {self.max_days}-day limit.")


@dataclass(frozen=True)
class NotExpired:
    key = "not_expired"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, today: date) -> Outcome:
        expiry = doc.get("expiry_date")
        if expiry is None:
            return _unreadable("an expiry date")
        if expiry < today:
            return _fail(f"Expired on {expiry.isoformat()}.", "Upload a document that is still valid.")
        return _pass("Still valid.")


@dataclass(frozen=True)
class ValidIdNumber:
    key = "valid_id_number"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, _today: date) -> Outcome:
        number = doc.get("id_number")
        if not number:
            return _unreadable("an ID number")
        problem = valid_sa_id(re.sub(r"\s", "", str(number)))
        if problem:
            return _fail(f"The ID number is not valid: {problem}.", "Check the number or upload a clearer copy.")
        return _pass("The ID number is well formed.")


@dataclass(frozen=True)
class IdMatchesProfile:
    key = "id_matches_profile"

    def evaluate(self, doc: ExtractedDocument, profile: ApplicantProfile, _today: date) -> Outcome:
        number = doc.get("id_number")
        if not number:
            return _unreadable("an ID number")
        if not profile.id_number.strip():
            return _confirm("We have no ID number to compare this document with.", "Add your ID number, then check again.")
        if re.sub(r"\s", "", str(number)) != re.sub(r"\s", "", profile.id_number):
            return _fail("The ID number differs from the one on your profile.", "Correct your profile or upload the right document.")
        return _pass("The ID number matches your profile.")


@dataclass(frozen=True)
class NameMatchesProfile:
    key = "name_matches_profile"

    def evaluate(self, doc: ExtractedDocument, profile: ApplicantProfile, _today: date) -> Outcome:
        name = doc.get("holder_name")
        if not name:
            return _unreadable("the holder's name")
        wanted, found = _tokens(profile.full_name), _tokens(str(name))
        if not wanted:
            return _confirm("We have no name to compare this document with.", "Add your full name, then check again.")
        matched = sum(any(w == f or (len(f) == 1 and w.startswith(f)) for f in found) for w in wanted)
        if matched == len(wanted) and len(found) <= len(wanted):
            return _pass("The name matches your profile.")
        if matched / len(wanted) >= 0.5:
            return _confirm(
                "The name only partly matches your profile (for example a missing middle name or initials).",
                "Confirm both names refer to you.",
            )
        return _fail("The name does not match your profile.", "Upload a document in your own name.")


@dataclass(frozen=True)
class AddressMatchesProfile:
    key = "address_matches_profile"

    def evaluate(self, doc: ExtractedDocument, profile: ApplicantProfile, _today: date) -> Outcome:
        address = doc.get("address")
        if not address:
            return _unreadable("an address")
        wanted, found = _tokens(profile.address), set(_tokens(str(address)))
        if not wanted:
            return _confirm("We have no address to compare this document with.", "Add your home address, then check again.")
        share = sum(token in found for token in wanted) / len(wanted)
        if share >= 0.9:
            return _pass("The address matches your profile.")
        if share >= 0.5:
            return _confirm("The address only partly matches your profile.", "Confirm it is the same address.")
        return _fail("The address does not match your profile.", "Update your profile or upload a matching document.")


@dataclass(frozen=True)
class MinNumber:
    """e.g. a final average of at least 60%."""

    field: str
    minimum: float
    label: str
    key = "min_number"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, _today: date) -> Outcome:
        value = doc.get(self.field)
        if value is None:
            return _unreadable(self.label)
        if value < self.minimum:
            return _fail(f"Your {self.label} is {value:g}; at least {self.minimum:g} is required.", "You may not meet this requirement; check other bursaries.")
        return _pass(f"Your {self.label} is {value:g}, meeting the {self.minimum:g} minimum.")


@dataclass(frozen=True)
class MaxNumber:
    """e.g. a household income ceiling."""

    field: str
    maximum: float
    label: str
    key = "max_number"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, _today: date) -> Outcome:
        value = doc.get(self.field)
        if value is None:
            return _unreadable(self.label)
        if value > self.maximum:
            return _fail(f"Your {self.label} is {value:,.0f}; it must not exceed {self.maximum:,.0f}.", "You may not meet this requirement; check other bursaries.")
        return _pass(f"Your {self.label} is {value:,.0f}, within the {self.maximum:,.0f} limit.")


@dataclass(frozen=True)
class FieldEquals:
    """e.g. results must be from the exact academic year the bursary requires."""

    field: str
    expected: int
    label: str
    key = "field_equals"

    def evaluate(self, doc: ExtractedDocument, _profile: ApplicantProfile, _today: date) -> Outcome:
        value = doc.get(self.field)
        if value is None:
            return _unreadable(self.label)
        if value != self.expected:
            return _fail(f"The {self.label} is {value}; {self.expected} is required.", "Upload the correct document.")
        return _pass(f"The {self.label} is {self.expected}.")
