#!/bin/bash

echo "🚀 Generating Load for SigNoz Demo"
echo "================================="

# Function to generate realistic user data
generate_user_data() {
    local user_plans=("free" "premium" "enterprise")
    local regions=("us-east" "us-west" "eu-central" "asia-pacific")
    local payment_methods=("credit_card" "debit_card" "paypal" "bank_transfer")
    local products=("laptop-001" "laptop-002" "phone-001" "phone-002" "tablet-001" "watch-001" "headphones-001" "headphones-002")
    
    echo "user-$(date +%s)-$RANDOM"
    echo "${user_plans[$RANDOM % ${#user_plans[@]}]}"
    echo "${regions[$RANDOM % ${#regions[@]}]}"
    echo "${payment_methods[$RANDOM % ${#payment_methods[@]}]}"
    echo "${products[$RANDOM % ${#products[@]}]}"
}

# Function to place order
place_order() {
    local user_id=$1
    local plan=$2
    local region=$3
    local payment_method=$4
    local product=$5
    local quantity=$((RANDOM % 3 + 1))
    local price=$((RANDOM % 1000 + 100))
    
    curl -s -X POST "http://localhost:3000/orders" \
        -H "Content-Type: application/json" \
        -H "x-user-id: $user_id" \
        -H "x-user-plan: $plan" \
        -H "x-user-region: $region" \
        -H "x-request-id: load-test-$(date +%s)-$RANDOM" \
        -d "{
            \"items\": [
                {\"productId\": \"$product\", \"quantity\": $quantity, \"price\": $price}
            ],
            \"shippingAddress\": \"123 Load Test Street, Test City, TC 12345\",
            \"paymentMethod\": \"$payment_method\"
        }" > /dev/null 2>&1
}

# Function to create user session
create_session() {
    local user_id=$1
    local plan=$2
    local region=$3
    
    curl -s -X POST "http://localhost:3000/users/session" \
        -H "Content-Type: application/json" \
        -H "x-user-id: $user_id" \
        -H "x-user-plan: $plan" \
        -H "x-user-region: $region" \
        -d "{}" > /dev/null 2>&1
}

# Function to fetch products
fetch_products() {
    local user_id=$1
    local plan=$2
    local region=$3
    
    curl -s "http://localhost:3000/products" \
        -H "x-user-id: $user_id" \
        -H "x-user-plan: $plan" \
        -H "x-user-region: $region" > /dev/null 2>&1
}

echo "Starting load generation..."
echo "Press Ctrl+C to stop"

# Initialize counters
total_requests=0
successful_orders=0
failed_orders=0
start_time=$(date +%s)

# Main load generation loop
while true; do
    # Generate user data
    user_data=($(generate_user_data))
    user_id=${user_data[0]}
    plan=${user_data[1]}
    region=${user_data[2]}
    payment_method=${user_data[3]}
    product=${user_data[4]}
    
    # Simulate user journey
    create_session "$user_id" "$plan" "$region"
    sleep 0.1
    
    fetch_products "$user_id" "$plan" "$region"
    sleep 0.2
    
    # Place order (simulate some users not completing purchase)
    if [ $((RANDOM % 4)) -ne 0 ]; then  # 75% conversion rate
        if place_order "$user_id" "$plan" "$region" "$payment_method" "$product"; then
            ((successful_orders++))
        else
            ((failed_orders++))
        fi
    fi
    
    ((total_requests++))
    
    # Print stats every 10 requests
    if [ $((total_requests % 10)) -eq 0 ]; then
        current_time=$(date +%s)
        duration=$((current_time - start_time))
        rate=$(echo "scale=2; $total_requests / $duration" | bc -l 2>/dev/null || echo "N/A")
        
        echo "📊 Stats: $total_requests total requests, $successful_orders successful orders, $failed_orders failed orders, Rate: ${rate}/sec"
    fi
    
    # Random delay between requests (0.5-2 seconds)
    sleep_time=$(echo "scale=2; 0.5 + ($RANDOM % 150) / 100" | bc -l 2>/dev/null || echo "1")
    sleep "$sleep_time"
done