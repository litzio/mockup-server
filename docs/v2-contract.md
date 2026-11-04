# v2 지원 목표와 판정 경계

v2는 동일 클라이언트 코드가 제품별 Base URL과 가짜 PAT만 바꾸어 선언된 Jira·Confluence 읽기 API를 사용하는 것을 목표로 한다. 대상 목표 버전은 Jira Software 9.12.28/Confluence 9.2.17이며 제공 실측에서 실제 patch version은 수집되지 않았다.

실질적인 인수 입력은 [제공 JSON](acceptance/mockup-server-acceptance.json)이며 fixture version은 `synthetic-acceptance-v1`이다. [출처](acceptance/provenance.md)에 원본 hash·편집 범위와 91개 행/5개 gate를 기록한다. [Jira 지원 범위](../services/jira/api-support.md), [Confluence 지원 범위](../services/confluence/api-support.md)가 구체적인 유한 요청 언어를 설명한다. 임의 JQL/CQL·쓰기·권한 엔진은 제공하지 않는다.

- Jira: 현재 사용자 assigned/reported × unresolved/resolved/all 6종, updated 내림차순, 최소/확장 fields, nullable 필드, key/numeric detail, 페이지 상한 2를 지원한다. 요청 maxResults=100에서도 응답의 실제 건수만큼 다음 startAt을 계산한다. 요청한 100만큼 건너뛰는 클라이언트와의 호환성을 주장하지 않는다.
- Confluence: 알려진 사용자와 HTTP 200 anonymous를 구분한다. 개인 `~mock.user-a` 및 일반/빈 공간, 공간/페이지 목록, storage 및 조합 expansion을 지원한다. size는 현재 페이지 길이이며 total로 사용하지 않는다.
- 인증: Jira 인증 필터 오류는 401 `status-code`/`message`, resource 오류는 `errorMessages`/`errors`다. Confluence current-user의 anonymous 200은 보호 페이지 접근을 허용하지 않는다.
- 연결: 제품별 독립 포트, 빈/product/custom-context 및 localhost/127.0.0.1에서 같은 API 소비자 코드를 사용한다. 지원 self/next/prev는 origin/context를 보존한다. 지원하지 않는 메타데이터/browser 링크는 제품 문서에 표시한다.
- 오류: 인증·미지원·없는 데이터·주입 403/404/500을 구분한다. 지연 1500ms를 유지하고 timeout/malformed JSON/redirect 거부는 독립 소비자로 구분 검증한다. 임시 fault mapping은 고유 ID만 삭제하고 시나리오는 finally에서 리셋한다.
- 반입: 고정 이미지, 현재 runtime, 생성기와 정적 결과, pinned validator 의존성 및 라이선스를 함께 반입한다. 기존 개인정보 경로를 가진 역사적 증거는 명시적 익명화 파생본으로 바꾸고 반입에서는 제외한다. [오프라인 절차](offline-v2.md)를 따른다.

해결 여부는 `resolution`만으로 판단한다. canonical 8개 seed 자체는 변경하지 않는다. 별도 단위 검사는 임시 복제본의 모든 status/category를 resolution과 반대로 바꾼 뒤 실제 생성기를 실행해 4개 해결 여부 검색 결과 집합이 바뀌지 않음을 검증한다.

실제 Jira 소비자의 Host/CLI/UI는 사용자 확인으로 접근 불가다. 독립 HTTP/변환 검사를 실제 클라이언트 연결 검증으로 부르지 않는다. 실제 소비자 6행과 nullable 실제 렌더링 단언은 NOT_RUN이고 전체 명세 완료는 false다. 클라이언트 고정 주소를 설정으로 분리하는 작업은 외부 클라이언트 후속 범위다. 실제 권한·SSO·TLS·프록시와 완전한 host 망 차단 반입 재실행은 별도 검증이다.

실제 소비자 6행·실제 nullable 렌더링 및 클라이언트 Base URL 설정 분리 후속은 [#34](https://github.com/litzio/mockup-server/issues/34)로 추적한다. 이는 필수 gate 면제가 아니다.
