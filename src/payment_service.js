const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { trace } = require('@opentelemetry/api');
const logger = require('./logger');
const { paymentCounter, errorCounter } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// In-memory payment store
const payments = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'payment_service' });
});

// Process payment
app.post('/payments/process', async (req, res) => {
  const startTime = Date.now();
  const span = trace.getActiveSpan();
  
  try {
    const { orderId, amount, paymentMethod, userId } = req.body;
    
    // Simulate payment processing delay
    const processingDelay = Math.random() * 2000 + 500; // 500-2500ms
    await new Promise(resolve => setTimeout(resolve, processingDelay));
    
    // Simulate payment failures (10% chance)
    const shouldFail = Math.random() < 0.1;
    
    const paymentId = uuidv4();
    const payment = {
      paymentId,
      orderId,
      amount,
      paymentMethod,
      userId,
      status: shouldFail ? 'failed' : 'successful',
      createdAt: new Date(),
      processingTime: processingDelay
    };
    
    payments.set(paymentId, payment);
    
    span?.setAttributes({
      'payment.id': paymentId,
      'payment.amount': amount,
      'payment.method': paymentMethod,
      'payment.status': payment.status,
      'payment.processing_time': processingDelay
    });
    
    paymentCounter.add(1, {
      status: payment.status,
      method: paymentMethod,
      amount_range: amount < 50 ? 'small' : amount < 200 ? 'medium' : 'large'
    });
    
    if (shouldFail) {
      errorCounter.add(1, { 
        type: 'payment_failure', 
        service: 'payment_service',
        method: paymentMethod
      });
      
      logger.error('Payment processing failed', {
        paymentId,
        orderId,
        amount,
        paymentMethod,
        reason: 'Insufficient funds or card declined'
      });
      
      return res.status(402).json({
        paymentId,
        status: 'failed',
        error: 'Payment declined'
      });
    }
    
    logger.info('Payment processed successfully', {
      paymentId,
      orderId,
      amount,
      paymentMethod,
      processingTime: processingDelay
    });
    
    res.json({
      paymentId,
      status: 'successful',
      processingTime: processingDelay
    });
    
  } catch (error) {
    errorCounter.add(1, { 
      type: 'payment_error', 
      service: 'payment_service'
    });
    
    span?.recordException(error);
    logger.error('Payment service error', { error: error.message });
    res.status(500).json({ error: 'Payment service error' });
  }
});

// Get payment details
app.get('/payments/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  const payment = payments.get(paymentId);
  
  if (!payment) {
    logger.warn('Payment not found', { paymentId });
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  logger.info('Payment details retrieved', { paymentId });
  res.json(payment);
});

app.listen(PORT, () => {
  logger.info(`Payment Service started on port ${PORT}`, {
    service: 'payment_service',
    port: PORT
  });
});