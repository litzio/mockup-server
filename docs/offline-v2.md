# v2 오프라인 실행

대상은 합성 Jira/Confluence 읽기 모의 서버다. 현재 요청 계약은 `docs/acceptance/mockup-server-acceptance.json`과 제품별 `services/*/api-support.md`에 있다. 실제 소비자/제품의 권한·SSO·TLS·프록시 호환성 및 Windows host 전체의 완전한 망 차단은 별도 미검증이다.

## 온라인 준비

PowerShell 7, Node.js 24, Docker Linux engine/Compose를 미리 준비한다. 설치와 전역 설정 변경은 스크립트가 수행하지 않는다. 깨끗한 source commit에서 실행한다.

```powershell
npm ci
node scripts/offline/package.mjs C:/Transfer/mockup-v2-bundle
```

패키징만 이미지 다운로드를 수행한다. WireMock 3.13.2 linux/amd64 및 검증 도구 docker:29.7.2-dind를 archive로 저장하고 image ID/digest·source commit·fixture version·런타임 버전·SHA256SUMS를 기록한다. Ajv 8.20.0과 lockfile에 고정된 전이 의존성 전체 및 라이선스를 포함한다. 반입 후 npm install/ci나 image pull이 필요하지 않다.

반입 범위는 현재 mappings/fixtures/tests/generators, 공통 실행/검증 스크립트, 제공 명세/출처/이 운영 안내와 schema-validator 의존성이다. `.env`, credential 파일, Git 이력, 과거 증거, 기존 README/과거 실행 문서는 제외한다. 포함·제외된 추적 경로는 bundle.json에 명시한다. 재현 가능한 반입을 위해 자사 runtime 텍스트는 UTF-8 LF로 복사하고 전이 의존성/라이선스 바이트는 그대로 보존한다. source 비교도 이 LF 정규화 범위를 명시하며 실제 반입 바이트는 SHA256SUMS로 확인한다. 과거 증거의 현재 저장소 사본도 익명화 파생본으로 표시하며 원래 hash와 실패 결과는 보존한다. 기존 제3자 라이선스는 수정하지 않는다.

## 반입 후 단독 실행

새로 만든 전용 프로젝트와 충돌하지 않는 포트를 사용한다. 아래 이름의 프로젝트가 이미 있으면 다른 이름을 정하고 해당 프로젝트만 정리한다.

```powershell
node scripts/offline/checksums.mjs C:/Transfer/mockup-v2-bundle
Set-Location C:/Transfer/mockup-v2-bundle
docker load -i wiremock.tar
$env:JIRA_PORT='18781'
$env:CONFLUENCE_PORT='18782'
$env:JIRA_BASE_URL='http://127.0.0.1:18781'
$env:CONFLUENCE_BASE_URL='http://127.0.0.1:18782'
docker compose -p mockup-v2-review up -d --pull never
node scripts/wait-services.mjs
node scripts/offline/state.mjs started
node scripts/test-services.mjs
node scripts/check-context.mjs
node scripts/acceptance/run.mjs --owned --server-only --output C:/Transfer/acceptance-default.json
Invoke-RestMethod -Method Post http://127.0.0.1:18781/__admin/scenarios/reset
Invoke-RestMethod -Method Post http://127.0.0.1:18782/__admin/scenarios/reset
node scripts/offline/state.mjs started
docker compose -p mockup-v2-review down
```

기본 context는 빈 문자열이다. 제품별 `/jira`, `/confluence`와 인수용 `/custom-context`를 허용한다. `/custom-context` 실행은 두 CONTEXT 변수와 Base URL을 바꾸고 `node scripts/prepare-context.mjs` 후 `-f compose.yaml -f compose.context.yaml`로 기동한다. staging은 `.runtime`에 생성되므로 checksum 검사는 생성 전에 수행한다. 컨텍스트가 있을 때 context 없는 제품 경로는 미지원이다. 관리API는 항상 origin의 `/__admin`이며 제품 토큰으로 보호된다고 주장하지 않는다.

`--server-only`가 없으면 필수 실제 소비자 증거가 없는 보고는 exit 2다. 옵션이 있어도 보고서의 NOT_RUN/BLOCKED와 `completion.declared=false`는 바뀌지 않는다. 서버 실행 실패는 exit 1이며 재시도로 이전 보고를 덮어쓰지 않는다. 출력 파일은 항상 새 경로여야 한다.

## 다운로드 차단 격리 인수

```powershell
pwsh -NoProfile -File C:/Transfer/mockup-v2-bundle/scripts/offline/verify-isolated.ps1 -Bundle C:/Transfer/mockup-v2-bundle -Evidence C:/Transfer/mockup-v2-evidence -HostContext desktop-linux
node scripts/acceptance/audit.mjs --source C:/Projects/mockup-server --bundle C:/Transfer/mockup-v2-bundle --evidence C:/Transfer/mockup-v2-evidence --output C:/Transfer/mockup-v2-audit.json
node scripts/acceptance/aggregate.mjs --reports C:/Transfer/mockup-v2-evidence --lifecycle C:/Transfer/mockup-v2-evidence/lifecycle.json --audit C:/Transfer/mockup-v2-audit.json --output C:/Transfer/mockup-v2-final.json --server-only
```

audit는 source checkout에서 수행하며 `--denylist <비공개 JSON>`을 추가할 수 있다. denylist 값은 출력·반입하지 않는다. source와 bundle의 포함 파일 hash가 일치해야 한다. 외부 설치가 없는 실행 자체는 bundle만으로 가능하고 source checkout은 최종 source/산출물 동시 감사에만 사용한다.

격리 도구는 별도 DinD image store가 빈 상태인지 확인하고 namespace 내 신규 외부 연결을 차단한다. 실패하는 registry/IP probe 및 제품 컨테이너의 외부 연결 차단, archive load ID/architecture를 확인한다. 기본/custom-context에서 기동/재기동 각 2회 동안 전체 또는 context 대응 회귀, 91행 보고와 fault/reset을 수행한다. 시작 전 기존 자원을 거부하며 고유 소유 label을 확인한 자기 컨테이너/네트워크만 종료한다. Docker Desktop이나 기존 서비스·host 방화벽은 변경하지 않는다.

로그의 bundle/evidence/home/user/host 식별자는 합성 경로/값으로 치환한다. source SHA·exit code·시간 수치·실패는 유지한다. `lifecycle.json`은 성공한 생명주기와 정리 후에만 생성되며 명령 로그 hash와 연결된다. 내부 DNS 응답 차단이나 host 전체 air-gap을 증명하는 시험이 아니다. 완전한 망 차단 반입 재실행은 별도 검증 항목이다.
