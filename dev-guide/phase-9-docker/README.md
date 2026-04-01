# Phase 9: Docker 컨테이너화

> 예상 시간: 3~5시간  
> 완료 기준: `docker compose up --build` 후 `http://localhost` 접근 가능

---

## 최종 인프라 구조

```
외부 요청 (:80)
    ↓
[Nginx] — 리버스 프록시, PDF 크기 제한
    ↓
[NestJS App :3000] — 비즈니스 로직
    ↓
[ChromaDB :8000] — 벡터 DB
```

모두 같은 Docker 네트워크 내에서 통신.  
외부에서는 오직 Nginx(:80)만 노출된다.

---

## 9-1. Dockerfile (멀티스테이지 빌드)

```dockerfile
# Stage 1: Builder — TypeScript 컴파일
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci                          # package-lock.json 기반 정확한 설치

COPY tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build                   # TypeScript → dist/

# Stage 2: Production — 빌드 결과물만 복사
FROM node:20-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force  # dev 의존성 제외

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
RUN mkdir -p /app/documents         # PDF 마운트 경로 미리 생성

USER node                           # root 대신 node 유저로 실행 (보안)
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

### 멀티스테이지 빌드를 쓰는 이유

| | 단일 스테이지 | 멀티스테이지 |
|--|--------------|-------------|
| 이미지 크기 | TypeScript, @types 등 전부 포함 | 컴파일된 JS만 포함 |
| 보안 | dev 도구 포함 | 불필요한 도구 없음 |
| 빌드 속도 | 캐시 효율 낮음 | 레이어 캐시 최적화 |

---

## 9-2. Nginx 설정

`nginx/nginx.conf`

```nginx
server {
    listen 80;

    # PDF 업로드 크기 제한 (기본 1MB → 20MB로 증가)
    client_max_body_size 20M;

    # API 요청 → NestJS 앱으로 프록시
    location /api/ {
        proxy_pass http://nestjs-app:3000;  # Docker 서비스명 사용
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 타임아웃 설정 (LLM 응답이 오래 걸릴 수 있음)
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # 헬스체크
    location /health {
        proxy_pass http://nestjs-app:3000;
        proxy_set_header Host $host;
    }

    # 정적 파일 (웹 UI)
    location / {
        proxy_pass http://nestjs-app:3000;
        proxy_set_header Host $host;
    }
}
```

---

## 9-3. docker-compose.yml

```yaml
version: '3.9'

services:
  # 벡터 DB
  chromadb:
    image: chromadb/chroma:latest
    container_name: ai-agent-chroma
    volumes:
      - chroma_data:/chroma/chroma    # 데이터 영속화
    networks:
      - ai-agent-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "[ -f /proc/1/cmdline ]"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

  # NestJS 앱
  nestjs-app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production              # 멀티스테이지의 production 스테이지
    container_name: ai-agent-app
    env_file:
      - .env.docker                   # Docker용 환경변수 파일
    environment:
      - CHROMA_URL=http://chromadb:8000   # 서비스명으로 접근
    volumes:
      - ./documents:/app/documents:ro  # PDF 디렉토리 읽기 전용 마운트
    networks:
      - ai-agent-network
    depends_on:
      chromadb:
        condition: service_healthy    # ChromaDB가 준비된 후 시작
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s              # 앱 시작 시간 여유

  # 리버스 프록시
  nginx:
    image: nginx:alpine
    container_name: ai-agent-nginx
    ports:
      - "80:80"                       # 유일하게 외부에 노출
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - ai-agent-network
    depends_on:
      nestjs-app:
        condition: service_healthy    # 앱이 준비된 후 Nginx 시작
    restart: unless-stopped

networks:
  ai-agent-network:
    driver: bridge

volumes:
  chroma_data:
    driver: local
```

### 서비스 시작 순서

```
chromadb (healthcheck 통과)
    ↓
nestjs-app (depends_on: chromadb, healthcheck 통과)
    ↓
nginx (depends_on: nestjs-app)
```

---

## 9-4. .env.docker 파일

```bash
# .env.docker
OPENAI_API_KEY=sk-proj-...
LLM_MODEL=gpt-4o-mini
CHROMA_COLLECTION=ai_agent_docs
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RETRIEVER_TOP_K=5
EMBEDDING_PROVIDER=openai
# CHROMA_URL은 compose에서 environment로 주입 (http://chromadb:8000)
```

> `CHROMA_URL`은 환경마다 다르므로 `docker-compose.yml`의 `environment`에서 덮어쓴다.

---

## 9-5. package.json 빌드 스크립트 확인

```json
{
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch"
  }
}
```

Dockerfile의 `RUN npm run build`가 `nest build`를 실행해 `dist/` 폴더 생성.

---

## 9-6. 빌드 & 실행

```bash
# 전체 스택 빌드 + 실행
docker compose up --build -d

# 로그 확인
docker compose logs -f nestjs-app

# 상태 확인
docker compose ps

# 접속 테스트
curl http://localhost/health
curl http://localhost/api/llm/models
```

---

## 9-7. 자주 발생하는 문제

### 문제 1: nestjs-app이 계속 재시작
원인: ChromaDB가 아직 준비 안 됨 → `depends_on: condition: service_healthy` 확인

### 문제 2: "cannot find module" 에러
원인: `dist/` 없이 production 이미지 실행
해결: `docker compose build --no-cache`로 강제 리빌드

### 문제 3: PDF 업로드 413 에러
원인: Nginx의 기본 body 크기 제한 (1MB)
해결: `nginx.conf`에 `client_max_body_size 20M;` 확인

### 문제 4: ChromaDB 데이터가 재시작 시 사라짐
원인: `volumes` 설정 누락
해결: `chroma_data` named volume 확인

---

## 체크리스트

- [ ] `Dockerfile` — 멀티스테이지 빌드 작동 확인
- [ ] `nginx/nginx.conf` — `proxy_read_timeout` + `client_max_body_size` 설정
- [ ] `docker-compose.yml` — 서비스 의존 순서 (`depends_on: condition: service_healthy`)
- [ ] `.env.docker` 파일 생성 (`.gitignore`에 추가됐는지 확인)
- [ ] `docker compose up --build` 성공
- [ ] `http://localhost/health` 응답 확인
- [ ] `http://localhost/api/docs` Swagger UI 접근 확인

**→ [Phase 10](../phase-10-ui/README.md)으로 (선택사항)**
