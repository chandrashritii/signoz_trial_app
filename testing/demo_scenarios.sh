#!/bin/bash

echo "🎭 SigNoz Demo Scenarios"
echo "======================="

BASE_URL="http://localhost:3000"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

demo_step() {
    echo -e "${BLUE}$1${NC}"
    echo "Press Enter to continue..."
    read
}

make_request() {
    local description=$1
    local method=$2
    local url=$3
    local data=$4
    local headers=$5
    
    echo -e "${YELLOW}$description${NC}"
    
    if [ -n "$headers" ]; then
        if [ "$method" = "GET" ]; then
            curl -s "$url" $headers | jq '.' || curl -s "$url" $headers
        else
            curl -s -X "$method" -H "Content-Type: application/json" $headers -d "$data" "$url" | jq '.' || curl -s -X "$method" -H "Content-Type: application/json" $headers -d "$data" "$url"
        fi
    else
        if [ "$method" = "GET" ]; then
            curl -s "$url" | jq '.' || curl -s "$url"
        else
            curl -s -X "$method" -H "Content-Type: application/json" -d "$data" "$url" | jq '.' || curl -s -X "$method" -H "Content-Type: application/json" -d "$data" "$url"
        fi
    fi
    echo ""
}

echo "This demo will show different scenarios that generate traces and logs in SigNoz."
echo "Make sure SigNoz is running at http://localhost:3301"
echo ""

# Scenario 1: Happy Path
demo_step "Scenario 1: Successful Order Flow (Happy Path)"
make_request "1.1 Create user session" "POST" "$BASE_URL/users/session" '{}' '-H "x-user-id: demo-user-happy" -H "x-user-plan: premium" -H "x-user-region: us-east"'

make_request "1.2 Browse products" "GET" "$BASE_URL/products" "" '-H "x-user-id: demo-user-happy" -H "x-user-plan: premium" -H "x-user-region: us-east"'

make_request "1.3 Place successful order" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "laptop-001", "quantity": 1, "price": 1299}],
    "shippingAddress": "123 Happy Street, Success City, SC 12345",
    "paymentMethod": "credit_card"
}' '-H "x-user-id: demo-user-happy" -H "x-user-plan: premium" -H "x-user-region: us-east"'

echo -e "${GREEN}✅ Check SigNoz: You should see a complete trace spanning all 3 services${NC}"
echo ""

# Scenario 2: Payment Failure
demo_step "Scenario 2: Payment Failure Flow"
make_request "2.1 Attempt order with potential payment failure" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "laptop-002", "quantity": 1, "price": 2500}],
    "shippingAddress": "456 Fail Street, Error City, EC 67890",
    "paymentMethod": "bank_transfer"
}' '-H "x-user-id: demo-user-payment-fail" -H "x-user-plan: free" -H "x-user-region: eu-central"'

echo -e "${RED}💡 Check SigNoz: Look for payment failure traces and error logs${NC}"
echo ""

# Scenario 3: Inventory Issues
demo_step "Scenario 3: Insufficient Inventory"
make_request "3.1 Order too many items" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "watch-001", "quantity": 1000, "price": 399}],
    "shippingAddress": "789 Inventory Street, Stock City, IC 11111",
    "paymentMethod": "credit_card"
}' '-H "x-user-id: demo-user-inventory" -H "x-user-plan: enterprise" -H "x-user-region: asia-pacific"'

echo -e "${RED}💡 Check SigNoz: Inventory validation should fail before payment${NC}"
echo ""

# Scenario 4: Different User Segments
demo_step "Scenario 4: Different User Segments and Regions"

# Free user from US
make_request "4.1 Free user order (US East)" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "headphones-001", "quantity": 1, "price": 249}],
    "shippingAddress": "Free User Address",
    "paymentMethod": "credit_card"
}' '-H "x-user-id: free-user-001" -H "x-user-plan: free" -H "x-user-region: us-east"'

# Premium user from Europe
make_request "4.2 Premium user order (EU Central)" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "tablet-001", "quantity": 1, "price": 799}],
    "shippingAddress": "Premium User Address",
    "paymentMethod": "paypal"
}' '-H "x-user-id: premium-user-001" -H "x-user-plan: premium" -H "x-user-region: eu-central"'

# Enterprise user from Asia
make_request "4.3 Enterprise user order (Asia Pacific)" "POST" "$BASE_URL/orders" '{
    "items": [{"productId": "phone-001", "quantity": 2, "price": 999}],
    "shippingAddress": "Enterprise User Address",
    "paymentMethod": "debit_card"
}' '-H "x-user-id: enterprise-user-001" -H "x-user-plan: enterprise" -H "x-user-region: asia-pacific"'

echo -e "${GREEN}💡 Check SigNoz: Filter metrics by user plan and region to see segment performance${NC}"
echo ""

# Scenario 5: High-Value Orders
demo_step "Scenario 5: High-Value Order Analysis"
make_request "5.1 Multiple expensive items" "POST" "$BASE_URL/orders" '{
    "items": [
        {"productId": "laptop-001", "quantity": 2, "price": 1299},
        {"productId": "tablet-001", "quantity": 1, "price": 799}
    ],
    "shippingAddress": "High Value Customer Address",
    "paymentMethod": "credit_card"
}' '-H "x-user-id: high-value-customer" -H "x-user-plan: enterprise" -H "x-user-region: us-west"'

echo -e "${GREEN}💡 Check SigNoz: Look for traces with high order amounts and multiple items${NC}"
echo ""

# Scenario 6: Service Health Check
demo_step "Scenario 6: Service Health and Monitoring"
echo "Checking service health across all services..."

make_request "6.1 Order Service Health" "GET" "$BASE_URL/health"
make_request "6.2 Payment Service Health" "GET" "http://localhost:3001/health"  
make_request "6.3 Inventory Service Health" "GET" "http://localhost:3002/health"
make_request "6.4 Inventory Alerts" "GET" "http://localhost:3002/inventory/alerts?threshold=20"

echo -e "${GREEN}💡 Check SigNoz: Service map should show all services as healthy${NC}"
echo ""

echo "🎉 Demo Complete!"
echo ""
echo "📊 SigNoz Features to Explore:"
echo "  1. Service Map - Visual representation of service dependencies"
echo "  2. Traces - Click on any trace to see the full request flow"
echo "  3. Related Logs - From any trace, click 'Go to Related Logs'"
echo "  4. Metrics - Custom business metrics (orders, payments, inventory)"
echo "  5. Dashboards - Create custom dashboards filtering by user segments"
echo "  6. Alerts - Set up alerts on error rates, latency, or business metrics"
echo ""
echo "🔗 SigNoz UI: http://localhost:3301"
