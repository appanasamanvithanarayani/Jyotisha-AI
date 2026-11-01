# Internet-facing image. HTTPS is terminated by the hosting platform in front of this container.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY downloads ./downloads
COPY data/manifests ./data/manifests
COPY data/knowledge ./data/knowledge
# Only the GeoNames place list (CC BY 4.0) ships; the research source books under data/raw never do.
COPY data/raw/cities15000.zip ./data/raw/cities15000.zip
RUN pip install .

RUN useradd --system --uid 10001 appuser && mkdir /data && chown appuser /data
USER appuser

# PORT is provided by the platform (Cloud Run, Render, Railway, Fly). Set JYOTISHA_ALLOWED_HOSTS to your domain.
ENV PORT=8080 JYOTISHA_HOME=/app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/healthz',timeout=4)"
CMD ["python", "-m", "jyotisha_ai", "serve", "--public"]
