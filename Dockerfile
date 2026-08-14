FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (ffmpeg for yt-dlp audio stream operations)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set default port and host
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
