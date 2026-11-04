# Confluence v2 검증 (#25)

기준 소스는 8977c604이며 구현은 PR의 고유 diff에 있다. 최종 실행한 personal-space.test.mjs Git blob은 092c0abfec701a6c69d6ecfc33d3eb458a1f6a2b, v2-personal-pages.json Git blob은 56d559662f10e58fdb76639ce50125f1648edc1b 이다. 실제 클라이언트와 실제 Confluence 9.2.17은 접근 불가로 실행하지 않았다.

2026-11-04, Node.js 24.21.0, PowerShell 7.6.9, Docker Engine 29.7.2, WireMock 3.13.2에서 수행했다. 전용 Compose 프로젝트 mockup-v2-confluence, Jira 18581/Confluence 18582 포트를 사용했다. 외부 다운로드 없이 기존 고정 이미지로 기동했으며 완전한 망 차단 검증은 이 작업 범위 밖이다.

| 실행 | 결과 |
| --- | --- |
| npm ci, 폼 일치 검사, npm test, git diff --check | 성공, 정책 55/55 |
| 기본 Base URL, node scripts/test-services.mjs | 31/31, exit 0 |
| 최종 테스트 소스, context Base URL, personal-space.test.mjs | 3/3, exit 0 |
| context Base URL, node scripts/check-context.mjs | 두 제품 U PASS, exit 0 |
| 최종 테스트 소스, 기본 Base URL, personal-space.test.mjs | 3/3, exit 0 |
| 전용 Compose down 및 소유 label 컨테이너 조회 | 종료 후 빈 목록 |

기본 전체 회귀 이후 새 테스트에 Connection: close 및 각 새 delay 요청의 1500ms 하한 단언을 추가했다. 이후 변경된 테스트를 context와 기본 환경에서 각각 실행했다. 최종 두 실행은 새 경로의 지연 49건씩 전부 1500ms 이상이었으며 기준을 완화하지 않았다. 상태 선택·인증 우선·미지원 경계·자연404·리셋 및 합성 페이지 탐색을 함께 검사했다.

첫 개발 검사는 새 테스트에서 Started를 PUT으로 선택하려다가 관리자 API가 거부하여 3개 테스트가 실패했다. 정상 상태 복귀를 기존 계약대로 POST /__admin/scenarios/reset으로 고쳤다. 서버 지연 실패가 아니며 이 실패를 최종 통과로 덮어쓰지 않는다. 최초 전체 Confluence 테스트를 파일 병렬로 호출한 명령도 최종 근거로 사용하지 않는다. 상태를 다루는 최종 전체 검증은 기존 test-services.mjs의 파일 순차 실행으로 수행했다.

재현 명령(작업에서 새로 소유한 프로젝트명과 충돌 없는 포트를 사용):

```powershell
$env:JIRA_PORT='18581'
$env:CONFLUENCE_PORT='18582'
$env:JIRA_BASE_URL='http://127.0.0.1:18581'
$env:CONFLUENCE_BASE_URL='http://127.0.0.1:18582'
docker compose -p mockup-v2-confluence up -d --pull never
node scripts/wait-services.mjs
node scripts/test-services.mjs
docker compose -p mockup-v2-confluence down
$env:JIRA_CONTEXT='/jira'
$env:CONFLUENCE_CONTEXT='/confluence'
$env:JIRA_BASE_URL='http://127.0.0.1:18581/jira'
$env:CONFLUENCE_BASE_URL='http://127.0.0.1:18582/confluence'
node scripts/prepare-context.mjs
docker compose -p mockup-v2-confluence -f compose.yaml -f compose.context.yaml up -d --pull never
node scripts/wait-services.mjs
node --test services/confluence/tests/personal-space.test.mjs
node scripts/check-context.mjs
docker compose -p mockup-v2-confluence -f compose.yaml -f compose.context.yaml down
```

지원은 명시된 유한 쿼리 조합이다. 임의 start/limit, CQL, 권한·SSO·TLS·프록시 및 실제 클라이언트 호환성을 보증하지 않는다. 최종 v2 통합 인수·반입 검증은 #27에서 별도로 수행한다.
