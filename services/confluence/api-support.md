# 지원 계약

이 문서는 현재 구현 기준입니다. v1 계약을 유지하고 아래 V2-C (#25) 요청을 추가합니다. [v1 계약](../../docs/v1-contract.md)은 이전 버전 기록입니다.

- 목표: Confluence 9.2.17
- 실제 대상 서버 검증: **미실행**
- 합성 데이터만 사용합니다.

| 요청 | 조건 | 응답 |
| --- | --- | --- |
| GET /rest/api/user/current | Bearer mock-confluence-token | 200, 현재 사용자 |
| 동일 요청 | PAT 누락·오류·다른 인증 방식 | 401, 합성 오류 |
| 아래 공간·페이지 계약 외 경로·메서드·쿼리 | 모든 인증 상태 | 404, UNSUPPORTED_REQUEST |

현재 사용자 필드는 __files/users/current.json에 명시된 부분집합입니다. 인증 실패 본문과 일괄 401 정책은 모의 계약이며 실제 서버의 인증 필터·익명 접근 설정 동작을 보증하지 않습니다. fallback은 제품의 실제 404 응답이 아닙니다. 응답 링크 대상 API는 별도 명시 없이는 미지원입니다.

## 근거

- [PAT Bearer 인증](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)
- [Confluence 사용자 API 참조 9.2.20](https://developer.atlassian.com/server/confluence/rest/v9220/api-group-user/)

참조 문서와 목표 패치 버전은 다릅니다. 경로·필드의 참고 근거이며 목표 패치 버전의 실측 증거가 아닙니다.

## 연결 제약

WireMock 3.13.2에서 연결 재사용 중 PAT의 대소문자만 바꾼 요청이 이전 헤더 값으로 관측되는 현상을 재현했습니다. 현재 모든 모의 응답에 Connection: close를 지정해 인증 판정을 보존합니다. 따라서 keep-alive 및 연결 풀 동작 검증은 지원하지 않습니다. 고정 인증 헤더는 Bearer 표기와 토큰을 정확하게 비교합니다. 이 제약은 서버 엔진 수정·교체 후 회귀 검사로 해제합니다.
## 공간·페이지 읽기 계약

| 요청 | 조건 | 응답 |
| --- | --- | --- |
| GET /rest/api/space | 정확한 Bearer mock-confluence-token, 쿼리 없음 | 200, MOCK/EMPTY/~mock-user-a 공간 3개 |
| GET /rest/api/content/{20001,20002,20003,22001,22002,22003} | 같은 PAT, 쿼리 없음 | 200, current page 메타데이터 |
| GET /rest/api/content/{20001,20002,20003,22001,22002,22003}?expand=body.storage | 같은 PAT, 정확히 이 쿼리 하나 | 200, 메타데이터와 storage 본문 |
| GET /rest/api/content/{id}, 같은 storage 확장 선택 가능 | 같은 PAT, 미등록 양의 십진 정수 ID | 404, 합성 statusCode/message/reason |
| 위 지원 형태의 GET | PAT 누락·오류·대소문자만 변경·다른 인증 방식 | 401, 데이터 없는 합성 오류 |
| 그 외 요청 | 모든 인증 상태 | 404, UNSUPPORTED_REQUEST |

ID는 `[1-9][0-9]*`이며 20001/20002/20003/22001/22002/22003이 존재합니다. 0, 선행 0, 비숫자 ID, 후행 슬래시, 다른 경로·메서드는 미지원입니다. 아래 페이지 목록 이외의 start/limit/필터, 검색·쓰기·첨부는 지원하지 않습니다. 공간 단건은 아래 V2-C 범위를 지원합니다. context는 아래 U 설정을 따릅니다. 쿼리 값은 URL decoding 후 비교하며 추가·중복·빈 값·다른 확장은 거부합니다. URL 형태와 WireMock hasExactly 쿼리 매칭을 함께 사용하므로 알 수 없는 쿼리가 성공으로 숨겨지지 않습니다. 인증 실패는 동일 GET 요청의 성공/존재 여부보다 우선하며 사용자·공간·페이지 본문을 반환하지 않습니다. 미지원 형태는 인증 여부와 무관하게 fallback입니다.

공간 목록의 start=0, limit=25, size=3은 MOCK/EMPTY/~mock-user-a 공간을 나타내며 next/prev는 없습니다. 공간 목록 자체의 페이지네이션 요청은 지원하지 않습니다. 공간 id=20000/key=MOCK와 페이지 id=20001, 작성자·버전 사용자(mock-user)는 현재 사용자와 일관된 합성 fixture입니다. 페이지 메타데이터 부분집합은 space/history/version을 포함하며 본문은 storage 확장 시에만 추가합니다. 두 응답의 메타데이터는 같습니다. GET 반복에 상태 전이는 없으며 오류 시나리오는 아래 관리API에서 선택합니다. 모든 링크가 실제 지원 API임을 뜻하지 않습니다.

### 읽기 API 근거와 검증 한계

- [공식 Server REST 7.19.0](https://docs.atlassian.com/ConfluenceServer/rest/7.19.0/): Space 목록의 results/start/limit/size, Content by id 경로와 기본 history/space/version 확장 구조 참고. 문서의 축약 `/rest/content` 대신 예시의 `/rest/api/content/{id}`를 사용합니다.
- [공식 Data Center Content Resource 9.2.20](https://developer.atlassian.com/server/confluence/rest/v9220/api-group-content-resource/): 작업자 최초 조회에서는 Content 응답 예시의 content/space/history/version 필드 구조가 노출되어 참고했습니다. 후속 조회 및 독립 리뷰어 접근에서는 내비게이션만 노출되어 같은 상세 내용을 재확인하지 못했습니다.
- [Atlassian Data Center 본문 조회 설명](https://support.atlassian.com/confluence/kb/how-to-get-page-content-or-child-list-via-rest-api/): expand=body.storage 사용 근거. 패치 버전 고정 문서는 아닙니다.

9.2.20 Space 참조는 이번 조회에서 내비게이션만 노출되어 공간 계약의 상세 근거로 사용하지 않았습니다. Content 참조도 상세 내용의 재현 가능한 접근에 위 한계가 있으므로, 읽기 계약의 재확인 가능한 근거는 위 7.19.0 문서와 공식 storage 안내입니다. 위 참고 버전은 목표 9.2.17과 다릅니다. 실제 9.2.17의 응답 전체·정확한 기본 확장·오류 문구·권한 및 익명 접근 정책·확장 조합의 동일성은 검증하지 않았습니다. 고정 응답 부분집합, 401/404 본문 및 엄격한 요청 제한은 모의 계약입니다. Cloud API는 사용하지 않습니다.

검증은 Docker WireMock HTTP에서 공간·페이지 일관성, storage 유무, 목록 메타데이터, 재조회, 정상/누락/오류/대소문자 PAT, 미등록 페이지, 미지원 메서드·쿼리·경로를 단언합니다. 기존 Jira와 현재 사용자 회귀도 함께 실행합니다. 이는 모의 계약 검증이며 실제 제품 호환성 검증은 **미실행**입니다. Connection: close 제약은 유지합니다.

## C-L 공간별 페이지 목록 (#11)

[계약 원본](../../docs/v1-contract.md)의 B-C/C-L을 구현합니다. GET /rest/api/space/{spaceKey}/content/page는 쿼리 없음 또는 start=0/2/4와 limit=2의 쌍을 허용하며, V2-C에서 limit=1과 개인 공간을 추가합니다. 순서는 무관하고 값은 decoding 후 비교하며 각각 정확히 한 번이어야 합니다. v1 공간 키는 [A-Z][A-Z0-9_]*이며 형식에 맞는 미등록 공간은 404 No content found, 인증 오류는 먼저 401입니다. 그 외 쿼리·경로·메서드는 인증과 무관하게 fallback입니다.

MOCK(id 20000)의 페이지는 20001/20002/20003 순서이며 EMPTY(id 21000)는 비어 있습니다. 새 페이지는 기존 페이지와 같은 필드 집합을 제공하고 현재 사용자·공간 관계를 보존합니다. 기존 20001의 제목·본문·사용자·버전은 변경하지 않습니다. 새 storage 문자열은 각각 <p>Synthetic integration page 20002 body.</p>, <p>Synthetic integration page 20003 body.</p>입니다.

목록은 results/start/limit/size/_links를 반환합니다. 기본 start=0/limit=25는 전체, 명시 start=0/2/4는 각각 2/1/0건이며 size는 해당 결과 길이입니다. EMPTY는 모든 허용 형태에서 0건입니다. 본문은 목록에 없고 상세의 storage 확장에서만 추가합니다. 기본·빈·범위 밖 목록에는 next/prev가 없으며 MOCK start=0은 next(start=2), start=2는 prev(start=0)를 제공합니다. self는 현재 쿼리 포함 절대 URL, next/prev는 origin 기준 상대 경로입니다. context는 빈 문자열 또는 설정한 /confluence이며 모든 API 링크가 이를 반영합니다. 조회는 상태를 바꾸지 않습니다.

HTTP 검증은 tests/pagination.test.mjs의 B-C/C-L 테스트에 연결됩니다. 공간→목록→상세→storage 일관성, self/next/prev 실제 추적과 전체 집합·중복 검사, 빈/마지막/범위 밖, 인코딩·순서·중복·인증·fallback을 검증합니다. HEAD는 성공 계약이 없으며 404를 검사합니다. WireMock/Jetty는 HEAD에 Connection: close를 두 번 출력하여 클라이언트에서 close, close로 관찰되므로 HEAD에서는 모든 토큰이 close인지 검사하고 GET은 단일 close 단언을 유지합니다. 실제 Confluence 9.2.17 호환성은 미실행이며 모의 계약 성공과 구분합니다.

## 오류와 지연 (E, #12)

모든 지원 GET에 WireMock 시나리오 `product-read`를 적용합니다. 판정 순서는 지원 요청 형태 → 정확한 PAT → 시나리오 → 데이터 존재/정상 응답입니다. 미지원 요청은 모든 상태에서 기존 fallback 404이며 인증 실패는 항상 401입니다. 제품 전용 헤더나 클라이언트 분기는 없습니다.

| 상태 | 응답 |
| --- | --- |
| Started | 기존 정상 또는 자연 404 |
| forbidden | 403, Forbidden |
| not-found | 404, No content found |
| server-error | 500, Internal server error |
| delay | 기존 정상/자연 404 응답 그대로 고정 1500ms 지연 |

오류 본문은 [v1 E 계약](../../docs/v1-contract.md#e-오류지연서버측-상태-12)의 제품별 JSON과 일치하며 보호 데이터를 포함하지 않습니다. Jira 자연 404의 Issue Does Not Exist와 강제 Not found는 구별됩니다. PAT 실패와 fallback은 지연하지 않습니다. 모든 응답에 JSON Content-Type과 Connection: close를 유지합니다.

관리 origin(제품과 같은 호스트/포트, context 제외)에서 GET /__admin/scenarios로 확인하고, PUT /__admin/scenarios/product-read/state에 JSON {"state":"forbidden"}을 보내 선택합니다. state는 표의 다섯 값 중 하나입니다. 빈 POST /__admin/scenarios/reset으로 Started로 복귀합니다. GET은 상태를 바꾸지 않으며 선택 상태를 반복합니다. 두 제품의 상태는 독립이고 재시작하면 Started입니다. 관리API는 신뢰하는 로컬 실행자용 WireMock 기본 기능이며 PAT 보호를 주장하지 않습니다.

전용 HTTP 검증은 services/jira/tests/error-scenarios.test.mjs와 tests/personal-space.test.mjs에서 기존 및 새 지원 GET, 자연404, 오류 전문, PAT 우선, fallback, 실측1500ms, 제품격리 및 반복 reset을 단언합니다. 시험 전후 reset을 실행합니다. 서버 전체 상태를 사용하는 시험끼리 경합하지 않도록 서비스 실행기는 파일을 순차 실행합니다. 이는 테스트 실행 방식이며 제품 클라이언트의 순차 요청 요구가 아닙니다. 실제 제품 호환성·성능 검증은 미실행입니다. WireMock [시나리오](https://wiremock.org/docs/stateful-behaviour/)와 [고정 지연](https://wiremock.org/docs/simulating-faults/)을 재사용합니다.

## 연결 설정과 링크 (U, #13)

[실행 절차](../../docs/context-paths.md)에 따라 빈 context 또는 제품별 context를 준비합니다. 모든 API 링크는 요청 origin/context를 반영합니다. 관리API는 context 밖이며 설정 시 context 없는 제품 요청은 fallback입니다. Jira issue self와 Confluence page 및 목록 self/next/prev는 추적 지원합니다. Confluence space self는 V2-C에서 추적 지원합니다. Jira 메타데이터 링크의 지원 여부는 Jira 계약을 따릅니다.

## V2-C 개인 공간과 단건 조회 (#25)

| GET 경로 | 추가 허용 조건 | 결과 |
| --- | --- | --- |
| `/rest/api/space/{spaceKey}` | 쿼리 없음 | 등록 공간 메타데이터, 목록 원소와 동일 |
| `/rest/api/space/{spaceKey}/content/page` | `limit=1` 또는 `start=0/1/2/3/4&limit=1` | start 생략은 0, 첫·중간·마지막·빈·범위 밖 결과 |
| 개인 공간의 같은 페이지 목록 | 쿼리 없음 또는 기존 `start=0/2/4&limit=2` | 일반 공간과 동일한 유한 페이지 계약 |
| `/rest/api/content/{22001,22002,22003}` | 쿼리 없음 또는 `expand=body.storage` | 개인 공간 페이지 메타데이터/본문 |

공간 목록에 id=22000/key=`~mock-user-a`/type=`personal`을 추가합니다. 이 공간의 페이지는 22001, 22002, 22003 순서이며 제목·본문은 구별 가능한 합성 문자열입니다. 기존 MOCK/EMPTY 공간과 기존 페이지 값은 보존합니다. 작성자·버전 사용자는 기존 합성 현재 사용자이며 공간 소유자/권한 엔진을 모사하지 않습니다.

단건 공간과 새 목록 형태의 키 문법은 일반 `[A-Z][A-Z0-9_]*` 또는 개인 `~[a-z][a-z0-9-]*`입니다. 등록되지 않은 유효한 키는 제품형 404이고 인증 실패는 401이 우선합니다. 개인 키의 `~`와 `%7E`/`%7e`는 동등합니다. 나머지 경로 문자의 임의 percent 인코딩까지 지원하지 않습니다. 새 쿼리도 순서와 동등한 값 인코딩을 수용하고 추가·중복·빈 값·음수·소수·선행 0은 fallback입니다. `start` 단독, `limit=2` 단독, `start=5&limit=1`, 범위 밖 limit/expand 조합은 미지원입니다. 임의 start/limit 엔진이 아닌 명시적 허용 목록입니다.

`limit=1`에서 데이터가 3개인 공간의 start=0/1/2는 각 1건, start=3/4는 0건입니다. EMPTY는 모두 0건입니다. size는 결과 길이이며 total 필드가 아닙니다. 빈·범위 밖 목록에는 next/prev가 없고, 데이터가 있는 페이지에는 실제 앞/뒤 페이지가 있을 때만 링크를 제공합니다. 모든 공간 self와 페이지 self/next/prev는 같은 origin/context로 실제 추적됩니다.

`tests/personal-space.test.mjs`는 기본 및 `/confluence` Base URL에서 공간 상세→limit=1 전체 탐색→상세→storage, 인코딩·빈/범위 밖·중복/누락·인증·모든 오류 상태·리셋을 검사합니다. 오류 시나리오는 서버 전체 상태이므로 다른 HTTP 테스트와 파일 단위로 순차 실행합니다. delay 검사는 응답 의미 유지와 단조 시계로 측정한 요청부터 본문 수신까지 1500ms 이상을 검사합니다. 클라이언트 타임아웃/취소 판정과 지연 경계 진단은 별도 지연 검사에 속합니다. 실제 클라이언트는 접근 불가로 **미검증**이며 계약 기반 HTTP 소비자 검증을 대신 수행합니다. 실제 제품 권한·SSO·TLS·프록시 호환성은 이 결과로 보증하지 않습니다. 추가 키·페이지 조건은 사용자 평가에 근거한 모의 계약이며 실제 제품 전체 요청 문법과 동일하다는 주장이 아닙니다.
