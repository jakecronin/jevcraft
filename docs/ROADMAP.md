# First milestones

- [ ] Run the one-log fixture against live Minecraft and Jev; save a sanitized successful trace.
- [ ] Add integration tests for death, disconnect, stale targets, and timeout during movement.
- [ ] Replace the duplicate idle choices with richer inspect/stop semantics.
- [ ] Add a preview-then-execute mode and a compact progress display.
- [ ] Add a run summary: success, elapsed time, calls, token usage, failures.
- [ ] Generalize collect-one-log to collect-N with inventory-based completion.
- [ ] Add owner-authorized in-game commands using authenticated player identity.
- [ ] Add tool requirements and a bounded exposed-iron fixture.
- [ ] Consider Fabric autopilot only after the shared contracts have stabilized.

MVP acceptance: from the reset fixture, Jev selects each gameplay action, the bot gains one oak log, stops, and leaves a replayable decision record. Repeat across several log positions and test stop during both inference and movement.
