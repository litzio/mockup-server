# 서비스 추가

1. services/<name>/에 README.md, api-support.md, mappings/, __files/, tests/를 추가합니다.
2. compose.yaml에 고정 WireMock 이미지, 독립 포트, 읽기 전용 모듈 마운트를 등록합니다.
3. 정상·인증 실패·미지원 요청 매핑과 HTTP 테스트를 작성합니다.
4. scripts/wait-services.mjs에 준비 상태 확인 주소를 추가합니다. test:services는 services/*/tests/*.test.mjs를 자동 실행합니다.
5. API 지원 범위·합성 데이터·실측 여부와 루트 실행 안내를 갱신합니다.

제품별 인증·응답 의미는 서비스 모듈이 소유합니다. 공통 도구에는 제품 의미를 추가하지 않습니다. npm workspace나 플러그인 로더는 현재 필요하지 않습니다.
