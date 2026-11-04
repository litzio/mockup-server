# 폐쇄망 반입 구성 (#14)

최종 실행 증거는 아래 검증 결과에 기록한다. 실제 Jira/Confluence 서버 호환성 검증과는 별개다.

## 온라인 패키징

Windows x64, PowerShell 7, Docker Desktop Linux engine, Compose plugin, Node.js 24를 사전에 설치한다. 스크립트는 런타임 설치나 전역 설정 변경을 수행하지 않는다.

깨끗하게 commit한 저장소 루트에서 `node scripts/offline/package.mjs C:/Transfer/mockup-bundle`을 실행한다. 대상은 저장소 밖의 새 디렉터리여야 한다. Docker pull은 이 온라인 단계에서만 수행한다. 모든 추적 파일, WireMock 3.13.2 linux/amd64 아카이브 wiremock.tar, 검증용 docker:29.7.2-dind linux/amd64 아카이브 dind.tar, 이미지ID/digest/원본commit/준비 버전을 기록한 bundle.json, SHA256SUMS를 만든다. .runtime, node_modules, 개발자cache는 반입하지 않는다.

반입 직후 루트에서 `node scripts/offline/checksums.mjs .`로 누락·변경·추가 파일을 확인한다. 이 목록은 전송 손상 검사이며 신뢰할 수 있는 발신자의 서명은 아니다. context 출력 생성과 기동 전에 실행한다. HTTP 검증은 Node built-in만 사용하며 npm ci가 필요하지 않다. 저장소 관리 정책 테스트의 npm 의존성은 오프라인 HTTP 실행 요구사항이 아니다.

## 반입 후 일반 실행

반입 디렉터리 루트에서 실행한다. WireMock의 공개 관리API는 PAT로 보호되지 않으므로 host 게시를 loopback에 유지한다. 사전 런타임은 Windows x64 + PowerShell 7 + Docker Desktop Linux engine/Compose plugin + Node.js 24다. 설치·인증·전역 설정 변경은 사용자가 별도로 준비한다.

```powershell
node scripts/offline/checksums.mjs .
docker load -i wiremock.tar
$env:JIRA_CONTEXT = '/jira' # 기본 context는 빈 문자열
$env:CONFLUENCE_CONTEXT = '/confluence'
$env:JIRA_PORT = '8081'
$env:CONFLUENCE_PORT = '8082'
$env:JIRA_BASE_URL = 'http://127.0.0.1:8081' + $env:JIRA_CONTEXT
$env:CONFLUENCE_BASE_URL = 'http://127.0.0.1:8082' + $env:CONFLUENCE_CONTEXT
node scripts/prepare-context.mjs
docker compose -p mockup-offline -f compose.yaml -f compose.context.yaml up -d --pull never
node scripts/wait-services.mjs
node scripts/offline/state.mjs started
if ($env:JIRA_CONTEXT -or $env:CONFLUENCE_CONTEXT) {
  node --test services/jira/tests/error-scenarios.test.mjs
} else {
  node scripts/test-services.mjs
}
node scripts/check-context.mjs
# 매핑은 보존하고 각 제품의 시나리오를 기본 상태로 초기화한다.
Invoke-RestMethod -Method Post http://127.0.0.1:8081/__admin/scenarios/reset
Invoke-RestMethod -Method Post http://127.0.0.1:8082/__admin/scenarios/reset
node scripts/offline/state.mjs started
docker compose -p mockup-offline -f compose.yaml -f compose.context.yaml down
```

다시 같은 up 명령부터 실행하면 Started 상태에서 기동한다. 데이터는 합성 읽기 전용이며 사용자 쓰기를 저장하지 않는다. 재반입 checksum 확인은 생성된 .runtime이 없는 새 디렉터리에서 한다. 실패한 checksum을 무시하고 기동하지 않는다.

## 격리 검증 재현

체크섬이 아직 변하지 않은 새 반입 디렉터리와 별도의 새 증거 디렉터리를 준비한다. 다른 서비스와 충돌하지 않는 예약 포트 18475/18481/18482를 사용한다.

```powershell
pwsh -NoProfile -File C:/Transfer/mockup-bundle/scripts/offline/verify-isolated.ps1 `
  -Bundle C:/Transfer/mockup-bundle -Evidence C:/Transfer/mockup-evidence `
  -HostContext desktop-linux
```

스크립트는 checksum 확인 후 dind.tar를 host daemon에 load하고 작업 전용 network/privileged DinD를 생성한다. host socket/storage 마운트는 없다. DinD는 새 anonymous volume과 빈 image store를 가진다. 컨테이너 namespace 방화벽으로 daemon OUTPUT과 nested container 외부 forwarding의 신규 연결을 차단하고 IPv6도 차단한다. host의 Windows 네트워크/방화벽 설정은 바꾸지 않는다. Docker의 내장 DNS 응답 자체를 차단했다고 주장하지 않으며 registry/IP TCP 연결 차단과 방화벽 정책을 함께 기록한다.

빈 store → 외부pull/IP 접속 실패 → 빈 store 재확인 → wiremock.tar load/ID·아키텍처 확인 → 기본/context 각각 기동·Started HTTP 확인·오류/리셋 테스트·self/next/prev 추적 → forbidden 설정 및403 확인 → down/up → Started와 검증 반복을 수행한다. 기본 모드는 test-services의 전체 HTTP 회귀, context 모드는 기존 E 오류 테스트와 U check-context를 실행한다. 기본 전용 페이지네이션 테스트의 빈 context 단언은 바꾸지 않는다. 검증은 Windows PowerShell/Compose/Node에서 수행하며 원격 bind 경로만 DinD 내부 staging으로 변환한다. 제품 데이터·명령은 반입 Compose에서 가져온다. 모든 명령의 JSON 인자·출력·종료코드는 commands.log, 변환한 Compose는 remote-compose.json에 남긴다. 실패하면 예외로 비정상 종료하며 고유 소유 label이 일치하는 자신의 컨테이너만 finally에서 정리한다. Docker Desktop은 종료하지 않는다.

이는 **독립 Linux image store의 cache 비의존·다운로드 차단 증거**와 **Windows 제어/검증 실행 증거**를 결합한다. Windows host 전체를 새로 설치하거나 host의 모든 외부통신을 차단한 시험은 아니다. 검증 스크립트 자체는 반입 파일과 사전 런타임만 사용하며 npm install·CDN 요청을 하지 않는다. host의 DinD 도구이미지 load는 archive/ID 검증으로 출처를 기록하지만 host image store를 비우지는 않는다.

## 검증 결과와 증거

**O: PASS** — 2026-11-04 최종 격리 검증의 상위 pwsh 종료코드는 **0**이다. [최종 원시 명령 로그](evidence/issue14/final.commands.log.gz), [상위 실행 출력과 종료코드](evidence/issue14/final.console.log.gz), [실행한 원격 Compose](evidence/issue14/remote-compose.json)를 보존했다. 로컬 준비/전달 파일은 `C:/Users/swBaek/Downloads/mockup-server-offline-a5645c6`이며 이 폴더도 재생성물 없이 checksum 131개를 확인했다. 바이너리 아카이브는 Git에 commit하지 않는다.

실제 실행 명령은 다음과 같다. Evidence는 새 디렉터리여야 한다.

```powershell
node scripts/offline/package.mjs "$env:TEMP/mockup-issue14-final-bundle-2"
pwsh -NoProfile -File scripts/offline/verify-isolated.ps1 `
  -Bundle "$env:TEMP/mockup-issue14-final-bundle-2" `
  -Evidence "$env:TEMP/mockup-issue14-final-evidence-2"
```

| 항목 | 최종 결과 |
| --- | --- |
| 체크섬/출처 | 131 files, DinD archive host load/ID 일치, 독립 store 0개 |
| 외부 차단 | daemon registry pull 실패1, 외부 IP wget 실패1, load 전 store 여전히0; nested 제품 외부 TCP 실패1 |
| WireMock 반입 | archive load 성공0, 이미지ID 및 linux/amd64 일치 |
| 기본 모드 | 전체 HTTP 28/28 + U 두 제품 링크 추적, 기동/재기동 2회 모두0 |
| context 모드 | 기존 E 1/1 + U 두 제품 링크 추적, 기동/재기동 2회 모두0 |
| 초기화/상태 | E의 리셋/반복/제품격리/인증우선/지연 검증; 두 모드 각각 forbidden403 후 down/up Started 및 정상200 확인 |
| 종료/정리 | 자신이 생성한 project/container/anonymous volume/network 정리0; 최종 PASS는 정리 후 출력 |

정책 검증은 `npm run issues:forms -- --check` 0, `npm test` 55/55(기존 context 검사와 checksum 경계16 포함), `git diff --check` 0이다. #15는 통합 main에서 인수 결과를 다시 생성해야 한다. 이 결과는 실제 Jira/Confluence 호환성 보증이 아니다.

원본 소스는 main 9060a3fe2ef5c3672c878027387ec242d75a3c34에 #14 도구를 더한 a5645c67e5ee8fd7195f65fffacae061e2f3800f다. [bundle.json](evidence/issue14/bundle.json)에 sourceSHA/두 이미지ID/digest/준비 버전을, [반입 파일 SHA-256 목록](evidence/issue14/bundle.SHA256SUMS)에 모든 131개 파일을 기록한다. 이 목록 자체의 SHA-256은 576ff61a933d1dfb3294e3f77320411ae3b78d2f11f6a2904b3678c89426a660이다. 최종 보고서 추가로 Git head가 바뀌어도 실행파일은 이 sourceSHA와 동일한지 별도 비교한다.

실측 환경은 Windows 11 Pro x64(build 26200), PowerShell 7.6.9, Node 24.21.0, Docker Desktop 4.87.0, CLI/Engine 29.7.2, Compose plugin 5.4.0이다. 다른 OS/architecture나 실제 대상 서버 검증은 미실행이다.

시도는 선택적으로 숨기지 않는다. source f0914d079c03aa23e3c4fa6faf974637bc129129의 첫 실행은 기본 전용 full HTTP 테스트를 context 모드에도 적용해 Confluence의 빈 context 단언 3건이 실패했다(상위 pwsh 종료코드1). [첫 시도 원시 로그](evidence/issue14/attempt1.commands.log.gz)를 보존한다. a5645c6은 기존 제품 테스트를 약화하지 않고 context 검증을 기존 U/E로 분리했다.

포트 충돌 회귀는 로컬 TcpListener로 18475를 임시 점유한 뒤 동일 a5645c6 스크립트를 실행했다. docker run은 컨테이너 생성 후 bind 오류125, pwsh는1로 실패했고, GUID 소유 label 확인 후 컨테이너/네트워크 삭제 및 별도 inspect 부재를 확인했다. [명령 로그](evidence/issue14/port-failure.commands.log.gz), [상위 출력](evidence/issue14/port-failure.console.log.gz), [정리 후 inspect](evidence/issue14/port-failure-cleanup.log.gz)를 보존한다. 재현 시 예약 포트의 다른 작업이 없는지 확인하고 아래처럼 자신의 listener만 닫는다.

```powershell
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18475)
$listener.Start()
try {
  pwsh -NoProfile -File scripts/offline/verify-isolated.ps1 -Bundle C:/Transfer/mockup-bundle -Evidence C:/Transfer/mockup-port-failure
  # 예상 종료코드 1. raw log의 docker run은125이며 정리는0이어야 한다.
} finally { $listener.Stop() }
docker inspect mockup-issue14-daemon # 예상 실패: 없음
docker network inspect mockup-issue14-control # 예상 실패: 없음
```

로그는 원문 바이트를 유지해 gzip으로 보관한다. 별도 설치 없이 Node로 읽을 수 있다.

```powershell
node --input-type=module -e "import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';process.stdout.write(gunzipSync(readFileSync(process.argv[1])))" docs/evidence/issue14/attempt1.commands.log.gz
```
