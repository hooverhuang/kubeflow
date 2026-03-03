# resource-quota-manager/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 复制依赖文件
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY backend/ ./backend/
COPY templates/ ./templates/

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

WORKDIR /app/backend

EXPOSE 5000

CMD ["python", "app.py"]