# Confluence v2 검증 (#25, #31)

## 추가 인수 명세 이전 초안 기록 (01a86e6 / 04e8f5a)

아래 결과는 새 인수 JSON을 전달받기 전의 초안 검증이다. 현재 canonical 인수 충족의 증거로 전용하지 않는다. 기준 소스는 8977c604이며 구현은 PR의 고유 diff에 있다. 최종 실행한 personal-space.test.mjs Git blob은 092c0abfec701a6c69d6ecfc33d3eb458a1f6a2b, v2-personal-pages.json Git blob은 56d559662f10e58fdb76639ce50125f1648edc1b 이다. 실제 클라이언트와 실제 Confluence 9.2.17은 접근 불가로 실행하지 않았다.

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

## 사용자 인수 JSON 반영 후 기록 (#31)

이 기록은 canonical `synthetic-acceptance-v1` 사용자/공간/페이지와 anonymous identity 및 확장 계약을 반영한 실행이다. 입력 JSON은 전달본과 바이트 단위 SHA-256 `d0484d862470cb5f4d18dd2715546deb2941eaa035d9e142d856dd4639d43496`이 같다. 생성기 Git blob은 `3474e9eefc353761d241ae7748c0b8d9b2befa13`, 269개 매핑 출력 blob은 `7024804cfeae7a15eb21404f3a8bc44217932bdf`다. 이번 단계의 main 기반은 `fb25765`이고 Jira #29 통합 전의 Jira v1 회귀를 함께 실행했다. 최종 통합 commit 검증과 `/custom-context` 공통 인수는 #27/#31에서 추가한다.

실측 환경은 Node 24.21.0, PowerShell 7.6.9, Docker Engine 29.7.2, Compose 5.4.0, 고정 WireMock 3.13.2다. 전용 프로젝트/포트는 위와 같고 모든 up은 `--pull never`였다.

| 실행 | 결과 / 증거 |
| --- | --- |
| 새 Confluence 모듈 최초 순차 실행 | 10/10 PASS, exit0 |
| 폼/정책/생성물 drift/whitespace | 일치, 55/55 PASS, 269개 매핑 일치, exit0 |
| 기본 Base URL 전체 회귀 | [27/27 PASS 원시 로그](evidence/issue31-confluence/base-http.log), exit0 |
| `/confluence` Base URL 새 모듈 전체 | [10/10 PASS 원시 로그](evidence/issue31-confluence/context-http.log), exit0 |
| 기본/context 지연 | 새 경로 51건씩 모두 1500ms 이상; raw monotonic 수치 보존 |
| 정리 | 직접 시작한 Compose 프로젝트 down 후 해당 소유 label의 컨테이너 목록 비어 있음 |

이 단계의 제품 테스트 실패는 없었다. 위 초안의 Started PUT 하네스 실패는 그대로 보존한다. 새 데이터에 맞춰 기존 테스트를 바꿀 때, storage-only의 전체 메타데이터 동등성 단언을 삭제로 끝내지 않고 explicit combined expansion에서 유지했다. identity 401 기대는 관찰된 anonymous200/type/identity-field 부재 단언으로 대체하고 보호 자원의 401 단언은 유지했다. canonical seed에 없는 이전 경로는 문서화된 별칭으로 검증한다.

기본 단계는 `node scripts/test-services.mjs`, context 단계는 위 context 준비/up 후 `node --test --test-concurrency=1 services/confluence/tests/*.test.mjs`로 실행했다. 테스트 출력은 각각 `Tee-Object`로 위 파일에 보존했다. shared scenario를 변경하는 파일을 동시에 실행하지 않았다. 기본 단계의 shared E는 Confluence anonymous 예외를 반영하며 기존 시간 하한/취소/제품 격리/리셋 단언을 유지한다.

실제 소비자 접근이 불가능하므로 G-CONSUMER와 관련 consumer_integration 결과는 **NOT_RUN**이다. 이 모듈 결과만으로 전체 인수 게이트 PASS나 v2 전체 완료를 선언하지 않는다. 실제품 권한/SSO/TLS/프록시 및 완전한 망 차단 반입 재실행도 별도 검증이다.

공통 U checker도 새 Confluence 관찰 계약으로 갱신했다. 잘못된 PAT는 anonymous200/identity-field 부재로 검사하고, canonical 개인 공간30001..3을 따라 기존 next/prev 실제 추적 단언을 유지한다. 같은 `/jira`/`/confluence` Base URL에서 `node scripts/check-context.mjs` 두 제품 PASS(exit0) 후 전용 자원을 종료했다.
