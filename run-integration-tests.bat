@echo off
REM Integration Test Setup Script for Windows
REM Uses existing infrastructure (PostgreSQL, Redis, Keycloak)
REM Only starts local development servers (API, Web)

setlocal enabledelayedexpansion

echo.
echo ═════════════════════════════════════════════════════════════════
echo   Slice 1 Integration Test Setup (Windows)
echo   (Using Existing Infrastructure)
echo ═════════════════════════════════════════════════════════════════
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 20+
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✓ Node.js version: %NODE_VERSION%
echo.

echo ═════════════════════════════════════════════════════════════════
echo   Step 1: Verifying Existing Infrastructure
echo ═════════════════════════════════════════════════════════════════
echo.

echo Checking PostgreSQL (localhost:5434)...
REM Can't easily check PostgreSQL on Windows without psql, so just note the requirement
echo   ℹ PostgreSQL should be running at localhost:5434
echo   ℹ Database: house_financial
echo   ℹ User: hf_admin
echo.

echo Checking Redis (localhost:6379)...
echo   ℹ Redis should be running at localhost:6379
echo.

echo Checking Keycloak (https://keycloak.keystone.internal:7443)...
echo   ℹ Keycloak should be running (used in Slice 2)
echo.

echo ═════════════════════════════════════════════════════════════════
echo   Step 2: Installing Dependencies
echo ═════════════════════════════════════════════════════════════════
echo.

if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install --silent
    if errorlevel 1 echo Warning: Some dependencies may have failed
)

if not exist "apps\api\node_modules" (
    echo Installing API dependencies...
    cd apps\api
    call npm install --silent
    if errorlevel 1 echo Warning: Some dependencies may have failed
    cd ..\..
)

if not exist "apps\web\node_modules" (
    echo Installing Web dependencies...
    cd apps\web
    call npm install --silent
    if errorlevel 1 echo Warning: Some dependencies may have failed
    cd ..\..
)

echo ✓ Dependencies installed
echo.

echo ═════════════════════════════════════════════════════════════════
echo   Step 3: Starting Local Development Servers
echo ═════════════════════════════════════════════════════════════════
echo.

echo Starting API server on port 3000...
start cmd /k "cd apps\api && npm run dev"
timeout /t 3 /nobreak

echo Starting Web dev server on port 5173...
start cmd /k "cd apps\web && npm run dev"
timeout /t 5 /nobreak

echo ✓ Services started in separate windows
echo.
echo   API:  http://localhost:3000
echo   Web:  http://localhost:5173
echo.

echo ═════════════════════════════════════════════════════════════════
echo   Step 4: Running Integration Tests
echo ═════════════════════════════════════════════════════════════════
echo.

cd apps\web

set TEST_CMD=npm test -- --project=chromium e2e/integration.spec.ts

echo Running: !TEST_CMD!
echo.

call !TEST_CMD!
set TEST_RESULT=%errorlevel%

cd ..\..

echo.
echo ═════════════════════════════════════════════════════════════════
echo   Summary
echo ═════════════════════════════════════════════════════════════════
echo.

if %TEST_RESULT% equ 0 (
    echo ✅ All integration tests passed!
    echo.
    echo Next steps:
    echo   - Existing infrastructure is still running
    echo   - Close the API and Web windows when done
) else (
    echo ❌ Some tests failed
    echo.
    echo Troubleshooting:
    echo   - Check that PostgreSQL is running at localhost:5434
    echo   - Check that API is running on http://localhost:3000/health
    echo   - Check that Web is running on http://localhost:5173
    echo   - Check existing infrastructure is accessible
)

echo.
pause

