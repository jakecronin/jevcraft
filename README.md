# JevCraft

A local Minecraft companion using **Jev as its only AI model**. A reactive loop sends the player's task, observed game state, initial inventory, and recent results to Jev. Jev selects one concrete candidate action; the bot executes it, records the outcome, and observes again. There is no task graph or LLM planner.

This is an experimental bounded-action assistant, not a fully capable survival or building agent. The loop and audit tooling are implemented. A live Minecraft 26.1 + Jev wait-and-complete smoke test passed; broader gameplay scenarios still need integration testing.

## Start

Use Node.js 24:

```sh
npm ci
cp .env.example .env  # first setup only; do not overwrite your existing key
npm run check
npm test
npm run demo           # recorded fixture, no network or Minecraft required
```

Set your TypeSafe key in `.env`. Start Minecraft Java **26.1**, your local server, and then:

```sh
npm run dev
```

Existing users only need to restart the bot for code changes. Docker does not need a restart.

## Give it a task

Address the conversational name printed at startup (default `JevCraft`):

```text
JevCraft, collect four oak logs
JevCraft, drop all of your logs
JevCraft, build a three-block-high pole with your logs
JevCraft, come to me
JevCraft, deposit your oak logs in the nearby chest
JevCraft stop
```

Anyone on the server may control it. Only addressed requests become tasks; unrelated chat is ignored. Tasks and observed game state go to your configured TypeSafe API. There is no hardcoded intent classifier before the reactive policy. A new task is rejected while one is actively running. Specify targets explicitly: nearby player names, block types, or chest coordinates help. No conversation-level reference resolution or persistent world memory exists yet.

### Available primitives

- Approach nearby observed resource blocks, chests, or players.
- Mine reachable, harvestable logs or ores using the currently held tool.
- Pick up nearby dropped items; equip carried items; toss carried stacks as loose item entities.
- Place the held block at adjacent ground positions or extend reachable vertical columns (up to four blocks above current feet). Placement preserves at least one flat walkable exit.
- Inspect a reachable chest; deposit **all carried items of one selected type** into it.
- Wait, report blocked, ask a templated target/quantity question, or declare completion.

Candidates are bounded (up to 240), with resource/drop searches within 12 blocks. Navigation does not dig or scaffold. There is no recipe executor, chest withdrawal, exact partial deposit, free-form geometry, house blueprint, or autonomous mine construction yet. High-level tasks outside these capabilities should cause Jev to report blocked or clarify; do not assume it can build a house because it accepts the text.

Dropping is different from placing: `drop all of your inventory`, `drop your logs`, and `drop your blocks` offer only matching stack-toss actions and control outcomes, never block placement. Completion for these explicit unquantified drop requests requires that no matching items remain in inventory. Exact partial-stack quantities are not implemented: use whole-stack/all-item requests for now. Each toss verifies inventory reduction; items can still be picked up again later by normal Minecraft behavior.

Pole building uses one placement at a time, not a special autonomous build routine. Specify a height and supply enough logs. The first version supports adjacent reachable columns, not arbitrarily tall towers, scaffolding, or jumping and placing underfoot. It will not automatically dismantle blocks placed by earlier buggy runs.

Each step includes the last 12 action results. For other tasks, Jev determines completion, which is explicitly labeled **model-reported, not independently verified**. Primitive results check observable effects where feasible, but successful actions do not prove the whole task is complete.

## Audit and interrupt

The terminal streams timestamped, numbered events:

```text
model.request
model.response
decision mine_3_-60_0
action.start mine_3_-60_0
action.progress mine_3_-60_0 (1000ms)
action.result mine_3_-60_0
task.complete
```

Every task has a unique `logs/<timestamp>-<run-id>.jsonl` file. Events are appended immediately, so a crash preserves earlier records. Each model request is saved **before** sending; its exact body, raw response, HTTP status, duration and errors are saved with a matching call ID. Headers and API keys are never logged. Each action has start/progress/result events plus observed state, and every event has a sequence number and run ID. These records show inputs and outputs, not hidden model reasoning.

### Stop immediately

- In game: `<current name> stop` (also `cancel`, `pause`, `please stop`).
- Bot terminal: `stop`.
- Ctrl+C: stop and disconnect.

Stop aborts in-flight inference, clears movement/digging, closes an open inventory, and prevents a late response from executing. Completed blocks/transfers cannot be undone. The executor rejects another action while a cancelled operation is still settling. A stopped task needs a new request to start again.

The loop also stops on a repeated action/state signature, 120 action attempts, a five-minute run budget, or low health. Each primitive has a 15-second timeout. Errors pause automatic execution; review before retrying. Repetition detection is heuristic, not a guarantee against every unproductive loop.

### Inspect the full chain

In another terminal, from the project folder:

```sh
npm run trace
```

This exports the latest run to an HTML file and prints its full path. Open that file in a browser. Expand individual events or all events, and filter by action ID, error, event type or text. This is a snapshot; rerun the command to refresh it.

```sh
npm run trace -- logs/EXACT-RUN.jsonl          # export a specific run
npm run trace -- logs/EXACT-RUN.jsonl --json   # pretty-print every event
```

For raw live updates, use `tail -f` on the trace path printed by the bot. Logs stay local and are Git-ignored; they include task text, player names, coordinates and inventory contents.

### Step mode

```text
task collect one oak log
```

Enter that in the **bot terminal**, then press Enter on an empty line to execute one model-selected action. `auto` enables repetition; `status` shows the task; `trace` prints the trace path; `reset` starts a fresh one-log task; `quit` disconnects. Step mode does not request an additional approval after selection.

## Rename during play

```text
JevCraft, rename yourself Woody
Woody, what is your name?
Woody, collect four oak logs
```

The name persists in `.bot-state/name.json`. It changes addressing and reply prefixes, not the Minecraft account or overhead label. `MC_CHAT_NAME` supplies an initial fallback, otherwise `MC_USERNAME` is used. Saved names take priority. Names use 1–16 letters/digits/underscores and start with a letter.

## Local Minecraft server

With Docker Desktop running, read the [Minecraft EULA](https://www.minecraft.net/eula). If you agree:

```sh
MC_EULA=TRUE docker compose up -d
docker compose logs -f minecraft
```

Wait for `Done`, then join `localhost:25565` using Java Edition 26.1. The compose configuration uses Java 25, peaceful superflat survival, and persists the world under `server-data/`. Its offline-authentication port binds only to 127.0.0.1; do not expose this development configuration publicly. A shared authenticated server needs separate configuration and a licensed bot account using `MC_AUTH=microsoft`.

A resettable fixture (stop the bot's current task first):

```sh
docker compose exec minecraft rcon-cli tp JevCraft 0 -60 0
docker compose exec minecraft rcon-cli setblock 3 -60 0 minecraft:oak_log
docker compose exec minecraft rcon-cli clear JevCraft minecraft:oak_log
```

Use the bot's Minecraft username if different. These coordinates assume the supplied flat world. Then submit a new task; it snapshots initial inventory. `docker compose stop` stops the server while preserving the world.

## Code map

- `src/reactor.ts`: serial decision/execution loop, task context, interruption and budgets.
- `src/core.ts`: typed candidates, Jev request, validation and API audit.
- `src/world.ts`: concrete candidate generation and Minecraft primitive execution.
- `src/audit.ts`, `src/trace.ts`: immediate JSONL recording and HTML inspection.
- `src/main.ts`: chat/terminal controls and lifecycle.
- `src/name.ts`: conversational identity persistence.
- `src/chat.ts`: addressing helper; legacy intent parser retained for existing tests, unused by the reactive runner.
- `src/minecraft.ts`: connection setup; legacy collection helpers retained for fixture compatibility.

No database or cloud backend is required. Active tasks exist only in memory and never auto-resume after restart. Minecraft owns world state; traces and the conversational name are local files. API/session secrets are Git-ignored.

## Validation and limitations

CI runs type checking, tests, and offline replay. Automated coverage includes interruption during inference/action execution, timeout, repetition detection, history, real-time progress, invalid responses, and logging without authorization headers. A live wait/completion loop was verified against Minecraft 26.1 and Jev. Mining, placement, chest transfers, and compound goals require further live scenario testing.

The dependency audit previously reported six moderate entries stemming from transitive `uuid` in Mineflayer authentication. The proposed automatic fix downgrades Mineflayer to 1.4.0 and was not applied.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [roadmap](docs/ROADMAP.md). References: [Mineflayer](https://github.com/PrismarineJS/mineflayer), [Jev API](https://docs.typesafe.ai/introduction/quickstart).

Regression validation: synthetic live Jev checks select stack tossing for inventory disposal and upward placement for a partially built pole. Unit tests cover stale stacks, disposal constraints, completion eligibility, vertical candidates and blocking the last exit. These checks do not constitute a live in-world pole build.
