# Mockup Server

회사 외부에서 Jira·Confluence 연동 서비스를 개발하기 위한 WireMock 기반 범용 모의 REST API 서버입니다.

## 목적

- Jira Software **9.12.28**, Confluence **9.2.17**을 목표 버전으로 합니다.
- 실제 서버나 자격증명 없이 로컬·폐쇄망에서 정상 응답, 인증 실패, 권한 오류, 서버 오류와 지연을 시험합니다.
- 특정 클라이언트에 종속되지 않으며 지원 API와 시나리오를 확장합니다.

## 개발 경험

외부에서 모의 서버로 개발한 동일 서비스 빌드를 내부망에 배포하고, 제품별 Base URL과 PAT를 교체해 실제 서버에 연결하는 것이 목표입니다. 클라이언트 코드에 모의 서버 전용 분기를 넣지 않습니다.

아래는 클라이언트 연결 설정 예시입니다.

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

서비스 모듈 기반 실행 구성과 현재 사용자·Jira 프로젝트 목록·단일 이슈·Confluence 공간 목록·페이지 조회와 PAT HTTP 테스트를 구현했습니다. 폐쇄망 실행에 필요한 고정 버전 런타임·실행 파일 또는 이미지를 사전 반입하는 구성을 마련할 예정입니다.

v1의 후속 지원 범위와 완료 판정은 [v1 계약](docs/v1-contract.md)에 확정했습니다. 이 문서의 계획은 현재 구현 완료를 뜻하지 않습니다.

## 저장소 관리

- [작업 원칙](AGENTS.md)
- [기여 및 검증](CONTRIBUTING.md)
- [이슈 작성 규칙](docs/contributing/issues.md)
- [이슈 등록](https://github.com/litzio/mockup-server/issues/new/choose)

이슈 관리 체계는 litzio/litzio를 참고하며 영역은 이 저장소에 맞게 변경했습니다.

## 로컬 실행

Docker Desktop의 Linux 컨테이너 엔진이 실행 중이어야 합니다. 공식 WireMock 3.13.2 이미지를 사용하며 최초 실행 시 다운로드합니다.

```powershell
docker compose up -d
npm ci
npm run wait:services
npm run test:services
```

Jira만 실행하려면 `docker compose up -d jira`, 종료는 `docker compose down`을 사용합니다. 준비 확인·전체 서비스 테스트는 두 서비스를 모두 실행한 상태에서 수행합니다.

```powershell
Invoke-RestMethod http://localhost:8081/rest/api/2/myself -Headers @{Authorization='Bearer mock-jira-token'}
Invoke-RestMethod http://localhost:8082/rest/api/user/current -Headers @{Authorization='Bearer mock-confluence-token'}
```

포트는 `.env.example`을 `.env`로 복사하여 변경합니다. 변경한 포트로 테스트하려면 `JIRA_BASE_URL`, `CONFLUENCE_BASE_URL` 환경 변수를 설정합니다. PAT 값은 현재 모듈에 고정된 가짜 값이며 `.env`로 변경하지 않습니다.

## 서비스 모듈

```text
services/
  jira/
    README.md
    api-support.md
    mappings/
    __files/users/
    tests/
  confluence/
    README.md
    api-support.md
    mappings/
    __files/users/
    tests/
tests/helpers/
scripts/
compose.yaml
```

- [Jira](services/jira/README.md)
- [Confluence](services/confluence/README.md)
- [서비스 추가](docs/adding-service.md)

현재 사용자·Jira 프로젝트 목록·키 기반 단일 이슈·Confluence 공간 목록·단일 페이지(storage 본문 선택) 조회·정상 PAT·인증 실패·미지원 요청을 구현했습니다. Jira/Confluence 검색·페이지네이션, 상태 시나리오, 컨텍스트 경로, 폐쇄망 반입 패키지는 후속 범위입니다. 실제 대상 서버 검증은 미실행입니다.


현재 모의 응답은 인증 헤더 재사용 문제를 피하기 위해 연결을 닫습니다. keep-alive·연결 풀 검증은 지원하지 않습니다. 자세한 근거와 제약은 제품별 api-support.md에 기록했습니다.
