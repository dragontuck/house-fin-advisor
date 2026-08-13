#!/bin/bash

# Integration Test Setup Script
# Uses existing infrastructure (PostgreSQL, Redis, Keycloak)
# Only starts local development servers (API, Web)

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Slice 1 Integration Test Setup"
echo "  (Using Existing Infrastructure)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+"
    exit 1
fi

echo "✓ Node.js version: $(node -v)"
echo ""

# Parse arguments
HEADLESS="${1:-true}"
BROWSER="${2:-chromium}"
TEST_PATTERN="${3:-}"

if [ "$HEADLESS" = "--headed" ]; then
    HEADLESS="false"
fi

echo "Configuration:"
echo "  Headless mode: $HEADLESS"
echo "  Browser: $BROWSER"
if [ -n "$TEST_PATTERN" ]; then
    echo "  Test pattern: $TEST_PATTERN"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Verifying Existing Infrastructure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check PostgreSQL
echo "  Checking PostgreSQL (localhost:5434)..."
if command -v psql &> /dev/null; then
    if psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1" > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL is accessible"
    else
        echo "  ❌ Cannot connect to PostgreSQL at localhost:5434"
        echo "     User: hf_admin"
        echo "     Database: house_financial"
        exit 1
    fi
else
    echo "  ⚠ psql not found, skipping PostgreSQL check"
    echo "    (psql is optional - PostgreSQL should still be running)"
fi

# Check Redis
echo "  Checking Redis (localhost:6379)..."
if command -v redis-cli &> /dev/null; then
    if redis-cli -p 6379 ping > /dev/null 2>&1; then
        echo "  ✓ Redis is accessible"
    else
        echo "  ⚠ Cannot connect to Redis at localhost:6379"
        echo "    (Redis check is optional - it may still be running)"
    fi
else
    echo "  ⚠ redis-cli not found, skipping Redis check"
fi

# Check Keycloak
echo "  Checking Keycloak (https://keycloak.keystone.internal:7443)..."
if command -v curl &> /dev/null; then
    if curl -s -k https://keycloak.keystone.internal:7443/health/ready > /dev/null 2>&1; then
        echo "  ✓ Keycloak is accessible"
    else
        echo "  ⚠ Cannot connect to Keycloak at keycloak.keystone.internal:7443"
        echo "    (Keycloak is used in Slice 2 - optional for Slice 1)"
    fi
else
    echo "  ⚠ curl not found, skipping Keycloak check"
fi

echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Installing Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -d "node_modules" ]; then
    echo "  Installing root dependencies..."
    npm install --silent
fi

if [ ! -d "apps/api/node_modules" ]; then
    echo "  Installing API dependencies..."
    cd apps/api && npm install --silent && cd ../..
fi

if [ ! -d "apps/web/node_modules" ]; then
    echo "  Installing Web dependencies..."
    cd apps/web && npm install --silent && cd ../..
fi

echo "✓ Dependencies installed"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: Starting Local Development Servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start API server in background
echo "  Starting API server on port 3000..."
cd apps/api
npm run dev > ../../.api.log 2>&1 &
API_PID=$!
cd ../..

# Wait for API to be ready
echo "  Waiting for API to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "  ✓ API is ready on http://localhost:3000"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "  ❌ API failed to start"
        tail -20 .api.log
        kill $API_PID || true
        exit 1
    fi
    sleep 1
done

# Start web dev server in background
echo "  Starting Web dev server on port 5173..."
cd apps/web
npm run dev > ../../.web.log 2>&1 &
WEB_PID=$!
cd ../..

# Wait for web server to be ready
echo "  Waiting for Web dev server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:5173/ > /dev/null 2>&1; then
        echo "  ✓ Web dev server is ready on http://localhost:5173"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "  ❌ Web dev server failed to start"
        tail -20 .web.log
        kill $API_PID $WEB_PID || true
        exit 1
    fi
    sleep 1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 4: Running Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd apps/web

# Build test command
TEST_CMD="npm test"
TEST_CMD="$TEST_CMD -- --project=$BROWSER"

if [ "$HEADLESS" = "false" ]; then
    TEST_CMD="$TEST_CMD --headed"
fi

if [ -n "$TEST_PATTERN" ]; then
    TEST_CMD="$TEST_CMD -g \"$TEST_PATTERN\""
fi

TEST_CMD="$TEST_CMD e2e/integration.spec.ts"

echo "Running: $TEST_CMD"
echo ""

# Run tests
eval $TEST_CMD
TEST_RESULT=$?

cd ../..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Kill background processes
kill $API_PID $WEB_PID 2>/dev/null || true

echo "✓ API and Web servers stopped"
echo "✓ Existing infrastructure still running"
echo ""

if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ All integration tests passed!"
    exit 0
else
    echo "❌ Some tests failed"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check that PostgreSQL is running at localhost:5434"
    echo "  - Verify database exists: house_financial"
    echo "  - Check API logs: tail -50 .api.log"
    echo "  - Check Web logs: tail -50 .web.log"
    exit 1
fi

