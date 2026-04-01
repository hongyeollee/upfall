# Phase 10: 웹 UI (선택사항)

> 예상 시간: 2~3시간  
> 완료 기준: 브라우저에서 PDF 인제스트 + 채팅이 가능한 간단한 UI

**선택사항이다.** API 자체는 Phase 9에서 완성됐다.  
별도 React 앱 불필요 — 순수 HTML + fetch API로 충분하다.

---

## 10-1. 정적 파일 서빙 설정

`main.ts`에 정적 파일 경로 추가:

```typescript
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useStaticAssets(join(process.cwd(), "public"));  // public/ 폴더를 루트로 서빙
```

이제 `public/index.html` → `http://localhost:3000/` 에서 접근 가능.

---

## 10-2. public/index.html 구조

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upfall AI Agent</title>
  <style>
    /* 기본 스타일 */
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    #chat-box { height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; }
    .user-msg { text-align: right; color: #0066cc; margin: 8px 0; }
    .ai-msg { text-align: left; color: #333; margin: 8px 0; background: #f5f5f5; padding: 8px; border-radius: 4px; }
    .ref { font-size: 0.8em; color: #999; }
    input, select, button { padding: 8px; margin: 4px; }
    #question { width: 70%; }
  </style>
</head>
<body>
  <h1>Upfall AI Agent</h1>

  <!-- PDF 인제스트 섹션 -->
  <div>
    <h3>문서 인덱싱</h3>
    <input id="file-path" placeholder="documents/ai-agent-market.pdf" style="width:400px" />
    <button onclick="ingest()">인덱싱</button>
    <span id="ingest-status"></span>
  </div>

  <hr />

  <!-- 채팅 섹션 -->
  <div>
    <h3>질의응답</h3>
    <div id="chat-box"></div>
    <div>
      <input id="question" placeholder="질문을 입력하세요..." onkeypress="if(event.key==='Enter') sendChat()" />
      <select id="model">
        <option value="">기본 모델</option>
        <!-- 모델 목록은 자동으로 채워짐 -->
      </select>
      <button onclick="sendChat()">전송</button>
    </div>
  </div>

  <script>
    // 세션 ID (페이지 로드마다 새 세션)
    const sessionId = 'session-' + Date.now();
    const BASE = '';  // 같은 오리진이므로 빈 문자열

    // 페이지 로드 시 모델 목록 가져오기
    async function loadModels() {
      const res = await fetch(`${BASE}/api/llm/models`);
      const data = await res.json();
      const select = document.getElementById('model');
      data.supportedModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m + (m === data.defaultModel ? ' (기본)' : '');
        select.appendChild(opt);
      });
    }

    // PDF 인제스트
    async function ingest() {
      const filePath = document.getElementById('file-path').value || 'documents/ai-agent-market.pdf';
      const status = document.getElementById('ingest-status');
      status.textContent = '인덱싱 중...';

      try {
        const res = await fetch(`${BASE}/api/rag/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        const data = await res.json();
        status.textContent = `완료: ${data.chunks}개 청크 인덱싱됨`;
      } catch (e) {
        status.textContent = `오류: ${e.message}`;
      }
    }

    // 채팅 메시지 전송
    async function sendChat() {
      const questionEl = document.getElementById('question');
      const question = questionEl.value.trim();
      if (!question) return;

      const model = document.getElementById('model').value || undefined;
      const chatBox = document.getElementById('chat-box');

      // 사용자 메시지 표시
      chatBox.innerHTML += `<div class="user-msg">${escapeHtml(question)}</div>`;
      questionEl.value = '';
      chatBox.scrollTop = chatBox.scrollHeight;

      // 로딩 표시
      const loadingId = 'loading-' + Date.now();
      chatBox.innerHTML += `<div class="ai-msg" id="${loadingId}">생각 중...</div>`;

      try {
        const res = await fetch(`${BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, sessionId, model }),
        });
        const data = await res.json();

        // 로딩 → 실제 답변으로 교체
        document.getElementById(loadingId).outerHTML =
          `<div class="ai-msg">
            ${escapeHtml(data.answer)}
            <div class="ref">모델: ${data.modelUsed} | 참조: ${data.references.length}개 청크</div>
          </div>`;
      } catch (e) {
        document.getElementById(loadingId).textContent = `오류: ${e.message}`;
      }

      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    // 초기화
    loadModels();
  </script>
</body>
</html>
```

---

## 10-3. 주요 기능 설명

| 기능 | 구현 방식 |
|------|-----------|
| 모델 목록 자동 로드 | 페이지 로드 시 `GET /api/llm/models` 호출 |
| PDF 인제스트 | `POST /api/rag/ingest` with filePath |
| 채팅 | `POST /api/chat` with question + sessionId + model |
| 세션 유지 | `sessionId = 'session-' + Date.now()` (페이지마다 새 세션) |
| XSS 방지 | `escapeHtml()` 함수로 모든 사용자 입력 이스케이프 |
| Enter 키 전송 | `onkeypress="if(event.key==='Enter') sendChat()"` |

---

## 10-4. 확인

```bash
npm run start:dev
# http://localhost:3000 접속
# 또는 Docker: http://localhost
```

1. "인덱싱" 버튼 클릭 → "완료: N개 청크 인덱싱됨"
2. 질문 입력 + 전송 → AI 답변 + 참조 청크 수 표시

---

## 체크리스트

- [ ] `main.ts`에 `useStaticAssets()` 추가
- [ ] `public/index.html` 생성
- [ ] 모델 목록 자동 로드 확인
- [ ] 인제스트 + 채팅 동작 확인
- [ ] XSS 방지 (`escapeHtml`) 적용 확인

---

## 완료! 전체 개발 가이드 끝

모든 Phase를 완료했다면:

```
✅ Phase 0: 설계
✅ Phase 1: NestJS 초기 설정
✅ Phase 2: 환경변수
✅ Phase 3: LLM 모듈
✅ Phase 4: RAG / 벡터스토어
✅ Phase 5: Chat + LangGraph
✅ Phase 6: 에러 처리 표준화
✅ Phase 7: Swagger 문서화
✅ Phase 8: 헬스체크
✅ Phase 9: Docker 컨테이너화
✅ Phase 10: 웹 UI
```

이 상태면 **이 프로젝트(upfall)와 동일한** RAG AI Agent API가 완성된다.

**[← 전체 목차로 돌아가기](../README.md)**
