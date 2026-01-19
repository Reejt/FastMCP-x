# FastMCP Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including Tesseract OCR and poppler for PDF processing
RUN apt-get update && apt-get install -y \
    gcc \
    git \
    curl \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with increased timeout and retries for network resilience
RUN pip install --default-timeout=1000 --retries 5 -r requirements.txt

# Copy application code
COPY server/ ./server/
COPY utils/ ./utils/

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app:$PYTHONPATH

# Run the FastMCP server directly
CMD ["python", "server/main.py"]
