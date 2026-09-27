# Reactive assistant roadmap

- [x] Task + world state + recent history → one concrete Jev-selected action.
- [x] Real-time action events and unique JSONL run traces.
- [x] Exact request/response recording and expandable HTML trace exports.
- [x] Interrupt in-flight inference/actions; ignore late responses.
- [x] Repeated-action detection, execution timeouts, and run budgets.
- [x] Live read-only wait/completion smoke test.
- [ ] Integration scenarios: movement, mining, pickup, placement, chest inspection/deposit.
- [ ] Exact quantity transfers and verified task completion for supported goal types.
- [ ] Broader candidate generation, crafting, withdrawal, and bounded exploration.
- [ ] Persistent references for “this chest” and “this house”.
- [ ] Blueprint/desired-state representation for coherent construction.
- [ ] Evaluate which tasks actually require an explicit planner.

A model completion choice is a claim, not independent proof. Preserve that distinction in UI and evaluations. Raw traces are local/private by default and may contain player messages and coordinates.
