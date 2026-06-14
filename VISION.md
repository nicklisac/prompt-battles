# Prompt Battle — Vision Board

> A Jackbox-style party game where players compete to write the best prompts for a shared LLM endpoint. Host brings their own brain.

---

## The Concept

One person hosts. They bring their own OpenAI-compatible API endpoint — local (LM Studio, Ollama, llama.cpp, vLLM) or cloud (OpenAI, Together, etc.). They get a share code. Friends join from their browsers. Everyone gets the same task. Everyone writes a prompt. All prompts go through the same model. Outputs are revealed. Players vote. Highest score wins.

**The hook:** The same model, the same task — your prompt is the only variable. It's a test of promptcraft, not model quality.

---

## Core Design Principles

- **Host brings the brain** — the LLM endpoint is the host's. No cloud API costs for players.
- **Zero backend** — Vercel serves static files. Supabase is a stateless message bus. The host's browser talks directly to the local LLM.
- **Any browser, any device** — players join from phones, laptops, tablets. Fully responsive. No app install.
- **Jackbox energy** — fast rounds, silly tasks, group voting, chaotic fun.
- **Model-agnostic** — works with any OpenAI-compatible endpoint. Local or cloud.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    VERCEL                            │
│  Static file hosting only (HTML/JS/CSS)             │
│  No serverless functions, no backend logic           │
└────────────────────┬────────────────────────────────┘
                     │ serves
                     ▼
┌─────────────────────────────────────────────────────┐
│              SUPABASE REALTIME                       │
│  Stateless bidirectional message bus                 │
│  - Room channels (join, leave, ready)                │
│  - Prompt broadcast (players → host)                 │
│  - Result broadcast (host → players)                 │
│  - Vote collection (players → all)                   │
│  - Score updates                                     │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
  ┌────▼─────┐          ┌────▼─────────┐
  │  HOST    │          │   PLAYERS    │
  │  Browser │          │  (phones)    │
  │          │          │              │
  │ collects │          │ submit       │
  │ prompts  │◄─────────│ prompts      │
  │          │          │              │
  │ calls    │          │ receive      │
  │ local    │─────────►│ results      │
  │ LLM      │          │              │
  │          │          │ cast         │
  │ broadcasts│         │ votes        │
  │ results  │◄─────────│              │
  └────┬─────┘          └──────────────┘
       │
       │ fetch() to localhost:1234
       ▼
┌─────────────────────────────────────────────────────┐
│              HOST'S LLM ENDPOINT                    │
│  LM Studio / Ollama / llama.cpp / vLLM / etc.       │
│  OpenAI-compatible API                              │
└─────────────────────────────────────────────────────┘
```

### Why this works

- **No tunnel needed** — the host's browser is on the same machine as the local LLM. It calls `http://localhost:1234/v1/chat/completions` directly.
- **Vercel is dumb** — just serves static HTML/JS. No serverless functions, no proxy routes.
- **Supabase is a switchboard** — it doesn't store game state persistently. It just routes messages between clients in real time.
- **CORS is handled** — LM Studio, Ollama, llama.cpp all serve with permissive CORS by default.

### Tradeoff

The host's browser tab must stay open and active for the entire game. If they close it or the tab goes to sleep, the game stalls. Acceptable for a party game.

---

## Game Flow

### 1. Host Setup
- Host opens the game URL
- Clicks "Create Game"
- Enters their LLM endpoint URL and model name
- Gets a 6-character share code
- Sees a lobby screen with the share code

### 2. Player Join
- Players open the game URL on their devices
- Enter the share code
- Pick a display name
- Land in the lobby, see player count and host name

### 3. Game Start
- Host clicks "Start Game"
- Round 1 begins

### 4. Round Flow

**Phase 1 — Task Revealed**
- All screens show the same task simultaneously
- Examples: "Generate a SVG of a cat wearing a crown", "Write a haiku about a toaster that thinks it's a philosopher"

**Phase 2 — Prompt Writing (60 seconds)**
- Timer starts. All players type their prompts simultaneously.
- Host can see prompts coming in.

**Phase 3 — Processing**
- Timer ends. Host's browser collects all prompts.
- Host's browser sends each prompt to the local LLM, one at a time.
- A "processing" screen shows while responses come in.
- Timeout: 30 seconds per prompt, then skip.

**Phase 4 — Results**
- All outputs displayed anonymized (Player A, B, C, D).
- SVGs are rendered inline. Text is displayed as-is.
- Players scroll through all outputs.

**Phase 5 — Voting**
- Each player votes for their favorite output.
- Cannot vote for your own.
- **Model tiebreaker:** If there's a tie, the model itself is asked "Which of these outputs is best?" and its vote breaks the tie.

**Phase 6 — Score Reveal**
- Votes are tallied.
- Points awarded (1 point per vote).
- Leaderboard shown.
- Next round or game over.

### 5. Game Over
- Final leaderboard.
- Option to play again with the same group.

---

## Task Categories

| Category | Description | Output |
|----------|-------------|--------|
| **SVG Art** | Generate SVG images from text prompts | Rendered SVG |
| **Silly Poems** | Short poems with a theme/constraint | Text |
| **Micro Stories** | One-paragraph stories with a twist | Text |
| **Song Lyrics** | 4-8 lines of a song from a weird perspective | Text |

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React + Vite | SPA, mobile-responsive |
| Hosting | Vercel | Static file deployment |
| Realtime | Supabase Realtime | WebSocket message bus |
| Styling | Tailwind CSS | Fast UI development |
| State | Client-side React state + Supabase broadcasts | No server state |

---

## MVP Scope

**In scope for v1:**
- [x] Room creation with share code
- [x] Player join/lobby
- [x] Task types: SVG art + text (poems, stories, songs)
- [x] 60-second prompt writing phase
- [x] Sequential LLM processing (host's browser)
- [x] Anonymized result display
- [x] Player voting (can't vote for self)
- [x] Model tiebreaker
- [x] Score tracking + leaderboard
- [x] 3 rounds per game
- [x] Mobile-responsive UI
- [ ] Vercel deployment
- [ ] Supabase realtime integration

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Host's local LLM is slow | Long wait times | Timeout per prompt (30s). Show progress. |
| CORS blocks the host's endpoint | Host can't call their LLM | Most local servers allow CORS by default. Document the fix. |
| Host's browser tab goes to sleep | Game stalls | Keep-alive pings. Visible warning if host goes idle. |
| Supabase free tier limits | Game breaks at scale | Free tier handles 200k realtime messages. Very safe for a party game. |
| Mobile SVG rendering | Small screens can't see art well | Zoom/pan on SVG results. |
| Model returns invalid SVG | Broken display | Fallback to raw text display if SVG parsing fails. |
| Players submit empty prompts | Wasted LLM call | Validate minimum prompt length before accepting. |

---

*Last updated: 2026-06-13*
