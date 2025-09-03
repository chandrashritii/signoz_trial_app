const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('ecommerce-metrics', '1.0.0');

const orderCounter = meter.createCounter('orders_total', {
  description: 'Total number of orders placed',
});

const checkoutDurationHistogram = meter.createHistogram('checkout_duration_ms', {
  description: 'Duration of checkout process in milliseconds',
  unit: 'ms',
});

const paymentCounter = meter.createCounter('payments_total', {
  description: 'Total number of payment attempts',
});

const inventoryGauge = meter.createUpDownCounter('inventory_items', {
  description: 'Current inventory levels',
});

const activeUsersGauge = meter.createUpDownCounter('active_users', {
  description: 'Number of active users',
});

const errorCounter = meter.createCounter('errors_total', {
  description: 'Total number of errors by type',
});

module.exports = {
  orderCounter,
  checkoutDurationHistogram,
  paymentCounter,
  inventoryGauge,
  activeUsersGauge,
  errorCounter
};