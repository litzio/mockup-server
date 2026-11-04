# confluence

독립 WireMock 모듈. `docker compose up -d confluence`로 실행한다.

- Base URL: `http://localhost:8082`
- 가짜 PAT: `mock-confluence-token`
- 현재 사용자: `GET /rest/api/user/current` — 정상 PAT는 known/mock.user-a, 누락·잘못된 PAT는 anonymous HTTP200
- 공간 목록: `GET /rest/api/space?start=0&limit=1` — ~mock.user-a, MOCK, EMPTY
- 개인 공간: `GET /rest/api/space/~mock.user-a`
- 개인 페이지: `GET /rest/api/space/~mock.user-a/content/page?limit=1`
- 페이지: `GET /rest/api/content/30001`, 본문은 `?expand=body.storage`
- 본문과 기본 메타데이터: `?expand=body.storage,version,space,history`
- [지원 계약·별칭·근거](api-support.md)

공간 및 페이지 목록은 start=0..999999999, limit=1/2/25를 각각 선택하며 생략은 start=0/limit=25다. 보호 자원은 PAT가 필요하다. HTTP200만으로 identity 인증을 판정하지 않는다. API 링크는 설정 origin/context를 따른다. [context 설정](../../docs/context-paths.md)을 따른다.

인수 명세 seed를 변경하지 않고 `node services/confluence/tools/generate-acceptance.mjs --check`로 생성물 drift를 확인한다. 제품 클라이언트나 실제 Confluence를 실행한 검증이 아니며 실제 연결은 접근 불가로 미검증이다.
