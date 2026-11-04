# 모의 서버 v1 지원 계약과 완료 판정

상위 목표 [#8](https://github.com/litzio/mockup-server/issues/8), 계약 확정 [#9](https://github.com/litzio/mockup-server/issues/9).

이 문서는 **후속 구현이 충족해야 할 v1 계약**이다. 문서 게시만으로 아래 기능을 지원하거나 검증에 통과한 것이 아니다. 목표는 실제 서버·자격증명 없이 WireMock으로 핵심 읽기와 오류 처리를 개발하는 것이다. 대상은 Jira Software 9.12.28 및 Confluence 9.2.17이며 Cloud API를 사용하지 않는다. 실제 제품 호환성 검증은 별도 후속이고 v1 완료 차단 조건이 아니다.

## 현재 구현과 후속 범위

기준 커밋은 PR #7 병합 `097d99cde722feb0ae514714e53944e91464016d`다. 현재 구현의 정확한 조건은 [Jira 계약](../services/jira/api-support.md)과 [Confluence 계약](../services/confluence/api-support.md)에 있다.

| 계약 ID | 기준 커밋의 구현 | v1에서 추가할 결과 | 담당 |
| --- | --- | --- | --- |
| B-J | 현재 사용자, MOCK 프로젝트 목록, MOCK-1 상세, PAT/없는 키 오류 | 기존 데이터·인증 의미 보존 | #10 이후 회귀 |
| B-C | 현재 사용자, MOCK 공간 목록, 20001 상세와 storage 선택 | 기존 데이터·인증 의미 보존 | #11 이후 회귀 |
| J-L | 검색 미지원 | 프로젝트별 고정 검색·페이지 탐색 | #10 |
| C-L | 공간별 페이지 목록 미지원 | 공간별 페이지 탐색·본문 연결 | #11 |
| E | 401·없는 데이터 404·fallback만 구현 | 403·강제 404·500·고정 지연 선택/리셋 | #12 |
| U | 별도 포트·포트 변경 안내, context 미지원 | 변경된 Base URL과 지원 링크 추적 | #13 |
| O | 최초 다운로드 필요 | 반입 파일만으로 격리 환경 실행 | #14 |
| A | 개별 HTTP 회귀 존재 | 최종 통합 인수와 완료 판정 | #15 |

이 문서의 추가 데이터·요청·링크·관리 절차는 아직 미구현이다. 기준 테스트의 단일 항목 개수 등은 후속 데이터 확장에 맞게 갱신하되 인증·응답 의미 단언을 약화하지 않는다.

## 공통 요청 경계

제품 요청은 아래 GET만 지원한다. 본문 없는 일반 HTTP 요청이며 가짜 PAT는 Jira `Bearer mock-jira-token`, Confluence `Bearer mock-confluence-token`이다. 헤더 값은 Bearer 표기·토큰까지 정확히 비교한다. 누락, 다른 제품 토큰, 잘못된 값, 토큰의 대소문자만 바꾼 값과 다른 인증 방식은 모두 401이다. 실제 PAT·사내 데이터를 사용하지 않는다.

표의 쿼리는 URL decoding 후 값으로 판정한다. 매개변수 순서는 무관하며 공백의 `%20`/`+` 인코딩은 동등하다. 매개변수는 각각 한 번만 허용한다. 추가·중복·빈 값·다른 값·페이지 값의 선행 0·음수·소수, 표에 없는 조합은 미지원이다. 쿼리 이름의 대소문자도 구별한다. 후행 슬래시, 대소문자만 다른 경로, 서브리소스와 다른 메서드는 미지원이다. HEAD도 별도 성공 계약이 없다. 미지원 쿼리를 무시하고 200을 반환하지 않는다.

판정 순서는 지원 요청 형태 → PAT → 선택된 오류 시나리오 → 데이터 존재/정상 응답이다. 미지원 형태는 인증·시나리오와 무관하게 기존 `404 {mockError: "UNSUPPORTED_REQUEST", message: "This request is outside the supported mock contract."}`다. 지원 형태의 인증 실패는 데이터 존재 여부나 선택 시나리오보다 우선하며 보호된 데이터를 담지 않는다. 일반 성공·오류 모두 JSON Content-Type과 `Connection: close`를 유지한다. HTTP 엔진 자체의 잘못된 프로토콜 입력 처리는 이 계약 밖이다.

## J-L: Jira 프로젝트에서 이슈 탐색 (#10)

| GET 경로 | 허용 쿼리 | 결과 |
| --- | --- | --- |
| /rest/api/2/myself | 없음 | 기존 현재 사용자 |
| /rest/api/2/project | 없음 | MOCK 및 EMPTY 프로젝트 배열 |
| /rest/api/2/issue/{key} | 없음 | 등록 키 상세; 형식에 맞는 미등록 키는 제품형 404 |
| /rest/api/2/search | `jql=project = MOCK ORDER BY key ASC` 또는 `jql=project = EMPTY ORDER BY key ASC`만 | startAt=0, maxResults=50 기본 목록 |
| /rest/api/2/search | 위 jql과 `startAt=0&maxResults=2`, `startAt=2&maxResults=2`, `startAt=4&maxResults=2` 중 하나 | 열거된 페이지 |

실제 URL에서는 jql 값을 인코딩한다. 예: `/rest/api/2/search?jql=project%20%3D%20MOCK%20ORDER%20BY%20key%20ASC&startAt=0&maxResults=2`. jql 생략, 임의 공백 변형·조건·정렬, 다른 프로젝트, POST 검색, fields/expand, 페이지 인자 하나만 지정하는 요청은 미지원이다. 임의 JQL 파서는 제공하지 않는다. 키 형식은 기존 `[A-Z][A-Z0-9_]*-[1-9][0-9]*`를 유지한다.

MOCK(id `10000`)에 MOCK-1/2/3(id `10001`/`10002`/`10003`) 세 건, EMPTY(id `11000`)에는 0건이다. MOCK-1의 기존 필드 값은 보존한다. 새 이슈도 같은 필드 집합(id/key/self, fields의 summary/description/project/status/issuetype/assignee/reporter)을 제공한다. 프로젝트는 목록과 일치하고 담당자·보고자는 현재 사용자다. 데이터는 합성이며 조회로 변하지 않는다.

검색 응답 필수 필드는 `startAt`, `maxResults`, `total`, `issues`다. MOCK의 total=3, EMPTY의 total=0이며 페이지에 상관없이 유지된다. issues 원소는 같은 키의 상세와 동일한 지원 필드 값을 갖는다. 순서는 MOCK-1, MOCK-2, MOCK-3이다. startAt=0/maxResults=2에서 2건, 2에서 1건(마지막), 4에서 0건을 반환한다. 기본 요청은 세 건 전체를 반환한다. EMPTY는 모든 허용 페이지에서 빈 배열이다. Jira 검색에 Confluence형 next 링크나 cursor를 추가하지 않는다.

## C-L: Confluence 공간에서 페이지 탐색 (#11)

| GET 경로 | 허용 쿼리 | 결과 |
| --- | --- | --- |
| /rest/api/user/current | 없음 | 기존 현재 사용자 |
| /rest/api/space | 없음 | MOCK 및 EMPTY 공간, start=0/limit=25/size=2 |
| /rest/api/space/{spaceKey}/content/page | 없음, 또는 `start=0&limit=2`, `start=2&limit=2`, `start=4&limit=2` 중 하나 | 공간별 페이지 목록 |
| /rest/api/content/{id} | 없음, 또는 정확히 `expand=body.storage` | 페이지 상세, 확장 시 storage 본문 |

spaceKey는 대문자 `[A-Z][A-Z0-9_]*` 형태다. MOCK/EMPTY 외 형식에 맞는 공간의 페이지 목록은 제품형 404다. id는 기존 `[1-9][0-9]*`이고 미등록 ID는 제품형 404다. 목록의 expand, space 목록의 페이지네이션, start/limit 한쪽만 지정, CQL·검색·다른 content type은 미지원이다.

MOCK 공간(id `20000`)에 페이지 `20001`/`20002`/`20003`, EMPTY 공간(id `21000`)에 0건을 둔다. 기존 20001의 제목·본문·사용자·버전 값은 보존한다. 새 페이지도 id/type=page/status=current/title/space/history/version/_links와 선택적 body.storage의 같은 부분집합을 제공한다. 작성자·버전 사용자는 현재 사용자와 일치한다. 각 페이지는 자기 공간에 속하며 본문은 구별 가능한 합성 storage 문자열이다.

목록 필수 필드는 `results`, `start`, `limit`, `size`, `_links`다. 쿼리 없는 목록의 start=0/limit=25이며 모든 페이지를 반환한다. 명시 페이지는 지정 start/limit을 반영한다. size는 이번 results 길이이며 전체 개수가 아니다. ID 오름차순으로 start=0/limit=2는 2건, 2는 마지막 1건, 4는 빈 배열이다. EMPTY는 모두 빈 배열이다. 목록 원소는 id/type/status/title과 상세로 연결되는 `_links.self`를 포함하며 space가 있으면 상세와 같아야 한다. 목록에 본문을 넣지 않는다. 상세는 확장 없이 body를 생략하며 확장 시 `body.storage.value`와 `representation=storage`를 제공하고 나머지 메타데이터는 동일하다.

링크는 `_links.base`(origin), `context`(빈 문자열 또는 설정된 context), `self`(목록은 현재 쿼리 포함 URL, 페이지 상세는 쿼리 없는 정규 URL), next/prev(존재 시 origin 기준 상대 경로, context 포함)로 표현한다. 목록 기본 요청·빈 결과·범위 밖 페이지에는 next/prev를 넣지 않는다. MOCK 명시 페이지 start=0은 next(start=2)만, start=2는 prev(start=0)만 포함한다. 링크를 따라 같은 페이지 데이터가 나와야 한다. 전체 탐색에서 누락·중복이 없어야 한다.

## E: 오류·지연·서버측 상태 (#12)

두 제품 각각 별도의 WireMock 시나리오 `product-read`를 사용한다. 지원 GET 전체에 적용되며 같은 이름이어도 제품 포트가 달라 상태가 격리된다. 상태는 `Started`(기본 정상), `forbidden`, `not-found`, `server-error`, `delay`만 사용한다. GET은 상태를 전이시키지 않는다. 관리자가 바꾸거나 초기화할 때까지 같은 결과를 반복한다.

| 상태/조건 | 코드 | Jira 본문 | Confluence 본문 |
| --- | --- | --- | --- |
| PAT 실패(모든 상태) | 401 | errorMessages=["Authentication required"], errors={} | statusCode=401, message="Authentication required", reason="Unauthorized" |
| forbidden | 403 | errorMessages=["Forbidden"], errors={} | statusCode=403, message="Forbidden", reason="Forbidden" |
| not-found | 404 | errorMessages=["Not found"], errors={} | statusCode=404, message="No content found", reason="Not Found" |
| server-error | 500 | errorMessages=["Internal server error"], errors={} | statusCode=500, message="Internal server error", reason="Internal Server Error" |
| delay | 보통 결과와 동일 | 정상/자연404 본문에 고정1500ms 추가 | 동일 |

지연 상태는 같은 응답(200 또는 자연404)을 늦출 뿐 성능을 재현하지 않는다. WireMock 설정1500ms와 실제 HTTP 경과시간이 최소1500ms임을 기록한다. OS 부하에 따른 상향 편차를 실제 제품 성능으로 해석하지 않는다. PAT 실패·fallback에는 지연을 적용하지 않는다. 403/404/500/401에는 사용자·이슈 필드·페이지 본문 같은 보호 데이터를 포함하지 않는다.

Started/delay에서 자연적으로 없는 Jira 키는 기존 `Issue Does Not Exist`의404, Confluence ID/공간은 `No content found`의404다. 강제not-found와 fallback은 위 표로 구별한다. 실제 권한 엔진이나 제품 오류 전문의 복제가 아닌 모의 계약이다.

선택·확인·리셋은 제품 클라이언트와 별도로 관리자가 실행한다. 관리 origin은 각 제품의 같은 호스트·포트(context 제외)다.

- 확인: `GET /__admin/scenarios`.
- 선택: `PUT /__admin/scenarios/product-read/state`, JSON `{"state":"forbidden"}`(위 다른 상태도 동일).
- 기본 상태 복귀: 빈 POST `/__admin/scenarios/reset`. 매핑을 삭제하는 조작이 아니다.

이는 WireMock 기존 관리API이며 제품API에 추가하는 헤더·분기가 아니다. 관리API는 신뢰할 수 있는 로컬 실행자용이며 PAT 보호를 주장하지 않는다. 공개 서비스로 배포하지 않는다. 한 제품의 선택/리셋이 다른 제품 상태·데이터를 바꾸면 안 된다. 시험 전후 각 제품을 리셋하고 Started 복귀와 정상 조회를 HTTP로 확인한다. 종료·재시작 후에도 Started여야 한다. 작업 외 프로세스는 종료하지 않는다.

## U: 연결 설정과 링크 (#13)

지원은 HTTP, 기본 Jira 8081/Confluence 8082, 서로 다른 사용 가능한 포트로의 변경, 호스트명 `localhost`와 `127.0.0.1`이다. 동일 클라이언트 실행물의 제품별 Base URL/PAT를 교체한다. TLS·사내 DNS·프록시·인증서 환경은 제외한다. PAT는 위 고정값을 사용한다.

context는 제품별로 빈 문자열(기본) 또는 Jira `/jira`, Confluence `/confluence`를 선택한다. Base URL 끝에 슬래시를 붙이지 않고 `/rest/...`를 연결한다. context 설정 시 제품 경로는 context가 붙은 형태만 지원하며 context 없는 제품 요청은 fallback이다. 관리API에는 context를 붙이지 않는다. 설정 선택의 구체적 실행 절차는 #13에서 제공하며 클라이언트에 특별한 헤더를 요구하지 않는다.

v1에서 추적 성공이 필수인 링크는 Jira issue self와 Confluence page self, 페이지 목록self/next/prev다. Jira의 기존issue self는 숫자ID를 반환하므로 #13에서는 `/rest/api/2/issue/{id}`(등록10001/10002/10003, 미등록 양의 십진ID는 자연404)를 키 조회와 같은 의미로 제공한다. 숫자ID는 선행0과 쿼리를 허용하지 않는다. #10 시점에 이 별칭을 필수로 요구하지 않는다.

모든 응답 내 API 링크는 설정한 origin/context를 반영한다. 기존 Jira project/user/status/issuetype self, Confluence space self는 메타데이터 링크이며 해당 단건API는 v1 추적 대상 밖이라고 명시한다. 브라우저 UI·첨부URL은 범위 밖이다. Connection: close를 모든 상태에서 유지하고 keep-alive·연결 풀 지원을 주장하지 않는다.

## O: 폐쇄망 반입 환경과 실행 (#14)

v1 배포 대상은 `linux/amd64` WireMock `3.13.2` 이미지다. 실행 환경은 Windows x64 + PowerShell 7 + Docker Desktop Linux engine/Compose v2, 검증 런타임은 Node.js 24다. #14는 실제 사용한 패치 버전을 기록한다. 실측하지 않은 OS/아키텍처까지 지원을 일반화하지 않는다. 런타임은 사전 준비하며 설치·전역 설정 변경은 자동 수행하지 않는다.

온라인 준비와 오프라인 실행을 구분한다. 반입물은 고정태그/이미지ID/아키텍처를 기록한 이미지 아카이브, Compose 구성, 모든 매핑·합성 데이터, 실행/종료/초기화/준비확인/HTTP 검증에 필요한 파일·의존물·절차, 전체 파일 SHA-256 목록과 원본commit을 포함한다. 실행 중 CDN·npm 다운로드·레지스트리pull을 요구하지 않는다. 검증에 npm 의존물이 필요하면 함께 반입하며 개발자의 node_modules/cache를 암묵적으로 사용하지 않는다.

격리 검증 환경에서 외부 다운로드를 실제 차단하고 차단 방법·확인 결과와 사전 환경을 기록한다. 아카이브 load 전후와 의존물 출처를 기록하여 기존cache에 기대지 않음을 증명한다. 개발자daemon에서 `--pull never`만 사용하는 것으로 통과하지 않는다. 격리 환경도 반입물과 사전 런타임만으로 재현 가능해야 한다. 기존 사용자 이미지 삭제나 전역 네트워크 변경으로 이를 대체하지 않는다.

체크섬 확인 → load → 두 제품 기동 → 준비 확인 → 핵심HTTP/오류/초기화 → 종료 → 재기동/재검증을 외부 다운로드 없이 통과한다. 직접 기동한 프로젝트만 종료하고 데이터가 초기값으로 돌아오는지 확인한다. 실제 환경·명령·종료코드·결과 증거를 남긴다.

## A: 추적과 최종 판정 (#15)

이 PR은 계약 확정뿐이며 J-L/C-L/E/U/O/A의 구현·오프라인 검증은 미실행이다. 과거baseline 성공을 새 계약의PASS로 전용하지 않는다. 실제 인증·프록시·제품 호환성 검증은 미실행이며 v1 필수 항목이 아니다.

후속PR은 위 계약ID를 실제 HTTP 테스트명/실행로그에 연결한다. #15는 최종 통합commit에 대해 아래 표를 채운다. 증거에는 실행commit, 런타임 버전, 명령, 결과와 로그 참조를 기록한다. 계획한 검증에 PASS를 쓰지 않는다.

| 계약 | 필수 판정 대상 | 담당/선행 | 현재 결과 |
| --- | --- | --- | --- |
| B-J/J-L | project→전체페이지→상세, 빈/마지막/범위밖 페이지, 키/관계 일관성, 인증·미지원 경계 | #10 ← #9 | 새v1 계약 미실행 |
| B-C/C-L | space→전체페이지→storage본문, 빈/마지막/범위밖 페이지, ID/관계 일관성, 인증·미지원 경계 | #11 ← #9 | 새v1 계약 미실행 |
| E | 모든 상태, PAT우선/데이터비노출, 제품격리, 리셋 후 반복 | #12 ← #10/#11 | 미실행 |
| U | 같은 클라이언트의 기본/변경port·host·context와 지원링크, 인증회귀 | #13 ← #10/#11 | 미실행 |
| O | 차단증거, 체크섬, cache비의존 반입실행/종료/초기화/재실행 | #14 ← #12/#13 | 미실행 |
| A | 최종통합commit의 위 증거 집계, 필수CI와merge queue 결과 | #15 ← #9~#14 | 미실행 |

결과는 PASS/FAIL/미실행을 구분한다. 필수 항목에 FAIL/미실행이 있으면 완료하지 않는다. CI head와queue 통합검증commit을 구분하고 queue 성공 및main 반영을 확인한다. #9~#15의 변경이main에 통합되고 최종파일목록·알려진제약과 모든 필수 증거가 있을 때만 #8에 **모의 서버 v1 개발 완료**로 판정한다. 실제 제품 호환성 보증과 구분한다.

쓰기·첨부·댓글·전체이력·실제권한엔진·임의JQL/CQL·사용자정의필드전체·플러그인·성능재현은 제외한다.

## 공식 근거와 모의 계약의 결정

| 근거 | 실제 참조 버전·내용 | 한계 |
| --- | --- | --- |
| [Jira Server REST](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/search) | 9.12.0, GET search의jql/startAt/maxResults와issues/total | 목표9.12.28과 다름. 허용JQL·열거페이지·fixture는 모의 결정 |
| [Confluence Server REST](https://docs.atlassian.com/ConfluenceServer/rest/7.19.0/) | 7.19.0, space/{spaceKey}/content/{type}의page예시, start/limit, content ID조회 | 목표9.2.17과 다름. 유한페이지·링크정책·필드부분집합은 모의 결정 |
| [Confluence storage 안내](https://support.atlassian.com/confluence/kb/how-to-get-page-content-or-child-list-via-rest-api/) | 패치고정 없음, expand=body.storage | 목표판 실측 아님. 9.2.20 접근 제약은 기존 제품계약에 기록 |
| [WireMock 상태](https://wiremock.org/docs/stateful-behaviour/) / [지연](https://wiremock.org/docs/simulating-faults/) | 현행 공개문서, 상태선택/reset과 고정delay 기능 | 런타임3.13.2 고정, 후속HTTP확인 필요. 상태명·우선순위·오류문구는 모의 결정 |
| [Docker save](https://docs.docker.com/reference/cli/docker/image/save/) / [load](https://docs.docker.com/reference/cli/docker/image/load/) | 현행CLI, 이미지아카이브 저장·복원 | 반입물 실체·격리실행 증거를 대체하지 않음 |

공식 참조는 경로·응답구조의 근거다. 엄격한 허용목록·PAT강제·오류문구·데이터개수·시나리오를 실제 제품 전체 동작으로 간주하지 않는다. 목표 패치 버전에서 확인은 미실행이다.
