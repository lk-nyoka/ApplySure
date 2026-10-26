"""Human review of AI-read bursaries: a person checks each draft against its source page.

    python -m app.review list               drafts waiting for review, soonest deadline first
    python -m app.review show <id>          everything that was read, with the source link
    python -m app.review approve <id>       publish it as verified: it appears in the app
    python -m app.review reject <id>        delete it, e.g. wrong details, closed, or not a real bursary

New drafts from `python -m app.ingest` wait in backend/data/pending.json, which the app never shows.
Only approve after opening the source page and confirming the deadline, the eligibility rules and
the document list. To correct a detail, edit the record in pending.json first, then approve.
"""
import argparse
import json
import os
from pathlib import Path

from .services.requirements import requirement_set_from_spec
from .services.store import _INGESTED_FILE, _PENDING_FILE, _read


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


def main(argv: list[str] | None = None, path: Path = _INGESTED_FILE, pending_path: Path = _PENDING_FILE) -> str:
    parser = argparse.ArgumentParser(description="Review AI-read bursaries")
    parser.add_argument("action", choices=["list", "show", "approve", "reject"])
    parser.add_argument("id", nargs="?", help="bursary id, or its first few characters")
    args = parser.parse_args(argv)
    live, pending = _read(path), _read(pending_path)
    # Waiting = everything in the queue, plus any older unverified record already in the live file.
    waiting = pending + [r for r in live if r.get("status") != "verified"]
    if args.action == "list":
        drafts = sorted(waiting, key=lambda r: r.get("deadline") or "9999")
        return "\n".join(f"{r['id'][:8]}  {r.get('deadline') or 'no deadline':<11}  {r['title']}" for r in drafts) or "No drafts waiting."
    if not args.id:
        raise SystemExit("Give the bursary id")
    record = _find(waiting, args.id)
    in_queue = any(r is record for r in pending)
    if args.action == "show":
        return json.dumps(record, indent=2)
    if args.action == "approve":
        record["status"] = "verified"
        record["review_notes"] = [n for n in record.get("review_notes", []) if "without AI" not in n]
        if in_queue:
            _write([r for r in live if r["id"] != record["id"]] + [record], path)
            _write([r for r in pending if r is not record], pending_path)
        else:
            _write(live, path)
        return f"Verified: {record['title']}"
    if in_queue:
        _write([r for r in pending if r is not record], pending_path)
    else:
        _write([r for r in live if r is not record], path)
    return f"Removed: {record['title']}"


if __name__ == "__main__":
    print(main())
