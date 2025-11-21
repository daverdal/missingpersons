# PowerShell script to help reset Neo4j password by finding and backing up the auth file
# This will help you locate the Neo4j database folder

Write-Host "=== Neo4j Auth File Finder ===" -ForegroundColor Cyan
Write-Host ""

# Common Neo4j Desktop locations
$possiblePaths = @(
    "$env:USERPROFILE\.Neo4jDesktop\relate-data\databases",
    "$env:LOCALAPPDATA\Neo4j Desktop\relate-data\databases",
    "$env:APPDATA\Neo4j Desktop\relate-data\databases"
)

Write-Host "Searching for Neo4j database folders..." -ForegroundColor Yellow
Write-Host ""

$found = $false

foreach ($basePath in $possiblePaths) {
    if (Test-Path $basePath) {
        Write-Host "Found Neo4j data folder: $basePath" -ForegroundColor Green
        $found = $true
        
        # List all databases
        $databases = Get-ChildItem -Path $basePath -Directory -ErrorAction SilentlyContinue
        if ($databases) {
            Write-Host "`nFound databases:" -ForegroundColor Cyan
            $i = 1
            foreach ($db in $databases) {
                Write-Host "  $i. $($db.Name)" -ForegroundColor White
                $i++
            }
            
            Write-Host "`nTo reset password for a database:" -ForegroundColor Yellow
            Write-Host "1. STOP the database in Neo4j Desktop" -ForegroundColor White
            Write-Host "2. Navigate to the database folder above" -ForegroundColor White
            Write-Host "3. Go to: data\dbms\" -ForegroundColor White
            Write-Host "4. Delete or rename the 'auth' file/folder" -ForegroundColor White
            Write-Host "5. START the database" -ForegroundColor White
            Write-Host "6. Default password will be 'neo4j'" -ForegroundColor White
            Write-Host ""
            
            # Try to find auth files
            foreach ($db in $databases) {
                $authPath = Join-Path $db.FullName "data\dbms\auth"
                if (Test-Path $authPath) {
                    Write-Host "  Auth file found in: $($db.Name)" -ForegroundColor Green
                    Write-Host "    Path: $authPath" -ForegroundColor Gray
                }
            }
        }
    }
}

if (-not $found) {
    Write-Host "Could not find Neo4j database folders in common locations." -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual steps:" -ForegroundColor Yellow
    Write-Host "1. Open Neo4j Desktop" -ForegroundColor White
    Write-Host "2. Right-click on your database" -ForegroundColor White
    Write-Host "3. Click 'Open Folder' or 'Open Terminal'" -ForegroundColor White
    Write-Host "4. Navigate to: data\dbms\" -ForegroundColor White
    Write-Host "5. Delete or rename the 'auth' file/folder" -ForegroundColor White
    Write-Host "6. Restart the database" -ForegroundColor White
    Write-Host "7. Default password will be 'neo4j'" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

