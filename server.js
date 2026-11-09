require('dotenv').config();
const http = require('http');
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`[Faro Server] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
// En Vercel el bodyParser nativo consume el JSON antes de Express.
// Sin esto, Stripe no puede verificar la firma del webhook.
module.exports.config = { api: { bodyParser: false } };
