# Production image for Render (single web service: API + built SPA)
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE=
RUN npm run build

FROM python:3.11-slim-bookworm AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-cpu.txt /app/backend/requirements-cpu.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-cpu.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist

ENV PYTHONUNBUFFERED=1
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST=/app/frontend/dist
ENV PORT=10000

WORKDIR /app/backend
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % (__import__('os').environ.get('PORT','10000'),))"

CMD ["python", "server.py"]
