# Test Analytics Endpoint
Write-Host "🔍 Testing Analytics Endpoint..." -ForegroundColor Cyan

# Login as admin
$loginBody = @{
    email = "testadmin@example.com"
    password = "123456"
} | ConvertTo-Json

try {
    Write-Host "📝 Logging in as admin..." -ForegroundColor Yellow
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $token = $loginData.token
    
    Write-Host "✅ Login successful! Token: $($token.Substring(0,20))..." -ForegroundColor Green
    
    # Test analytics endpoint
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "📊 Testing analytics endpoint..." -ForegroundColor Yellow
    $analyticsResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/dashboard/analytics" -Method GET -Headers $headers -UseBasicParsing
    $analyticsData = $analyticsResponse.Content | ConvertFrom-Json
    
    Write-Host "✅ Analytics endpoint working!" -ForegroundColor Green
    Write-Host "📈 Total Orders: $($analyticsData.summary.totalOrders)" -ForegroundColor Cyan
    Write-Host "💰 Total Revenue: $($analyticsData.financial.totalRevenue)" -ForegroundColor Cyan
    Write-Host "📊 Success Rate: $($analyticsData.summary.successRate)%" -ForegroundColor Cyan
    
    # Test dashboard stats endpoint
    Write-Host "📊 Testing dashboard stats..." -ForegroundColor Yellow
    $statsResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/dashboard/stats" -Method GET -Headers $headers -UseBasicParsing
    $statsData = $statsResponse.Content | ConvertFrom-Json
    
    Write-Host "✅ Dashboard stats working!" -ForegroundColor Green
    Write-Host "🛍️ Total Products: $($statsData.total_products)" -ForegroundColor Cyan
    Write-Host "📦 Total Orders: $($statsData.total_orders)" -ForegroundColor Cyan
    Write-Host "Total Sales: $($statsData.total_sales)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorContent = $reader.ReadToEnd()
        Write-Host "Error Details: $errorContent" -ForegroundColor Red
    }
}

Write-Host "Test completed!" -ForegroundColor Green