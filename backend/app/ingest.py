"""Background job: read bursaries from zabursaries.co.za with free-tier AI and store them as drafts.

Run from the backend folder:  python -m app.ingest --closing --limit 20   (open now)
                         or:  python -m app.ingest --faculty engineering --limit 5
One request is made every 30 seconds (the site's robots.txt crawl-delay), so --limit 5 takes a few minutes.
"""
import argparse
import calendar
from datetime import date

from pydantic_settings import BaseSettings, SettingsConfigDict

from .services.ingest.extractor import extract_bursary
from .services.ingest.fetcher import ALLOWED_HOST, FetchError, PoliteFetcher, bursary_links, page_text
from .services.ingest.llm import LLMChain, providers_from_settings
from .services.store import BursaryStore, save_ingested

# Faculty keys the frontend offers (FACULTIES in BursariesPage.tsx) -> zabursaries listing page.
FACULTY_PAGES = {
    "commerce": "commerce-bursaries-south-africa",
    "education": "education-bursaries-south-africa",
    "engineering": "engineering-bursaries-south-africa",
    "health_sciences": "medical-bursaries-south-africa",
    "humanities": "music-and-performing-arts-bursaries-south-africa",
    "information_technology": "computer-science-it-bursaries-south-africa",
    "law": "law-bursaries-south-africa",
    "science": "science-bursaries-south-africa",
}


class IngestSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None
    # Model names change; override in .env if a provider retires one (a retired model answers 404).
    gemini_model: str = "gemini-3.8-flash"
    groq_model: str = "llama-3.3-70b-versatile"
    # Comma-separated free models, tried in order. List current ones at https://openrouter.ai/models?q=free
    openrouter_model: str = "nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free"
    crawl_delay_seconds: float = 30


def closing_soon_pages(today: date, months: int = 4) -> list[str]:
    """The site's monthly "Bursaries closing in <month> <year>" posts, which list what is open now.

    Later months come first: everything on them is still open. The current month's post comes last,
    because its early entries have already closed."""
    pages, year, month = [], today.year, today.month
    for _ in range(months):
        pages.append(f"https://{ALLOWED_HOST}/bursaries-closing-in-{calendar.month_name[month].lower()}-{year}/")
        month, year = (1, year + 1) if month == 12 else (month + 1, year)
    return pages[1:] + pages[:1]


def run(faculty: str | None, limit: int, settings: IngestSettings, fetcher=None, llm=None, save=save_ingested,
        closing: bool = False, skip: set[str] | frozenset[str] = frozenset()) -> int:
    """Ingest up to `limit` new bursaries from one faculty page, or from the closing-soon posts."""
    if closing:
        listings = closing_soon_pages(date.today())
    elif (slug := FACULTY_PAGES.get((faculty or "").casefold())) is not None:
        listings = [f"https://{ALLOWED_HOST}/{slug}/"]
    else:
        raise SystemExit(f"Unknown faculty. Choose one of: {', '.join(FACULTY_PAGES)}")
    providers = providers_from_settings(settings)
    if llm is None and not providers:
        raise SystemExit("Set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY in backend/.env")
    fetcher = fetcher or PoliteFetcher(delay=settings.crawl_delay_seconds)
    llm = llm or LLMChain(providers)
    saved = 0
    for listing_url in listings:
        try:
            links = [(u, t) for u, t in bursary_links(fetcher.get(listing_url)) if u not in skip]
        except FetchError as exc:
            print(f"skip listing {listing_url}: {exc}")  # e.g. next month's post is not published yet
            continue
        if listing_url == closing_soon_pages(date.today())[-1]:
            links.reverse()  # this month's post is in date order: its last entries close latest
        # Listings mix years of archive; pages titled with next year's cycle are the most likely to be open.
        links.sort(key=lambda link: str(date.today().year + 1) not in link[1])
        for url, title in links:
            if saved >= limit:
                return saved
            try:
                # Falls back to the page-layout reader when every AI provider is out of quota.
                record = extract_bursary(llm, page_text(fetcher.get(url)), url, listing_url, title)
            except FetchError as exc:
                print(f"skip {title}: {exc}")
                continue
            skip = skip | {url}
            if record["title"] == "Untitled bursary" or not (record["requirement_set"]["documents"] or record["deadline"] or record["unchecked_requirements"]):
                print(f"skip {title}: no bursary details found on the page")
                continue
            if record["deadline"] and record["deadline"] < date.today().isoformat():
                print(f"skip {title}: closed on {record['deadline']}")
                continue
            if faculty and faculty.casefold() not in record["faculties"]:
                record["faculties"].append(faculty.casefold())
            save(record)
            skip = skip | {url}
            saved += 1
            print(f"saved draft: {record['title']} (deadline {record['deadline']}, {len(record['requirement_set']['documents'])} documents)")
    return saved


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--faculty", choices=sorted(FACULTY_PAGES))
    source.add_argument("--closing", action="store_true", help="bursaries closing in the next three months")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--refresh", action="store_true", help="re-read bursaries that are already saved")
    args = parser.parse_args()
    known = set() if args.refresh else {b.official_source_url for b in BursaryStore().list_bursaries()}
    print(f"{run(args.faculty, args.limit, IngestSettings(), closing=args.closing, skip=known)} bursaries saved")
