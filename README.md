# Faro

Portal B2B de métricas: subes un CSV y armas el tablero con KPIs, gráficas y un resumen ejecutivo (reglas locales o Gemini si hay API key).

**Demo:** [faro-jadh.vercel.app](https://faro-jadh.vercel.app)

## Precios

Un solo plan: **Pro, $29 USD/mes**, cobrado con Stripe ([suscribirme](https://buy.stripe.com/eVq5kEcjLbx3fx41Pb2wU03)). Incluye carga de CSV, tablero de métricas, resumen ejecutivo automático y exportación a PDF.

## Stack

- Node.js / Express
- Frontend estático (`public/index.html`)
- PostgreSQL (opcional, vía `DATABASE_URL`)
- Gemini (opcional, vía `GEMINI_API_KEY`)
- Despliegue en Vercel

## Cómo correr

```bash
npm install
cp .env.example .env   # opcional
npm run dev            # o: npm start
```

Abre [http://localhost:3000](http://localhost:3000).

Variables útiles en `.env`:

- `PORT` — puerto local (default 3000)
- `GEMINI_API_KEY` — insights con Gemini; sin ella usa el motor heurístico
- `DATABASE_URL` — Postgres para sincronizar métricas y guardar leads
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — activan el webhook de Stripe (opcional)

## Stripe

- **Cobro:** los botones "Suscribirme" llevan al Payment Link de Stripe. Al pagar, Stripe regresa a `/?checkout=success`, la app muestra la confirmación y marca Pro en el navegador (`localStorage`, solo visual; no es control de acceso).
- **Webhook (opcional):** `POST /api/v1/billing/webhook` verifica la firma con `STRIPE_WEBHOOK_SECRET` y registra `checkout.session.completed` y `customer.subscription.deleted`. Sin las dos variables responde `503` y no afecta al resto de la app.
- Para activarlo: en Stripe Dashboard > Developers > Webhooks agrega `https://faro-jadh.vercel.app/api/v1/billing/webhook` con esos dos eventos y guarda las llaves en las variables de entorno de Vercel.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/v1/workspaces` | Workspaces activos |
| GET | `/api/v1/metrics/:id` | KPIs y series del workspace |
| POST | `/api/v1/insights/generate` | Resumen ejecutivo |
| POST | `/api/v1/data/upload-csv` | Carga de CSV |
| POST | `/api/v1/connect-source` | Verificación de fuente de datos |
| POST | `/api/v1/leads` | Registro de solicitudes de demo |
| POST | `/api/v1/billing/webhook` | Webhook de Stripe (requiere variables) |

## Estructura

```
faro/
├── server.js
├── package.json
├── vercel.json
├── .env.example
├── public/
│   ├── index.html
│   ├── terminos.html
│   └── privacidad.html
└── src/
    ├── app.js
    ├── routes/
    ├── controllers/
    ├── services/
    ├── config/
    └── db/schema.sql
```

## Licencia

MIT
