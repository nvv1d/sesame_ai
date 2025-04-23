# 1. Use a lightweight Python base image
FROM python:3.10-slim

# 2. Set working directory inside the container
WORKDIR /app

# 3. Copy only requirements first for better caching
COPY requirements.txt .

# 4. Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the rest of your application code
COPY . .

# 6. Expose the port your FastAPI app listens on
EXPOSE 8000

# 7. Default command to run your app via Uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
