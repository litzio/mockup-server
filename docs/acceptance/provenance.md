# 제공 인수 명세의 출처와 실행 경계

사용자가 2026-11-04 제공한 두 파일을 인수 입력으로 사용한다. 실제 서버 patch version은 수집되지 않았으므로 저장소 목표 버전(Jira Software 9.12.28 / Confluence 9.2.17)을 관측 버전으로 바꾸어 쓰지 않는다.

| 원본 | SHA-256 |
| --- | --- |
| mockup-server-acceptance.json | d0484d862470cb5f4d18dd2715546deb2941eaa035d9e142d856dd4639d43496 |
| mockup-server-acceptance.md | ae535f6166e86778b420f7d0588846523d76bcce35be01588c97f27f85ba52e8 |

JSON의 실질적 내용과 바이트는 원본을 유지한다. Windows `core.autocrlf`에 의한 checkout CRLF 변환이 관측되어 `.gitattributes`로 이 디렉터리의 JSON/Markdown에 LF를 고정했다. JSON의 LF SHA-256은 위 원본과 같다. Markdown에서 이 저장소에 없는 두 외부 문서 링크를 현재 JSON과 이 출처 문서로 바꾸고, draft 상태가 입력 시점의 기록이라는 설명만 추가했다. 필수 단언, fixture, matrix, schema, completion gate는 삭제·완화하지 않았다.

실행기는 30개 정의를 Cartesian product로 펼친 **91개 고유 행**을 추적한다. 분류는 mock_http 74, mock_http_and_consumer 8, consumer_integration 7, artifact_audit 1, isolated_environment 1이다. Ajv 8.20.0으로 draft-07 schema와 URN 참조를 엄격히 컴파일한다. 알 수 없는 schema keyword는 실패하며 false schema·anyOf·타입 배열·required·중첩 참조를 음성 검사한다. CLI의 `--server-only`는 외부 검증 공백을 남긴 서버 작업 종료코드만 구분하며 명세의 완료 조건을 변경하지 않는다.

실제 Jira 소비자의 query/parser/Host/CLI/dashboard는 사용자 확인으로 접근할 수 없다. 해당 6개 행과 G-CONSUMER는 NOT_RUN이며 nullable 행의 실제 렌더링 단언도 NOT_RUN이다. 같은 nullable 데이터를 독립 formatter로 변환하는 검사는 별도로 기록한다. 독립 소비자 `scripts/acceptance/consumer.mjs`는 실제 제품 코드가 아니며, Base URL/PAT만 바꾸는 HTTP·JSON·타임아웃·redirect 거부를 검증한다. 명세가 허용한 독립 Confluence reader는 이 소비자와 대표 탐색 흐름으로 명명한다.

따라서 실행 가능한 서버·독립 소비자 검사가 성공해도 `completion.declared`는 false다. G-CONTRACT는 nullable 행의 외부 렌더링 단언 때문에 BLOCKED, G-EVIDENCE는 필수 실제 소비자 근거가 없어 BLOCKED다. G-PRIVACY/G-OFFLINE은 별도 현재 산출물 검사와 격리 생명주기 증거가 있을 때만 PASS로 판정한다. 이전 실패 시도는 이후 성공에 합쳐도 attempts에서 제거하지 않는다.

기존 1500ms/1495.6ms 보고의 원인은 미규명이다. 지연 설정과 최소 1500ms 단언을 유지하고 실제 수치·헤더/본문 경계를 기록하며, 300ms/500ms 취소 검사는 별도로 구분한다. 이 작업은 실제 제품 지연·성능 또는 실제 소비자 timeout 구현을 보증하지 않는다.
