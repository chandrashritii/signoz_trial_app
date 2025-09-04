# ====================
# scripts/test-api.sh - API Testing Script
# ====================
#!/bin/bash

echo "🧪 Testing SigNoz E-commerce Demo API"
echo "======================================"

BASE_URL_ORDER="http://localhost:3000"
BASE_URL_PAYMENT="http://localhost:3001"
BASE_URL_INVENTORY="http://localhost:3002"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local method=$1
    local url=$2
    local data=$3
    local expected_code=$4
    local description=$5
    
    echo -e "${YELLOW}Testing: $description${NC}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$url")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS.*//g')
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✅ PASS${NC} - HTTP $http_code"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ FAIL${NC} - Expected HTTP $expected_code, got $http_code"
        echo "$body"
    fi
    echo ""
}

# Test 1: Health checks
echo "1. Testing Health Endpoints"
echo "-------------------------"
test_endpoint "GET" "$BASE_URL_ORDER/health" "" "200" "Order Service Health"
test_endpoint "GET" "$BASE_URL_PAYMENT/health" "" "200" "Payment Service Health"
test_endpoint "GET" "$BASE_URL_INVENTORY/health" "" "200" "Inventory Service Health"

# Test 2: Get products
echo "2. Testing Product Catalog"
echo "------------------------"
test_endpoint "GET" "$BASE_URL_ORDER/products" "" "200" "Get Products"

# Test 3: Create user session
echo "3. Testing User Session"
echo "---------------------"
SESSION_DATA='{"userId": "test-user-123"}'
test_endpoint "POST" "$BASE_URL_ORDER/users/session" "$SESSION_DATA" "200" "Create User Session"

# Test 4: Inventory validation
echo "4. Testing Inventory Validation"
echo "-----------------------------"
INVENTORY_DATA='{"items": [{"productId": "laptop-001", "quantity": 1}]}'
test_endpoint "POST" "$BASE_URL_INVENTORY/inventory/validate" "$INVENTORY_DATA" "200" "Validate Inventory"

# Test 5: Successful order
echo "5. Testing Successful Order"
echo "--------------------------"
ORDER_DATA='{
  "items": [
    {"productId": "laptop-001", "quantity": 1, "price": 1299}
  ],
  "shippingAddress": "123 Test Street, Test City, TS 12345",
  "paymentMethod": "credit_card"
}'

# Add custom headers for better tracing
test_endpoint_with_headers() {
    local method=$1
    local url=$2
    local data=$3
    local expected_code=$4
    local description=$5
    
    echo -e "${YELLOW}Testing: $description${NC}"
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -X "$method" \
        -H "Content-Type: application/json" \
        -H "x-user-id: test-user-456" \
        -H "x-user-plan: premium" \
        -H "x-user-region: us-east" \
        -H "x-request-id: test-$(date +%s)" \
        -d "$data" \
        "$url")
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS.*//g')
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✅ PASS${NC} - HTTP $http_code"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ FAIL${NC} - Expected HTTP $expected_code, got $http_code"
        echo "$body"
    fi
    echo ""
}

test_endpoint_with_headers "POST" "$BASE_URL_ORDER/orders" "$ORDER_DATA" "201" "Place Order"

# Test 6: Order with insufficient inventory
echo "6. Testing Order with Insufficient Inventory"
echo "------------------------------------------"
LARGE_ORDER_DATA='{
  "items": [
    {"productId": "laptop-001", "quantity": 999, "price": 1299}
  ],
  "shippingAddress": "123 Test Street, Test City, TS 12345",
  "paymentMethod": "credit_card"
}'
test_endpoint_with_headers "POST" "$BASE_URL_ORDER/orders" "$LARGE_ORDER_DATA" "400" "Order with Insufficient Inventory"

# Test 7: Multiple items order
echo "7. Testing Multi-Item Order"
echo "--------------------------"
MULTI_ITEM_ORDER='{
  "items": [
    {"productId": "phone-001", "quantity": 1, "price": 999},
    {"productId": "headphones-001", "quantity": 2, "price": 249}
  ],
  "shippingAddress": "456 Demo Avenue, Demo City, DC 67890",
  "paymentMethod": "paypal"
}'
test_endpoint_with_headers "POST" "$BASE_URL_ORDER/orders" "$MULTI_ITEM_ORDER" "201" "Multi-Item Order"

# Test 8: Get inventory alerts
echo "8. Testing Inventory Alerts"
echo "--------------------------"
test_endpoint "GET" "$BASE_URL_INVENTORY/inventory/alerts?threshold=10" "" "200" "Low Stock Alerts"

echo "🎉 Testing Complete!"
echo ""
echo "📊 Check SigNoz UI at: http://localhost:3301"
echo "🔍 Look for traces, logs, and metrics from the test runs"
