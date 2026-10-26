"""Reads a zabursaries.co.za bursary page without AI, using the site's fixed section headings.

Used when every AI provider is out of quota, so ingestion keeps working on free tiers. It returns the
same raw shape the AI is asked for, and the result goes through the same `sanitize` validation.
"""
import re

from ..documents.extraction import _dates

_HEADINGS = ("ABOUT THE", "FIELDS COVERED", "EXPENSES COVERED", "ELIGIBILITY REQUIREMENTS", "HOW TO APPLY",
             "CLOSING DATE", "CONTACT THE", "RELATED BURSARIES", "MORE ABOUT", "SELECTION PROCESS", "BURSARY VALUE")

_FACULTY_WORDS = {
    "engineering": ("engineering", "mechatronic"),
    "science": ("science", "physics", "chemistry", "biochem", "geology", "mathematics", "statistics", "agricultur"),
    "commerce": ("commerce", "accounting", "finance", "economics", "actuarial", "business", "auditing", "marketing"),
    "health_sciences": ("medicine", "medical", "nursing", "pharmacy", "health", "dentistry", "physiotherapy"),
    "humanities": ("humanities", "social work", "psychology", "journalism", "arts", "languages"),
    "law": ("law", "llb", "legal"),
    "education": ("education", "teaching", "b.ed"),
    "information_technology": ("information technology", "computer science", "software", "data science", "cyber", " it "),
}
_COURSES = ("electrical engineering", "electronic engineering", "mechanical engineering", "civil engineering", "chemical engineering",
            "mining engineering", "industrial engineering", "metallurgical engineering", "aeronautical engineering", "computer engineering",
            "computer science", "information technology", "data science", "cyber security", "accounting", "actuarial science",
            "economics", "finance", "law", "medicine", "nursing", "pharmacy", "teaching", "geology", "physics", "chemistry",
            "mathematics", "statistics", "agriculture", "environmental science", "quantity surveying", "architecture", "logistics")
_COVER_WORDS = {
    "tuition": ("tuition", "registration fee", "study fees", "course fees"), "accommodation": ("accommodation", "residence"),
    "books": ("book",), "meals": ("meal", "food"), "living_allowance": ("allowance", "stipend", "pocket money"),
    "laptop": ("laptop", "computer"), "transport": ("transport", "travel"), "vacation_work": ("vacation work", "vac work", "internship"),
    "employment": ("employment", "work back", "work-back", "permanent position", "job"),
}
_DOCUMENT_WORDS = (  # order matters: parent/guardian ID before the applicant's own ID
    ("parent_id_document", r"parents?'? or guardians?'? id|parents?'? id|guardians?'? id"),
    ("id_document", r"\bid (document|copy|book|card)|identity document|copy of (your )?id\b"),
    ("academic_record", r"academic record|transcript|results|matric certificate|report card"),
    ("proof_of_income", r"proof of (household )?income|payslip|salary slip|sassa|employment letter|affidavit"),
    ("proof_of_residence", r"proof of (residence|address)|utility bill"),
    ("registration_letter", r"(acceptance|registration|admission) (letter|at)|proof of (university )?(acceptance|registration)"),
    ("motivation_letter", r"motivation(al)? letter|letter of motivation|essay"),
    ("cv", r"\bcv\b|curriculum vitae|résumé|resume"),
    ("bank_confirmation", r"bank (confirmation|statement|letter)"),
)


def _sections(text: str) -> dict[str, str]:
    """Split the page at its upper-case headings: {"CLOSING DATE": "...text until the next heading"}."""
    pattern = "|".join(re.escape(h) for h in _HEADINGS)
    # A heading continues while its words are fully upper case ("CLOSING DATE FOR THE ACME BURSARY"),
    # so it stops before "You must..." or a date like "26 February".
    parts = re.split(rf"((?:{pattern})(?:\s+[A-Z'&/().,-]+(?![a-z0-9]))*)", text)
    found: dict[str, str] = {}
    for i in range(1, len(parts) - 1, 2):
        key = next(h for h in _HEADINGS if parts[i].startswith(h))
        found.setdefault(key, parts[i + 1])
    return found


def _rand(text: str) -> float | None:
    m = re.search(r"R\s?(\d[\d\s,]*(?:\.\d+)?)\s*(million|m\b)?", text, re.I)
    if not m:
        return None
    value = float(re.sub(r"[\s,]", "", m.group(1)))
    return value * 1_000_000 if m.group(2) else value


def read_page(text: str, title: str, url: str) -> dict:
    sections = _sections(text)
    fields = (sections.get("FIELDS COVERED", "") + " " + url.replace("-", " ")).casefold()
    eligibility = sections.get("ELIGIBILITY REQUIREMENTS", "")
    how_to = sections.get("HOW TO APPLY", "").casefold()

    closing = [d for _, d in _dates(sections.get("CLOSING DATE", ""))]
    years = sorted({int(y) for y in re.findall(r"\b(20[2-3]\d)\b", f"{title} {sections.get('ABOUT THE', '')[:600]}")})

    documents = []
    for document_type, pattern in _DOCUMENT_WORDS:
        if re.search(pattern, how_to):
            documents.append({"document_type": document_type, "rules": []})
    income = re.search(r"household income[^.]{0,80}?(not (?:be )?more than|less than|below|under|maximum of|up to)[^.]{0,40}", eligibility, re.I)
    if income and (limit := _rand(income.group(0))) and re.search(r"per month|a month|monthly|p/m", income.group(0), re.I):
        limit *= 12  # the engine compares annual household income
    if income and limit and any(d["document_type"] == "proof_of_income" for d in documents):
        next(d for d in documents if d["document_type"] == "proof_of_income")["rules"].append(
            {"type": "max_number", "field": "household_income_annual", "value": limit})
    average = re.search(r"(?:average|aggregate) of (?:at least )?(\d{2})\s?%", eligibility, re.I)
    if average and any(d["document_type"] == "academic_record" for d in documents):
        next(d for d in documents if d["document_type"] == "academic_record")["rules"].append(
            {"type": "min_number", "field": "average_percent", "value": int(average.group(1))})

    conditions = [c.strip(" .") for c in re.split(r"(?=You must )", eligibility) if c.strip().lower().startswith("you must")]
    return {
        "title": re.sub(r"\s+South Africa\s+20\d\d.*$", "", title).strip() or title,
        "funder": re.sub(r"\s+(Bursary|Bursaries|Scholarship|Fellowship).*$", "", title, flags=re.I).strip() or title,
        "deadline": max(closing).isoformat() if closing else None,
        "study_years": years,
        "faculties": [f for f, words in _FACULTY_WORDS.items() if any(w in f" {fields} " for w in words)],
        "courses": [c for c in _COURSES if c in fields],
        "covers": [c for c, words in _COVER_WORDS.items() if any(w in sections.get("EXPENSES COVERED", "").casefold() for w in words)],
        "application_url": None,
        "documents": documents,
        "unchecked_requirements": conditions[:12],
    }
