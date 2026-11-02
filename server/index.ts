import express from 'express';
import httpServer from './game-server.js';
import { app } from './game-server.js';

const port = Number(process.env.PORT ?? 3001);
if (process.env.VERCEL !== '1') {
  httpServer.listen(port, () => console.log(`Our Little Arcade is listening on ${port}`));
}

// Vercel detects the Express framework from this recognized entrypoint.
// Keep the HTTP server for local Socket.IO hosting, but export the app itself.
const vercelApp: express.Express = app;
export default vercelApp;
