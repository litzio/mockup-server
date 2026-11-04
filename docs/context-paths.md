# U: Base URL과 context 설정

Node.js 24와 기존 WireMock 3.13.2를 사용한다. 기본 `compose.yaml` 단독 실행은 기존처럼 빈 context다. 별도 서버나 클라이언트 전용 헤더는 없다. 원본 매핑을 변경하지 않고 Node built-in으로 `.runtime/`에 WireMock 파일을 준비한다. 실행 중 Node 프로세스는 필요하지 않다.

```powershell
$env:JIRA_PORT='18381'
$env:CONFLUENCE_PORT='18382'
$env:JIRA_CONTEXT='/jira'
$env:CONFLUENCE_CONTEXT='/confluence'
node scripts/prepare-context.mjs
docker compose -f compose.yaml -f compose.context.yaml -p mockup-issue13 up -d
$env:JIRA_BASE_URL='http://localhost:18381/jira'
$env:CONFLUENCE_BASE_URL='http://localhost:18382/confluence'
$env:JIRA_PAT='mock-jira-token'
$env:CONFLUENCE_PAT='mock-confluence-token'
npm run wait:services
node scripts/check-context.mjs
node --test services/jira/tests/error-scenarios.test.mjs
docker compose -f compose.yaml -f compose.context.yaml -p mockup-issue13 down
```

호스트 `127.0.0.1`도 지원한다. Base URL 끝에는 슬래시를 붙이지 않는다. `JIRA_CONTEXT`는 빈 문자열 또는 `/jira`, `CONFLUENCE_CONTEXT`는 빈 문자열 또는 `/confluence`다. 제품별 독립 선택이며 잘못된 값은 생성 전에 실패한다. 준비 명령은 저장소 루트에서 실행하고 설정/원본 변경 때마다 다시 실행한다. 출력은 `.runtime/jira`, `.runtime/confluence`의 `mappings`와 `__files`이며 이전 출력을 교체한다. 생성물을 직접 편집하지 않는다. Compose override는 같은 `/home/wiremock` mount를 이 출력으로 교체한다.

같은 `scripts/check-context.mjs` 실행물로 제품별 Base URL/PAT만 바꿔 조회와 링크를 추적한다. 일반 `test:services`는 기존 빈 context 계약 회귀용이고 이 검사는 U 계약용이다. 관리 요청은 항상 `new URL(BASE_URL).origin + '/__admin/...'`로 실행한다. context가 설정되면 원래 context 없는 제품 요청은 fallback 404다.

Jira issue self(숫자 ID), Confluence page self와 페이지 목록 self/next/prev를 실제 추적한다. Jira project/user/status/issuetype self와 Confluence space self는 메타데이터이며 단건 API 추적은 지원하지 않는다. 브라우저 UI/첨부 링크, TLS, 프록시, 사내 DNS는 범위 밖이다. 모든 API 링크는 요청 origin과 준비한 context를 반영한다. `Connection: close`를 유지하며 연결 풀 지원은 주장하지 않는다.

WireMock의 [standalone CLI](https://wiremock.org/docs/standalone/java-jar/)에는 제품별 context 선택 옵션이 없다. 기존 JSON matcher/응답 템플릿을 준비하고 [파일 기반 root](https://wiremock.org/docs/standalone/docker/)를 사용하는 방식이다. 시나리오 배열, 우선순위, 인증, 쿼리 조건, 지연 설정은 보존하며 origin은 기존 `request.baseUrl` 템플릿을 사용한다.

이는 합성 데이터 모의 계약 검증이다. Jira Software 9.12.28/Confluence 9.2.17 실제 서버·PAT·인증서·프록시 호환성 검증은 미실행이다.

## 2026-11-04 로컬 검증

Windows x64/PowerShell 7.6, Node 24.21.0, Docker Engine 29.7.2, Compose 5.4.0, WireMock 3.13.2에서 실행했다. base는 #19 병합 `9a7e7c4cc03b8e8338c440ece71bea1d7a2e82c8`이며 이 PR 구현 트리를 검사했다. 최종 head의 CI/독립리뷰는 PR 기록에서 별도로 확인한다.

| 설정 | 명령·관찰 | 결과 |
| --- | --- | --- |
| 빈 context, 18381/18382 | `npm run test:services`, numeric 회귀 포함 28/28 | PASS |
| 빈 context, 18381/18382, localhost 및 127.0.0.1 | 동일 `node scripts/check-context.mjs` | PASS |
| /jira 및 /confluence, 18381/18382, 두 호스트 | 동일 링크 검사, context 없는 제품 요청 fallback | PASS |
| 두 context, localhost | `node --test services/jira/tests/error-scenarios.test.mjs` 모든 지원 GET/숫자별칭/자연404/인증 우선/제품격리/reset | PASS |
| Jira 빈 context/Confluence /confluence | 생성·재기동 후 동일 링크 검사 | PASS |
| 기본 compose 단독, 8081/8082, localhost/127.0.0.1 | 준비 확인과 동일 링크 검사 | PASS |
| 정책 | `npm ci`, forms check, `npm test` 39/39, diff check | PASS |

지연 상태 HTTP 실측은 빈 context 40요청 1502.4–1513.5ms, 두 context 40요청 1503.4–1518.0ms였다. 모든 요청이 최소1500ms 단언을 통과했다. PAT 실패/fallback 비지연, 오류 전문/데이터 비노출, 상태 확인과 시험 전후 reset도 기존 E harness에서 단언했다. 성능 보증이 아니다. 원시 로컬 로그는 이 worktree `.runtime/baseline.log`, `.runtime/context-scenarios.log`, `.runtime/policy.log`에 있으며 생성물로 제외한다. CI가 기본 및 두 context의 HTTP 검사를 재실행한다. 직접 기동한 `mockup-issue13`만 down으로 정리했다.
