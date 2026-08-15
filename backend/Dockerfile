FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if needed (e.g. for building packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Set default port
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Run uvicorn server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
