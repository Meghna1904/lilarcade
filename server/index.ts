import httpServer from './game-server.js';

const port = Number(process.env.PORT ?? 3001);
if (process.env.VERCEL !== '1') {
  httpServer.listen(port, () => console.log(`Our Little Arcade is listening on ${port}`));
}

export default httpServer;
