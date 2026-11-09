# Faro

Portal B2B de métricas: subes un CSV y armas el tablero con KPIs, gráficas y un resumen ejecutivo (reglas locales o Gemini si hay API key).

**Demo:** [faro-jadh.vercel.app](https://faro-jadh.vercel.app)

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
- `DATABASE_URL` — Postgres para sincronizar métricas

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/v1/workspaces` | Workspaces activos |
| GET | `/api/v1/metrics/:id` | KPIs y series del workspace |
| POST | `/api/v1/insights/generate` | Resumen ejecutivo |
| POST | `/api/v1/data/upload-csv` | Carga de CSV |
| POST | `/api/v1/connect-source` | Verificación de fuente de datos |

## Estructura

```
faro/
├── server.js
├── package.json
├── vercel.json
├── .env.example
├── public/index.html
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
