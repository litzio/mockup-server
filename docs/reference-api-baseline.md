# 목표 패치 버전의 공식 REST 기준점 (#32)

2026-11-04 확인 결과, **Jira 9.12.28의 Platform/Agile HTML과 Confluence 9.2.17의 OpenAPI JSON을 확보했다.** 정확한 버전의 경로·매개변수 근거로 사용할 수 있지만, 공식 파일만으로 현재 인수 명세의 응답 검증을 대체할 수는 없다. 이 변경은 조사 문서이며 fixture, 서버 동작, 제공된 인수 assertion/gate를 바꾸지 않는다.

## 출처와 재현

| 공식 자료 | 확인 결과 | 저장 형식 |
| --- | --- | --- |
| [Jira Platform 9.12.28](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.28/) | 직접 HTTPS 200, HTML title `Jira 9.12.28` | HTML, 내장 JSON Schema 조각 |
| [Jira Software/Agile 9.12.28](https://docs.atlassian.com/jira-software/REST/9.12.28/) | 직접 HTTPS 200, title에 버전 명시 | HTML |
| [Confluence Data Center 9.2.17](https://developer.atlassian.com/server/confluence/9.2.17.swagger.v3.json) | 직접 HTTPS 200, `openapi=3.0.1`, `info.version=9.2.17` | JSON, 122 paths / 117 component schemas |

정확한 URL·최종 URL·HTTP 상태·바이트 수·SHA-256·내부 버전·API 매핑은 [출처 manifest](reference-api-sources.json)에 있다. Platform HTML과 Confluence JSON은 별도 재다운로드에서도 동일 해시였다. Confluence 응답 Content-Type은 text/plain이지만 본문을 JSON으로 파싱하고 내부 OpenAPI 버전을 확인했다.

원본은 저장소 밖 참조 디렉터리에 보관한다. vendor의 실명처럼 보이는 예제·외부 도메인·수 MB 자료를 모의 fixture나 반입 패키지에 복사하지 않는다. 저장소에는 출처와 조사 결과만 기록한다. 공식 자료 자체의 HTTP 재다운로드에만 다음처럼 사용하며 실제 제품이나 자격증명에는 접속하지 않는다.

```powershell
$referenceFile = 'C:/Reference/confluence-9.2.17.openapi.json'
Invoke-WebRequest 'https://developer.atlassian.com/server/confluence/9.2.17.swagger.v3.json' -OutFile $referenceFile
Get-FileHash -Algorithm SHA256 -LiteralPath $referenceFile
$reference = Get-Content -Raw -LiteralPath $referenceFile | ConvertFrom-Json
$reference.openapi
$reference.info.version
```

대상 디렉터리는 미리 만들고 새 파일에 받는다. URL이 같아도 앞으로 바이트가 바뀌면 기존 해시의 검증 기록을 덮어쓰지 않고 새 확인 기록을 남긴다.

## 현재 API의 공식 근거

현재 Jira 조회는 **Platform `/rest/api/2`**에 속한다. Jira Software에 포함된 API와 Agile `/rest/agile/1.0`의 보드·스프린트 API를 혼동하지 않는다. Cloud 문서를 기준으로 사용하지 않는다.

| 현재 요청 | 버전 고정 근거 | 채택 가능한 내용 |
| --- | --- | --- |
| Jira myself | [getUser](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.28/#api/2/myself-getUser) | GET 경로, 200/401 |
| Jira project | [getAllProjects](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.28/#api/2/project-getAllProjects) | 프로젝트 배열 조회; 가시성은 실제 권한 설정에 종속 |
| Jira search | [search](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.28/#api/2/search-search) | jql/startAt/maxResults/fields, 기본 요청 크기 50와 서버 상한, 잘못된 JQL의 400 |
| Jira issue | [getIssue](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.28/#api/2/issue-getIssue) | `{issueIdOrKey}`, fields 선택, 200/404 |
| Confluence user/current | OpenAPI `getCurrent` | identity 경로; 명시 응답은 200/403 |
| Confluence space 목록/상세 | `spaces` / `space` | start/limit, 일반적인 spaceKey 경로와 personal 타입 |
| Confluence 공간별 page | `contentsWithType` | `{type}=page`, start/limit 및 목록 구조 |
| Confluence content 상세 | `getContentById` | expand, 기본 history/space/version, 200/404 |

Confluence 행은 위 [9.2.17 JSON](https://developer.atlassian.com/server/confluence/9.2.17.swagger.v3.json)의 operationId다. personal key의 실제 문자열, 정확한 익명 응답, 필드 null 변형은 이 경로 선언만으로 정해지지 않는다. Jira의 6개 JQL 조합·페이지 상한 2·정확한 필드 허용목록은 모의 계약이며 공식 문서가 그 제한을 요구한다고 주장하지 않는다.

## 자동 응답 검증에 그대로 적용할 수 없는 이유

다음 JSON Pointer는 확보한 Confluence JSON 안의 위치다.

| 위치 | 관찰한 한계 | 인수에 미치는 영향 |
| --- | --- | --- |
| `#/components/schemas/Person` | username/userKey 및 required 목록이 없음 | known/anonymous 인증 판정을 검증할 수 없음 |
| `#/paths/~1rest~1api~1space/get/responses/200/content/application~1json/schema` | 단일 Space를 참조 | 실측·인수의 results/start/limit/size 목록 envelope와 직접 일치하지 않음 |
| `#/components/schemas/Space/properties/id` | integer 선언 | 소비자·fixture의 ID 표현과 별도 대조 필요 |
| `#/components/schemas/Content/properties/body` | 일반 object | body.storage.value/representation을 강제하지 못함 |
| `#/paths/~1rest~1api~1user~1current/get/responses` | 200/403만 열거 | 누락/잘못된 PAT의 anonymous200이나 인증 필터 전체를 확정하지 못함 |

목록 query의 start/limit는 string으로 기술되어 있고 응답 항목에는 number가 사용된다. 쿼리 문자열의 표현과 응답 JSON 타입을 같은 규칙으로 처리하면 안 된다. OpenAPI 3.0.1 schema와 제공된 draft-07/URN 인수 schema도 같은 문서 형식이 아니다.

Jira HTML의 search-results 및 issue 내장 schema는 최상위 required 목록이 없고 `fields.patternProperties[".+"]={}`다. 따라서 `status.statusCategory.key`, priority/null, 파싱 가능한 updated 등 소비자의 필수 조건을 검사하지 못한다. 공식 schema에서 허용한다고 소비자 검증을 완화해서는 안 된다.

## 부적합한 후보와 확인 경계

- Platform HTML에 연결된 `jira-rest-plugin.wadl`은 404 XML 오류였다. 외부에 보관한 `.http404.xml`과 manifest의 해시는 실패 응답 증거이며 **WADL 확보 증거가 아니다**. 이번 조사에서는 정확한 Jira 버전의 OpenAPI를 확보하지 못했다.
- 옛 Jira REST URL은 HTTP 포트 8080으로 302 전환되었고 후속 요청이 완료되지 않았다. 직접 HTTPS 버전 URL을 사용한다.
- 현대 문서의 `v91228/intro/`는 `v11003/`로 전환되었다. 최종 HTTP 200을 9.12.28 확인으로 간주하지 않는다.

위 주소·상태·Location은 manifest에 그대로 구분했다. 확인 실패는 원격에 명세가 전혀 없다는 증명이 아니다. 브라우저 검색 도구가 두 정확한 자료를 열지 못한 경우에도 별도 HTTP 다운로드·내용 파싱·해시로 확인했으며, 검색 결과의 제목만으로 판정하지 않았다.

## 기준점 채택 제안

1. **공식 버전 근거:** 현재 범위의 경로·메서드·명시 매개변수는 확보한 9.12.28/9.2.17 자료를 우선 참조한다. 인접 버전 문서보다 정확한 목표 버전 근거다.
2. **실측 보완:** 제공된 [인수 명세](acceptance/mockup-server-acceptance.json)의 관찰은 실제 패치 버전 미수집이라는 한계를 유지한다. Jira auth-filter401, Confluence anonymous200, storage-only 확장 차이를 공식 자료의 생략만으로 폐기하지 않는다.
3. **모의·소비자 계약:** 고정 seed, JQL 허용목록, null 사례, 주입 오류, 엄격한 미지원 처리와 소비자 필수 필드는 독립적으로 명시하고 테스트한다. 실제 권한·SSO·TLS·프록시 또는 전체 제품 호환성을 이 파일의 존재로 인증하지 않는다.

이 제안의 채택은 참고 근거 갱신에 한정한다. 응답 동작이나 인수 schema를 바꾸려면 구체적인 차이·근거·새 완료 기준을 별도 이슈로 검토해야 한다. 실제 소비자 미실행과 인수 gate 결과는 그대로 유지한다.
