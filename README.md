# Faro

Portal B2B de métricas: subes un Excel o CSV y armas el tablero con KPIs, gráficas, comparación vs. el periodo anterior y un resumen ejecutivo (reglas locales o Gemini si hay API key).

**Demo:** [faro-jadh.vercel.app](https://faro-jadh.vercel.app)

## Precios

Un solo plan: **Pro, $29 USD/mes**, cobrado con Stripe ([suscribirme](https://buy.stripe.com/eVq5kEcjLbx3fx41Pb2wU03)). La prueba incluye carga de Excel o CSV, tablero, comparación vs. el periodo anterior, resumen ejecutivo y PDF con marca «Hecho con Faro». Pro ($29 USD/mes) quita la marca, permite compartir el informe con un link y guarda un reporte recurrente con recordatorio semanal.

## Stack

- Node.js / Express
- Frontend estático (`public/index.html`)
- PostgreSQL (opcional, vía `DATABASE_URL` o `POSTGRES_URL`; en Vercel, Neon)
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
- `DATABASE_URL` (o `POSTGRES_URL`, o `FARO_STORAGE_DATABASE_URL` que crea la integración de Neon) — Postgres para leads y suscripciones; las tablas se crean solas
- `STRIPE_WEBHOOK_SECRET` — activa el webhook de Stripe (no requiere clave secreta de la API)
- `RESEND_API_KEY` — opcional; si está, el cron semanal envía el recordatorio del reporte. Sin ella el cron no envía nada.
- `FARO_FROM_EMAIL` y `FARO_APP_URL` — remitente y URL de los links personales

## Stripe

- **Cobro:** los botones "Suscribirme" llevan al Payment Link de Stripe (con el correo prellenado si ya lo conocemos). Al pagar, Stripe regresa a `/?checkout=success`.
- **Activación automática:** `POST /api/v1/billing/webhook` verifica la firma con `STRIPE_WEBHOOK_SECRET` y guarda en la tabla `subscriptions` los eventos `checkout.session.completed`, `customer.subscription.created/updated/deleted` e `invoice.payment_failed`. El correo sale de `customer_details.email` del checkout.
- **Estado Pro:** el frontend consulta `GET /api/v1/billing/status?email=` (`active` o `trialing` = Pro) al volver del checkout, al dejar su correo y con el campo "Ya pagué — activar con mi correo".
- Sin base de datos todo sigue funcionando: el webhook solo registra en el log y el estado Pro queda del lado del navegador.

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
| POST | `/api/v1/billing/webhook` | Webhook de Stripe (requiere `STRIPE_WEBHOOK_SECRET`) |
| GET | `/api/v1/billing/status?email=` | Estado de la suscripción Pro |
| POST | `/api/v1/reports/setup` | Guarda el reporte recurrente (requiere Pro) |
| GET | `/api/v1/reports/setup?email=` | Configuración e historial (requiere Pro) |
| GET | `/api/v1/reports/upload/:token` | Datos del link personal de carga |
| POST | `/api/v1/reports/history` | Guarda un reporte en el historial (token o Pro) |
| GET | `/api/v1/reports/cron` | Recordatorio semanal (Vercel Cron) |
| POST | `/api/v1/shares` | Crea un link de solo lectura (requiere Pro) |
| GET | `/api/v1/shares/:id` | Lee un informe compartido |

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
