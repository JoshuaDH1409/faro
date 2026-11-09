'use strict';

const { z } = require('zod');
const db = require('../config/db');
const subs = require('./subscriptionStore');

const emailSchema = z.string().trim().toLowerCase().email().max(200);

async function requireProEmail(raw) {
  const parsed = emailSchema.safeParse(raw || '');
  if (!parsed.success) {
    return { ok: false, status: 400, body: { success: false, error: 'Correo inválido.', pro: false } };
  }
  try {
    const result = await subs.getStatusByEmail(parsed.data);
    if (!result.pro) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          error: 'Esta función es parte de Faro Pro.',
          pro: false,
          enabled: result.enabled,
          status: result.status
        }
      };
    }
    return { ok: true, email: parsed.data, billing: result };
  } catch (err) {
    console.error('[Access] error al verificar Pro', err.message);
    return {
      ok: false,
      status: 500,
      body: { success: false, error: 'No se pudo verificar la suscripción.', pro: false, enabled: db.hasDatabase() }
    };
  }
}

module.exports = { requireProEmail, emailSchema };
