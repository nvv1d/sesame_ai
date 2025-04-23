FROM python:3.10-slim

# 1. Install system packages needed by PyAudio
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
      gcc \
      libportaudio2 \
      libportaudiocpp0 \
      portaudio19-dev \
      libasound2-dev \
      libsndfile1-dev \
      build-essential && \
    rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Copy only requirements to leverage Docker cache
COPY requirements.txt .

# 4. Install Python deps, including PyAudio
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the rest of your code
COPY . .

# 6. Expose and launch
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
