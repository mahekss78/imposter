# Imposter Game — Full Spec v2 (roles, flow, scoring, test matrix, tech)

This supersedes v1. Every open question you listed (disconnects, refresh, tabs, ties, etc.) is
answered explicitly in §5 so nothing is left ambiguous going into build.

---

## 1. Roles & Permissions

### Host
- Creates/configures the room, owns the QR/link.
- Sees: lobby list, current round number, whose turn it is, live chat/clue feed, "voting in
  progress" status, timers.
- Never sees (until the game ends): scores, vote counts, who-voted-for-whom, confidence values,
  partial leaderboard.
- Can: force-start with fewer than configured players (with a warning), end game early, start a
  new game (always a fresh room).

### Player
- Joins one room only, via that room's QR/link.
- Sees: own private identity (word or "imposter"), lobby list, own turn prompts, shared chat,
  voting screen (can't select self), own confidence slider (rounds 2–3 only).
- Never sees: own or others' running score, other players' identities, other players' votes —
  all of this only appears on the final leaderboard.

### Audience (people watching the host's screen, not playing)
- Sees exactly what the host's *public display* shows: round number, clue feed, "voting in
  progress." Nothing else. Same restriction as host — no live scores.

---

## 2. Config Rules

| Players | Valid imposter count(s) | Notes |
|---|---|---|
| 3–5   | 1 | Below 3 players, no meaningful deduction is possible — disallow |
| 6–9   | 1 (2 optional, shown with a balance warning) | |
| 10–12 | 2 | |

- Rounds: 1–3, host's choice.
- Genre: cosmetic, controls the word/topic pool only.
- Confidence-bet mechanic (see §5) is **only active from round 2 onward** — a 1-round game never
  uses it.

---

## 3. Full Game Flow

### 3.1 Host side
1. `CREATE_ROOM` → configure players / imposters (auto-limited per §2) / rounds / genre.
2. Server issues a unique room code + QR + link. Host enters `LOBBY_OPEN`.
3. Host watches join count live. `START` button enabled only once configured count has joined
   (or host force-starts).
4. Host taps Start → server moves room to `ROLE_REVEAL`, then `ROUND_1_CLUES`.
5. For each round: host's screen shows current turn/clue feed only, then "voting in progress,"
   then `ROUND_N_COMPLETE` (no results shown) → next round's lobby check → repeat.
6. After final round: `GAME_END` → full leaderboard revealed to host (and optionally cast to the
   public display).
7. `NEW_GAME` → always issues a brand-new room code; old room becomes `ARCHIVED` (read-only).

### 3.2 Player side
1. Scan QR → resolves to `{roomCode}` → `JOIN_ROOM` with a name.
2. Server assigns a session token (stored client-side) bound to `{roomCode, playerId}`.
3. `LOBBY_WAITING` until host starts.
4. `ROLE_REVEAL` (private) — word or imposter notice. This screen is **re-accessible any time**
   during the game via a small persistent "view my role" control (see §5.9).
5. Per round:
   - `CLUE_PHASE`: if it's your turn, 30s server-driven timer, submit one clue into shared chat.
   - `VOTE_PHASE`: 45s timer, pick one other player (not self); rounds 2–3 also submit a
     confidence level 50–100% at the same time as the vote.
   - `ROUND_WAIT`: nothing shown about results.
6. After final round: `LEADERBOARD` screen, same for every player.

### 3.3 Round loop internals
- Turn order for the round = one server-side shuffle of currently-active players, generated once
  at round start and stored. Server marks each player "answered" as they go; a player can never
  be selected twice or skipped in the same round.
- Timer authority is 100% server-side: server stores an absolute deadline (epoch ms), clients only
  render a countdown to it. If a submission doesn't arrive before the deadline, server auto-scores
  0 and advances the turn — it can never hang waiting on a client.

---

## 4. Scoring — Per Round, Per Imposter Count

### 4.1 Base score for a correct vote (same regardless of 1 or 2 imposters)

| Round | Correct-vote score |
|---|---|
| 1 | +1 |
| 2 | +2 |
| 3 | +3 |

Wrong vote or no vote = 0, no exceptions.

### 4.2 Imposter scoring — 1 imposter
`N` = crew members who voted this round, `C` = how many voted correctly for the imposter.

| Catch rate | Imposter score |
|---|---|
| C = N | 0 |
| 0 < C < N | half of round's max escape bonus, rounded down |
| C = 0 | full max escape bonus |

Max escape bonus by round: R1 = 2, R2 = 3, R3 = 4.

### 4.3 Imposter scoring — 2 imposters (this was your open question)
**Each imposter is scored completely independently**, based only on the votes cast specifically
against *them*. A vote for imposter A never affects imposter B's score and vice versa. Votes cast
against an innocent crew member count toward nobody's catch rate.

Worked example, 12 players, imposters P2 and P8, round 2:
```
Votes for P2: P1, P3            → 2 correct votes toward P2's catch rate
Votes for P8: P4, P5            → 2 correct votes toward P8's catch rate
Votes for others (wrong): P6→P1, P7→P3, etc. → count for nobody
```
- P2's catch rate is evaluated only against however many crew members voted for P2 vs. how many
  crew members exist in total (§4.2 formula, using P2's own C/N).
- P8's is calculated the same way, separately.
- It's entirely possible for P2 to be fully caught (0 score) while P8 escapes clean (full escape
  bonus) in the same round.

### 4.4 Confidence bet (rounds 2–3 only)
Submitted **at the same time as the vote**, before the player knows the outcome:

| Confidence | If correct | If wrong |
|---|---|---|
| 90–100% | +2 | −2 |
| 70–89%  | +1 | −1 |
| 50–69%  | 0  | 0 |

This is a real bet (downside if wrong), which is what stops everyone from defaulting to "100%
sure" every time.

### 4.5 Winner & ties
- Winner = highest total score across all rounds.
- Tie-break order: (1) most correct votes overall → (2) most confidence points earned →
  (3) declared shared win if still tied.
- **There is no plurality "most-voted-out" elimination mechanic** in this game — each player's
  vote is judged individually against ground truth, not tallied against other players' votes. This
  means "vote ties" in the classic Mafia sense don't exist here — worth stating explicitly since
  it removes an entire category of edge case you were worried about.

---

## 5. Locked Decisions on Every Edge Case You Listed

| Scenario | Ruling |
|---|---|
| Player disconnects during their clue turn | Grace period (~20–30s) to reconnect and still submit within the original deadline; past deadline = auto 0, turn advances regardless |
| Player disconnects during voting | Same grace period; past deadline = counted as no vote (0) |
| Host disconnects while a turn is active | **Game does not pause.** All timers/state live on the server, not on the host's device — players keep playing normally. Only the *public display* screen goes blank until host reconnects; host reconnect just resyncs to current state |
| Player joins, refreshes before role reveal | Session token already bound to their seat — refresh just re-shows the lobby-waiting screen, no data lost |
| Player refreshes after role reveal | Resumes wherever the game currently is; their role is always re-viewable via a persistent "view my role" button (not a one-time popup) |
| Player refreshes during their own turn | Reconnects into the same turn, countdown continues from the original server deadline |
| Player refreshes after submitting their clue | Shows "waiting for others" — resubmission is blocked server-side (idempotent by round+player) |
| Player manually opens another room's QR/link | A session token is bound to one active room at a time; opening a second room's link while already active elsewhere prompts "you're already in a game — leave it first?" |
| Two browser tabs, same player session | Session token is shared via local storage; the most recently active tab is authoritative, other tabs show "opened in another tab" and go read-only, preventing double submissions |
| Host opens same game in two tabs | Same pattern as above; regardless, all host actions are idempotent server-side so double-clicking "Start" twice can't break state |
| Two imposters, one disconnects permanently | Marked inactive; stops contributing clues/votes; their catch rate locks at whatever was recorded in completed rounds; the other imposter is unaffected |
| Player leaves permanently after round 1 | Marked inactive; excluded from future rounds' "did everyone answer" checks; keeps points already earned, earns nothing further |
| All players time out their votes in a round | Valid outcome, not an error: imposter(s) get the full escape bonus (0% caught), all crew score 0 for that round |
| "Vote ties" | Doesn't apply — see §4.5, votes are judged individually, not tallied against each other |
| "Confidence ties" | Doesn't apply either, for the same reason — each player's confidence bet is scored independently against a fixed bracket table, not relative to others |
| 1-round game with confidence | Confidence mechanic is simply off; round 1 never has it regardless of total round count |
| Can a player see their own score mid-game | No — hidden until the final leaderboard, same rule as hiding it from host/audience, since even your own running score could hint whether you're the imposter |

---

## 6. Test Case Matrix by Player Count

For each valid config, verify all catch-rate tiers and the boundary conditions.

### 1-imposter configs

| Players | Imposters | Crew size | Catch-rate test values to run |
|---|---|---|---|
| 3  | 1 | 2  | 0/2, 1/2, 2/2 |
| 4  | 1 | 3  | 0/3, 1/3, 2/3, 3/3 |
| 5  | 1 | 4  | 0/4, 1/4, 2/4, 3/4, 4/4 |
| 6  | 1 | 5  | 0/5, 1/5, 2/5, 3/5, 4/5, 5/5 |
| 7  | 1 | 6  | 0/6, 1/6, 3/6, 5/6, 6/6 |
| 8  | 1 | 7  | 0/7, 1/7, 3/7, 6/7, 7/7 |
| 9  | 1 | 8  | 0/8, 1/8, 4/8, 7/8, 8/8 |

For every row, also run: all-timeout (0 votes submitted at all), and a mixed round where some
players time out and others vote correctly/incorrectly, to confirm timeouts and wrong votes both
resolve to 0 without affecting the imposter's catch-rate denominator incorrectly (timeouts should
still count in `N`, since "not voting" is still a crew member who failed to catch them).

### 2-imposter configs

| Players | Imposters | Crew size | Test cases |
|---|---|---|---|
| 6  | 2 | 4  | Both imposters at 0/4; both at 4/4; one at 0/4 + other at 4/4 (independence check); split votes where some crew vote for each imposter and some vote for the wrong crew member entirely |
| 7  | 2 | 5  | Same pattern, plus one imposter disconnects mid-game (§5) while the other keeps playing |
| 8  | 2 | 6  | Same pattern, plus a round where nobody votes for one imposter at all (0 votes referencing them) — confirm this resolves as 0/6 caught, not a divide-by-zero or error state |
| 9  | 2 | 7  | Same pattern |
| 10 | 2 | 8  | Same pattern, plus confidence bet interacting independently per imposter (a crew member can be 90%+ confident about imposter A and only 60% about a wrong guess elsewhere — confirm confidence only ties to their one actual vote) |
| 11 | 2 | 9  | Same pattern |
| 12 | 2 | 10 | Full worked example from §4.3 — both imposters at different catch rates in the same round |

### Cross-cutting test cases (run regardless of player count)
- Force-start with fewer players than configured joined.
- Host ends game early mid-round — confirm partial leaderboard generates from completed rounds
  only.
- Room code collision attempt (two hosts creating rooms at the same instant) — confirm codes are
  guaranteed unique.
- A player's QR scan attempt for an already-archived room — should fail cleanly with a clear
  message, not silently join a dead room.
- Rapid double-submit of the same clue/vote (simulating a laggy double-tap) — confirm server
  accepts only the first and ignores the duplicate.

---

## 7. Technical Risks — Bugs & Glitches (pre- and post-deploy)

### Before deploy (things that will bite you in dev/QA if not designed around up front)
- **Race conditions on turn advancement** — two near-simultaneous clue submissions racing to
  "complete" a turn. Fix: server treats round-turn advancement as a single atomic operation per
  room, not something two events can trigger at once.
- **Timer drift** — client `setInterval` timers drift or pause when a mobile tab is backgrounded.
  Fix: never trust client-side elapsed time; always recompute the countdown from
  `serverDeadline - Date.now()` on each render tick.
- **Off-by-one bugs in turn order/round counting** — easy to accidentally repeat or skip a player.
  Fix: cover this explicitly with the matrix in §6, and unit test the shuffle+turn-tracking logic
  in isolation from the UI.
- **Client-side bypass** — a technical player could call the vote/clue API directly, bypassing UI
  restrictions like "can't vote for self." Fix: every rule (self-vote block, one-clue-per-turn,
  deadline enforcement) must be re-checked server-side regardless of what the UI allows.
- **Room code collisions** — two hosts assigned the same code. Fix: generate against a uniqueness
  check on the active-rooms table before issuing, not just randomly.
- **State bugs across simultaneous rooms** — the actual isolation bug you're most worried about.
  Fix: rooms as first-class namespaces (§ from v1) tested specifically with 3+ concurrent rooms in
  QA, not just one room at a time.

### After deploy (things that only show up in production)
- **Server restarts wiping in-memory state mid-game.** Fix: persist active-game state to Redis (or
  equivalent) so a restart/redeploy doesn't erase a live game; on restart, rooms rehydrate from
  the store.
- **Load spikes** (e.g. a classroom or event all starting games at once). Fix: load-test with
  concurrent room creation before any real event, not just steady-state traffic.
- **Backgrounded mobile tabs** — browsers throttle JS timers when a tab isn't in focus, meaning a
  player might miss seeing "it's your turn." Fix: rely on server timers (not affected by this) for
  scoring correctness, and consider a vibration/sound/browser notification trigger for "your
  turn" if the tab is backgrounded.
- **Stale client bundle after a deploy** — a player who joined before a deploy is now running old
  JS talking to a new server contract. Fix: version the client build and force a refresh prompt on
  a protocol mismatch, rather than letting it silently misbehave.
- **Zombie/abandoned rooms** — hosts who close the tab and never return leave rooms running
  forever. Fix: a cleanup job that archives rooms inactive beyond a timeout (e.g. no host activity
  for 15+ minutes).

---

## 8. Suggested Stack

| Layer | Suggestion | Why |
|---|---|---|
| Frontend (host + player UI) | React (or Vue) + Tailwind, built as a PWA | Fast to build two distinct views (host display vs. player device); PWA lets players "add to home screen" for a smoother repeat-play experience |
| Real-time layer | Socket.IO (or raw WebSockets with a thin wrapper) | Native support for rooms/namespaces, which is exactly the isolation boundary you need |
| Backend | Node.js (Express or Fastify) | Same language as frontend simplifies sharing types/validation logic between client and server — useful since so much of this game's correctness depends on server-side validation |
| Ephemeral game state | Redis | Stores active room state, turn deadlines, current phase — survives a backend restart and lets you scale to multiple backend instances later via Redis pub/sub adapter for Socket.IO |
| Persistent storage | PostgreSQL (or MongoDB if you prefer schema-less) | Stores completed games, final leaderboards, archived rooms, and any host/account data |
| Session identity | Signed token (JWT or opaque, server-verified) stored client-side | The actual mechanism behind reconnect-without-losing-your-seat and same-room enforcement described in §5 |
| Timers | Server-side, deadline timestamps stored in Redis | Works correctly even across multiple backend instances behind a load balancer, not just a single process |
| Deployment | Containerized (Docker) behind a load balancer, with the Redis adapter enabled for Socket.IO if you run more than one instance | Needed the moment you have enough concurrent games that one server process isn't enough |
| Monitoring | Basic error tracking (e.g. Sentry) + uptime checks | A live-game glitch in front of a room full of people is highly visible — worth catching issues before players do |

---

With §5 locking every edge case and §4.3 resolving the two-imposter split-vote question, the
remaining implementation work is mechanical: build the room/session layer first (§6 of v1 +
here), then the round state machine, then layer scoring on top last — scoring only needs to read
from state that's already correct.
