# jira

독립 WireMock 모듈. `docker compose up -d jira`로 실행합니다.

- Base URL: http://localhost:8081
- 가짜 PAT: `mock-jira-token`
- 현재 사용자: `GET /rest/api/2/myself`
- 프로젝트 목록: GET /rest/api/2/project
- 단일 이슈: GET /rest/api/2/issue/MOCK-1 (MOCK-2/3도 지원)
- 고정 검색: `GET /rest/api/2/search?jql=project%20%3D%20MOCK%20ORDER%20BY%20key%20ASC&startAt=0&maxResults=2`
- [지원 계약과 근거](api-support.md)

빈 context 또는 `/jira`를 지원합니다. [설정 절차](../../docs/context-paths.md)를 따릅니다. 쿼리는 지원 계약의 조합만 허용하며 오류 상태는 WireMock 관리API로 선택합니다.
