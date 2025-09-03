#!/bin/bash

echo "🚀 Starting SigNoz E-commerce Demo Services"

# Create logs directory
mkdir -p logs

# Start SigNoz infrastructure
echo "📊 Starting SigNoz infrastructure..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for SigNoz to be ready..."
sleep 30

# Check if SigNoz is ready
echo "🔍 Checking SigNoz health..."
curl -f http://localhost:8080/api/v1/version || {
    echo "❌ SigNoz not ready. Please check docker logs."
    exit 1
}

echo "✅ SigNoz is ready!"
echo "🌐 SigNoz UI: http://localhost:8080"

# Start Node.js services
echo "🚀 Starting Node.js services..."

# Start services in background
npm run start &
ORDER_PID=$!

sleep 5

npm run start:payment &
PAYMENT_PID=$!

sleep 5

npm run start:inventory &
INVENTORY_PID=$!

echo "✅ All services started!"
echo ""
echo "📋 Service URLs:"
echo "  - Order Service: http://localhost:3000"
echo "  - Payment Service: http://localhost:3001"
echo "  - Inventory Service: http://localhost:3002"
echo "  - SigNoz UI: http://localhost:8080"
echo ""
echo "💡 To stop services, run: ./scripts/stop-services.sh"

# Store PIDs for cleanup
echo $ORDER_PID > .order.pid
echo $PAYMENT_PID > .payment.pid
echo $INVENTORY_PID > .inventory.pid

# Keep script running
wait