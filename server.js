const PORT = process.env.PORT || 8080;
import { PrismaClient } from '@prisma/client';
import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import { initSocket } from './socket/socket.js';
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
