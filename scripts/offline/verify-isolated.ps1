param(
    [Parameter(Mandatory)][string]$Bundle,
    [Parameter(Mandatory)][string]$Evidence,
    [string]$HostContext = 'desktop-linux'
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$Bundle = (Resolve-Path -LiteralPath $Bundle).Path
if (Test-Path -LiteralPath $Evidence) { throw 'Evidence directory must be new' }
$Evidence = [IO.Path]::GetFullPath($Evidence)
if ($Evidence.StartsWith($Bundle + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $Evidence -eq $Bundle) { throw 'Evidence must be outside bundle' }
New-Item -ItemType Directory -Path $Evidence | Out-Null
$Log = Join-Path $Evidence 'commands.log'
function Invoke-Logged([string]$File, [string[]]$Arguments, [switch]$AllowFailure) {
    $command = ConvertTo-Json -Compress @{ time = [DateTime]::UtcNow.ToString('o'); command = $File; args = $Arguments }
    $command | Tee-Object -FilePath $Log -Append | Out-Host
    $script:LastOutput = @(& $File @Arguments 2>&1 | ForEach-Object { "$_" })
    $script:LastExit = $LASTEXITCODE
    $script:LastOutput | Tee-Object -FilePath $Log -Append | Out-Host
    "EXIT $script:LastExit" | Tee-Object -FilePath $Log -Append | Out-Host
    if ($script:LastExit -ne 0 -and !$AllowFailure) { throw "Command failed: $File ($script:LastExit)" }
}
$hostArgs = @('--context', $HostContext)
$remote = @('-H', 'tcp://127.0.0.1:18475')
$daemon = 'mockup-issue14-daemon'
$network = 'mockup-issue14-control'
$createdNetwork = $false
$attemptedDaemon = $false
$owner = [guid]::NewGuid().ToString('N')
$composeFile = Join-Path $Evidence 'remote-compose.json'
$remoteCompose = $remote + @('compose', '-p', 'mockup-issue14', '-f', $composeFile)
$originalLocation = Get-Location
$environmentNames = @('JIRA_CONTEXT', 'CONFLUENCE_CONTEXT', 'JIRA_BASE_URL', 'CONFLUENCE_BASE_URL', 'JIRA_PORT', 'CONFLUENCE_PORT', 'JIRA_PAT', 'CONFLUENCE_PAT')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
    Set-Location -LiteralPath $Bundle
    "PowerShell $($PSVersionTable.PSVersion); OS $([Environment]::OSVersion); architecture $([Runtime.InteropServices.RuntimeInformation]::OSArchitecture)" | Tee-Object -FilePath $Log -Append | Out-Host
    Invoke-Logged node @('--version')
    Invoke-Logged node @('scripts/offline/checksums.mjs', '.')
    Invoke-Logged docker ($hostArgs + @('version'))
    Invoke-Logged docker ($hostArgs + @('compose', 'version'))
    Get-Content bundle.json | Tee-Object -FilePath $Log -Append | Out-Host
    $manifest = Get-Content bundle.json -Raw | ConvertFrom-Json
    foreach ($kind in @(@('container', $daemon), @('network', $network))) {
        Invoke-Logged docker ($hostArgs + @($kind[0], 'inspect', $kind[1])) -AllowFailure
        if ($script:LastExit -eq 0) { throw "Refusing existing resource: $($kind[1])" }
    }
    # The harness image is loaded from the checksum-verified archive, never pulled.
    Invoke-Logged docker ($hostArgs + @('load', '-i', 'dind.tar'))
    Invoke-Logged docker ($hostArgs + @('image', 'inspect', $manifest.toolImage, '--format', '{{.Id}}'))
    if (($script:LastOutput -join '').Trim() -ne $manifest.toolImageId) { throw 'Tool image identity mismatch' }
    Invoke-Logged docker ($hostArgs + @('network', 'create', '--label', 'mockup.issue=14', $network))
    $createdNetwork = $true
    $attemptedDaemon = $true
    Invoke-Logged docker ($hostArgs + @('run', '-d', '--pull', 'never', '--name', $daemon, '--label', 'mockup.issue=14', '--label', "mockup.offline.owner=$owner", '--privileged', '--network', $network,
        '-p', '127.0.0.1:18475:2375', '-p', '127.0.0.1:18481:8081', '-p', '127.0.0.1:18482:8082', '-e', 'DOCKER_TLS_CERTDIR=',
        $manifest.toolImageId, '--tls=false', '--host=tcp://0.0.0.0:2375', '--host=unix:///var/run/docker.sock'))
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Invoke-Logged docker ($remote + @('info', '--format', '{{.ID}}')) -AllowFailure
        if ($script:LastExit -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Isolated daemon not ready' }
    Invoke-Logged docker ($hostArgs + @('inspect', $daemon))
    # These rules operate ONLY inside the new DinD network namespace. Incoming
    # published-port connections and their replies remain possible; new external
    # traffic from the daemon and nested containers is denied, including IPv6.
    $firewall = 'set -eu; iptables -F OUTPUT; iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT; iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT; iptables -A OUTPUT -j REJECT; iptables -F DOCKER-USER; iptables -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN; iptables -A DOCKER-USER -o eth0 -j REJECT; iptables -A DOCKER-USER -j RETURN; ip6tables -P OUTPUT DROP; ip6tables -P FORWARD DROP; ip route; iptables -S OUTPUT; iptables -S DOCKER-USER; ip6tables -S OUTPUT; ip6tables -S FORWARD'
    Invoke-Logged docker ($hostArgs + @('exec', $daemon, 'sh', '-c', $firewall))
    Invoke-Logged docker ($remote + @('image', 'ls', '-q'))
    if (($script:LastOutput -join '').Trim()) { throw 'Isolated image store was not empty' }
    Invoke-Logged docker ($remote + @('pull', $manifest.image)) -AllowFailure
    if ($script:LastExit -eq 0) { throw 'External registry access unexpectedly succeeded' }
    Invoke-Logged docker ($hostArgs + @('exec', $daemon, 'wget', '-T', '5', '-O', '/dev/null', 'http://1.1.1.1')) -AllowFailure
    if ($script:LastExit -eq 0) { throw 'External IP access unexpectedly succeeded' }
    Invoke-Logged docker ($remote + @('image', 'ls', '-q'))
    if (($script:LastOutput -join '').Trim()) { throw 'Failed pull populated image store' }
    Invoke-Logged docker ($remote + @('load', '-i', 'wiremock.tar'))
    Invoke-Logged docker ($remote + @('image', 'inspect', $manifest.image, '--format', '{{.Id}} {{.Os}}/{{.Architecture}}'))
    if (($script:LastOutput -join '').Trim() -ne "$($manifest.imageId) linux/amd64") { throw 'WireMock identity mismatch' }
    $env:JIRA_PORT = '8081'; $env:CONFLUENCE_PORT = '8082'
    $env:JIRA_PAT = 'mock-jira-token'; $env:CONFLUENCE_PAT = 'mock-confluence-token'
    foreach ($mode in @('default', 'context')) {
        $env:JIRA_CONTEXT = $(if ($mode -eq 'context') { '/jira' } else { '' })
        $env:CONFLUENCE_CONTEXT = $(if ($mode -eq 'context') { '/confluence' } else { '' })
        $env:JIRA_BASE_URL = 'http://127.0.0.1:18481' + $env:JIRA_CONTEXT
        $env:CONFLUENCE_BASE_URL = 'http://127.0.0.1:18482' + $env:CONFLUENCE_CONTEXT
        "MODE $mode $env:JIRA_BASE_URL $env:CONFLUENCE_BASE_URL" | Tee-Object -FilePath $Log -Append | Out-Host
        Invoke-Logged node @('scripts/prepare-context.mjs')
        Invoke-Logged docker ($hostArgs + @('exec', $daemon, 'mkdir', '-p', '/bundle-runtime'))
        Invoke-Logged docker ($hostArgs + @('cp', '.runtime/.', "${daemon}:/bundle-runtime"))
        Invoke-Logged docker ($hostArgs + @('compose', '-f', 'compose.yaml', '-f', 'compose.context.yaml', 'config', '--format', 'json'))
        $configuration = ($script:LastOutput -join "`n") | ConvertFrom-Json -AsHashtable
        foreach ($product in @('jira', 'confluence')) {
            $configuration.services[$product].volumes = @(@{ type = 'bind'; source = "/bundle-runtime/$product"; target = '/home/wiremock'; read_only = $true })
            $port = $(if ($product -eq 'jira') { '8081' } else { '8082' })
            $configuration.services[$product].ports = @(@{ target = 8080; published = $port; host_ip = '0.0.0.0'; protocol = 'tcp' })
        }
        $configuration | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $composeFile
        # First launch and down/up both execute from the same verified bundle.
        foreach ($cycle in @(1, 2)) {
            "CYCLE $cycle" | Tee-Object -FilePath $Log -Append | Out-Host
            Invoke-Logged docker ($remoteCompose + @('up', '-d', '--pull', 'never'))
            Invoke-Logged node @('scripts/wait-services.mjs')
            Invoke-Logged node @('scripts/offline/state.mjs', 'started')
            if ($mode -eq 'default' -and $cycle -eq 1) {
                Invoke-Logged docker ($remote + @('exec', 'mockup-issue14-jira-1', 'bash', '-c', 'command -v timeout'))
                Invoke-Logged docker ($remote + @('exec', 'mockup-issue14-jira-1', 'bash', '-c', 'timeout 5 bash -c "echo > /dev/tcp/1.1.1.1/80"')) -AllowFailure
                if ($script:LastExit -eq 0) { throw 'Nested product container external access unexpectedly succeeded' }
            }
            if ($mode -eq 'default') {
                Invoke-Logged node @('scripts/test-services.mjs')
            } else {
                # Existing pagination tests intentionally assert the empty-context
                # contract. Preserve those assertions and use U + E for context.
                Invoke-Logged node @('--test', 'services/jira/tests/error-scenarios.test.mjs')
            }
            Invoke-Logged node @('scripts/check-context.mjs')
            Invoke-Logged node @('scripts/offline/state.mjs', 'dirty')
            Invoke-Logged docker ($remoteCompose + @('logs', '--no-color'))
            Invoke-Logged docker ($remoteCompose + @('down'))
        }
    }
    Invoke-Logged docker ($hostArgs + @('exec', $daemon, 'iptables', '-nvL', 'OUTPUT'))
} finally {
    if ($attemptedDaemon) {
        # docker run may create the container and then fail to bind a port.
        # A unique token proves ownership even when the run command failed.
        Invoke-Logged docker ($hostArgs + @('inspect', '--format', '{{ index .Config.Labels "mockup.offline.owner" }}', $daemon)) -AllowFailure
        if ($script:LastExit -eq 0 -and ($script:LastOutput -join '').Trim() -eq $owner) {
            if (Test-Path -LiteralPath $composeFile) { Invoke-Logged docker ($remoteCompose + @('down')) -AllowFailure }
            Invoke-Logged docker ($hostArgs + @('logs', $daemon)) -AllowFailure
            Invoke-Logged docker ($hostArgs + @('rm', '-fv', $daemon))
        }
    }
    if ($createdNetwork) { Invoke-Logged docker ($hostArgs + @('network', 'rm', $network)) }
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name]) }
    Set-Location $originalLocation
}
"PASS sourceCommit=$($manifest.sourceCommit)" | Tee-Object -FilePath $Log -Append | Out-Host
