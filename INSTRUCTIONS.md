# Prompt Battle — Setup Instructions

This is your checklist. Everything in the code is done. These are the steps you need to complete to get it running.

---

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign up/log in
2. Click **"New Project"**
3. Pick an organization (or create one)
4. Name it something like `prompt-battle`
5. Pick a region closest to you (e.g., `US East` if you're in Maine)
6. **Database password** — set a strong password, you won't need it again for this project
7. Click **"Create new project"** — it takes ~2 minutes to provision

Once it's ready:

1. Go to **Project Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

You'll paste these into the `.env` file next.

---

## Step 2: Set Up the Project

Open a terminal in the `prompt-battle/` directory:

```bash
cd ~/AppData/Local/hermes/hermes-workspace/prompt-battle

# Install dependencies
npm install

# Create env file
echo "VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co" > .env
echo "VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE" >> .env
```

Replace the URL and key with the values from Step 1.

---

## Step 3: Test Locally

```bash
npm run dev
```

This starts the dev server at `http://localhost:5173`. Open it in your browser.

**To test the multiplayer flow:**

1. Open `http://localhost:5173` in two browser windows (or a desktop + your phone on the same network)
2. In the first window: Click **"Create Game"**
   - Endpoint: Your local LLM URL (e.g., `http://localhost:1234/v1` for LM Studio)
   - Model: Your model name (e.g., `llama-3.1-8b`)
   - Click **Create**
3. Note the 6-character room code
4. In the second window: Click **"Join Game"**
   - Enter the room code
   - Enter a name
   - Click **Join**
5. Both windows should now show the lobby with both players
6. In the host window: Click **"Start Game"**

**Note:** For local testing, you'll need your LLM server running (LM Studio, Ollama, etc.) with CORS enabled. LM Studio enables CORS by default. For Ollama, you may need to set the `OLLAMA_ORIGINS` environment variable to `*`.

---

## Step 4: Deploy to Vercel

### Option A: Vercel CLI (fastest)

```bash
# Install Vercel CLI if you haven't
npm install -g vercel

# Login
vercel login

# Deploy
vercel
```

- Accept the project detection
- Set the environment variables when prompted:
  - `VITE_SUPABASE_URL` = your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- It will give you a deployment URL

### Option B: GitHub + Vercel Dashboard

1. Push the code to a GitHub repo:
   ```bash
   cd prompt-battle
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:nlisac/prompt-battle.git
   git push -u origin main
   ```

2. Go to https://vercel.com/new
3. Import the GitHub repo
4. Add the environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**

---

## Step 5: Play the Game

Once deployed, share the Vercel URL with your friends.

**Host setup:**
1. Open the URL
2. Click **"Create Game"**
3. Enter your LLM endpoint:
   - **Local:** `http://localhost:1234/v1` (if hosting from the same machine as the LLM)
   - **Local network:** `http://192.168.x.x:1234/v1` (if LLM is on another machine on your network)
   - **Cloud:** Your OpenAI/Together/etc. endpoint URL
4. Enter your model name
5. Share the room code with players

**Player setup:**
1. Open the URL on their device
2. Click **"Join Game"**
3. Enter the room code + their name
4. Wait for the host to start

---

## Troubleshooting

### "CORS error" when host tries to call their LLM

The host's browser is making a `fetch()` call to the LLM endpoint. If the endpoint doesn't allow cross-origin requests, it will fail.

**LM Studio:** CORS is enabled by default. No action needed.

**Ollama:** Set the environment variable before starting:
```bash
# Linux/Mac
export OLLAMA_ORIGINS="*"

# Windows (PowerShell)
$env:OLLAMA_ORIGINS="*"
```

**llama.cpp (server):** Add `--host-cors` flag or set `HOST_CORS` environment variable.

**vLLM:** Add `--cors-allow-origins '*'` to the server command.

### "Failed to fetch" or network error

- Make sure your LLM server is running
- Make sure the endpoint URL is correct (include `/v1` for OpenAI-compatible endpoints)
- If using a local network IP, make sure firewall allows the port
- If using `localhost`, the host browser must be on the same machine as the LLM

### Players can't join the room

- Make sure the Supabase URL and anon key are correct in `.env`
- Check that the Supabase project is active (not paused)
- Check the browser console for Supabase connection errors

### Game stalls during processing

- The host's browser tab must stay open and active
- If the model is very slow, prompts may timeout after 30 seconds
- Try a smaller/faster model for testing

### SVG output doesn't render

- The model may have wrapped the SVG in markdown code fences — the code strips those automatically
- If the SVG is malformed, it falls back to raw text display
- Try adjusting the system prompt to be more explicit about raw SVG output

---

## Supabase Free Tier Limits

The free tier is more than enough for a party game:

- **200,000 realtime messages per month** — a 6-player game uses ~500 messages per round
- **50,000 row-level sync operations** — we don't use row sync, only broadcast channels
- **No database tables needed** — all game state is transient, held in client memory and broadcast messages

You won't hit any limits unless you're running dozens of games per day.

---

## What's Next (Post-MVP)

- [ ] QR code for easy room joining
- [ ] Sound effects for phase transitions
- [ ] Custom task creation by host
- [ ] Persistent leaderboards across games
- [ ] Spectator mode
- [ ] Freeform lobby chat
- [ ] More task categories
- [ ] Parallel prompt processing (for fast endpoints)
- [ ] Host can see all prompts in real-time during writing phase

---

*If you get stuck on any step, ask Rooster and I'll help you through it.*
