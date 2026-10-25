import html
import re
import time
from urllib.parse import urldefrag, urlparse

import httpx

ALLOWED_HOST = "www.zabursaries.co.za"
MAX_BYTES = 2_000_000
_SKIP_SECTIONS = {"career-guidance", "bursary-news", "universities", "internships", "student-accommodation",
                  "author", "category", "tag", "page", "feed", "comments", "wp-content", "wp-json", "search"}


class FetchError(Exception):
    pass


class PoliteFetcher:
    """Fetches pages from one allow-listed host, one request per `delay` seconds (robots.txt asks for 30).

    Only URLs this class builds or validates are fetched, never user input, and redirects are refused
    so a page cannot send the fetcher to another host.
    """

    def __init__(self, delay: float = 30.0, client: httpx.Client | None = None, sleep=time.sleep, clock=time.monotonic):
        self._delay = delay
        self._client = client or httpx.Client(
            follow_redirects=False, timeout=20, headers={"User-Agent": "ApplySureBot/0.1 (hackathon; student bursary helper)"}
        )
        self._sleep, self._clock = sleep, clock
        self._last: float | None = None

    def get(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != ALLOWED_HOST:
            raise FetchError("URL is outside the allowed site")
        if self._last is not None:
            wait = self._delay - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()
        with self._client.stream("GET", url) as response:
            if response.status_code != 200:
                raise FetchError(f"Unexpected status {response.status_code}")
            body = bytearray()
            for chunk in response.iter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    raise FetchError("Page is too large")
        return body.decode("utf-8", errors="replace")


def bursary_links(listing_html: str) -> list[tuple[str, str]]:
    """(url, title) of bursary pages on a faculty listing page: https://host/<section>/<slug>/ ."""
    found: dict[str, str] = {}
    # Only the article body lists bursaries; menus, sidebars and footers link to everything else.
    body = re.search(r"<article.*?</article>", listing_html, re.S) or re.search(r"<main.*?</main>", listing_html, re.S)
    for href, inner in re.findall(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', body.group(0) if body else listing_html, re.S):
        url = urldefrag(href)[0].split("?")[0]
        parsed = urlparse(url)
        parts = [p for p in parsed.path.split("/") if p]
        if parsed.scheme != "https" or parsed.netloc != ALLOWED_HOST or len(parts) != 2 or parts[0] in _SKIP_SECTIONS:
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", inner)).strip()
        if title and url not in found:
            found[url] = title
    return list(found.items())


def page_text(page_html: str, limit: int = 12_000) -> str:
    """Readable text of the main article, without scripts, navigation or markup."""
    match = re.search(r"<article.*?</article>", page_html, re.S) or re.search(r"<main.*?</main>", page_html, re.S)
    body = re.sub(r"<(script|style|nav|footer|aside|form)\b.*?</\1>", " ", match.group(0) if match else page_html, flags=re.S)
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)))
    return text.strip()[:limit]
