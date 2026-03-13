# Complete Test Script for Shopify Store Management System
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Shopify Store Management System Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Configuration
$backendUrl = "http://localhost:5000"
$frontendUrl = "http://localhost:3000"

# Test 1: Check if Backend is running
Write-Host "`n[1/8] Checking Backend Server..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$backendUrl/api/health" -Method Get -UseBasicParsing
    Write-Host "SUCCESS: Backend is running - $($health.message)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Backend is not running!" -ForegroundColor Red
    Write-Host "Please start backend with: cd backend && npm run dev" -ForegroundColor Yellow
    exit 1
}

# Test 2: Check if Frontend is running
Write-Host "`n[2/8] Checking Frontend Server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $frontendUrl -Method Get -UseBasicParsing -TimeoutSec 5
    Write-Host "SUCCESS: Frontend is running (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Frontend might not be running" -ForegroundColor Yellow
    Write-Host "Please start frontend with: cd frontend && npm start" -ForegroundColor Yellow
}

# Test 3: Try to register a new admin user
Write-Host "`n[3/8] Testing User Registration..." -ForegroundColor Yellow
$registerBody = @{
    email = "testadmin@example.com"
    password = "admin123456"
    name = "Test Admin"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$backendUrl/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -UseBasicParsing
    Write-Host "SUCCESS: User registered successfully" -ForegroundColor Green
    Write-Host "  Email: testadmin@example.com" -ForegroundColor Cyan
    Write-Host "  Password: admin123456" -ForegroundColor Cyan
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "INFO: User already exists (this is OK)" -ForegroundColor Cyan
    } else {
        Write-Host "WARNING: Registration failed - $_" -ForegroundColor Yellow
    }
}

# Test 4: Try to login
Write-Host "`n[4/8] Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "testadmin@example.com"
    password = "admin123456"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$backendUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -UseBasicParsing
    $token = $loginResponse.token
    $userId = $loginResponse.user.id
    $userRole = $loginResponse.user.role
    Write-Host "SUCCESS: Login successful!" -ForegroundColor Green
    Write-Host "  User: $($loginResponse.user.name)" -ForegroundColor Cyan
    Write-Host "  Email: $($loginResponse.user.email)" -ForegroundColor Cyan
    Write-Host "  Role: $userRole" -ForegroundColor Cyan
    Write-Host "  Token: $($token.Substring(0, 20))..." -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Login failed - $_" -ForegroundColor Red
    exit 1
}

# Test 5: Check user role and upgrade to admin if needed
Write-Host "`n[5/8] Checking User Role..." -ForegroundColor Yellow
if ($userRole -ne "admin") {
    Write-Host "INFO: User is not admin. Role: $userRole" -ForegroundColor Yellow
    Write-Host "NOTE: To test admin features, you need to:" -ForegroundColor Yellow
    Write-Host "  1. Go to Supabase Dashboard" -ForegroundColor Cyan
    Write-Host "  2. Open SQL Editor" -ForegroundColor Cyan
    Write-Host "  3. Run: UPDATE users SET role = 'admin' WHERE email = 'testadmin@example.com';" -ForegroundColor Cyan
} else {
    Write-Host "SUCCESS: User is admin!" -ForegroundColor Green
}

# Test 6: Test API endpoints with token
Write-Host "`n[6/8] Testing API Endpoints..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

# Test Dashboard Stats
try {
    $stats = Invoke-RestMethod -Uri "$backendUrl/api/dashboard/stats" -Method Get -Headers $headers -UseBasicParsing
    Write-Host "SUCCESS: Dashboard Stats API working" -ForegroundColor Green
    Write-Host "  Total Sales: `$$($stats.total_sales)" -ForegroundColor Cyan
    Write-Host "  Total Orders: $($stats.total_orders)" -ForegroundColor Cyan
    Write-Host "  Total Products: $($stats.total_products)" -ForegroundColor Cyan
    Write-Host "  Total Customers: $($stats.total_customers)" -ForegroundColor Cyan
} catch {
    Write-Host "WARNING: Dashboard Stats API failed - $_" -ForegroundColor Yellow
}

# Test Users API (Admin only)
if ($userRole -eq "admin") {
    Write-Host "`n[7/8] Testing Users API (Admin)..." -ForegroundColor Yellow
    try {
        $users = Invoke-RestMethod -Uri "$backendUrl/api/users" -Method Get -Headers $headers -UseBasicParsing
        Write-Host "SUCCESS: Users API working" -ForegroundColor Green
        Write-Host "  Total Users: $($users.Count)" -ForegroundColor Cyan
        foreach ($user in $users) {
            Write-Host "  - $($user.name) ($($user.email)) - Role: $($user.role)" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "ERROR: Users API failed - $_" -ForegroundColor Red
    }
} else {
    Write-Host "`n[7/8] Skipping Users API test (requires admin role)" -ForegroundColor Yellow
}

# Test Permissions API
Write-Host "`n[8/8] Testing Permissions API..." -ForegroundColor Yellow
try {
    $permissions = Invoke-RestMethod -Uri "$backendUrl/api/users/me/permissions" -Method Get -Headers $headers -UseBasicParsing
    Write-Host "SUCCESS: Permissions API working" -ForegroundColor Green
    Write-Host "  Permissions:" -ForegroundColor Cyan
    $permissions.PSObject.Properties | ForEach-Object {
        $status = if ($_.Value) { "[YES]" } else { "[NO]" }
        Write-Host "    $status $($_.Name)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "WARNING: Permissions API failed - $_" -ForegroundColor Yellow
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nBackend: http://localhost:5000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "`nTest Credentials:" -ForegroundColor Yellow
Write-Host "  Email: testadmin@example.com" -ForegroundColor Cyan
Write-Host "  Password: admin123456" -ForegroundColor Cyan
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Open browser to: $frontendUrl" -ForegroundColor Cyan
Write-Host "2. Login with the credentials above" -ForegroundColor Cyan
Write-Host "3. Check Dashboard for admin features" -ForegroundColor Cyan
Write-Host "4. Navigate to /users page to manage users" -ForegroundColor Cyan
Write-Host "`nAdmin Features to Check:" -ForegroundColor Yellow
Write-Host "- Dashboard should show 'Admin Quick Actions' cards" -ForegroundColor Cyan
Write-Host "- Dashboard should show 'Pending Requests' and 'Recent Reports'" -ForegroundColor Cyan
Write-Host "- Sidebar should show 'Users' menu item" -ForegroundColor Cyan
Write-Host "- /users page should allow adding/editing users" -ForegroundColor Cyan
Write-Host "`n========================================" -ForegroundColor Cyan
