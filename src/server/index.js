import { createApp } from './app.js';
import { getDatabase } from './db/database.js';
import { seedDatabase, printSeededLogins } from './db/seed.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST;

// 1. Initialize and seed database
const db = getDatabase();
const creds = seedDatabase(db);

// 2. Print required seeded logins
printSeededLogins(creds);

// 3. Create and start Express server (dual-stack by default when HOST is undefined)
const app = createApp();
const listenCallback = () => {
  console.log(`DOGFOOD 2026 portal running on port ${PORT}`);
};

const server = HOST 
  ? app.listen(PORT, HOST, listenCallback)
  : app.listen(PORT, listenCallback);

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
