# JevCraft

A local Minecraft companion with **Jev as its only model**. Built for learning together: observe the world, ask Jev to choose one bounded action, execute it, and inspect the result.

**First task:** approach a nearby oak log, mine it, pick it up, and stop. This is an early starter, not a general survival assistant. Type checking, automated tests, and offline replay are validated; a live Minecraft + Jev end-to-end run is still required.

## Try the decision interface in two minutes

Install Node.js 24, then:

```sh
npm ci
npm run demo
npm test
npm run check
```

`demo` uses an explicitly labeled recorded response. It needs neither Minecraft nor an API key, does not make decisions itself, and never controls a player. Runtime gameplay always uses Jev; there is no fallback model or heuristic policy.

## Run the bot locally

1. Copy `.env.example` to `.env`.
2. Get a key from https://console.typesafe.ai and set `TYPESAFE_API_KEY` in `.env`.
3. Start a Java Edition **1.21.4** server (see below).
4. Join it with your normal Minecraft client at `localhost:25565`.
5. Run `npm run dev` in a terminal and wait for `Ready`.
6. Put an oak log nearby at ground level. Press Enter in the terminal to ask Jev and execute **one** action.

Terminal commands:

| Command | Behavior |
|---|---|
| Enter | Ask Jev and execute one action |
| `auto` | Repeat bounded actions; up to 30 actions / two minutes |
| `stop` | Cancel the pending request/action and release controls |
| `status` | Show lifecycle, task counters, and log location |
| `reset` | Start a fresh one-log objective from current inventory; only when idle |
| `quit` / Ctrl+C | Stop and disconnect |

Step mode executes the selected action immediately after displaying it; it is not a separate approval screen. Any execution/API error pauses automatic mode. Three consecutive errors require reset. Low health, death, and disconnect cancel activity. Completion is measured against the inventory at task start.

### Optional local server using Docker

Install and start Docker Desktop. Read the [Minecraft EULA](https://www.minecraft.net/eula); if you agree, run:

```sh
MC_EULA=TRUE docker compose up -d
# Wait for the server to finish starting:
docker compose logs -f minecraft
```

The included development server is bound to **127.0.0.1 only** and uses offline authentication. Do not expose this configuration to a network. Your brothers can each run their own local copy. For a shared authenticated server, use `MC_AUTH=microsoft` and a separate licensed bot account, and configure the server appropriately.

Prepare a repeatable fixture after the bot joins:

```sh
docker compose exec minecraft rcon-cli tp JevCraft 0 -60 0
docker compose exec minecraft rcon-cli setblock 3 -60 0 minecraft:oak_log
docker compose exec minecraft rcon-cli clear JevCraft minecraft:oak_log
```

Then type `reset` in the bot terminal. These fixture commands assume the supplied new superflat world and default bot name. Reapply them between trials, with the bot stopped. The compose image tag tracks its Java 21 build; Minecraft itself is pinned. The server downloads Minecraft on first startup.

Stop the server with `docker compose stop`. Its world persists in ignored `server-data/`. You can also supply your own vanilla server; match its version and connection settings in `.env`.

## Fast iteration

- Edit TypeScript, stop/restart the bot, and keep your Minecraft client/server open.
- Start with step mode and a single reachable log. Examine `logs/*.jsonl` after failures.
- `npm run replay` sends `fixtures/near-log.json` to live Jev without connecting to Minecraft (billable API call).
- `npm run replay -- path/to/state.json` evaluates another observation matching the fixture schema. For a logged decision, save its `event.request.state` as that file.
- Add recorded-state tests before expanding the action set.

## Architecture and storage

```text
Mineflayer observation → plain typed state/actions → Jev choice
        ↑                                               ↓
        └──────── result + inventory ← bounded executor ─┘
```

- `src/core.ts`: library-independent state/action contracts and Jev HTTP adapter.
- `src/minecraft.ts`: Mineflayer observations, target validation, pathfinding and execution.
- `src/main.ts`: terminal controls, cancellation, run limits and logging.
- `src/replay.ts`, `fixtures/`, `tests/`: offline and live policy experiments.

Jev chooses the block/drop/location; pathfinder executes navigation. Navigation cannot dig or scaffold. Observations include nearby loaded blocks (not pixel vision), so this is a structured-state agent. The current candidate generator is limited to oak logs within 12 blocks; path feasibility is checked during execution. It does not explore for distant resources.

No database or hosted backend is needed. Minecraft stores the world and inventory. The bot keeps its active task in memory, stores JSONL diagnostics locally, and starts idle after restart. `.env`, `.auth/`, `logs/`, and server worlds are excluded from Git. Logs contain game state and model responses, not API keys.

A future Fabric autopilot can reuse the contracts, question design, and fixtures. Its observation/execution adapter will need new Java code. Sharing this TypeScript policy at runtime would require a local service; that is deliberately deferred.

## Collaborating

See [CONTRIBUTING.md](CONTRIBUTING.md) for work areas and [the roadmap](docs/ROADMAP.md) for small first issues. CI checks types, tests and the fixture demo on every push and pull request. Each developer supplies their own Jev key.

## Known limitations

- No live Jev/Minecraft end-to-end verification yet; treat the first local run as an integration test.
- No combat, tool selection, crafting, general exploration, chat command authorization, or iron gathering yet.
- Low-health protection stops the bot; it does not move it to safety.
- npm audit currently reports six moderate dependency entries stemming from a transitive `uuid` advisory in Mineflayer's authentication chain. The suggested automatic fix downgrades Mineflayer to 1.4.0; it was not applied. Recheck upstream updates before broader deployment.

References: [Mineflayer](https://github.com/PrismarineJS/mineflayer), [Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), [Jev API quickstart](https://docs.typesafe.ai/introduction/quickstart), [local server image](https://docker-minecraft-server.readthedocs.io/).
