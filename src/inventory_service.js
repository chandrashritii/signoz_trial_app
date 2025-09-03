const express = require('express');
const { trace } = require('@opentelemetry/api');
const logger = require('./logger');
const { inventoryGauge, errorCounter } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Mock inventory data
const inventory = new Map([
  ['laptop-001', { id: 'laptop-001', name: 'MacBook Pro', price: 1299, stock: 10, reserved: 0 }],
  ['phone-001', { id: 'phone-001', name: 'iPhone 14', price: 999, stock: 25, reserved: 0 }],
  ['tablet-001', { id: 'tablet-001', name: 'iPad Air', price: 599, stock: 15, reserved: 0 }],
  ['watch-001', { id: 'watch-001', name: 'Apple Watch', price: 399, stock: 30, reserved: 0 }],
  ['headphones-001', { id: 'headphones-001', name: 'AirPods Pro', price: 249, stock: 50, reserved: 0 }]
]);

// Update inventory metrics on startup
inventory.forEach((item, id) => {
  inventoryGauge.add(item.stock, { product_id: id, product_category: id.split('-')[0] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'inventory_service' });
});

// Get inventory
app.get('/inventory', (req, res) => {
  const products = Array.from(inventory.values()).map(item => ({
    ...item,
    available: item.stock - item.reserved
  }));
  
  logger.info('Inventory retrieved', { productCount: products.length });
  res.json({ products, total: products.length });
});

// Validate inventory for order
app.post('/inventory/validate', (req, res) => {
  const span = trace.getActiveSpan();
  
  try {
    const { items } = req.body;
    const validationResults = [];
    let allValid = true;
    
    for (const item of items) {
      const product = inventory.get(item.productId);
      const available = product ? (product.stock - product.reserved) : 0;
      const isValid = product && available >= item.quantity;
      
      validationResults.push({
        productId: item.productId,
        requested: item.quantity,
        available,
        valid: isValid
      });
      
      if (!isValid) allValid = false;
    }
    
    span?.setAttributes({
      'validation.items_count': items.length,
      'validation.result': allValid,
      'validation.invalid_items': validationResults.filter(r => !r.valid).length
    });
    
    logger.info('Inventory validation completed', {
      itemsValidated: items.length,
      allValid,
      results: validationResults
    });
    
    res.json({
      valid: allValid,
      results: validationResults
    });
    
  } catch (error) {
    errorCounter.add(1, { type: 'inventory_validation', service: 'inventory_service' });
    span?.recordException(error);
    logger.error('Inventory validation error', { error: error.message });
    res.status(500).json({ error: 'Validation failed' });
  }
});

// Reserve inventory
app.post('/inventory/reserve', (req, res) => {
  const span = trace.getActiveSpan();
  
  try {
    const { orderId, items } = req.body;
    const reservations = [];
    
    for (const item of items) {
      const product = inventory.get(item.productId);
      if (product && (product.stock - product.reserved) >= item.quantity) {
        product.reserved += item.quantity;
        
        // Update metrics
        inventoryGauge.add(-item.quantity, { 
          product_id: item.productId, 
          product_category: item.productId.split('-')[0] 
        });
        
        reservations.push({
          productId: item.productId,
          quantity: item.quantity,
          reserved: true
        });
      } else {
        throw new Error(`Cannot reserve ${item.quantity} of ${item.productId}`);
      }
    }
    
    span?.setAttributes({
      'reservation.order_id': orderId,
      'reservation.items_count': items.length,
      'reservation.successful': true
    });
    
    logger.info('Inventory reserved successfully', {
      orderId,
      reservations
    });
    
    res.json({
      orderId,
      reservations,
      status: 'reserved'
    });
    
  } catch (error) {
    errorCounter.add(1, { type: 'inventory_reservation', service: 'inventory_service' });
    span?.recordException(error);
    logger.error('Inventory reservation failed', { error: error.message });
  }
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Inventory service running on port ${PORT}`);
});