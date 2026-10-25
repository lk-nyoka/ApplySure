"""Human review of AI-read bursaries: a person checks each draft against its source page.

    python -m app.review list               drafts waiting for review, soonest deadline first
    python -m app.review show <id>          everything that was read, with the source link
    python -m app.review approve <id>       mark verified: the app stops showing the "not reviewed" warning
    python -m app.review reject <id>        remove it, e.g. wrong details or not a real bursary

Only approve after opening the source page and confirming the deadline, the eligibility rules and
the document list. To correct a detail, edit backend/data/ingested.json first, then approve.
"""
import argparse
import json
import os
from pathlib import Path

from .services.requirements import requirement_set_from_spec
from .services.store import _INGESTED_FILE, _read


def _write(records: list[dict], path: Path) -> None:
    for record in records:  # never write a record the API would refuse to load
        requirement_set_from_spec(record["requirement_set"], record["official_source_url"])
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"bursaries": records}, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def _find(records: list[dict], prefix: str) -> dict:
    matches = [r for r in records if r["id"].startswith(prefix)]
    if len(matches) != 1:
        raise SystemExit(f"{len(matches)} bursaries match {prefix!r}; give more of the id")
    return matches[0]


def main(argv: list[str] | None = None, path: Path = _INGESTED_FILE) -> str:
    parser = argparse.ArgumentParser(description="Review AI-read bursaries")
    parser.add_argument("action", choices=["list", "show", "approve", "reject"])
    parser.add_argument("id", nargs="?", help="bursary id, or its first few characters")
    args = parser.parse_args(argv)
    records = _read(path)
    if args.action == "list":
        drafts = sorted((r for r in records if r.get("status") != "verified"), key=lambda r: r.get("deadline") or "9999")
        return "\n".join(f"{r['id'][:8]}  {r.get('deadline') or 'no deadline':<11}  {r['title']}" for r in drafts) or "No drafts waiting."
    if not args.id:
        raise SystemExit("Give the bursary id")
    record = _find(records, args.id)
    if args.action == "show":
        return json.dumps(record, indent=2)
    if args.action == "approve":
        record["status"] = "verified"
        record["review_notes"] = [n for n in record.get("review_notes", []) if "without AI" not in n]
        _write(records, path)
        return f"Verified: {record['title']}"
    _write([r for r in records if r is not record], path)
    return f"Removed: {record['title']}"


if __name__ == "__main__":
    print(main())
