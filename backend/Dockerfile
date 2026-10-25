# ApplySure API. Build from the backend folder:  docker build -t applysure-api .
FROM python:3.12-slim

# OpenCV (used by OCR) needs these shared libraries even without a display.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ENVIRONMENT=production
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

COPY app ./app
COPY data ./data
# Run as an unprivileged user; only the data folder (ingested bursaries) is writable.
RUN useradd --create-home --uid 10001 api && chown -R api /app/data
USER api

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'))"
# Behind a TLS-terminating proxy (Render, Fly, a load balancer). Two workers: OCR and PDF reading run in child processes.
# uvicorn's own access log is off: it records query strings. The app logs path, status and request ID only.
# Hosts such as Render set PORT; small free tiers should set WEB_CONCURRENCY=1 to fit in 512 MB.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips='*' --no-server-header --no-access-log"]
