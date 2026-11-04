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
node scripts/test-services.mjs
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

빈 store → 외부pull/IP 접속 실패 → 빈 store 재확인 → wiremock.tar load/ID·아키텍처 확인 → 기본/context 각각 기동·Started HTTP 확인·전체 HTTP 오류/리셋 테스트·self/next/prev 추적 → forbidden 설정 및403 확인 → down/up → Started와 전체 검증 반복을 수행한다. 검증은 Windows PowerShell/Compose/Node에서 수행하며 원격 bind 경로만 DinD 내부 staging으로 변환한다. 제품 데이터·명령은 반입 Compose에서 가져온다. 모든 명령의 JSON 인자·출력·종료코드는 commands.log, 변환한 Compose는 remote-compose.json에 남긴다. 실패하면 예외로 비정상 종료하며 자신이 생성한 자원만 finally에서 정리한다. Docker Desktop은 종료하지 않는다.

이는 **독립 Linux image store의 cache 비의존·다운로드 차단 증거**와 **Windows 제어/검증 실행 증거**를 결합한다. Windows host 전체를 새로 설치하거나 host의 모든 외부통신을 차단한 시험은 아니다. 검증 스크립트 자체는 반입 파일과 사전 런타임만 사용하며 npm install·CDN 요청을 하지 않는다. host의 DinD 도구이미지 load는 archive/ID 검증으로 출처를 기록하지만 host image store를 비우지는 않는다.

## 독립 daemon 실측 메모 (최종 인수 아님)

2026-11-04, source 6cab8a5, Windows x64, PowerShell 7.6, Node 24.21.0, Docker Desktop 4.87.0, CLI/Engine 29.7.2, Compose plugin 5.4.0. 기존 계약의 Compose v2 명칭은 plugin 방식의 Compose를 뜻하며 실측 버전은 5.4.0이다.

검증 도구 docker:29.7.2-dind의 pull digest는 sha256:3ef33f2e220b79ed3ef3b99d81746f06f306cd6340e2cb7331d17ae996e74cb6 이다. DinD 전용 privileged 컨테이너만 사용했다. 호스트 socket/storage를 마운트하지 않았으며 /var/lib/docker는 새 anonymous volume이다. 관리 포트는 host 127.0.0.1:18475에만 게시했다.

- internal 전용 network에서는 daemon이 정상 시작해도 Windows published port 연결은 거부되었다. 이 구성을 성공 절차로 사용하지 않는다.
- 전용 bridge 연결 후 Windows `docker -H tcp://127.0.0.1:18475 info` 성공. 독립 daemon ID 28e8509c-9968-4da5-9cf1-82aed58c3e3d, load 전 `image ls --no-trunc`는 0개였다.
- DinD namespace OUTPUT은 ESTABLISHED/RELATED와 loopback만 허용하고 나머지는 REJECT. DOCKER-USER는 ESTABLISHED/RELATED 허용, 외부 interface eth0/eth1로 나가는 신규 forwarding은 REJECT, 내부 forwarding은 RETURN. IPv6 OUTPUT/FORWARD DROP. 호스트 전역 방화벽은 변경하지 않았다.
- 차단 후 독립 daemon `pull wiremock/wiremock:3.13.2`는 registry 공인IP TCP443 connection refused로 실패. `wget http://1.1.1.1`도 실패. load 전 이미지 목록은 계속 0개였다.
- host에서 save한 wiremock.tar를 Windows CLI `docker -H ... load -i ...`로 반입. 이미지 sha256:0d4ecb3e4dc8213fd7a4d37d6a78f6e6b553a6d2e15bd51b0999781282ac61b3, amd64 확인.
- `docker cp services mockup-issue14-daemon:/bundle-services` 뒤 Windows Compose가 daemon 내 절대경로 /bundle-services/{jira,confluence}를 mount하는 임시 구성을 사용했다. Windows 경로를 원격 daemon의 bind 경로로 전달하지 않는다. 내부 product port는 0.0.0.0에 bind하고 외부 host 게시만 127.0.0.1:18481/18482로 제한했다.
- Windows Node에서 두 Base URL을 18481/18482로 설정해 wait-services와 test-services 실행: 종료코드 0, 26/26 통과. 이는 당시 baseline HTTP 검증이며 E/U/최종 O 검증은 아니다.

최종 증거에는 각 명령의 원문 로그·종료코드, checksum 확인, load 전후, 차단 재확인, #12 오류/초기화, #13 context/링크, down/up 재검증을 함께 남겨야 한다. 이 실험은 Linux 독립 image store와 Windows 제어 경로를 확인하며, 새 Windows 전체 무cache 설치 검증은 아니다. 최종 검증에 사용하는 DinD 도구이미지도 따로 아카이브/체크섬/버전 기록해 반입해야 한다.
