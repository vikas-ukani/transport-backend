const PORT = process.env.PORT || 8080;

import http from 'http';
import { PrismaClient } from '@prisma/client';
import app from './app.js';
import { initSocket } from './socket/socket.js';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$connect();
    console.log('Connected to the database with Prisma');
  } catch (err) {
    console.error('Prisma database connection error:', err);
    process.exit(1);
  }
})();

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
