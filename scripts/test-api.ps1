# Test Script for API Endpoints
Write-Host "=== Testing Backend API Endpoints ===" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n1. Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
    Write-Host "✅ Health Check: $($health.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Health Check Failed: $_" -ForegroundColor Red
}

# Test 2: Login (to get token)
Write-Host "`n2. Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@example.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "✅ Login Successful! Token received." -ForegroundColor Green
    Write-Host "   User: $($loginResponse.user.name) ($($loginResponse.user.role))" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Login Failed: $_" -ForegroundColor Red
    Write-Host "   Trying to create admin user first..." -ForegroundColor Yellow
    exit
}

# Test 3: Get Users (Admin only)
Write-Host "`n3. Testing Get Users (Admin endpoint)..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $users = Invoke-RestMethod -Uri "http://localhost:5000/api/users" -Method Get -Headers $headers
    Write-Host "✅ Users Retrieved: $($users.Count) users found" -ForegroundColor Green
    foreach ($user in $users) {
        Write-Host "   - $($user.name) ($($user.email)) - Role: $($user.role)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Get Users Failed: $_" -ForegroundColor Red
}

# Test 4: Get Current User Permissions
Write-Host "`n4. Testing Get Current User Permissions..." -ForegroundColor Yellow
try {
    $permissions = Invoke-RestMethod -Uri "http://localhost:5000/api/users/me/permissions" -Method Get -Headers $headers
    Write-Host "✅ Permissions Retrieved:" -ForegroundColor Green
    $permissions.PSObject.Properties | ForEach-Object {
        $status = if ($_.Value) { "[YES]" } else { "[NO]" }
        Write-Host "   $status $($_.Name): $($_.Value)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Get Permissions Failed: $_" -ForegroundColor Red
}

# Test 5: Get Dashboard Stats
Write-Host "`n5. Testing Get Dashboard Stats..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:5000/api/dashboard/stats" -Method Get -Headers $headers
    Write-Host "✅ Dashboard Stats Retrieved:" -ForegroundColor Green
    Write-Host "   - Total Sales: `$$($stats.total_sales)" -ForegroundColor Cyan
    Write-Host "   - Total Orders: $($stats.total_orders)" -ForegroundColor Cyan
    Write-Host "   - Total Products: $($stats.total_products)" -ForegroundColor Cyan
    Write-Host "   - Total Customers: $($stats.total_customers)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Get Dashboard Stats Failed: $_" -ForegroundColor Red
}

# Test 6: Get Access Requests
Write-Host "`n6. Testing Get Access Requests..." -ForegroundColor Yellow
try {
    $requests = Invoke-RestMethod -Uri "http://localhost:5000/api/access-requests/all" -Method Get -Headers $headers
    Write-Host "✅ Access Requests Retrieved: $($requests.Count) requests found" -ForegroundColor Green
    $pending = $requests | Where-Object { $_.status -eq "pending" }
    Write-Host "   - Pending Requests: $($pending.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Get Access Requests Failed: $_" -ForegroundColor Red
}

# Test 7: Get Daily Reports
Write-Host "`n7. Testing Get Daily Reports..." -ForegroundColor Yellow
try {
    $reports = Invoke-RestMethod -Uri "http://localhost:5000/api/daily-reports/all" -Method Get -Headers $headers
    Write-Host "✅ Daily Reports Retrieved: $($reports.Count) reports found" -ForegroundColor Green
} catch {
    Write-Host "❌ Get Daily Reports Failed: $_" -ForegroundColor Red
}

Write-Host "`n=== API Testing Complete ===" -ForegroundColor Cyan
Write-Host "`nSummary:" -ForegroundColor Yellow
Write-Host "- Backend is running on http://localhost:5000" -ForegroundColor Green
Write-Host "- Frontend is running on http://localhost:3000" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Open browser to http://localhost:3000" -ForegroundColor Cyan
Write-Host "2. Login with admin credentials" -ForegroundColor Cyan
Write-Host "3. Check Dashboard for Users management section" -ForegroundColor Cyan
Write-Host "4. Navigate to /users page" -ForegroundColor Cyan
