$loginBody = '{"email":"admin@infrapilot.com","password":"password"}'
$res = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/auth/login' -Method Post -Body $loginBody -ContentType 'application/json'
$token = $res.token

$headers = @{ Authorization = "Bearer $token" }

Write-Host "Calling DELETE on machine 29ddc34c-cee3-4109-9c5d-5c2aeaaa72df..."
$delRes = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/servers/29ddc34c-cee3-4109-9c5d-5c2aeaaa72df' -Method Delete -Headers $headers
Write-Host "API Response: $($delRes | ConvertTo-Json)"
