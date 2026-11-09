const { z } = require('zod');
const { saveLead } = require('../services/leadStore');

const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
  source: z.string().trim().max(60).optional(),
  website: z.string().max(0).optional() // honeypot: debe ir vacío
});

async function createLead(req, res) {
  const parsed = leadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Revisa nombre, correo y empresa.'
    });
  }

  const { website, ...data } = parsed.data;
  const lead = {
    ...data,
    source: data.source || 'web',
    createdAt: new Date().toISOString()
  };

  try {
    const saved = await saveLead(lead);
    const storage = typeof saved === 'string' ? saved : saved.storage;
    return res.status(200).json({ success: true, storage, id: saved && saved.id, rolledBack: Boolean(saved && saved.rolledBack) });
  } catch (err) {
    // Nunca perder el lead: queda en el log aunque falle el almacenamiento.
    console.error('[Lead] error al guardar', err.message);
    return res.status(200).json({ success: true, storage: 'log' });
  }
}

module.exports = { createLead };
