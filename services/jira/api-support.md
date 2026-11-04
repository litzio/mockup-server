# Jira 지원 계약

대상은 Jira Software 9.12.28입니다. 실제 대상 패치 버전 호환성 및 실제 서비스 클라이언트 연결은 미검증입니다. API 경로·응답 형태는 [공식 Jira Server 9.12.0 REST 참조](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/search)를 참고하며, 정확한 허용 목록과 합성 데이터는 아래 모의 계약입니다.

## 계약 우선순위와 데이터

사용자가 제공한 [인수 명세](../../docs/acceptance/mockup-server-acceptance.json)의 `synthetic-acceptance-v1`을 fixture와 응답 구조의 기준으로 사용합니다. #31은 이전 v1/초기 #24의 3건/18건 데이터와 인증 오류 계약을 의도적으로 대체합니다. 예전 데이터에 대한 성공 기록은 새 인수 명세 통과 근거가 아닙니다. 제공한 명세의 assertion이나 완료 gate를 약화하지 않습니다.

- 현재 사용자: `mock-user-a`, key `mock-user-a-key`; 다른 합성 사용자 `mock-user-b`, `mock-user-c`.
- 프로젝트 MOCK(id 10000), EMPTY(id 11000). projectTypeKey=software, archived=false.
- 이슈 MOCK-1 … MOCK-8(id 10001 … 10008). 사용자 제공 seed의 제목·담당자·보고자·상태·우선순위·resolution·updated를 그대로 materialize합니다.
- MOCK-7의 assignee, priority, resolution은 null이며 보고자 조회에 포함되고 담당자 조회에는 포함되지 않습니다.
- 해결 여부는 status가 아닌 resolution null 여부로 판정합니다. updated는 문자열 사전순이 아닌 파싱한 시각으로 내림차순 정렬합니다.
- created=2025-12-01T09:00:00.000+0000; resolutiondate는 미해결이면 null, 해결이면 해당 seed updated입니다. 이 날짜와 statusCategory 숫자 ID는 합성 보강값이며 실서버 관찰값을 복제한 것이 아닙니다.

## 지원 요청

모든 제품 요청은 GET, 가짜 PAT는 정확히 `Bearer mock-jira-token`입니다. 쓰기·첨부·변경 이력·임의 JQL은 지원하지 않습니다.

| 경로 | 조건 / 결과 |
| --- | --- |
| /rest/api/2/myself | 쿼리 없음; 현재 사용자 |
| /rest/api/2/project | 쿼리 없음; MOCK 및 EMPTY 배열 |
| /rest/api/2/issue/{key 또는 id} | 쿼리 없음; 등록 8건의 전체 지원 필드. 형식에 맞는 미등록 식별자는 제품형 404 |
| /rest/api/2/issue/{등록 key 또는 id} | 아래 minimal 또는 enriched fields 하나; 동일 필드만 투영 |
| /rest/api/2/search | 아래 현재 사용자 6종 검색 |
| /rest/api/2/search | 아래 고정 프로젝트 검색 |
| /rest/api/2/search?jql=assignee%20%3D | 명세가 지정한 불완전 JQL 한 건은 제품형 400 |

키 형식은 `[A-Z][A-Z0-9_]*-[1-9][0-9]*`, ID는 선행 0 없는 양의 십진수입니다. fields는 다음 두 문자열만 지원하며 순서·필드 추가 변형은 미지원입니다.

- minimal: `summary,status,priority,updated`
- enriched: `summary,status,priority,updated,assignee,reporter,resolution,created,resolutiondate`

투영 시 최상위 id/key/self는 유지하고 fields에는 지정 필드만 반환합니다. fields가 없으면 project/description/issuetype 등을 포함한 전체 지원 필드를 반환합니다. priority=null을 포함하며 status.name 및 status.statusCategory.key가 있습니다. 검색과 상세의 겹치는 필드는 동일합니다.

## 현재 사용자 검색

정확한 범위 `assignee = currentUser()` 또는 `reporter = currentUser()`에 ` AND resolution = Unresolved`, ` AND resolution IS NOT EMPTY`, 또는 조건 없음을 붙이고 ` ORDER BY updated DESC`로 끝나는 여섯 문자열을 지원합니다. 임의 공백·대소문자·괄호 정규화는 제공하지 않습니다.

| 매개변수 | 허용 값 / 생략 |
| --- | --- |
| jql | 위 여섯 문자열 중 하나, 필수 |
| fields | minimal 또는 enriched; 생략하면 전체 지원 필드 |
| startAt | 0 … 999999999의 정규 십진 정수; 생략 시 0 |
| maxResults | 1, 2, 100; 생략 시 기본 요청값 50에 서버 상한 적용 |

각 선택 인자는 독립적으로 생략 가능합니다. 서버 상한은 **2**이며 maxResults=100 또는 생략에도 응답 maxResults=2입니다. 다음 offset은 실제 반환 건수로 증가시키고 total까지 순회합니다. 요청값100을 그대로 더하는 클라이언트는 누락될 수 있으며 실제 클라이언트는 접근 불가로 미검증입니다. total은 전체 결과 수이고 at/beyond total은 동일 total과 빈 issues를 반환합니다.

| 검색 | total | updated DESC 기대 키 |
| --- | --- | --- |
| assignee / 미해결 | 2 | MOCK-1, MOCK-8 |
| assignee / 해결 | 2 | MOCK-2, MOCK-6 |
| assignee / 전체 | 4 | MOCK-1, MOCK-2, MOCK-6, MOCK-8 |
| reporter / 미해결 | 2 | MOCK-3, MOCK-7 |
| reporter / 해결 | 2 | MOCK-2, MOCK-4 |
| reporter / 전체 | 4 | MOCK-2, MOCK-3, MOCK-4, MOCK-7 |

## 프로젝트 검색

`project = MOCK ORDER BY key ASC` 또는 `project = EMPTY ORDER BY key ASC`를 지원합니다. JQL만 지정하면 startAt=0/maxResults=50이며 전체 8건 또는 빈 배열을 반환합니다. startAt=0/2/4/6/8/10/12/14/16/18/20과 maxResults=2를 함께 지정하면 해당 페이지입니다. MOCK 순서는 숫자 키 오름차순이며 total=8, EMPTY total=0입니다.

추가로 명세의 EMPTY 요청 `fields=summary,status,priority,updated`, `maxResults=100`, `startAt=0 … 999999999` 조합을 지원하며 maxResults=2,total=0,issues=[]를 반환합니다. 다른 프로젝트 매개변수 조합은 여전히 미지원입니다.

## 인코딩과 오류 경계

URL decoding 후 이름·값을 비교합니다. 매개변수 순서, %20/+ 공백, 동등한 이름·값 인코딩은 무관합니다. 추가·중복·빈 값·선행0·음수·소수·다른 메서드/경로/쿼리는 `404 {mockError: "UNSUPPORTED_REQUEST", ...}`이며 인증과 무관하게 적용합니다. 미지원 JQL 전체를 임의로400 또는200으로 처리하지 않습니다.

지원 요청의 PAT 누락·잘못된 값·다른 제품 PAT·대소문자 변형은 `401 {"status-code":401,"message":"Authentication required"}`입니다. 이는 제공 명세의 인증 필터 형태이며 v1의 errorMessages/errors를 대체합니다. 제품형 오류는 `{errorMessages:[합성 문구],errors:{}}` 형태입니다. 없는 이슈는404, 정확히 선언한 불완전 JQL은400입니다. 실제 오류 전문이나 업무 내용을 사용하지 않습니다.

## 오류·지연·빈 검색 관리

제품 Base URL과 같은 origin의 context 밖 WireMock 관리API를 사용합니다. 제품 클라이언트에 특별한 헤더/우회 로직을 요구하지 않습니다.

- GET /__admin/scenarios로 상태 확인.
- PUT /__admin/scenarios/product-read/state에 `{"state":"forbidden"}` 등으로 선택.
- forbidden=403, not-found=404, server-error=500: 유효 PAT의 지원 읽기에 합성 제품형 오류.
- delay: 보통 응답에 고정1500ms. PAT 실패/fallback은 지연하지 않음.
- empty-search: 현재 사용자 여섯 검색만 total0/issues[]; 다른 읽기와 자연404는 보통 동작.
- POST /__admin/scenarios/reset으로 Started 복귀. Started를 PUT하는 방식은 사용하지 않음.

지원 형태 → PAT → 시나리오 → 보통 응답 순서입니다. 한 제품의 관리 상태는 다른 제품과 격리되며 테스트는 직렬화합니다. JSON Content-Type과 Connection: close를 유지합니다.

## 링크·생성·검증

기본 빈 context와 저장소의 [context 설정](../../docs/context-paths.md)을 따릅니다. 지원 이슈 self는 요청 origin/context의 숫자 ID이며 실제 추적 가능합니다. 프로젝트·사용자·상태·유형 단건 링크와 browse UI는 별도 지원 요청이 아니면 메타데이터 범위입니다.

`node services/jira/tools/generate-v2.mjs`는 제공 seed를 일반 WireMock JSON/fixture로 생성합니다. `--check`는 파일 drift를 검사합니다. 생성기는 서버 런타임 확장이 아니며 생성 결과와 검사 소스를 함께 반입합니다. 현재 사용자 검색은6 JQL×3 투영×2 크기×8 offsets=288 fixture로 전개합니다.

current-user-search.test.mjs는 독립적으로 명시한 기대 키와 페이지 크기1/2/100으로 실제 HTTP 계약 소비, 투영, nullable 필드, 인코딩, auth/오류/empty/reset을 검사합니다. 제공 명세의 모든 matrix/gate 실행은 별도 통합 인수입니다. 실제 클라이언트/Host/CLI/UI를 실행했다고 주장하지 않으며 G-CONSUMER가 NOT_RUN이면 명세 전체 완료를 선언하지 않습니다.
