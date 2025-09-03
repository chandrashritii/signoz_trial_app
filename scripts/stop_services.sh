#!/bin/bash

echo "🛑 Stopping SigNoz E-commerce Demo Services"

# Kill Node.js services
if [ -f .order.pid ]; then
    kill $(cat .order.pid) 2>/dev/null
    rm .order.pid
    echo "✅ Order service stopped"
fi

if [ -f .payment.pid ]; then
    kill $(cat .payment.pid) 2>/dev/null
    rm .payment.pid
    echo "✅ Payment service stopped"
fi

if [ -f .inventory.pid ]; then
    kill $(cat .inventory.pid) 2>/dev/null
    rm .inventory.pid
    echo "✅ Inventory service stopped"
fi

# Stop Docker containers
echo "📊 Stopping SigNoz infrastructure..."
docker-compose down

echo "✅ All services stopped!"