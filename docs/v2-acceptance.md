# v2 인수 실행 기록

상위 #23, 구현 #24/#25/#26, 통합 #27, 제공 명세 실행 #31의 기록이다. 전체 명세의 실제 소비자 완료 gate는 접근 불가로 미실행이며 이 문서는 이를 통과로 바꾸지 않는다.

## 개발 중 확인

합쳐진 API 기반은 `bde8f57`이다. 개발 트리에서 기본 및 `/custom-context`의 91개 행을 각각 실행했고 실행 가능한 항목 FAIL은 0이었다. 두 보고의 `worktreeDirty=true`는 의도적으로 보존했다. 이 결과는 고정 후보 소스의 최종 인수 증거가 아니다.

- [기본 로그](evidence/issue27/development/default.log), [기본 전체 보고](evidence/issue27/development/default.json.gz)
- [custom-context 로그](evidence/issue27/development/context.log), [custom-context 전체 보고](evidence/issue27/development/context.json.gz)

개발 단계의 실패도 구분한다. 초기 validator 음성 검사에서 미지원 keyword를 schema 등록만으로는 거부하지 않아 4개 중 1개가 실패했다. 모든 schema를 즉시 compile하도록 수정한 뒤 통과했다. 익명화 검사 초기에는 Markdown backtick으로 끝나는 합성 홈 경로를 오탐했고, 합성 경로의 구분자 처리만 고쳤다. Ajv 8.17.1 설치 점검에서 $data 옵션 관련 moderate advisory가 보고되어 후보 고정 전에 8.20.0으로 올렸고 audit 0건을 확인했다. 이들은 제품 HTTP의 실패를 재시도로 숨긴 사례가 아니다.

과거 1495.6ms 지연 보고와 #26의 원인 미규명 한계는 [지연 기록](delay-validation.md)을 유지한다. 과거 개인 경로를 가진 로그는 [명시적 익명화 파생본](evidence/redaction.md)으로 남긴다.

## 고정 후보 인수

고정 후보 `e3aefad2103ee11dd93fca0aa37358103b491b1f`에서 새 반입 패키지를 만들고 기본/custom-context × 최초/재기동 4회를 모두 실행했다. 기존 HTTP 검사와 제공 명세 실행기는 각 회차 exit 0, 상위 verifier의 OS 관측 종료코드도 0이었다. 최소 1500ms 단언은 유지했다. 최종 증거 추가 커밋은 문서와 증거만 변경하며, 고정 후보의 실행 파일·fixture·계약·의존성 바이트를 반입물과 다시 비교한다. 새 문서 head에서 격리 실행을 다시 했다는 뜻은 아니다.

[최종 전체 보고](evidence/issue27/candidate2/final.json.gz)는 **91행: PASS 84 / FAIL 0 / BLOCKED 1 / NOT_RUN 6 / SKIPPED 0**이다. nullable 실제 렌더링이 BLOCKED이고 실제 Jira 소비자 6행은 NOT_RUN이다. 5개 gate는 G-CONTRACT BLOCKED, G-CONSUMER NOT_RUN, G-PRIVACY PASS, G-OFFLINE PASS, G-EVIDENCE BLOCKED이며 `completion.declared=false`다.

- 최초/재기동 전체 보고: [default 1](evidence/issue27/candidate2/acceptance-default-1.json.gz), [default 2](evidence/issue27/candidate2/acceptance-default-2.json.gz), [context 1](evidence/issue27/candidate2/acceptance-context-1.json.gz), [context 2](evidence/issue27/candidate2/acceptance-context-2.json.gz).
- [생명주기 기록](evidence/issue27/candidate2/lifecycle.json), [실제 명령·exit·출력](evidence/issue27/candidate2/commands.json.gz), [명령 로그](evidence/issue27/candidate2/commands.log.gz), [콘솔](evidence/issue27/candidate2/console.log.gz), [OS 종료코드](evidence/issue27/candidate2/process-exit.json)를 보존한다. 별도 빈 image store를 두 번 확인하고 registry/IP/제품 컨테이너 egress 실패를 관측한 뒤 archive image ID와 linux/amd64를 확인했다. 각 모드 최초/재기동의 fixture snapshot이 일치한다. ownership 확인 후 daemon/network 제거 exit 0 및 후속 조회의 부재를 확인했다. 호스트 전체 air-gap을 주장하지 않는다.
- [반입 출처](evidence/issue27/candidate2/bundle.json), [산출물 hash 목록](evidence/issue27/candidate2/artifacts.json), [초기 감사](evidence/issue27/candidate2/privacy.json)를 연결한다. source 502 / bundle 811 / evidence 11개 파일이 private denylist·자격증명 패턴·비합성 홈 경로 검사에서 PASS였고 실행 파일 비교도 일치했다. 최종 문서·압축 증거를 추가한 이후 [추가 감사](evidence/issue27/candidate2/final-artifact-audit.json)로 현재 소스를 다시 검사했다. upstream 바이너리·라이선스는 원래 바이트를 보존하며 이 검사는 보편적 비밀 탐지를 보장하지 않는다.

정책·음성 회귀 검사는 68/68이며 후보 head의 Repository policy CI도 통과했다. 최종 문서 head의 CI·실행 바이트 재비교·독립 검토는 PR에 정확한 SHA로 기록한다.

실제 소비자 6행·실제 nullable 렌더링 및 클라이언트 Base URL 설정 분리 후속은 [#34](https://github.com/litzio/mockup-server/issues/34)로 추적한다. 이는 필수 gate 면제가 아니다.

## 후보 1 중단 기록

`f2dc7a49053dbbccd3b1c4c8b89ed3929b37d966`의 첫 격리 실행은 기본 cycle 1을 완료한 뒤 독립 검토에서 종료코드 결함이 발견되어 무효화했다. 초기 preflight reset이 실패하고 finally reset이 성공하면 91행 모두 BLOCKED여도 `--server-only`가 exit 0일 수 있었다. 검토자가 임시 HTTP 서버로 이 경로를 재현했다. 이는 전체 인수 성공이 아니므로 후보 1을 완료 근거로 사용하지 않는다.

실행 중인 정확한 verifier의 소유 Node 자손만 확인해 중단했고 PowerShell finally를 계속 실행했다. cycle 2의 node는 의도적 중단 -1, 상위는 exit 1이었다. 소유 daemon 제거와 ownership 확인 후 network 제거는 각각 exit 0, 이후 컨테이너/네트워크 조회는 빈 목록이었다. [중단 메타데이터](evidence/issue27/attempt1/attempt.json), [명령 로그](evidence/issue27/attempt1/commands.log.gz), [콘솔](evidence/issue27/attempt1/console.log.gz), [이미 완료된 첫 cycle 보고](evidence/issue27/attempt1/acceptance-default-1.json.gz), [bundle 출처](evidence/issue27/attempt1/bundle.json)를 보존한다. lifecycle PASS 파일은 생성되지 않았다.

종료 판정을 명시적인 외부 공백/다른 context/생명주기 단언으로 제한하고, 실제 subprocess에 첫 reset 500·finally reset 성공을 주입해 91 BLOCKED와 exit 1을 확인하는 회귀 검사를 추가했다. 실제 소비자 NOT_RUN을 숨기거나 원본 명세를 면제하지 않는다. 새 후보와 새 패키지로 격리 검증을 다시 수행한다.
