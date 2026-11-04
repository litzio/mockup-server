# 지원 계약

이 문서는 현재 구현 기준입니다. 후속 범위는 [v1 계약](../../docs/v1-contract.md)을 따르며 해당 이슈 구현 전에는 지원하지 않습니다.

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
| GET /rest/api/space | 정확한 Bearer mock-confluence-token, 쿼리 없음 | 200, MOCK/EMPTY 공간 2개 |
| GET /rest/api/content/{20001,20002,20003} | 같은 PAT, 쿼리 없음 | 200, current page 메타데이터 |
| GET /rest/api/content/{20001,20002,20003}?expand=body.storage | 같은 PAT, 정확히 이 쿼리 하나 | 200, 메타데이터와 storage 본문 |
| GET /rest/api/content/{id}, 같은 storage 확장 선택 가능 | 같은 PAT, 미등록 양의 십진 정수 ID | 404, 합성 statusCode/message/reason |
| 위 지원 형태의 GET | PAT 누락·오류·대소문자만 변경·다른 인증 방식 | 401, 데이터 없는 합성 오류 |
| 그 외 요청 | 모든 인증 상태 | 404, UNSUPPORTED_REQUEST |

ID는 `[1-9][0-9]*`이며 20001/20002/20003이 존재합니다. 0, 선행 0, 비숫자 ID, 후행 슬래시, 다른 경로·메서드는 미지원입니다. 아래 페이지 목록 이외의 start/limit/필터, 공간 단건·검색·쓰기·첨부·컨텍스트 경로는 지원하지 않습니다. 쿼리 값은 URL decoding 후 비교하며 추가·중복·빈 값·다른 확장은 거부합니다. URL 형태와 WireMock hasExactly 쿼리 매칭을 함께 사용하므로 알 수 없는 쿼리가 성공으로 숨겨지지 않습니다. 인증 실패는 동일 GET 요청의 성공/존재 여부보다 우선하며 사용자·공간·페이지 본문을 반환하지 않습니다. 미지원 형태는 인증 여부와 무관하게 fallback입니다.

공간 목록의 start=0, limit=25, size=2는 MOCK/EMPTY 공간을 나타내며 next/prev는 없습니다. 공간 목록 자체의 페이지네이션 요청은 지원하지 않습니다. 공간 id=20000/key=MOCK와 페이지 id=20001, 작성자·버전 사용자(mock-user)는 현재 사용자와 일관된 합성 fixture입니다. 페이지 메타데이터 부분집합은 space/history/version을 포함하며 본문은 storage 확장 시에만 추가합니다. 두 응답의 메타데이터는 같습니다. GET 반복에 상태 전이는 없고 시나리오·변경 API는 없습니다. 모든 링크가 실제 지원 API임을 뜻하지 않습니다.

### 읽기 API 근거와 검증 한계

- [공식 Server REST 7.19.0](https://docs.atlassian.com/ConfluenceServer/rest/7.19.0/): Space 목록의 results/start/limit/size, Content by id 경로와 기본 history/space/version 확장 구조 참고. 문서의 축약 `/rest/content` 대신 예시의 `/rest/api/content/{id}`를 사용합니다.
- [공식 Data Center Content Resource 9.2.20](https://developer.atlassian.com/server/confluence/rest/v9220/api-group-content-resource/): 작업자 최초 조회에서는 Content 응답 예시의 content/space/history/version 필드 구조가 노출되어 참고했습니다. 후속 조회 및 독립 리뷰어 접근에서는 내비게이션만 노출되어 같은 상세 내용을 재확인하지 못했습니다.
- [Atlassian Data Center 본문 조회 설명](https://support.atlassian.com/confluence/kb/how-to-get-page-content-or-child-list-via-rest-api/): expand=body.storage 사용 근거. 패치 버전 고정 문서는 아닙니다.

9.2.20 Space 참조는 이번 조회에서 내비게이션만 노출되어 공간 계약의 상세 근거로 사용하지 않았습니다. Content 참조도 상세 내용의 재현 가능한 접근에 위 한계가 있으므로, 읽기 계약의 재확인 가능한 근거는 위 7.19.0 문서와 공식 storage 안내입니다. 위 참고 버전은 목표 9.2.17과 다릅니다. 실제 9.2.17의 응답 전체·정확한 기본 확장·오류 문구·권한 및 익명 접근 정책·확장 조합의 동일성은 검증하지 않았습니다. 고정 응답 부분집합, 401/404 본문 및 엄격한 요청 제한은 모의 계약입니다. Cloud API는 사용하지 않습니다.

검증은 Docker WireMock HTTP에서 공간·페이지 일관성, storage 유무, 목록 메타데이터, 재조회, 정상/누락/오류/대소문자 PAT, 미등록 페이지, 미지원 메서드·쿼리·경로를 단언합니다. 기존 Jira와 현재 사용자 회귀도 함께 실행합니다. 이는 모의 계약 검증이며 실제 제품 호환성 검증은 **미실행**입니다. Connection: close 제약은 유지합니다.

## C-L 공간별 페이지 목록 (#11)

[계약 원본](../../docs/v1-contract.md)의 B-C/C-L을 구현합니다. GET /rest/api/space/{spaceKey}/content/page는 쿼리 없음 또는 start=0/2/4와 limit=2의 쌍만 허용합니다. 순서는 무관하고 값은 decoding 후 비교하며 각각 정확히 한 번이어야 합니다. 공간 키는 [A-Z][A-Z0-9_]*이며 형식에 맞는 미등록 공간은 404 No content found, 인증 오류는 먼저 401입니다. 그 외 쿼리·경로·메서드는 인증과 무관하게 fallback입니다.

MOCK(id 20000)의 페이지는 20001/20002/20003 순서이며 EMPTY(id 21000)는 비어 있습니다. 새 페이지는 기존 페이지와 같은 필드 집합을 제공하고 현재 사용자·공간 관계를 보존합니다. 기존 20001의 제목·본문·사용자·버전은 변경하지 않습니다. 새 storage 문자열은 각각 <p>Synthetic integration page 20002 body.</p>, <p>Synthetic integration page 20003 body.</p>입니다.

목록은 results/start/limit/size/_links를 반환합니다. 기본 start=0/limit=25는 전체, 명시 start=0/2/4는 각각 2/1/0건이며 size는 해당 결과 길이입니다. EMPTY는 모든 허용 형태에서 0건입니다. 본문은 목록에 없고 상세의 storage 확장에서만 추가합니다. 기본·빈·범위 밖 목록에는 next/prev가 없으며 MOCK start=0은 next(start=2), start=2는 prev(start=0)를 제공합니다. self는 현재 쿼리 포함 절대 URL, next/prev는 origin 기준 상대 경로입니다. 현재 context는 빈 문자열이고 변경 context는 #13 후속입니다. 조회는 상태를 바꾸지 않습니다.

HTTP 검증은 tests/pagination.test.mjs의 B-C/C-L 테스트에 연결됩니다. 공간→목록→상세→storage 일관성, self/next/prev 실제 추적과 전체 집합·중복 검사, 빈/마지막/범위 밖, 인코딩·순서·중복·인증·fallback을 검증합니다. HEAD는 성공 계약이 없으며 404를 검사합니다. WireMock/Jetty는 HEAD에 Connection: close를 두 번 출력하여 클라이언트에서 close, close로 관찰되므로 HEAD에서는 모든 토큰이 close인지 검사하고 GET은 단일 close 단언을 유지합니다. 실제 Confluence 9.2.17 호환성은 미실행이며 모의 계약 성공과 구분합니다.
