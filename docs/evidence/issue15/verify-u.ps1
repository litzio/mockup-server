$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
function Run([string]$exe,[string[]]$arguments) {
  ConvertTo-Json -Compress @{command=$exe;args=$arguments} | Out-Host
  & $exe @arguments
  $code=$LASTEXITCODE
  "EXIT $code" | Out-Host
  if($code -ne 0){throw "Command failed: $exe"}
}
$project='mockup-issue15-u'
try {
  $env:JIRA_PORT='8081'; $env:CONFLUENCE_PORT='8082'
  $env:JIRA_CONTEXT=''; $env:CONFLUENCE_CONTEXT=''
  $env:JIRA_PAT='mock-jira-token'; $env:CONFLUENCE_PAT='mock-confluence-token'
  Run docker @('compose','-p',$project,'up','-d','--pull','never')
  foreach($hostname in @('localhost','127.0.0.1')) {
    $env:JIRA_BASE_URL="http://${hostname}:8081"; $env:CONFLUENCE_BASE_URL="http://${hostname}:8082"
    Run node @('scripts/wait-services.mjs')
    Run node @('scripts/check-context.mjs')
  }
  Run docker @('compose','-p',$project,'down')
  $env:JIRA_PORT='18581'; $env:CONFLUENCE_PORT='18582'
  foreach($mode in @('jira-only','confluence-only')) {
    "MODE $mode" | Out-Host
    $env:JIRA_CONTEXT=$(if($mode -eq 'jira-only'){'/jira'}else{''})
    $env:CONFLUENCE_CONTEXT=$(if($mode -eq 'confluence-only'){'/confluence'}else{''})
    Run node @('scripts/prepare-context.mjs')
    Run docker @('compose','-p',$project,'-f','compose.yaml','-f','compose.context.yaml','up','-d','--pull','never')
    foreach($hostname in @('localhost','127.0.0.1')) {
      $env:JIRA_BASE_URL="http://${hostname}:18581"+$env:JIRA_CONTEXT
      $env:CONFLUENCE_BASE_URL="http://${hostname}:18582"+$env:CONFLUENCE_CONTEXT
      Run node @('scripts/wait-services.mjs')
      Run node @('scripts/check-context.mjs')
    }
    Run docker @('compose','-p',$project,'-f','compose.yaml','-f','compose.context.yaml','down')
  }
} finally {
  Run docker @('compose','-p',$project,'-f','compose.yaml','-f','compose.context.yaml','down')
}
'PASS U additional settings; cleanup complete'
