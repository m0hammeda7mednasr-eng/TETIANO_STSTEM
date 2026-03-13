# Test Backend Route Script

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Testing Backend Route" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if Backend is running
Write-Host "1. Testing Backend health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get -ErrorAction Stop
    Write-Host "   ✅ Backend is running: $($health.message)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Backend is NOT running!" -ForegroundColor Red
    Write-Host "   Please start Backend first: cd backend && npm start" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Test 2: Check operational-costs endpoint
Write-Host "2. Testing /api/operational-costs endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/operational-costs" -Method Get -ErrorAction Stop
    Write-Host "   ✅ Endpoint exists! Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Host "   ✅ Endpoint exists! (Got $statusCode - needs authentication)" -ForegroundColor Green
    } elseif ($statusCode -eq 404) {
        Write-Host "   ❌ Endpoint NOT FOUND (404)!" -ForegroundColor Red
        Write-Host "   The route is not loaded in Backend!" -ForegroundColor Red
        Write-Host "" 
        Write-Host "   SOLUTION:" -ForegroundColor Yellow
        Write-Host "   1. Stop Backend (Ctrl+C)" -ForegroundColor White
        Write-Host "   2. Check for errors in Terminal" -ForegroundColor White
        Write-Host "   3. Restart Backend: npm start" -ForegroundColor White
        Write-Host "   4. Look for: '✅ operationalCostsRoutes loaded: function'" -ForegroundColor White
    } else {
        Write-Host "   ⚠️  Got status code: $statusCode" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
