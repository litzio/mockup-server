# 지원 계약

- 목표: Jira Software 9.12.28
- 실제 대상 서버 검증: **미실행**
- 합성 데이터만 사용합니다.

| 요청 | 조건 | 응답 |
| --- | --- | --- |
| GET /rest/api/2/myself | Bearer mock-jira-token | 200, 현재 사용자 |
| 동일 요청 | PAT 누락·오류·다른 인증 방식 | 401, 합성 오류 |
| GET /rest/api/2/project | 쿼리 없음, Bearer mock-jira-token | 200, 프로젝트 배열 (MOCK 1개) |
| GET /rest/api/2/issue/MOCK-1 | 쿼리 없음, Bearer mock-jira-token | 200, 합성 이슈 |
| GET /rest/api/2/issue/{key} | 키 형식 [A-Z][A-Z0-9_]*-[1-9][0-9]*, 쿼리 없음, 정상 PAT, MOCK-1 이외 | 404, errorMessages: Issue Does Not Exist, errors: {} |
| 프로젝트 목록·형식에 맞는 이슈 키 조회 | PAT 누락·오류·다른 인증 방식 | 401, Authentication required; 데이터 비노출 |
| 그 외 경로·메서드·쿼리 | 모든 인증 상태 | 404, UNSUPPORTED_REQUEST |

지원 필드는 __files/users/current.json, __files/projects/list.json, __files/issues/MOCK-1.json에 명시된 부분집합입니다. 인증 실패 본문과 일괄 401 정책은 모의 계약이며 실제 서버의 인증 필터·익명 접근 설정 동작을 보증하지 않습니다. fallback은 제품의 실제 404 응답이 아닙니다. 응답 링크 대상 API는 별도 명시 없이는 미지원입니다.

## 데이터와 상태

MOCK 프로젝트(id 10000)의 MOCK-1 이슈(id 10001)는 Open 상태의 Task이며 담당자와 보고자는 현재 사용자 mock-user입니다. 프로젝트 목록과 이슈의 project 객체는 같습니다. 모든 데이터는 합성이며 읽기를 반복해도 변하지 않습니다. 생성·수정·상태 전이는 미지원입니다.

이슈 조회는 대문자 키만 지원합니다. 공식 API의 숫자 ID 조회, 키 정규화, fields·expand·properties, 프로젝트 expand 및 페이지네이션, 검색은 미지원입니다. 미지원 쿼리·메서드·경로는 인증 상태와 무관하게 fallback 404로 반환합니다. 형식에 맞는 없는 키 조회도 인증 검사가 먼저 적용됩니다. 응답 self는 요청 Base URL을 사용하지만 숫자 ID·프로젝트·사용자·상태·유형 링크는 후속 조회 지원을 의미하지 않습니다. 컨텍스트 경로는 미지원입니다.

## 근거

- [PAT Bearer 인증](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)
- [Jira Server 9.12.0 Get all projects](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/project-getAllProjects): 프로젝트 배열과 필드의 근거. 실제 API는 익명 접근에 공개된 프로젝트를 반환할 수 있으나 이 모의 계약은 PAT를 요구합니다.
- [Jira Server 9.12.0 Get issue](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/issue-getIssue): 이슈 키·fields와 404 오류의 근거. 실제 API의 전체 필드·ID·권한 처리는 구현하지 않습니다.

참조 문서와 목표 패치 버전은 다릅니다. 경로·필드의 참고 근거이며 목표 패치 버전의 실측 증거가 아닙니다.

## 연결 제약

WireMock 3.13.2에서 연결 재사용 중 PAT의 대소문자만 바꾼 요청이 이전 헤더 값으로 관측되는 현상을 재현했습니다. 현재 모든 모의 응답에 Connection: close를 지정해 인증 판정을 보존합니다. 따라서 keep-alive 및 연결 풀 동작 검증은 지원하지 않습니다. 고정 인증 헤더는 Bearer 표기와 토큰을 정확하게 비교합니다. 이 제약은 서버 엔진 수정·교체 후 회귀 검사로 해제합니다.
