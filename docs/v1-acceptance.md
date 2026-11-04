# v1 최종 통합 인수 (#15)

실행 대상은 #9~#14가 통합된 main `04ecd0f9b2abe078d17c59a496f869950be3b3fa`다. #14의 실행 결과를 재사용하지 않고 이 SHA에서 새 패키지를 만들어 직접 실행했다. 실제 Jira Software 9.12.28 / Confluence 9.2.17 호환성 검증은 **미실행**이며 v1 필수 범위 밖이다.

## 실행과 증거

2026-11-04 Windows x64 build 26200, PowerShell 7.6.9, Node 24.21.0, Docker CLI/Engine 29.7.2, Compose 5.4.0, WireMock 3.13.2 linux/amd64에서 실행했다. 반입물의 이미지 ID/digest와 전체 파일 체크섬은 [bundle.json](evidence/issue15/bundle.json), [SHA256SUMS](evidence/issue15/bundle.SHA256SUMS)에 있다. 바이너리 아카이브는 저장소에 넣지 않는다.

저장소 루트에서 실행한 명령은 다음과 같다. `$out`은 새 외부 디렉터리 `C:/Users/swBaek/AppData/Local/Temp/mockup-issue15-04ecd0f`다.

```powershell
node scripts/offline/package.mjs "$out/bundle"
pwsh -NoProfile -File scripts/offline/verify-isolated.ps1 -Bundle "$out/bundle" -Evidence "$out/isolated" -HostContext desktop-linux
pwsh -NoProfile -File "$out/verify-u.ps1"
```

추가 U 실행 스크립트는 [원본](evidence/issue15/verify-u.ps1)으로 보존한다. [격리 원시 명령 로그](evidence/issue15/isolated.commands.log.gz), [상위 출력/종료코드](evidence/issue15/isolated.console.log.gz), [U 출력/종료코드](evidence/issue15/u.console.log.gz), [패키징 출력](evidence/issue15/packaging.log.gz), [원격 Compose](evidence/issue15/remote-compose.json)를 함께 확인한다. gzip 읽기는 [오프라인 문서](offline.md)의 Node built-in 예시를 따른다.

## 계약별 판정

필수 실행 항목 B-J~O는 PASS이며 실패·미실행은 없다. 상위 harness 종료코드는 0이고, 기본 전체 HTTP 28/28을 2회, context E 1/1과 U를 2회씩 통과했다. 반입 checksum 140개를 확인했고 추가 U는 제품별 12건을 통과했다. 자신의 daemon/network/anonymous volume 및 U 프로젝트 정리 후 부재를 확인했다.

지연 실측 160건은 1502.6–1513.3ms로 모두 최소1500ms 단언을 통과했다. 외부 pull/IP의 비정상 종료는 차단을 확인하는 예상 결과이며 테스트 실패가 아니다. 이번 #15 실행에서 실패한 시도는 없었다.

| 계약 | 실행 검증 위치 / 필요한 관찰 | 결과 |
| --- | --- | --- |
| B-J/J-L | `current-user`, `project-issue`, `search`, `numeric-alias.test.mjs`: 프로젝트→전체 페이지→상세, 빈/마지막/범위밖, 키·ID·관계, 인증·미지원 경계 | PASS |
| B-C/C-L | `current-user`, `space-page`, `pagination.test.mjs`: 공간→페이지→storage, self/next/prev, 누락·중복·확장·경계 | PASS |
| E | `error-scenarios.test.mjs`: 양 제품 전체 지원 GET의 상태·PAT 우선·데이터 비노출·1500ms 이상·격리·리셋 반복; 각 모드 forbidden403→down/up→Started200 | PASS |
| U | 동일 `check-context.mjs`: 격리 18481/18482 기본·양 context 각 2회; 추가 8081/8082 기본 및 18581/18582 양방향 혼합 context, localhost/127.0.0.1 | PASS |
| O | 새 checksum 확인→독립 빈 image store→registry/IP 차단→store 여전히 빈 상태→archive load/ID 확인→기동/검증/종료/재기동/정리 | PASS |
| A | 실행 SHA·위 로그·정책·main CI·queue 연결. 이 보고서 PR의 최종 queue/main 확인은 병합 후 별도 기록 | 보류 |

## 커밋 연결과 완료 경계

실행 SHA의 필수 PR CI는 [41785876509](https://github.com/litzio/mockup-server/actions/runs/41785876509), 통합 queue는 [41786420859](https://github.com/litzio/mockup-server/actions/runs/41786420859), main push CI는 [41786782013](https://github.com/litzio/mockup-server/actions/runs/41786782013)로 성공했다. PR #21 head `26ac6e1a120f5ce371663d855796c5cb01012d4d`와 queue/main SHA를 구분한다. 로컬 `npm ci`, forms check, `npm test` 55/55, `git diff --check`는 모두 종료코드 0이다.

이 보고서를 추가한 commit은 실행 source SHA와 다르다. [runtime-hashes.json](evidence/issue15/runtime-hashes.json)은 실행 SHA에서 추적 파일 중 `docs/**`와 `*.md`만 제외한 **모든 파일**의 SHA-256을 기록한다(스크립트·fixture·매핑·테스트·Compose·CI·lockfile 포함). 보고서 PR은 문서/증거만 추가한다. 최종 PR head/queue/main은 PR과 #15 댓글에서 기록하며 이 문서에 자기 자신의 commit SHA를 넣지 않는다.

병합 후 최종 main 정확 SHA에서 새 순정 패키지를 만들고 checksum을 확인한다. 그 패키지의 비문서 파일 집합과 해시를 위 목록 전체(115파일)와 대조하고 이미지 ID도 비교한다. 이번 실행 직후 checkout과 검증 bundle 양쪽의 115개 해시는 모두 일치했다. 실행파일 변경이 있으면 전체 인수를 재실행한다. 동일하면 기존 실측과 최종 main 실행대상의 동일성을 #15 댓글로 연결한다. 이 확인 및 최종 CI/queue 증거 전에는 #8을 완료하지 않는다.

검증은 Windows 제어 절차와 Linux 독립 image store/egress 차단을 결합했다. 새 Windows 전체 cache 검증이나 host 전체 네트워크 차단을 주장하지 않는다. 실제 PAT·사내 데이터·TLS·프록시·인증서·실제품 권한/성능은 검증하지 않았다. `Connection: close`이며 keep-alive/연결 풀은 제외한다. 기타 쓰기·첨부·댓글·전체 이력·임의 JQL/CQL·플러그인 등 제외 범위는 [v1 계약](v1-contract.md)에 따른다.
