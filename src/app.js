const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { trace, context } = require('@opentelemetry/api');
const logger = require('./logger');
const {
  orderCounter,
  checkoutDurationHistogram,
  activeUsersGauge,
  errorCounter
} = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request ID and user context middleware
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.userId = req.headers['x-user-id'] || 'anonymous';
  req.userPlan = req.headers['x-user-plan'] || 'free';
  req.userRegion = req.headers['x-user-region'] || 'unknown';
  
  // Add custom attributes to active span
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      'user.id': req.userId,
      'user.plan': req.userPlan,
      'user.region': req.userRegion,
      'request.id': req.requestId,
      'http.route': req.route?.path || req.path
    });
  }
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    requestId: req.requestId,
    userId: req.userId,
    userPlan: req.userPlan,
    userRegion: req.userRegion
  });
  
  next();
});

// In-memory data store (for demo purposes)
const orders = new Map();
const users = new Map();
let activeUserCount = 0;

// Routes
app.get('/', (req, res) => {
  logger.info('Health check endpoint accessed');
  res.json({ 
    status: 'healthy', 
    service: 'order-service',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  logger.info('Health check performed', { memUsage, uptime });
  
  res.json({
    status: 'healthy',
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    },
    uptime: Math.round(uptime)
  });
});

// User session management
app.post('/users/session', (req, res) => {
  const span = trace.getActiveSpan();
  
  try {
    const sessionId = uuidv4();
    const user = {
      sessionId,
      userId: req.userId,
      plan: req.userPlan,
      region: req.userRegion,
      loginTime: new Date(),
      lastActivity: new Date()
    };
    
    users.set(sessionId, user);
    activeUserCount++;
    activeUsersGauge.add(1, { plan: req.userPlan, region: req.userRegion });
    
    span?.setAttributes({
      'session.id': sessionId,
      'session.created': true
    });
    
    logger.info('User session created', { 
      sessionId, 
      userId: req.userId, 
      activeUsers: activeUserCount 
    });
    
    res.json({ sessionId, message: 'Session created successfully' });
  } catch (error) {
    errorCounter.add(1, { type: 'session_creation', service: 'order-service' });
    logger.error('Failed to create user session', { error: error.message });
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Product catalog
app.get('/products', async (req, res) => {
  const span = trace.getActiveSpan();
  
  try {
    // Simulate calling inventory service
    logger.info('Fetching products from inventory service');
    
    const inventoryResponse = await axios.get('http://localhost:3002/inventory', {
      timeout: 5000,
      headers: {
        'x-request-id': req.requestId,
        'x-user-id': req.userId
      }
    });
    
    span?.setAttributes({
      'inventory.items_count': inventoryResponse.data.products.length,
      'inventory.response_time': Date.now() - req.startTime
    });
    
    logger.info('Products fetched successfully', { 
      productCount: inventoryResponse.data.products.length 
    });
    
    res.json(inventoryResponse.data);
  } catch (error) {
    errorCounter.add(1, { type: 'inventory_fetch', service: 'order-service' });
    span?.recordException(error);
    span?.setStatus({ code: 2, message: error.message });
    
    logger.error('Failed to fetch products', { 
      error: error.message,
      statusCode: error.response?.status 
    });
    
    res.status(503).json({ error: 'Inventory service unavailable' });
  }
});

// Place order endpoint
app.post('/orders', async (req, res) => {
  const startTime = Date.now();
  const span = trace.getActiveSpan();
  
  try {
    const { items, shippingAddress, paymentMethod } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Invalid order items');
    }
    
    const orderId = uuidv4();
    const order = {
      orderId,
      userId: req.userId,
      items,
      shippingAddress,
      paymentMethod,
      status: 'pending',
      createdAt: new Date(),
      totalAmount: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };
    
    // Add custom span attributes for business context
    span?.setAttributes({
      'order.id': orderId,
      'order.item_count': items.length,
      'order.total_amount': order.totalAmount,
      'order.payment_method': paymentMethod,
      'order.user_plan': req.userPlan,
      'order.user_region': req.userRegion
    });
    
    logger.info('Order creation started', { 
      orderId, 
      itemCount: items.length, 
      totalAmount: order.totalAmount 
    });
    
    // Step 1: Validate inventory
    logger.info('Validating inventory for order', { orderId });
    const inventoryCheck = await axios.post('http://localhost:3002/inventory/validate', 
      { items }, 
      {
        timeout: 3000,
        headers: {
          'x-request-id': req.requestId,
          'x-user-id': req.userId,
          'x-order-id': orderId
        }
      }
    );
    
    if (!inventoryCheck.data.valid) {
      throw new Error('Insufficient inventory');
    }
    
    // Step 2: Process payment
    logger.info('Processing payment for order', { orderId, amount: order.totalAmount });
    const paymentResponse = await axios.post('http://localhost:3001/payments/process',
      {
        orderId,
        amount: order.totalAmount,
        paymentMethod,
        userId: req.userId
      },
      {
        timeout: 10000,
        headers: {
          'x-request-id': req.requestId,
          'x-user-id': req.userId,
          'x-order-id': orderId
        }
      }
    );
    
    if (paymentResponse.data.status !== 'successful') {
      throw new Error('Payment processing failed');
    }
    
    // Step 3: Reserve inventory
    await axios.post('http://localhost:3002/inventory/reserve',
      { orderId, items },
      {
        timeout: 3000,
        headers: {
          'x-request-id': req.requestId,
          'x-user-id': req.userId,
          'x-order-id': orderId
        }
      }
    );
    
    // Update order status
    order.status = 'confirmed';
    order.paymentId = paymentResponse.data.paymentId;
    orders.set(orderId, order);
    
    // Record metrics
    orderCounter.add(1, {
      status: 'success',
      payment_method: paymentMethod,
      user_plan: req.userPlan,
      user_region: req.userRegion
    });
    
    const duration = Date.now() - startTime;
    checkoutDurationHistogram.record(duration, {
      payment_method: paymentMethod,
      user_plan: req.userPlan,
      user_region: req.userRegion
    });
    
    logger.info('Order placed successfully', {
      orderId,
      paymentId: order.paymentId,
      status: order.status,
      processingTime: duration
    });
    
    res.status(201).json({
      orderId,
      status: order.status,
      message: 'Order placed successfully',
      processingTime: duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    errorCounter.add(1, { 
      type: 'order_creation', 
      service: 'order-service',
      user_plan: req.userPlan,
      error_category: error.response?.status >= 500 ? 'server_error' : 'client_error'
    });
    
    checkoutDurationHistogram.record(duration, {
      payment_method: req.body?.paymentMethod || 'unknown',
      user_plan: req.userPlan,
      status: 'failed'
    });
    
    span?.recordException(error);
    span?.setStatus({ code: 2, message: error.message });
    
    logger.error('Order creation failed', {
      error: error.message,
      stack: error.stack,
      requestBody: req.body,
      processingTime: duration
    });
    
    res.status(400).json({ 
      error: 'Failed to place order', 
      details: error.message,
      processingTime: duration
    });
  }
});

// Get order details
app.get('/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const span = trace.getActiveSpan();
  
  span?.setAttributes({
    'order.id': orderId,
    'operation': 'get_order'
  });
  
  const order = orders.get(orderId);
  
  if (!order) {
    logger.warn('Order not found', { orderId });
    return res.status(404).json({ error: 'Order not found' });
  }
  
  logger.info('Order details retrieved', { orderId, status: order.status });
  res.json(order);
});

// Get user orders
app.get('/users/:userId/orders', (req, res) => {
  const { userId } = req.params;
  const span = trace.getActiveSpan();
  
  span?.setAttributes({
    'user.id': userId,
    'operation': 'get_user_orders'
  });
  
  const userOrders = Array.from(orders.values()).filter(order => order.userId === userId);
  
  logger.info('User orders retrieved', { userId, orderCount: userOrders.length });
  res.json({ orders: userOrders, total: userOrders.length });
});

// Error handling middleware
app.use((error, req, res, next) => {
  const span = trace.getActiveSpan();
  
  errorCounter.add(1, { 
    type: 'unhandled_error', 
    service: 'order-service',
    route: req.route?.path || req.path
  });
  
  span?.recordException(error);
  span?.setStatus({ code: 2, message: error.message });
  
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Order Service started on port ${PORT}`, {
    service: 'order-service',
    port: PORT,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});