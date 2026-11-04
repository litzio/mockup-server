# 기여 규칙

## 이슈와 PR

[이슈 작성 규칙](docs/contributing/issues.md)을 따른다. 검토 이슈 등록은 구현 착수 승인이 아니다. 변경은 PR로 검토하고 이유·관련 이슈·검증 결과를 기록한다. API 변경은 지원 범위와 근거도 갱신한다.

## 검증

Node.js 24와 npm은 저장소 관리 도구용이다. WireMock 실행 환경은 별도로 정한다.

```powershell
npm ci
npm run issues:forms -- --check
npm test
git diff --check
```

이 검사는 이슈 정책과 커밋 출처 검사 도구를 검증하며 제품 API 호환성 검사가 아니다.

## AI commit provenance

AI가 주로 작성한 커밋에는 실제 구현 정보를 최종 연속 trailer 블록에 각각 한 번 기록한다.

```text
AI-Agent: <실제 에이전트>
AI-Model: <provider/실제 모델 식별자>
```

모델을 추측하거나 이전 커밋에서 복사하지 않는다. 여러 줄 메시지는 UTF-8 파일과 `git commit --file`로 전달한다. 커밋 직후와 push 전에 `git log -1 --format='%H%n%(trailers:only)'`로 확인한다. GitHub merge queue가 만든 커밋은 예외이며 PR 원래 커밋은 검사한다.

선택적으로 `git config core.hooksPath .githooks`로 로컬 검사 훅을 활성화한다.

## 참고 저장소와 차이

litzio/litzio의 이슈 정책·CLI·자동 안내·테스트·AI 출처 검사를 재사용한다. Litzio 전용 UI·릴리스 절차와 플러그인 라벨은 가져오지 않는다. 기본 브랜치는 main이며 필수 검사는 Repository policy다.

## 서비스 HTTP 검증

`docker compose up -d` 후 `npm run wait:services`와 `npm run test:services`를 실행한다. 테스트는 services/*/tests/*.test.mjs를 자동 탐색한다. 이는 모의 계약 검증이며 실제 제품 호환성 검증이 아니다. 테스트를 위해 실행한 Compose 프로젝트는 완료 후 down으로 정리한다.
