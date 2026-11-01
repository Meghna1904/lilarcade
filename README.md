# lilarcade

Our Little Arcade is a private, two-player game room. Phase 1 currently includes room joining, reconnect support, the lobby, and Hangman. Cup Ordering and Poison Challenge are marked as coming soon.

## Run locally

Use Node.js 20 or newer.

```sh
npm install
npm run dev
```

Vite serves the client at `http://localhost:5173` and proxies Socket.IO to the server on port `3001`. Open the client in two browsers or devices, enter different names, and use the same passcode.

To make a production build and run the server:

```sh
npm run build
npm start
```

The Express server serves the built client and Socket.IO from one port. Set `PORT` in the deployment environment if the host supplies a port.

## Deploy

Deploy as one Node.js web service on a host that supports persistent WebSocket connections, such as Render, Railway, or Fly.io.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health endpoint: `/health`

The application keeps rooms and session scores in server memory. Restarting the service clears them. For separate client and server origins, set `CLIENT_ORIGIN` to a comma-separated list of permitted client origins and `VITE_SERVER_URL` at client build time to the server URL.

## Personalize

Edit `client/src/config.ts` to change the lobby greeting, footer name, and suggested names. Adjust the theme variables near the top of `client/src/style.css`.

## Manual checklist

- Join with two names and one shared passcode; confirm both players appear in the same lobby.
- Try a third device with that passcode; confirm it receives “This room is full.”
- Refresh or briefly disconnect a player during Hangman; confirm the room, role, and round resume and play pauses while they are away.
- Play Hangman through a win and a six-mistake loss; check that roles swap on replay and the session score updates.
- Inspect the Socket.IO room state and browser state while Hangman is active: the guesser should receive only the pattern and guessed letters; `fullWord` should appear only after the round ends.
- Cup Ordering and Poison Challenge checks are pending implementation.
