# v2 인수 실행 기록

상위 #23, 구현 #24/#25/#26, 통합 #27, 제공 명세 실행 #31의 기록이다. 전체 명세의 실제 소비자 완료 gate는 접근 불가로 미실행이며 이 문서는 이를 통과로 바꾸지 않는다.

## 개발 중 확인

합쳐진 API 기반은 `bde8f57`이다. 개발 트리에서 기본 및 `/custom-context`의 91개 행을 각각 실행했고 실행 가능한 항목 FAIL은 0이었다. 두 보고의 `worktreeDirty=true`는 의도적으로 보존했다. 이 결과는 고정 후보 소스의 최종 인수 증거가 아니다.

- [기본 로그](evidence/issue27/development/default.log), [기본 전체 보고](evidence/issue27/development/default.json.gz)
- [custom-context 로그](evidence/issue27/development/context.log), [custom-context 전체 보고](evidence/issue27/development/context.json.gz)

개발 단계의 실패도 구분한다. 초기 validator 음성 검사에서 미지원 keyword를 schema 등록만으로는 거부하지 않아 4개 중 1개가 실패했다. 모든 schema를 즉시 compile하도록 수정한 뒤 통과했다. 익명화 검사 초기에는 Markdown backtick으로 끝나는 합성 홈 경로를 오탐했고, 합성 경로의 구분자 처리만 고쳤다. Ajv 8.17.1 설치 점검에서 $data 옵션 관련 moderate advisory가 보고되어 후보 고정 전에 8.20.0으로 올렸고 audit 0건을 확인했다. 이들은 제품 HTTP의 실패를 재시도로 숨긴 사례가 아니다.

과거 1495.6ms 지연 보고와 #26의 원인 미규명 한계는 [지연 기록](delay-validation.md)을 유지한다. 과거 개인 경로를 가진 로그는 [명시적 익명화 파생본](evidence/redaction.md)으로 남긴다.

## 고정 후보 인수

후보 commit 이후 새 반입 패키지에서 수행할 기본/custom-context × 최초/재기동 4회와 source/bundle/evidence 감사를 별도로 기록한다. 아직 이 단락은 실행 예정 상태다. 최종 보고는 91개 행 전부와 5개 gate를 보존하고 `completion.declared=false`를 유지해야 한다.

실제 소비자 6행·실제 nullable 렌더링 및 클라이언트 Base URL 설정 분리 후속은 [#34](https://github.com/litzio/mockup-server/issues/34)로 추적한다. 이는 필수 gate 면제가 아니다.
