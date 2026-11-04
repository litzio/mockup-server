# 지연 측정과 취소 검증 (#26)

## 조사 범위와 판정

평가 기준 `8977c604`에서 HTTP 지연 최소 1500ms 검사에 1495.6ms가 관측되었고 단독 재실행은 통과했다는 사용자 보고를 출발점으로 한다. 원래 실패 시점의 서버 요청 journal·시계 진단·런타임 추적이 없으므로 원인을 확정할 수 없다. 재실행 성공은 과거 실패의 해결 증거가 아니다.

매핑의 `fixedDelayMilliseconds: 1500`과 테스트의 `ms >= 1500`을 유지한다. 지연 값을 늘려 경계 실패를 숨기거나 허용 오차를 넣지 않는다. 이번 변경은 관측과 별도 클라이언트 취소 검증의 보강이며, 미재현 결함을 수정했다고 주장하지 않는다.

## 확인한 적용·측정 경계

- [WireMock 3.13.2 StubResponseRenderer](https://github.com/wiremock/wiremock/blob/3.13.2/src/main/java/com/github/tomakehurst/wiremock/http/StubResponseRenderer.java)는 응답 정의의 고정 지연을 응답에 전달한다.
- [동일 버전 servlet](https://github.com/wiremock/wiremock/blob/3.13.2/src/main/java/com/github/tomakehurst/wiremock/servlet/WireMockHandlerDispatchingServlet.java)의 동기 경로는 응답 전 `MILLISECONDS.sleep`을 호출한다. 비동기 설정 시에는 executor에 지연 실행을 예약한다. 저장소 compose는 비동기 응답 옵션을 추가하지 않는다. 이는 구현 경로의 확인이며, 실패 환경의 실제 스케줄링·시계 오차 원인 규명은 아니다.
- 기존 테스트는 `performance.now()`로 fetch 직전부터 본문 JSON 파싱 완료까지 측정했다. 헤더만 받은 시점이나 서버 지연 시작 시점을 측정한 값이 아니다. 서버 내부 지연 시간과 클라이언트 왕복 경과시간을 동일한 계측으로 간주하지 않는다.
- 보강된 로그는 헤더 수신 경과시간, 기존 본문 완료 경과시간, `process.hrtime.bigint()` 경과시간, 매칭 stub ID를 남긴다. 두 클라이언트 시계는 진단용이며 독립된 서버 시계의 증거는 아니다. 1500ms 단언은 원래 `performance.now()` 측정을 그대로 사용한다.
- 서비스 테스트 실행기는 파일을 순차 실행한다. 시나리오 선택을 await하고 상태를 확인한 뒤 요청한다. 자체 전용 Compose 프로젝트에서 실행해 다른 작업의 시나리오 변경을 배제한다. 원래 실패 환경에도 외부 경합이 없었다고 소급 주장하지 않는다.

## 재현 절차

Node.js 24, 사전 반입된 `wiremock/wiremock:3.13.2` 이미지를 사용한다. 아래 프로젝트는 이 검증에서 새로 만든 전용 프로젝트여야 한다. 이미 같은 이름의 서비스가 있으면 다른 고유 이름을 사용한다.

```powershell
$env:JIRA_PORT = '18781'
$env:CONFLUENCE_PORT = '18782'
$env:JIRA_BASE_URL = 'http://127.0.0.1:18781'
$env:CONFLUENCE_BASE_URL = 'http://127.0.0.1:18782'
docker compose -p mockup-v2-delay up -d --pull never
node scripts/wait-services.mjs
node --test services/jira/tests/error-scenarios.test.mjs
# 최초 실행과 구분해 고정 1회 재기동 검증; 실패 시에도 첫 로그 보존
docker compose -p mockup-v2-delay restart
node scripts/wait-services.mjs
node --test services/jira/tests/error-scenarios.test.mjs
docker compose -p mockup-v2-delay down
```

기존 E 행렬은 모든 기존 지원 GET의 정상/오류/지연/인증 우선/제품 격리/리셋 단언을 유지한다. 지연 로그를 단언 전에 출력해 실패 샘플도 남긴다. 추가 검사는 제품별 고정 3회 지연 관측에서 admin으로 실제 매칭된 mapping의 1500ms와 delay 상태를 확인한다. 수치 미달은 모두 수집한 뒤 테스트를 실패시키며 성공할 때까지 재시도하지 않는다.

취소 검사는 같은 합성 GET에 Fetch `AbortSignal.timeout(500)`을 적용하고 `TimeoutError`와 1500ms 이전 취소를 확인한다. 취소 후에도 delay 상태와 다른 제품의 Started 상태가 유지되고, 후속 지연 응답과 reset 후 정상 응답이 올바른지 검증한다. 이 검사는 서버 지연 정확도 검증과 별도이며 실제 서비스 클라이언트의 타임아웃 구현 검증이 아니다. 실제 클라이언트는 사용자 확인으로 접근할 수 없다.

## 실행 기록

결과는 원시 로그와 함께 아래에 기록한다. 원래 1495.6ms 보고는 이번 로그로 덮어쓰지 않는다.

2026-11-04 실측: Windows PowerShell 7.6.9, Node.js 24.21.0, Docker CLI/Engine 29.7.2, Compose 5.4.0. WireMock 이미지 ID는 `sha256:0d4ecb3e4dc8213fd7a4d37d6a78f6e6b553a6d2e15bd51b0999781282ac61b3`다. 기준 소스는 `8977c604`이며 실행한 변경 테스트의 Git blob은 `c37ffeab8364a41fd676b6d6d91aa8d717a79a86`이다. 제품 매핑·fixture는 변경하지 않았다.

| 실행 | 결과 | 기록된 지연 48건의 범위 | 500ms 취소 실측(Jira / Confluence) |
| --- | --- | --- | --- |
| 최초 기동 | 2/2 PASS, exit 0 | 1502.6846–1523.2429ms | 507.0274 / 512.0471ms |
| 사전 계획한 1회 재기동 | 2/2 PASS, exit 0 | 1502.9341–1515.4627ms | 505.4627 / 499.8900ms |

[최초 원시 로그](evidence/issue26/first.log), [재기동 원시 로그](evidence/issue26/restart.log), [정책 검사 55/55](evidence/issue26/policy.log)를 보존한다. 범위는 로그가 있는 기존 행렬 40건과 추가 경계 6건·취소 후 2건의 합계이며 기존 테스트 내부의 나머지 지연 요청까지 전수 계측했다고 주장하지 않는다. 로그에는 반올림하지 않은 원시 수치가 있다. 취소 검사는 500ms 정확도를 판정하지 않고 TimeoutError로 지연 응답 전에 중단했는지를 판정하므로 499.8900ms도 숨기지 않는다.

준비 단계에서 Docker daemon 미기동으로 최초 compose 명령이 실패했고 컨테이너는 생성되지 않았다. 조율 담당자가 기존 Docker Desktop을 기동한 뒤 위 두 HTTP 실행을 수행했다. `npm ci`, 폼 일치 검사, `git diff --check`도 통과했다. 종료 후 전용 Compose label의 컨테이너 조회는 빈 목록이었다. 기존 서비스와 Docker Desktop 자체는 종료하지 않았다.

판정: 이번 환경의 반복 지연·취소 검증은 PASS다. 과거 1495.6ms 현상은 이번 두 실행에서 재현되지 않았으며 원인은 미규명이다. 이 상태는 지연 결함 수정 완료나 실제품 지연/성능 보증을 뜻하지 않는다. 동일 현상이 다시 나오면 단언 이전 수치·매칭 ID·상태와 해당 서버 journal을 보존해 조사해야 한다.
