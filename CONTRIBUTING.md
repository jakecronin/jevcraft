# Working together

Use short branches and pull requests. Before opening a PR, run `npm run check`, `npm test`, and `npm run demo`. Include the scenario tested and any relevant sanitized decision log.

Suggested parallel work areas:

1. **World and actions:** observations, movement, digging, pickups.
2. **Jev policy:** question wording, action descriptions, recorded scenarios.
3. **Developer experience:** terminal controls, world fixtures, run reports.

Agree on changes to `Observation` and `Action` together. Keep Mineflayer types out of `core.ts`. A new action needs preconditions, a bounded execution, cancellation, and an observable result. Test behavior rather than exact model prose. Never commit credentials, account sessions, or personal world files.

The live agent must use Jev for action selection. Recorded responses are for tests only. Add no silent heuristic or alternate-model fallback.
