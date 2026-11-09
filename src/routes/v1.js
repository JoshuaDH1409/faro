const express = require('express');
const multer = require('multer');
const os = require('os');
const { getWorkspaces, getMetrics } = require('../controllers/metricsController');
const { generateInsights } = require('../controllers/insightsController');
const { uploadCSV } = require('../controllers/uploadController');
const { createLead } = require('../controllers/leadsController');

const router = express.Router();

// Multer config for CSV uploads using OS temp directory (Vercel compatible)
const upload = multer({ dest: os.tmpdir() });

// Workspaces & Metrics
router.get('/workspaces', getWorkspaces);
router.get('/metrics/:id', getMetrics);

// Insights
router.post('/insights/generate', generateInsights);

// Data upload
router.post('/data/upload-csv', upload.single('file'), uploadCSV);

// Leads (demo / prueba con datos)
router.post('/leads', createLead);

// Simple health check or source connect endpoint
router.post('/connect-source', (req, res) => {
    res.json({
        success: true,
        message: "Conexión a fuente de datos verificada correctamente.",
        status: "ACTIVE",
        syncTime: "Hace segundos"
    });
});

module.exports = router;
