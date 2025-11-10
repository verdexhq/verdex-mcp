# Conceptual Tractability: The Deep Question

You're asking the right question. Let me help you think about this at a more fundamental level, independent of implementation details.

## The Core Theoretical Question

**Verdex worked because:**
- DOM exploration is fundamentally a **search problem in a known structure type**
- The structure type (tree) has well-defined traversal semantics
- The search goal is concrete: "find stable selector for this visible element"
- The search space is bounded by the tree

**Your question is:** 
> Is distributed systems debugging also fundamentally a search problem in a known structure type, or is it something else entirely?

Let me explore this through multiple lenses.

## Lens 1: What Kind of Problem Is This?

### Hypothesis Testing vs. Structure Discovery

**Verdex (DOM):** Pure structure discovery
- "I need to find this element" → traverse until found
- The answer EXISTS in the structure
- Following edges GUARANTEES you reach it
- No hypothesis needed, just traversal

**Distributed Systems Debugging:** Hypothesis testing + structure discovery
- "Why is this failing?" → must form hypothesis about cause
- The answer might NOT exist in the structure (root cause could be external: network, hardware, cosmic ray)
- Following edges gives you EVIDENCE, not ANSWERS
- You must INFER causation from correlation

**Critical distinction:**

```
DOM: "Follow parents until you find stable container"
     → Deterministic traversal to definitive answer

Distributed: "Follow parent spans until you find error origin"
             → Traversal shows WHERE error appeared, not WHY it happened
```

**Test this:** 
Can you define a set of traversal operations that are:
1. **Sufficient**: Always lead to root cause if executed correctly
2. **Necessary**: You can't skip them without missing information
3. **Composable**: Results from step N deterministically inform step N+1

If NO to any: You're not doing structure discovery, you're doing hypothesis-guided search.

**Implication if it's hypothesis-guided:**
- Your primitives need to return **evidence for/against hypotheses**, not just structural facts
- The LLM needs to maintain hypothesis space, not just follow edges
- Success criteria is "strong evidence" not "definitive answer"
- Progressive disclosure still works, but the GOAL is different

## Lens 2: The Isomorphism Question

For progressive disclosure to transfer from DOM → Distributed Systems, there must be a structural isomorphism.

### DOM's Structure

```
Tree with:
- Single root (html)
- Unambiguous edges (parent-child)
- Stable node properties (attributes)
- Meaningful depth (semantic nesting)
- Traversal semantics: up (ancestors), down (descendants), lateral (siblings)
```

### What's the Distributed Systems Equivalent?

You have multiple overlapping structures:

**Structure 1: Trace Trees**
```
Request flow:
  Root span
  ├─ Auth span
  ├─ Payment span
  │  ├─ DB query span
  │  └─ Fraud check span
  └─ Shipping span
```
This IS isomorphic to DOM ✅

**Structure 2: Service Dependency Graph**
```
User → API Gateway → Auth Service → Database
                   ↘ Payment Service ↗
```
This is NOT a tree (cycles possible, multiple paths) ❌

**Structure 3: Temporal Event Sequence**
```
T0: Deploy sha-abc
T1: Config change X
T2: First error appears
T3: Error rate spikes
T4: Auto-scaling triggered
```
This is linear, not tree-like ⚠️

**Structure 4: Causal Graph**
```
Deploy sha-abc → Schema change v13 → Validation requires 'riskScore'
                                    ↗
Risk-service not deployed → Field missing
```
This is a DAG, but YOU have to construct it (not given) ❌

**Critical insight:**

DOM has ONE underlying structure (the tree).

Distributed systems has MULTIPLE structures:
- Trace tree (given)
- Service graph (given) 
- Temporal sequence (given)
- Causal graph (inferred)

Progressive disclosure works when structure is GIVEN and you TRAVERSE it.

If you must CONSTRUCT the structure (causal graph), that's a different problem.

**The tractability question becomes:**

> Can I debug most incidents by traversing GIVEN structures (traces, service graph, time series)?

> Or do I need to CONSTRUCT causal graphs for most incidents?

## Lens 3: The Entropy Question

Information theory lens: How much uncertainty does progressive disclosure reduce per query?

### DOM Scenario

```
Initial state: "Find the 'Add to Cart' button for iPhone 15 Pro"
Uncertainty: ~100 buttons on page

Query 1: browser_snapshot()
→ Returns: 12 product cards visible
→ Uncertainty reduced to: ~12 buttons (8x reduction)

Query 2: resolve_container(target_button)
→ Returns: button is in product-card with data-testid
→ Uncertainty reduced to: 1 button (12x reduction)

Total: 100 → 1 in 2 queries (efficient)
```

### Distributed Systems Scenario

```
Initial state: "Why are 42% of payment requests failing?"
Uncertainty: ~infinite possible causes

Query 1: incident_overview()
→ Returns: Error spike in payments service, recent deploy
→ Uncertainty reduced to: ~10 plausible causes (deploy, config, dependency, resource, data)

Query 2: resolve_causality(failing_trace)
→ Returns: Error "missing field 'riskScore'" in payments span
→ Uncertainty reduced to: ~3 causes (upstream not providing field, field added to schema, validation logic changed)

Query 3: inspect_cohort(by: [deploy, region])
→ Returns: sha-abc in us-east has 42% errors, eu-west has 3%
→ Uncertainty reduced to: ~2 causes (deploy is bad in specific region, or region has different upstream)

Query 4+: Still need to understand WHY region-specific...
```

**Key difference:**

DOM: Each query typically reduces uncertainty by ~10x
Distributed: Each query reduces uncertainty by ~2-3x

**Why?**
- DOM queries return DEFINITIVE facts about structure
- Distributed queries return CORRELATIONS that require interpretation

**Implication:**
- Need MORE queries to reach conclusion
- Each query returns MORE ambiguous information  
- The LLM must do MORE inferential reasoning between queries

**Tractability test:**

Count queries needed to reach "actionable conclusion" for 10 real incidents.

If average < 5 queries: ✅ Efficient enough
If average 5-10 queries: ⚠️ Marginal
If average > 10 queries: ❌ Too many round trips

## Lens 4: The Composition Question

Can primitives compose "naturally" or do you need orchestration logic?

### Natural Composition (DOM)

```
Tool outputs contain exactly what next tool needs:

snapshot() → returns refs
            ↓
resolve_container(ref) → returns levels
                        ↓
inspect_pattern(ref, level) → returns sibling refs
                              ↓
extract_anchors(sibling_ref) → returns unique attributes

Linear composition, no branching logic needed.
```

### Your Distributed System Design

```
incident_overview() → returns anomalies[], deploys[], service_graph
                     ↓
                     ? Which to follow first?
                     ↓
resolve_causality(anomaly.sample_trace) → returns span_facts[]
                                         ↓
                                         ? What do span facts tell us?
                                         ↓
inspect_cohort(span, by: ???) → returns buckets[]
                                ↓
                                ? Do buckets suggest deploy issue? Region issue? Both?
                                ↓
                          ┌─────┴─────┐
                          ↓           ↓
                 diff_deploy()   get_resource_state()
```

**Key difference:**

DOM: Output N deterministically points to input N+1

Distributed: Output N requires INTERPRETATION to decide input N+1

**This means:**

You're not just building primitives, you're building:
1. Primitives (return facts)
2. Skills (teach interpretation)
3. **Decision logic** (when to branch, when to terminate)

**Tractability question:**

Can Skills encode the decision logic in a way that:
- Works across diverse incident types?
- Doesn't require hardcoded decision trees?
- The LLM can actually follow reliably?

**Test this:**

Write pseudo-code for "incident investigation" as a flowchart.

If flowchart has < 5 decision points: ✅ Skills can encode this
If flowchart has 10-20 decision points: ⚠️ Complex but possible  
If flowchart is dense with cross-cutting concerns: ❌ Too complex for prompt-based guidance

## Lens 5: The Grounding Question

**Grounding = Can the LLM connect abstract facts to concrete actions?**

### DOM (Strong Grounding)

```
Tool returns: { tag: "button", text: "Add to Cart" }

LLM interprets: "This is the button the user wants to click"

Why grounded: User can SEE the button, semantics are clear, interpretation matches reality
```

### Distributed Systems (Weak Grounding?)

```
Tool returns: { 
  errorRate: 0.42, 
  deploy: "sha-abc", 
  delta: 32 
}

LLM interprets: "Deploy sha-abc caused the error spike"

Why not grounded: 
- LLM doesn't understand what "error rate 0.42" means in business context
- "delta: 32" could be severe or normal depending on service
- "deploy sha-abc" is just correlation, not proven causation
```

**Critical difference:**

DOM debugging has VISUAL grounding: user sees element, LLM helps select it

Distributed debugging has NO grounding: LLM must interpret abstract metrics without domain context

**This creates a tractability question:**

Can you provide enough context in Skills for LLM to interpret metrics correctly?

**Example:**

```yaml
# Skill must encode domain knowledge:
interpretation_guides:
  error_rate:
    - 0.01 (1%): Normal baseline for most services
    - 0.05 (5%): Elevated, worth monitoring
    - 0.10 (10%): High, investigate if sustained
    - 0.20+ (20%+): Critical, immediate action
    
  delta:
    - 1.5x: Noticeable change
    - 5x: Significant anomaly
    - 10x+: Severe incident
```

**But this is domain-specific!**

Payment service might have different thresholds than logging service.

**Tractability question:**

Is there enough UNIVERSAL structure that you can build generic primitives?

Or is too much domain-specific that you need per-service/per-company customization?

## The Fundamental Tractability Test

Here's the deepest test I can think of:

### The Human Expert Test

1. **Record a human expert investigating an incident**
   - What questions do they ask?
   - What tools do they use?
   - What information do they gather at each step?

2. **Map to your primitives**
   - Can each human question be answered by a primitive?
   - Are there questions that require multiple primitives?
   - Are there questions your primitives can't answer?

3. **Check the composition pattern**
   - Does the expert follow a LINEAR sequence? (good for progressive disclosure)
   - Or do they jump around, backtrack, pursue parallel threads? (bad for progressive disclosure)

4. **Measure the interpretation load**
   - How much domain knowledge does the expert apply?
   - Is it codifiable in Skills?
   - Or is it tacit/experiential?

**If you find:**
- ✅ Expert asks ~5 questions in mostly linear sequence
- ✅ Questions map cleanly to your primitives
- ✅ Domain knowledge is explicit and codifiable
- ✅ Expert explains reasoning clearly

**Then:** Progressive disclosure is tractable ✅

**If you find:**
- ❌ Expert asks 20+ questions with lots of branching
- ❌ Questions require combining multiple backend systems
- ❌ Domain knowledge is tacit ("I just know this service behaves weirdly")
- ❌ Expert can't articulate why they chose next step

**Then:** Progressive disclosure might not be tractable ❌

## My Synthesis: The Tractability Hypothesis

Based on deep analysis, here's my hypothesis:

**Progressive disclosure is tractable for distributed systems debugging IF AND ONLY IF:**

1. **Structural Constraint**: You restrict to incident types where causality follows observable structure
   - Trace-contained failures ✅
   - Single-service failures ✅
   - Cross-service failures with clear dependency chains ✅
   - Global system failures ❌
   - Emergent behavior from complex interactions ❌

2. **Scope Constraint**: You scope to "first-level" root cause finding
   - "Which deploy/config/service caused this?" ✅
   - "Why did this specific request fail?" ✅
   - "Why did the architect design it this way?" ❌
   - "What's the deep underlying architectural issue?" ❌

3. **Knowledge Constraint**: You can encode domain knowledge in Skills
   - Generic patterns (error spikes, latency regressions) ✅
   - Service-specific thresholds ⚠️
   - Company-specific practices ⚠️
   - Tacit expertise ❌

4. **Composition Constraint**: Investigation follows mostly-linear workflow
   - 70%+ of incidents: Overview → Causality → Cohort → Anchor ✅
   - 20% of incidents: Branching/backtracking needed ⚠️
   - 10% of incidents: Non-linear exploration ❌

**Prediction:**

If you build this, you'll find:
- It works GREAT for 40-60% of incidents (trace-based, single-service)
- It works OK for 20-30% of incidents (needs iteration/backtracking)
- It fails for 10-20% of incidents (requires global context or tacit knowledge)

**That's actually good enough!**

If you can solve 60% of incidents with 5-7 tool calls vs. dumping 150KB of traces, that's huge value.

## The Actual Evaluation Plan

Given all of this theoretical analysis, here's what I'd actually do:

### Week 1: Shadow Human Experts

- Watch 10 incident investigations by senior engineers
- Record every question they ask
- Document what information they need
- Map their workflow to your primitive concepts

**Pass criteria:** 70%+ of questions map to your primitives, workflow is mostly linear

### Week 2: Mock Primitive Validation

- Build mocks that return realistic data
- Give them to GPT-4 with Skills
- Run on 10 past incidents
- See if LLM can reach correct conclusion

**Pass criteria:** 60%+ incidents diagnosed correctly, using <10 tool calls

### Week 3: Entropy Measurement

- For the successful cases from Week 2
- Measure uncertainty reduction per query
- Calculate: queries needed to reach 95% confidence

**Pass criteria:** Average <7 queries to reach actionable conclusion

### Week 4: Failure Mode Analysis

- For the unsuccessful cases from Week 2
- Categorize: What kind of problem was it?
  - Structural (can't follow edges to answer)
  - Compositional (LLM couldn't decide next step)
  - Grounding (LLM misinterpreted facts)
  - Knowledge (domain expertise needed)

**Pass criteria:** Failure modes are addressable (better Skills, more primitives) not fundamental (wrong paradigm)

**Total: 1 month to know if this is tractable**

If all four weeks pass criteria → Build it
If weeks 1-2 fail → Wrong approach for this domain
If weeks 3-4 fail → Right approach, needs refinement

## The Bottom Line

Your question was: "Is this tractable?"

My answer: **It's tractable for a meaningful subset of incidents, but not all of them.**

The real question is: **Is that subset valuable enough?**

If solving 50-60% of incidents programmatically with AI is valuable, then yes, build this.

If you need to solve 90%+ of incidents, progressive disclosure alone won't get you there—you'll need hybrid approaches.

Does this conceptual framework help you evaluate tractability?