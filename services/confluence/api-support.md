# Confluence 지원 계약

대상은 Confluence 9.2.17이며 Cloud API가 아니다. 실제 비교 환경의 패치 버전은 수집되지 않았으므로 목표 버전과 같다고 추정하지 않는다. 현재 계약은 사용자가 제공한 [인수 JSON](../../docs/acceptance/mockup-server-acceptance.json)의 합성 seed와 익명화된 관찰을 따른다. [v1 계약](../../docs/v1-contract.md)은 이전 strict-PAT 정책과 fixture의 역사적 기록이다.

## 인증과 판정 순서

- 가짜 PAT는 정확한 `Authorization: Bearer mock-confluence-token`이다.
- `GET /rest/api/user/current`는 정상 PAT에 `type: known`, `username: mock.user-a`, `userKey: mock-user-a-key`를 반환한다.
- 같은 identity 요청의 누락·잘못된 PAT·다른 제품 PAT·다른 인증 방식은 **HTTP 200, type: anonymous**이며 `username`과 `userKey`가 없다. HTTP 200만으로 인증 성공을 판정하면 안 된다. 다른 제품 토큰의 익명 처리는 합성 격리 확장이다.
- 공간·페이지는 보호된 자원이다. 지원 요청 형태에서 인증 실패는 401 제품형 JSON이며 존재 여부나 주입된 오류 상태보다 먼저 판정한다. 익명 identity가 보호된 페이지 접근을 허용하지 않는다.
- 미지원 경로·메서드·쿼리는 인증 상태와 무관하게 `404 {mockError: "UNSUPPORTED_REQUEST", message: "This request is outside the supported mock contract."}`다. 실제 제품 오류 응답으로 주장하지 않는다.
- 모든 제품 응답은 JSON과 `Connection: close`다. 기존 WireMock 헤더 재사용 문제 때문에 keep-alive/연결 풀 호환성을 보증하지 않는다. 제품 클라이언트에 목업 전용 헤더나 분기를 요구하지 않는다.

## 지원 GET과 매개변수

| 경로 | 허용 쿼리 | 결과 |
| --- | --- | --- |
| `/rest/api/user/current` | 없음 | known 또는 anonymous identity |
| `/rest/api/space` | 없음, `start`, `limit`, 또는 둘 모두 | 공간 목록 |
| `/rest/api/space/{spaceKey}` | 없음 | 공간 상세 |
| `/rest/api/space/{spaceKey}/content/page` | 없음, `start`, `limit`, 또는 둘 모두 | 공간별 페이지 목록 |
| `/rest/api/content/{id}` | 없음 | 본문 없는 기본 메타데이터 |
| 같은 content 경로 | `expand=body.storage` | 본문과 기본 identity, 기본 메타데이터 확장 없음 |
| 같은 content 경로 | `expand=body.storage,version,space,history` | 본문 및 명시한 메타데이터 확장 |

`start`는 0 … 999999999의 정규 십진 정수이며 생략하면 0이다. `limit`는 1, 2, 25이며 생략하면 25다. 서버 상한을 별도로 적용하지 않는다. 각 인자는 한 번만 허용한다. 쿼리 순서 및 이름/값의 동등한 percent 인코딩을 수용하며 추가·중복·빈 값·음수·소수·선행 0·다른 값은 fallback이다. 확장 조합은 표의 정확한 두 문자열이며 임의 확장 순열·CQL·검색·쓰기·첨부·다른 content type은 범위 밖이다.

일반 공간 키 문법은 `[A-Z][A-Z0-9_]*`, 개인 공간은 `~[a-z][a-z0-9.-]*`다. 개인 키의 `~`와 `%7E`/`%7e`는 동등하다. 나머지 경로 문자의 임의 인코딩을 일반화하지 않는다. content id 문법은 `[1-9][0-9]*`다. 형식에 맞는 미등록 공간·페이지는 `404 {statusCode:404, message:"No content found", reason:"Not Found"}`이며 보호 데이터가 없다. 잘못된 형식·후행 슬래시·다른 메서드는 fallback이다.

## 합성 데이터와 페이지 탐색

정규 데이터 버전은 인수 명세의 `synthetic-acceptance-v1`이다. 임의 사용자 데이터나 실제 응답 export가 아니다.

| 공간 id / key | type | 페이지 id 순서 |
| --- | --- | --- |
| 20000 / `~mock.user-a` | personal | 30001, 30002, 30003 |
| 20001 / `MOCK` | global | 40001 |
| 20002 / `EMPTY` | global | 없음 |

공간 목록은 위 순서다. 페이지는 공간 안에서 숫자 ID 오름차순이며 조회·재시작으로 바뀌지 않는다. 공간은 `id/key/name/type/status/_links`를 포함하며 status는 current다. 페이지 기본 응답은 `id/type/status/title/space/history/version/_links`를 포함하고 body는 없다. history/버전 사용자는 합성 known identity와 일치하며 버전은 seed 값이다.

storage 단독 확장은 `id/type/status/title/_links/body.storage`를 제공하며 space/history/version을 생략한다. 합성 30001의 본문은 `<p>Synthetic paragraph A.</p>`다. 기본 메타데이터가 필요한 소비자는 `body.storage,version,space,history`를 명시해야 한다. 기본 응답과 확장 응답의 identity는 같고, combined 응답의 메타데이터는 기본 응답과 같다. combined 조합은 consumer/synthetic 요구이며 실서버에서 관찰한 조합이라고 주장하지 않는다.

목록은 `results/start/limit/size/_links`다. size는 이번 results 길이이며 전체 개수가 아니다. start가 전체 개수 이상이면 빈 results/size=0이며 next/prev를 발명하지 않는다. 데이터가 있는 페이지는 실제 앞/뒤 페이지가 있을 때만 prev/next를 제공한다. next/prev는 선택한 limit를 보존하고, 전체 탐색에 누락·중복·순환이 없다. 목록 원소는 상세와 같은 identity 및 공간을 제공하며 본문은 목록에 넣지 않는다.

기존에 허용한 경로를 제거하지 않기 위해 `~mock-user-a`는 `~mock.user-a`의 별칭이다. content `20001/20002/20003` 및 초기 v2 초안의 `22001/22002/22003`은 각각 `30001/30002/30003`의 별칭이며 응답 id/self는 **정규 ID**다. 별칭을 공간·페이지 목록에 추가하지 않는다. 기존 `MOCK` 목록 요청 형태는 유지하되, 이 fixture 버전에서는 정규 seed인 40001 한 건을 반환한다. 이전 fixture 값까지 보존하는 호환성 주장이 아니다.

## 링크와 context

지원 API의 self는 설정 origin/context 안의 절대 URL이다. 목록 self는 현재 요청 쿼리를 포함하고, next/prev는 origin 기준 상대 경로이며 설정 context를 포함한다. 공간 상세와 content self, 모든 목록 self/next/prev를 실제로 추적할 수 있다. profilePicture의 브라우저 이미지 경로는 API 추적 범위 밖이다. 관리 API는 context 밖의 같은 origin을 사용한다. context 설정 시 context 없는 제품 경로는 fallback이다. 지원 context 선택 범위는 공통 [context 설정](../../docs/context-paths.md)을 따른다.

## 오류·지연·리셋

제품의 WireMock `product-read` 상태는 Started, forbidden(403), not-found(404), server-error(500), delay다. 정상 PAT의 지원 GET에는 상태가 적용되며 delay는 같은 정상/자연404 응답을 1500ms 지연한다. 오류는 `statusCode/message/reason`이며 사용자·페이지 본문을 포함하지 않는다. protected 인증 실패는 항상 401, identity 인증 실패는 항상 anonymous 200이며 이 두 경우에는 지연을 적용하지 않는다. 미지원 요청은 모든 상태에서 fallback이다.

`GET /__admin/scenarios`, `PUT /__admin/scenarios/product-read/state`와 JSON `{"state":"delay"}`, `POST /__admin/scenarios/reset`을 사용한다. Started 복귀는 reset이다. 관리 API는 로컬 실행자용이며 PAT 보호를 주장하지 않는다. 한 제품의 시나리오는 다른 제품과 독립이고 GET은 상태를 바꾸지 않는다. 시험은 파일 단위로 순차 실행하며 finally에서 직접 소유한 서비스만 리셋한다.

## 생성·검증·근거

`node services/confluence/tools/generate-acceptance.mjs`는 인수 JSON의 seed를 일반 WireMock JSON/fixture로 만든다. `--check`는 drift와 예상하지 않은 생성 파일을 거부한다. 실행 서버에 생성기나 npm 의존성은 필요 없다. 범위 밖 offset 응답의 숫자 start와 context는 WireMock 기본 response-template 및 [transformerParameters](https://wiremock.org/docs/response-templating/#using-transformer-parameters)를 사용한다.

모듈 테스트는 canonical seed identity, 익명 200, 공간/페이지 limits 1/2/25 행렬, storage-only/combined, 별칭, 인코딩, 미지원·인증·모든 오류·1500ms 지연 하한·리셋을 검사한다. 기존 기본 메타데이터 동등성 단언은 storage-only에 잘못 강제하지 않고 명시적 combined 확장에서 유지한다. [실행 기록](../../docs/confluence-v2-validation.md)은 초기 초안과 명세 반영 후 실행을 구분한다. 공통 인수 runner의 게이트 판정은 별도다.

경로/응답 구조의 기존 참고는 [Confluence Server REST 7.19.0](https://docs.atlassian.com/ConfluenceServer/rest/7.19.0/)과 [Atlassian storage 안내](https://support.atlassian.com/confluence/kb/how-to-get-page-content-or-child-list-via-rest-api/)다. 목표 패치 버전과 다른 문서이며 완전한 버전 일치 근거가 아니다. 최신 identity/expansion 차이는 제공된 익명화 관찰에 근거한다. 현재 실제 클라이언트 연결과 실제 제품의 권한·SSO·TLS·프록시 호환성은 **미검증**이다. 실제 클라이언트 접근 불가를 계약 기반 소비자 테스트로 대체했다고 주장하지 않는다.
