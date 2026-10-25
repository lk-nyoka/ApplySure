import json
import os
from datetime import date
from pathlib import Path
from uuid import UUID

from ..models import Bursary
from .requirements import RequirementSet, requirement_set_from_spec

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_SEED_FILE = _DATA_DIR / "bursaries.json"
_INGESTED_FILE = _DATA_DIR / "ingested.json"
_BURSARY_FIELDS = tuple(Bursary.model_fields)


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["bursaries"] if path.exists() else []


class BursaryStore:
    """Bursary and requirement source. Two JSON files stand in for the Supabase tables: hand-written
    seed data and AI-ingested drafts. Keep the public methods when swapping in a database."""

    def __init__(self, seed_path: Path = _SEED_FILE, ingested_path: Path = _INGESTED_FILE):
        self._ingested_path = ingested_path
        self._bursaries: dict[UUID, Bursary] = {}
        self._requirements: dict[UUID, RequirementSet] = {}
        for item in _read(seed_path) + _read(ingested_path):
            bursary = Bursary(**{k: item[k] for k in _BURSARY_FIELDS if k in item})
            # Building every set at load time means bad data stops the app instead of weakening a check.
            self._requirements[bursary.id] = requirement_set_from_spec(item["requirement_set"], item["official_source_url"])
            self._bursaries[bursary.id] = bursary

    def list_bursaries(self) -> list[Bursary]:
        return list(self._bursaries.values())

    def search(
        self,
        year: int | None = None,
        faculty: str | None = None,
        course: str | None = None,
        include_closed: bool = False,
        today: date | None = None,
    ) -> list[Bursary]:
        """Open or upcoming bursaries matching the applicant's choices. A bursary that lists no
        faculty or course is treated as open to any; one with no deadline is kept (deadline unknown)."""
        today = today or date.today()
        faculty, course = (faculty or "").strip().casefold(), (course or "").strip().casefold()

        def covers(options: list[str], wanted: str) -> bool:
            return not wanted or not options or any(wanted in o or o in wanted for o in options)

        return [
            b for b in self._bursaries.values()
            if (include_closed or b.deadline is None or b.deadline >= today)
            and (year is None or not b.study_years or year in b.study_years)
            and covers(b.faculties, faculty)
            and covers(b.courses, course)
        ]

    def get_bursary(self, bursary_id: UUID) -> Bursary | None:
        return self._bursaries.get(bursary_id)

    def get_requirements(self, bursary_id: UUID) -> RequirementSet | None:
        return self._requirements.get(bursary_id)


def save_ingested(record: dict, path: Path = _INGESTED_FILE) -> None:
    """Add or replace one AI-read draft. Validates it first so a bad record never reaches the file."""
    requirement_set_from_spec(record["requirement_set"], record["official_source_url"])
    Bursary(**{k: record[k] for k in _BURSARY_FIELDS if k in record})
    records = {r["id"]: r for r in _read(path)}
    records[record["id"]] = record
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"bursaries": list(records.values())}, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def get_store() -> BursaryStore:
    # Reloaded per request so freshly ingested bursaries appear without a restart; the files are small.
    return BursaryStore()
