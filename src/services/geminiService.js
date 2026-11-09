const ai = require('../config/gemini');

function heuristicInsights(metrics = {}) {
  const income = metrics.income ?? metrics.facturacion ?? 'N/A';
  const ticket = metrics.ticket ?? metrics.cac ?? 'N/A';
  const accounts = metrics.accounts ?? 'N/A';
  const collection = metrics.collectionRate ?? metrics.margin ?? metrics.cobro ?? 'N/A';
  const title = metrics.title ? ` de ${metrics.title}` : '';
  const topChannel = Array.isArray(metrics.channels) && metrics.channels.length
    ? metrics.channels[0]
    : null;

  return [
    `Análisis de ingresos${title}: la facturación registrada es ${income}.`,
    `Eficiencia: ticket ${ticket}, ${accounts} y una cobranza/margen de ${collection}.`,
    topChannel
      ? `Recomendación: el canal con más peso es ${topChannel}; conviene revisar lo pendiente de cobro y reforzar esa fuente.`
      : 'Recomendación estratégica: priorizar retención de cuentas clave y dar seguimiento a lo pendiente de cobro.'
  ];
}

/**
 * Generates executive insights based on metrics.
 * @param {Object} metrics - Data containing revenue, costs, uploaded KPIs, etc.
 * @returns {Promise<Array<string>>} - Array of 3 bullet points.
 */
async function generateExecutiveInsights(metrics) {
  if (!ai) {
    return heuristicInsights(metrics);
  }

  const prompt = `
Eres un analista financiero B2B de alto nivel para gerentes de PyMEs en México.
Basado en los siguientes datos (pueden ser de un CSV de ventas, cobranza o inventario):
${JSON.stringify(metrics, null, 2)}

Genera exactamente 3 conclusiones ejecutivas en formato JSON.
El JSON debe ser un arreglo de strings, sin Markdown adicional, solo el arreglo puro. Ejemplo: ["conclusion 1", "conclusion 2", "conclusion 3"].
Las conclusiones deben cubrir:
1) Análisis de ingresos o facturación.
2) Eficiencia (ticket, cobranza, costos o mezcla por canal).
3) Recomendación estratégica accionable.
Usa los números del dataset; no inventes cifras que no aparezcan.
`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
    });

    const text = response.text;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed.slice(0, 3);
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', text);
    }

    return heuristicInsights(metrics);
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return heuristicInsights(metrics);
  }
}

module.exports = { generateExecutiveInsights, heuristicInsights };
