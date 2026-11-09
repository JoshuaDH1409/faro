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
