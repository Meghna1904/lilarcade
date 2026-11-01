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

## Supabase client setup

### Player records

The Express server can save each player's display name and a private room/device identifier to `public.arcade_players`. It does not save the shared passcode itself. Room and device identifiers are HMAC-SHA-256 values keyed by `ARCADE_PASSCODE_PEPPER`.

1. Apply [`supabase/schema.sql`](supabase/schema.sql) in the Supabase Dashboard SQL Editor.
2. Configure these variables on the Express server host (keep the secret key and pepper server-side):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `ARCADE_PASSCODE_PEPPER` (use the same long random value for every server instance; changing it invalidates existing room identifiers)
3. Restart/redeploy the Express server. Player records are upserted when a player enters a room.

The publishable key is only needed for browser features that directly use Supabase. The server-side table write uses `SUPABASE_SECRET_KEY` and the table denies access to `anon` and `authenticated` roles.

The project includes a browser Supabase client and an Express SSR cookie client for future data or auth features. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the deployment environment. Vite is configured to expose those public variables during the client build; it also accepts the Vite-native `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` names. The root `.env.local` is ignored by Git for local development. The Express middleware refreshes an existing Supabase auth session when it sees Supabase auth cookies; the arcade's room passcode remains separate and no Supabase sign-in is required. The middleware must run on the Express host; a static-only client deployment does not run it.

## Manual checklist

- Join with two names and one shared passcode; confirm both players appear in the same lobby.
- Try a third device with that passcode; confirm it receives “This room is full.”
- Refresh or briefly disconnect a player during Hangman; confirm the room, role, and round resume and play pauses while they are away.
- Play Hangman through a win and a six-mistake loss; check that roles swap on replay and the session score updates.
- Refresh both players mid-round and disconnect/rejoin; confirm the game resumes with the same roles and the Guesser still cannot see the word.
- Inspect Socket.IO room state while Hangman is active: the Guesser should receive only the pattern and guessed letters; `fullWord` should appear only after the round ends.
- Cup Ordering and Poison Challenge checks are pending implementation.
