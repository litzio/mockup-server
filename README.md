# Mockup Server

회사 외부에서 Jira·Confluence 연동 서비스를 개발하기 위한 WireMock 기반 범용 모의 REST API 서버입니다.

## 목적

- Jira Software **9.12.28**, Confluence **9.2.17**을 목표 버전으로 합니다.
- 실제 서버나 자격증명 없이 로컬·폐쇄망에서 정상 응답, 인증 실패, 권한 오류, 서버 오류와 지연을 시험합니다.
- 특정 클라이언트에 종속되지 않으며 지원 API와 시나리오를 확장합니다.

## 개발 경험

외부에서 모의 서버로 개발한 동일 서비스 빌드를 내부망에 배포하고, 제품별 Base URL과 PAT를 교체해 실제 서버에 연결하는 것이 목표입니다. 클라이언트 코드에 모의 서버 전용 분기를 넣지 않습니다.

아래는 예정된 설정 예시이며 현재 실행 가능한 서버가 아닙니다.

```dotenv
JIRA_BASE_URL=http://localhost:8081
JIRA_PAT=mock-jira-token
CONFLUENCE_BASE_URL=http://localhost:8082
CONFLUENCE_PAT=mock-confluence-token
```

두 제품은 별도 포트를 사용하고 `Authorization: Bearer <PAT>`를 처리합니다. 모의 서버는 정해진 가짜 PAT를 검증합니다. 컨텍스트 경로가 포함된 Base URL과 응답 내 페이지·첨부파일 링크도 고려합니다.

## 범위와 검증

전체 제품 복제는 목표가 아닙니다. API별 메서드·경로·쿼리·응답 필드·페이지네이션·오류·상태 전이의 지원 범위를 명시합니다. 미지원 요청을 정상 응답으로 감추지 않습니다.

공식 문서 기반 응답, 합성 데이터, 실제 서버에서 확인한 응답을 구분합니다. 참고 문서 버전과 목표 패치 버전을 별도 기록합니다.

모의 테스트 통과는 실제 서버 호환성을 보증하지 않습니다. 내부망에서 동일 빌드로 핵심 연동을 별도 검증합니다. 실제 PAT 권한, 사용자 정의 필드, 플러그인 및 사내 인증서·프록시 환경도 확인해야 합니다.

## 현재 상태

문서와 이슈·PR 관리 기반을 준비하는 단계입니다. WireMock 실행 구성, API 매핑과 서버 테스트는 아직 구현되지 않았습니다. 폐쇄망 실행에 필요한 고정 버전 런타임·실행 파일 또는 이미지를 사전 반입하는 구성을 마련할 예정입니다.

## 저장소 관리

- [작업 원칙](AGENTS.md)
- [기여 및 검증](CONTRIBUTING.md)
- [이슈 작성 규칙](docs/contributing/issues.md)
- [이슈 등록](https://github.com/litzio/mockup-server/issues/new/choose)

이슈 관리 체계는 litzio/litzio를 참고하며 영역은 이 저장소에 맞게 변경했습니다.
