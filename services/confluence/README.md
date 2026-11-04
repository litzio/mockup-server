# confluence

독립 WireMock 모듈. `docker compose up -d confluence`로 실행합니다.

- Base URL: http://localhost:8082
- 가짜 PAT: `mock-confluence-token`
- 현재 사용자: `GET /rest/api/user/current`
- 공간 목록: `GET /rest/api/space` (MOCK 공간 1개)
- 페이지: `GET /rest/api/content/20001`, 본문은 `?expand=body.storage`
- [지원 계약과 근거](api-support.md)

현재는 기본 경로만 지원하며 컨텍스트 경로는 미지원입니다. 쿼리는 페이지의 정확한 `expand=body.storage`만 지원합니다. scenarios 디렉터리는 상태 시나리오 구현 시 추가합니다.
