# jira

독립 WireMock 모듈. `docker compose up -d jira`로 실행합니다.

- Base URL: http://localhost:8081
- 가짜 PAT: `mock-jira-token`
- 현재 사용자: `GET /rest/api/2/myself`
- 프로젝트 목록: GET /rest/api/2/project
- 단일 이슈: GET /rest/api/2/issue/MOCK-1
- [지원 계약과 근거](api-support.md)

현재는 기본 경로만 지원하며 컨텍스트 경로와 쿼리 확장은 미지원입니다. scenarios 디렉터리는 상태 시나리오 구현 시 추가합니다.
