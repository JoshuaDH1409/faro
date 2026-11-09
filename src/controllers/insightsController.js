const { generateExecutiveInsights } = require('../services/geminiService');

async function generateInsights(req, res, next) {
  try {
    const { workspaceId, metrics } = req.body;
    
    // In a real app, fetch metrics from DB using workspaceId if metrics are not provided
    // For now, we expect metrics to be passed or use a fallback
    const defaultMetrics = {
        income: 50000,
        margin: 45,
        cac: 120
    };

    const targetMetrics = metrics || defaultMetrics;

    const insights = await generateExecutiveInsights(targetMetrics);

    res.json({
      success: true,
      bullets: insights,
      timestamp: new Date().toISOString(),
      engine: process.env.GEMINI_API_KEY ? "Gemini" : "Faro-Heuristic"
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { generateInsights };
