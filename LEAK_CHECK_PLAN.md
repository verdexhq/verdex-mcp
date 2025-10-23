## Verdex Leak Check Plan

Session-scoped memory leak detection for authoring reliability. Provides LLM agents with actionable insights to catch memory issues early and guide developers toward fixes. Metrics collection runs by default with zero page mutation; opt-in instrumentation available for deeper analysis. Aligns with Verdex's event-driven CDP lifecycle and named isolated worlds without changing existing tools.

---

### Goals

- **Surface authoring-time memory risks** that cause flakes (slow GC, retained detached DOM, zombie timers).
- **Enable LLM agents to provide actionable guidance** through structured, interpretable leak reports with pattern-matched fix suggestions.
- **Default-on metrics collection** with zero page mutation; opt-in instrumentation for deeper analysis only when needed.
- **Small, deterministic MCP primitives** returning compact JSON consumable by agents/LLMs.
- **Bounded overhead**; avoid full heap snapshots by default.

### Non-Goals (initial)

- Cross-origin iframe coverage (future: per-frame extension).
- Always-on profiling/production monitoring.
- Full heap snapshot analysis by default (opt-in only, manual investigations).

---

### User-Facing API (MCP tool surface)

```ts
export type LeakStartOptions = {
  sampling?: boolean;                 // Phase C: heap sampling (not full snapshots)
  mainWorldInstrumentation?: boolean; // Phase B: reversible page-world patching
  suspectsLimit?: number;             // default 20
};

export type LeakPoint = {
  label: string;
  ts: number;
  nodes: number;
  listeners?: number;     // when available
  jsHeapMB: number;
  taskDuration?: number;  // from Performance.getMetrics
};

export type LeakSuspect = {
  type: 'listener-retain' | 'timer-zombie' | 'closure-retain' | 'dom-detach';
  hint: string;           // short selector/function/file:line
  count?: number;
  retainedMB?: number;
};

export type LeakReport = {
  role: string;
  sessionId: string;
  state: 'inactive' | 'active';
  navsSeen: number;
  baseline: LeakPoint;
  marks: LeakPoint[];
  final: LeakPoint;
  delta: { nodes: number; jsHeapMB: number; listeners?: number };
  retainedDetachedNodes?: number;
  zombieTimers?: number;
  suspects: LeakSuspect[];
  samplingSummary?: { topAllocators: Array<{ func: string; allocMB: number }> };
};

export type LeakAPI = {
  leak_session_start(opts?: LeakStartOptions): Promise<{ sessionId: string; state: 'active' }>;
  leak_mark(label: string): Promise<LeakPoint>;
  leak_session_stop(): Promise<LeakReport>;
};
```

Behavior:
- **start while active**: reject or return the active `sessionId` (implementation choice).
- **mark while inactive**: reject.
- **stop**: always restore instrumentation (try/finally), return final report, transition to `inactive`.

---

### Architecture & Integration

- **Existing components**:
  - `src/multi-context-browser.ts` manages roles, pages, and CDP sessions.
  - `src/injection/BridgeInjector.ts` (per migration plan) auto-injects bundled bridge in a named isolated world, listens for `Runtime.executionContextCreated`, and guards navigation.

- **New orchestration (inside BridgeInjector)**:
  - Add a small `LeakSessionManager` to track state (`active/inactive`), options, `sessionId`, nav count, baseline/marks, suspects.
  - Perform CDP calls for metrics and optional heap sampling.
  - Apply/restore main-world instrumentation only while the session is active.
  - Reapply main-world instrumentation on new default-context creation during navigation while active.

- **MultiContextBrowser integration**:
  - Add thin wrappers that delegate to the role’s `bridgeInjector`:
    - `leak_session_start(opts?: LeakStartOptions)`
    - `leak_mark(label: string)`
    - `leak_session_stop()`
  - Include the role name in reports; reuse existing navigation guards.

---

### Execution Context Handling

- Continue to `Runtime.enable` and listen for `Runtime.executionContextCreated`.
- Detect main-world contexts via `auxData.frameId === mainFrameId` and default-world checks (`auxData.type === 'default'` or `auxData.isDefault === true` or empty `context.name`).
- When `mainWorldInstrumentation` is enabled and a session is active:
  - Inject patch into the current main world via `Runtime.evaluate` (not `addScriptToEvaluateOnNewDocument`).
  - Reapply automatically on subsequent default main-world contexts created after navigation.

---

### Operational Flow

#### Phase A — Metrics-only (default off; zero page mutation)

- start:
  - `HeapProfiler.enable`
  - `HeapProfiler.collectGarbage`
  - Read `Memory.getDOMCounters`, `Performance.getMetrics` (extract `JSHeapUsedSize`, `TaskDuration`), best-effort `performance.memory.usedJSHeapSize` via `Runtime.evaluate`.
  - Record `baseline`.
- mark:
  - GC → read metrics → return `LeakPoint`.
- stop:
  - GC → read metrics → compute `delta` → return `LeakReport` (no suspects).

Estimated overhead: ~10–40 ms per mark/stop.

#### Phase B — Opt-in main-world instrumentation (reversible)

- Strategy:
  - Do not use `Page.addScriptToEvaluateOnNewDocument` for these patches (avoid persistence beyond session).
  - On session start with `mainWorldInstrumentation: true`, inject an idempotent patch into the current default main world via `Runtime.evaluate`.
  - While active, re-inject on each newly created default main-world context.
- Patch responsibilities (minimal):
  - Wrap `EventTarget.prototype.addEventListener/removeEventListener` to aggregate counts by a precomputed hint string (e.g., `[data-testid="…"]`, `#id`, tag). Do not store DOM nodes.
  - Wrap `setTimeout/clearTimeout`, `setInterval/clearInterval` to track outstanding timers and identify long-running intervals (zombies).
  - Use a `MutationObserver` to count removed nodes; store counters/hints only.
  - Expose a probe on a namespaced `Symbol` (e.g., `globalThis[Symbol.for('__verdexLeakProbe__')]`) that returns counts/top‑K suspects and a `restore()` function to revert prototypes and clear state.
- mark/stop (if active): call the probe; merge bounded suspects into the report (`suspectsLimit`).

#### Phase C — Opt-in heap sampling (no snapshots by default)

- start: `HeapProfiler.startSampling({ samplingInterval?: default })`.
- stop: `HeapProfiler.stopSampling()` → reduce to top‑N allocators `{ functionName, scriptId:line, allocMB }` → `samplingSummary`.
- Full heap snapshots excluded by default; consider later as separate opt‑in.

---

### CDP Calls Summary

- Always (active session):
  - `HeapProfiler.enable` (once), `HeapProfiler.collectGarbage` (per point)
  - `Memory.getDOMCounters`
  - `Performance.getMetrics`
  - Best-effort `Runtime.evaluate('performance.memory?.usedJSHeapSize')`
- Phase B (optional):
  - `Runtime.evaluate` to inject/restore main-world patches
  - Optional: `DOMDebugger.getEventListeners` on a few suspect elements for validation
- Phase C (optional):
  - `HeapProfiler.startSampling` / `HeapProfiler.stopSampling`

Compatibility: If `runImmediately` is unavailable on `Page.addScriptToEvaluateOnNewDocument`, this plan is unaffected (instrumentation uses `Runtime.evaluate`).

---

### Data Model & Heuristics

- Default thresholds (tunable):
  - Flag if `delta.nodes > 300` or `delta.jsHeapMB > 10` after GC.
  - Flag if `listeners` grows by > 50 (when available).
  - Consider intervals > 30s as potential zombie timers.
  - Cap suspects with `suspectsLimit` (default 20) using short, stable hints.

Example report (abbreviated):

```json
{
  "role": "admin",
  "sessionId": "lk_01H...",
  "navsSeen": 3,
  "baseline": { "label": "baseline", "nodes": 1845, "jsHeapMB": 38.2, "ts": 1730 },
  "final":    { "label": "final",    "nodes": 2310, "jsHeapMB": 54.7, "ts": 1950 },
  "delta":    { "nodes": 465, "jsHeapMB": 16.5 },
  "retainedDetachedNodes": 73,
  "zombieTimers": 5,
  "suspects": [
    { "type": "listener-retain", "hint": "[data-testid=product-card]", "count": 12 },
    { "type": "closure-retain",  "hint": "CartStore.subscribe:42",     "retainedMB": 4.1 }
  ],
  "samplingSummary": { "topAllocators": [ { "func": "renderItem@grid.tsx:118", "allocMB": 6.4 } ] }
}
```

---

### Integration Details

#### MultiContextBrowser

- Add methods forwarding to the role’s `bridgeInjector`:
  - `leak_session_start(opts?: LeakStartOptions)`
  - `leak_mark(label: string)`
  - `leak_session_stop()`
- Include `currentRole` in report fields; reuse injector’s nav guard.

#### BridgeInjector

- Internal state:
  - `leakSession?: { sessionId: string; options: LeakStartOptions; active: boolean; baseline?: LeakPoint; marks: LeakPoint[]; suspects: LeakSuspect[]; navsSeen: number }`
- Event wiring:
  - On `Page.frameNavigated` / `Runtime.executionContextCreated` (top frame default world), if `leakSession.active && options.mainWorldInstrumentation`, re-inject the main-world patch.
- Methods:
  - `startLeakSession` → enable domains, compute baseline, optionally inject instrumentation, optionally start sampling.
  - `markLeakPoint` → GC + metrics (+ probe), push mark.
  - `stopLeakSession` → GC + metrics (+ probe), optionally stop sampling, compute deltas, restore prototypes, clear state, return `LeakReport`.
- Errors:
  - All `stopLeakSession` paths must attempt restoration in `try/finally`.
  - Reject invalid state transitions with clear errors.

---

### Security & Isolation

- Default: no page-world mutation.
- Main-world patches:
  - Idempotent (guard symbol), reversible (`restore()`), session-scoped.
  - Namespaced via `Symbol.for` keys; no predictable globals.
  - Avoid DOM references (aggregate by hint strings only).
- Bridge factory remains isolated in the named world.

---

### Performance Budgets

- Metrics mark/stop: ~10–40 ms typical.
- Probe call: small (< 2 ms), bounded payload (< 10 KB).
- Sampling: modest cost; disabled by default.
- Full snapshots: excluded by default in MCP flows.

---

### Testing Strategy

- Unit (patch module):
  - Double-apply patch → no change; `restore()` twice → safe.
  - Probe returns bounded payload and no DOM references.
  - Works without `performance.memory`.
- Integration (CDP):
  - Metrics round-trip across hard/soft nav; stable post-GC deltas.
  - Re-injection on new main-world contexts while active.
  - No residual patching after `stop()`.
- E2E:
  - Modal open/close loop shows retained detached nodes on intentional leaks.
  - Zombie intervals detected across route changes.
  - No-leak baseline within noise (< 50 nodes, < 3 MB).

---

### Rollout Plan (phased)

- **Phase A (MVP)**: Metrics-only session; no page mutation.
- **Phase B (opt-in)**: Reversible main-world instrumentation with suspects/hints; reapply on nav while active.
- **Phase C (opt-in)**: Heap sampling summary; top‑N allocators in report.

Milestones:
- M1: API + metrics end-to-end, docs, acceptance tests.
- M2: Main-world instrumentation with reapply-on-nav and restoration.
- M3: Sampling support and summarized allocators.

---

### Risks & Mitigations

- GC nondeterminism → always measure post-GC; treat Finalization signals (if used) as hints only.
- Listener visibility across realms → addressed via opt-in main-world patch or targeted `DOMDebugger.getEventListeners` validation.
- Navigation races → reuse injector’s nav guard; reapply patches after default-world context creation.
- Compatibility variance → best-effort metrics; degrade gracefully without `performance.memory`.

---

### Developer Notes

- Aggregate by hint strings (e.g., `[data-testid]`, `#id`, tag) to avoid DOM references and enable enumeration.
- Keep suspects top‑K (min-heap or capped `Map`) to bound payload size.
- Validate hints sparingly with `DOMDebugger.getEventListeners` on at most N elements.
- Keep patch module small, idempotent, and fully restorable.

---

### Positioning Benefit

Verdex extends from selector intelligence to an authoring reliability platform: in addition to stable selectors and structural analysis, engineers and agents can catch silent memory regressions during authoring, reducing flakes and shortening feedback loops.


