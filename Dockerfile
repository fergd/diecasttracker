# --- Stage 1: build the React frontend ---
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python backend, serving the built frontend ---
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py match.py vision_extract.py live_pricing.py cloudinary_upload.py schema.sql ./
# reference_import_*.py + their html_cache_* dirs are the one-time,
# optional "seed the ground-truth casting catalog" step (see README) - the
# cache dirs let re-runs skip re-scraping the source sites.
COPY reference_import*.py ./
COPY html_cache_*/ ./
COPY static/ ./static/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Runtime data - overridden by volumes in docker-compose.yml so a container
# rebuild/replace never loses your collection.
RUN mkdir -p photos

EXPOSE 8420
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8420"]
