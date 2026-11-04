# 지원 계약

이 문서는 현재 구현 기준입니다. 후속 범위는 [v1 계약](../../docs/v1-contract.md)을 따르며 해당 이슈 구현 전에는 지원하지 않습니다.

- 목표: Jira Software 9.12.28
- 실제 대상 서버 검증: **미실행**
- 합성 데이터만 사용합니다.

| 요청 | 조건 | 응답 |
| --- | --- | --- |
| GET /rest/api/2/myself | Bearer mock-jira-token | 200, 현재 사용자 |
| 동일 요청 | PAT 누락·오류·다른 인증 방식 | 401, 합성 오류 |
| GET /rest/api/2/project | 쿼리 없음, Bearer mock-jira-token | 200, 프로젝트 배열 (MOCK 및 EMPTY) |
| GET /rest/api/2/issue/MOCK-1, MOCK-2, MOCK-3 | 쿼리 없음, Bearer mock-jira-token | 200, 합성 이슈 |
| GET /rest/api/2/issue/{key} | 키 형식 [A-Z][A-Z0-9_]*-[1-9][0-9]*, 쿼리 없음, 정상 PAT, 등록된 세 키 이외 | 404, errorMessages: Issue Does Not Exist, errors: {} |
| GET /rest/api/2/search | 아래 고정 JQL·페이지 조합, 정상 PAT | 200, startAt/maxResults/total/issues |
| 프로젝트 목록·형식에 맞는 이슈 키 조회·지원 검색 | PAT 누락·오류·다른 인증 방식 | 401, Authentication required; 데이터 비노출 |
| 그 외 경로·메서드·쿼리 | 모든 인증 상태 | 404, UNSUPPORTED_REQUEST |

지원 필드는 __files/users/current.json, __files/projects/list.json, __files/issues/MOCK-1.json에 명시된 부분집합입니다. 인증 실패 본문과 일괄 401 정책은 모의 계약이며 실제 서버의 인증 필터·익명 접근 설정 동작을 보증하지 않습니다. fallback은 제품의 실제 404 응답이 아닙니다. 응답 링크 대상 API는 별도 명시 없이는 미지원입니다.

## 데이터와 상태

MOCK 프로젝트(id 10000)의 MOCK-1/2/3 이슈(id 10001/10002/10003)는 Open 상태의 Task이며 담당자와 보고자는 현재 사용자 mock-user입니다. EMPTY 프로젝트(id 11000)는 이슈가 없습니다. 프로젝트 목록과 이슈의 project 객체는 같습니다. MOCK-1의 기존 값은 보존합니다. 모든 데이터는 합성이며 읽기를 반복해도 변하지 않습니다. 생성·수정·상태 전이는 미지원입니다.

이슈 조회는 대문자 키만 지원합니다. 공식 API의 숫자 ID 조회, 키 정규화, fields·expand·properties, 프로젝트 expand 및 프로젝트 목록 페이지네이션, 임의 JQL 검색은 미지원입니다. 미지원 쿼리·메서드·경로는 인증 상태와 무관하게 fallback 404로 반환합니다. 형식에 맞는 없는 키 조회도 인증 검사가 먼저 적용됩니다. 응답 self는 요청 Base URL을 사용하지만 숫자 ID·프로젝트·사용자·상태·유형 링크는 후속 조회 지원을 의미하지 않습니다. 컨텍스트 경로는 미지원입니다.

## 고정 프로젝트 검색 (J-L)

`GET /rest/api/2/search`는 정확히 `jql=project = MOCK ORDER BY key ASC` 또는 `jql=project = EMPTY ORDER BY key ASC`만 지원합니다. 실제 요청에서는 값을 URL 인코딩합니다. JQL만 지정하면 startAt=0/maxResults=50이며 전체 목록입니다. 또는 startAt=0/2/4 중 하나와 maxResults=2를 함께 지정합니다. MOCK의 total은 항상 3이고 각 페이지는 2/1/0건입니다. EMPTY의 total은 항상 0이고 모든 페이지가 비어 있습니다. 순서는 MOCK-1/2/3이며 각 목록 원소는 상세와 동일한 지원 필드 값을 제공합니다.

URL decoding 후 이름·값을 비교하며 순서와 %20/+ 공백 인코딩은 무관합니다. 매개변수는 각각 한 번만 허용합니다. 추가·중복·빈 값, 다른 JQL/페이지 값, 한쪽 페이지 인자만 지정, 선행 0/음수/소수, 다른 대소문자·경로·메서드는 인증과 무관하게 UNSUPPORTED_REQUEST입니다. WireMock의 URL 형태 matcher는 허용 이름·개수만 제한하며 queryParameters matcher가 decoding된 값을 판정합니다. 임의 JQL 파서나 모의 서버 전용 헤더는 없습니다. 조회는 상태를 바꾸지 않습니다.

## 근거

- [Jira Server 9.12.0 Search](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/search): jql/startAt/maxResults 및 검색 응답 구조의 근거. 고정 JQL·허용 페이지·합성 데이터는 [v1 모의 계약](../../docs/v1-contract.md)의 결정입니다.
- [PAT Bearer 인증](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)
- [Jira Server 9.12.0 Get all projects](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/project-getAllProjects): 프로젝트 배열과 필드의 근거. 실제 API는 익명 접근에 공개된 프로젝트를 반환할 수 있으나 이 모의 계약은 PAT를 요구합니다.
- [Jira Server 9.12.0 Get issue](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/issue-getIssue): 이슈 키·fields와 404 오류의 근거. 실제 API의 전체 필드·ID·권한 처리는 구현하지 않습니다.

참조 문서와 목표 패치 버전은 다릅니다. 경로·필드의 참고 근거이며 목표 패치 버전의 실측 증거가 아닙니다.

## 연결 제약

WireMock 3.13.2에서 연결 재사용 중 PAT의 대소문자만 바꾼 요청이 이전 헤더 값으로 관측되는 현상을 재현했습니다. 현재 모든 모의 응답에 Connection: close를 지정해 인증 판정을 보존합니다. 따라서 keep-alive 및 연결 풀 동작 검증은 지원하지 않습니다. 고정 인증 헤더는 Bearer 표기와 토큰을 정확하게 비교합니다. 이 제약은 서버 엔진 수정·교체 후 회귀 검사로 해제합니다.

## 검증

`services/jira/tests/search.test.mjs`의 B-J/J-L HTTP 단언은 프로젝트→전체 페이지→키 상세의 누락·중복·관계, 빈/마지막/범위밖 페이지, decoding·순서·인증·미지원 경계를 확인합니다. 기존 project-issue/current-user 회귀도 유지합니다. WireMock 모의 계약 검증이며 실제 Jira Software 9.12.28 호환성 검증은 미실행입니다. 숫자 ID 별칭과 context는 #13 후속입니다.

## 오류와 지연 (E, #12)

모든 지원 GET에 WireMock 시나리오 `product-read`를 적용합니다. 판정 순서는 지원 요청 형태 → 정확한 PAT → 시나리오 → 데이터 존재/정상 응답입니다. 미지원 요청은 모든 상태에서 기존 fallback 404이며 인증 실패는 항상 401입니다. 제품 전용 헤더나 클라이언트 분기는 없습니다.

| 상태 | 응답 |
| --- | --- |
| Started | 기존 정상 또는 자연 404 |
| forbidden | 403, Forbidden |
| not-found | 404, Not found |
| server-error | 500, Internal server error |
| delay | 기존 정상/자연 404 응답 그대로 고정 1500ms 지연 |

오류 본문은 [v1 E 계약](../../docs/v1-contract.md#e-오류지연서버측-상태-12)의 제품별 JSON과 일치하며 보호 데이터를 포함하지 않습니다. Jira 자연 404의 Issue Does Not Exist와 강제 Not found는 구별됩니다. PAT 실패와 fallback은 지연하지 않습니다. 모든 응답에 JSON Content-Type과 Connection: close를 유지합니다.

관리 origin(제품과 같은 호스트/포트, context 제외)에서 GET /__admin/scenarios로 확인하고, PUT /__admin/scenarios/product-read/state에 JSON {"state":"forbidden"}을 보내 선택합니다. state는 표의 다섯 값 중 하나입니다. 빈 POST /__admin/scenarios/reset으로 Started로 복귀합니다. GET은 상태를 바꾸지 않으며 선택 상태를 반복합니다. 두 제품의 상태는 독립이고 재시작하면 Started입니다. 관리API는 신뢰하는 로컬 실행자용 WireMock 기본 기능이며 PAT 보호를 주장하지 않습니다.

전용 HTTP 검증은 services/jira/tests/error-scenarios.test.mjs에서 두 제품의 모든 지원 GET, 자연404, 오류 전문, PAT 우선, fallback, 실측1500ms, 제품격리 및 반복 reset을 단언합니다. 시험 전후 reset을 실행합니다. 서버 전체 상태를 사용하는 시험끼리 경합하지 않도록 서비스 실행기는 파일을 순차 실행합니다. 이는 테스트 실행 방식이며 제품 클라이언트의 순차 요청 요구가 아닙니다. 실제 제품 호환성·성능 검증은 미실행입니다. WireMock [시나리오](https://wiremock.org/docs/stateful-behaviour/)와 [고정 지연](https://wiremock.org/docs/simulating-faults/)을 재사용합니다.
