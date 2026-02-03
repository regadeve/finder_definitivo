# core/discogs_client.py

import time
import requests


class DiscogsClient:
    def __init__(self, headers: dict, max_retries=5, timeout=30):
        self.session = requests.Session()
        self.headers = headers
        self.max_retries = max_retries
        self.timeout = timeout

    def _sleep_for_rate(self, resp):
        remaining = int(resp.headers.get("X-Discogs-Ratelimit-Remaining", "60"))
        if remaining <= 1:
            time.sleep(1.2)

    def get(self, url, params=None):
        backoff = 1.0
        last_exc = None

        for _ in range(self.max_retries):
            try:
                r = self.session.get(
                    url,
                    headers=self.headers,
                    params=params,
                    timeout=self.timeout,
                )

                if r.status_code in (429, 500, 502, 503, 504):
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 20)
                    last_exc = Exception(f"HTTP {r.status_code}")
                    continue

                r.raise_for_status()
                self._sleep_for_rate(r)
                return r.json()

            except Exception as e:
                last_exc = e
                time.sleep(backoff)
                backoff = min(backoff * 2, 20)

        raise last_exc or RuntimeError("Fallo desconocido en petición Discogs")
