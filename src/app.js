const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const v1Routes = require('./routes/v1');
const errorHandler = require('./middlewares/errorHandler');
const { stripeWebhook } = require('./controllers/billingController');

const app = express();

// Middlewares
// app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());

// Stripe necesita el body sin parsear para verificar la firma: va antes de express.json()
app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory at root
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'] }));

// API Routes
app.use('/api/v1', v1Routes);

// For backwards compatibility / fallback if needed
app.get('/api/health', (req, res) => {
    res.json({ status: "ok", service: "Faro API (Express)", timestamp: new Date().toISOString() });
});

// Any other route should serve index.html for SPA if applicable
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;
