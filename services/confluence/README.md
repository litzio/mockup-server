# confluence

독립 WireMock 모듈. `docker compose up -d confluence`로 실행합니다.

- Base URL: http://localhost:8082
- 가짜 PAT: `mock-confluence-token`
- 현재 사용자: `GET /rest/api/user/current`
- 공간 목록: `GET /rest/api/space` (MOCK/EMPTY 공간 2개)
- 페이지: `GET /rest/api/content/{20001,20002,20003}`, 본문은 `?expand=body.storage`
- [지원 계약과 근거](api-support.md)

빈 context 또는 `/confluence`를 지원합니다. [설정 절차](../../docs/context-paths.md)를 따릅니다. 페이지 상세는 `expand=body.storage`를 선택할 수 있습니다. 공간별 목록 `GET /rest/api/space/MOCK/content/page`는 기본 전체 또는 `?start=0&limit=2`, start=2/4를 지원합니다. EMPTY 목록은 비어 있습니다. 오류 상태는 WireMock 관리API로 선택합니다.
