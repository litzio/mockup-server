# 기여 규칙

## 이슈와 PR

[이슈 작성 규칙](docs/contributing/issues.md)을 따른다. 검토 이슈 등록은 구현 착수 승인이 아니다. 구현 전에 범위와 완료 기준이 있는 작업 이슈를 등록하고, 하나의 문제에 하나의 응집된 PR을 만들어 `Closes #N`으로 연결한다. 이유·검증 결과·미실행 검증과 이유를 기록한다. API 변경은 지원 범위와 근거도 갱신한다.

## 검토와 순차 병합

`main`은 [Protect main](https://github.com/litzio/mockup-server/rules/26508592) ruleset으로 보호한다. 2026-11-04 API 확인 기준 active, bypass 없음, 직접 push·force push·삭제 금지, GitHub required approval count 0, review thread 해결 필수다. 승인 수 0은 아래 운영상 검토를 생략한다는 뜻이 아니다. 같은 GitHub 계정의 agent는 작성자 자신의 PR에 approve review를 제출할 수 없으므로 PR 댓글로 검토 근거를 남긴다.

1. 구현은 독립 worktree에서 진행하고 정확한 현재 PR head의 필수 CI `Repository policy`가 통과해야 한다. 이전 head의 성공으로 대신하지 않는다.
2. 구현에 참여하지 않은 검토자가 diff, 관련 계약, 검증 근거와 테스트 단언 약화 여부를 확인한다. 보안·CI workflow·인증·상태 경합·데이터 변경 같은 위험 PR은 별도 agent가 독립 검토한다. 문서만의 변경 등 위험하지 않은 PR은 구현하지 않은 통합 담당자가 확인할 수 있다. 검토 전에 최신 base를 fetch하고 PR 고유 commit 전체의 Git parsed trailers를 확인한다. 구현자 자신의 판단은 승인이 아니다.
3. 검토자는 아래 형식으로 정확한 head SHA를 기록한다. 통합 담당자 확인은 첫 줄을 `Integrator check: <agent-id> (no independent review: <위험 PR이 아닌 이유>)`로 쓰고 확인 사항을 덧붙인다.
4. 통합 담당자는 enqueue 직전 승인 SHA와 현재 head 일치, 같은 head의 필수 CI 성공, 미해결 review thread 없음을 확인한다. head가 변경되면 새 CI와 변경 내용에 맞는 재검토 기록을 받는다. 위험한 코드·단언 변경은 별도 agent의 새 APPROVE가 필요하다. 문서만의 변경이나 양쪽 변경 보존 외의 변경이 없는 conflict 해결은 통합 담당자가 diff와 새 SHA를 확인할 수 있다.
5. Queue가 최신 main과 앞선 PR을 합친 결과를 검증한다. main 이동이나 queue 재구성만으로 head가 같은 PR에 재승인을 요구하지 않는다. 실패·충돌 시 해당 run의 로그부터 조사하고, head를 수정했다면 1–4단계를 다시 확인한다.

```text
Reviewer agent: <reviewer-agent-id>
Verdict: APPROVE
Head SHA: <full-approved-head-sha>
Required CI: PASSED
Unresolved review threads: NONE
```

Queue 설정은 merge method `MERGE`, build concurrency 5, group size 최소/최대 1/5, 대기 0분, `ALLGREEN`, timeout 60분이다. strict up-to-date는 queue가 최신 통합 결과를 검사하므로 OFF이며 queue를 비활성화할 때 ON으로 되돌린다. 병합 후 branch 자동 삭제는 ON이다. 규칙을 바꾸면 API 확인 후 이 기록도 갱신한다.

아래 PowerShell 명령에서 번호와 승인 SHA를 실제 값으로 바꾼다. `expectedHeadOid`가 승인 이후 head 변경을 거부한다. `gh pr merge` 대신 queue에 직접 등록한다.

```powershell
$prId = gh pr view <N> --json id --jq .id
gh api graphql -f 'query=mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position state}}}' -f "id=$prId" -f 'oid=<approved-sha>'
gh run list --event merge_group --json databaseId,headSha,status,conclusion,url
```

`merge_group` run의 headSha와 queue 통합 SHA를 대조해 성공을 확인한다. Queue 등록은 병합을 승인하는 작업이며 구현 작업자가 임의로 수행하지 않는다. 이 저장소의 이슈 선등록 의무·주 에이전트 조율/별도 GPT 구현 제약은 [AGENTS.md](AGENTS.md)에 따른다.

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

구현한 에이전트와 현재 실행의 실제 모델을 기록한다. 모델을 추측하거나 이전 커밋에서 복사하지 않는다. 제목에 출처를 넣거나 `Co-authored-by`로 대체하지 않는다. 여러 줄 메시지는 UTF-8 파일과 `git commit --file`로 전달한다. 커밋 직후와 push 전에 `git log -1 --format='%H%n%(trailers:only)'`로 확인한다. GitHub merge queue가 만든 플랫폼 merge commit은 예외이며 PR 고유 commit 전체는 검사한다. Agent가 수동 작성한 merge commit도 필수 trailer 대상이다.

검토자는 승인 전에 다음으로 PR 고유 commit 전체를 확인한다.

```powershell
git fetch origin main
git log origin/main..HEAD --format='%H%n%(trailers:only)'
```

[검사기](scripts/commit-provenance.mjs)는 Git의 `interpret-trailers --parse`를 재사용해 누락·중복·빈 값·모델 형식·블록 밖 metadata를 검사한다. PR event의 base SHA에서 head SHA까지 검사하며 base에서 도달 가능한 과거 이력과 GitHub synthetic merge는 제외하고 PR에서 작성한 merge는 포함한다. `merge_group`에서는 PR에서 검증한 provenance를 다시 검사하지 않고 queue merge를 명시적으로 제외한다. AI metadata가 전혀 없는 사람 commit과 선택적 `AI-Reviewed-By`는 허용한다. 검사기는 실제 작성자나 모델 기록의 진실성을 자동 판별하지 않는다. Hook 통과나 raw 본문 검색은 Git parsed trailers 확인을 대신하지 않는다.

선택적으로 `git config core.hooksPath .githooks`로 로컬 검사 훅을 활성화한다.

## 참고 저장소와 차이

litzio/litzio의 이슈 정책·CLI·자동 안내·테스트·AI 출처 검사를 재사용한다. Litzio 전용 UI·릴리스 절차와 플러그인 라벨은 가져오지 않는다. 2026-11-04 기준 Litzio `d492fc2368763e58a35aef7715ca496a1855e5cf`와 비교했다.

| 공통 규칙 | 적용 및 차이 |
| --- | --- |
| 이슈 폼·CLI·등록 후 안내 | 같은 필드/분류 계약과 검사. 영역은 Jira/Confluence/Server/Docs/Product, 대상 URL과 기본 브랜치는 이 저장소로 치환한다. |
| AI 출처 | 검사기·회귀 테스트·hook은 동일하다. 최종 연속 trailer, PR 범위와 authored merge 검사, queue merge 예외를 유지한다. |
| 검토·queue·브랜치 보호 | Litzio의 독립 검토/통합 확인, exact-head 승인과 queue 운영을 적용한다. ruleset 구조는 동일하며 기본 브랜치는 main, 필수 검사는 Repository policy다. |
| CI·도구 | npm과 Node.js 24, 정책 검사 및 WireMock 모의 HTTP 검증을 유지한다. Litzio의 pnpm·Editor·Desktop·Core·릴리스 CI와 제품별 라벨은 가져오지 않는다. |

기존 일반 GitHub 라벨은 삭제하지 않는다. 이슈 검사는 표준 type/area/status 라벨을 사용한다. 원격 ruleset과 branch 자동 삭제는 적용 상태이며, 이 PR의 변경은 merge 후 기본 브랜치의 폼·안내에 반영된다.

## 서비스 HTTP 검증

`docker compose up -d` 후 `npm run wait:services`와 `npm run test:services`를 실행한다. 테스트는 services/*/tests/*.test.mjs를 자동 탐색한다. 이는 모의 계약 검증이며 실제 제품 호환성 검증이 아니다. 테스트를 위해 실행한 Compose 프로젝트는 완료 후 down으로 정리한다.
