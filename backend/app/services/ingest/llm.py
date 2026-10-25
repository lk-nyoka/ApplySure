import json
import time
from dataclasses import dataclass

import httpx


class LLMUnavailable(Exception):
    """Every configured provider failed or ran out of quota."""


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str  # an OpenAI-compatible API root
    api_key: str
    model: str


def _parse_json(text: str | None) -> dict:
    if not isinstance(text, str):  # some providers send an empty message instead of an error
        raise ValueError("empty reply")
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("reply is not a JSON object")
    return value


# Key rejected, payment needed, forbidden, or model retired: retrying this run cannot help.
_FATAL = {401, 402, 403, 404}
# Free tiers rate-limit in short bursts and get overloaded; worth a short wait before moving on.
_BUSY = {429, 503}


class LLMChain:
    """Tries free-tier providers in order. A busy provider is retried briefly; one that is out of
    quota, rejects its key or has retired its model is skipped for the rest of this run."""

    def __init__(self, providers: list[Provider], client: httpx.Client | None = None, retries: int = 2, sleep=time.sleep):
        self._providers = providers
        self._client = client or httpx.Client(timeout=90)
        self._retries, self._sleep = retries, sleep
        self._disabled: set[str] = set()

    def _call(self, provider: Provider, system: str, user: str) -> dict:
        response = self._client.post(
            f"{provider.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {provider.api_key}"},
            json={
                "model": provider.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
        )
        response.raise_for_status()
        return _parse_json(response.json()["choices"][0]["message"]["content"])

    def complete_json(self, system: str, user: str) -> dict:
        for provider in self._providers:
            if provider.name in self._disabled:
                continue
            for attempt in range(self._retries + 1):
                try:
                    return self._call(provider, system, user)
                except httpx.HTTPStatusError as exc:
                    status = exc.response.status_code
                    if status in _FATAL:
                        self._disabled.add(provider.name)
                        break
                    if status in _BUSY and attempt < self._retries:
                        wait = exc.response.headers.get("retry-after", "")
                        self._sleep(min(float(wait), 20) if wait.replace(".", "", 1).isdigit() else 5 * (attempt + 1))
                        continue
                    if status == 429:
                        self._disabled.add(provider.name)  # still limited after waiting: treat the quota as spent
                    break
                except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
                    break  # network failure or malformed reply: try the next provider
        raise LLMUnavailable("No AI provider could complete the request")


def providers_from_settings(settings) -> list[Provider]:
    chain = [
        ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai", settings.gemini_api_key, settings.gemini_model),
        ("groq", "https://api.groq.com/openai/v1", settings.groq_api_key, settings.groq_model),
    ]
    # Several free OpenRouter models may be listed, comma-separated; each is its own fallback step.
    chain += [(f"openrouter:{m.strip()}", "https://openrouter.ai/api/v1", settings.openrouter_api_key, m.strip())
              for m in settings.openrouter_model.split(",") if m.strip()]
    return [Provider(name, url, key, model) for name, url, key, model in chain if key]
