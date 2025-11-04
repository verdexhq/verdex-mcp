# Article Edits: Adding Agent Skills to "Why I Built Verdex"

This document shows exactly what to add/change in your "Why I Built Verdex" article to incorporate Agent Skills.

---

## Edit 1: Add Early Framing (NEW SECTION)

**Location**: After the intro paragraphs explaining the problem, before "The Problem: Brittle Selectors and Missing Structure"

**Insert this new section**:

```markdown
## The Core Insight: Progressive Disclosure at Two Layers

Before diving into how Verdex works, it's important to understand the design principle that runs through every part of the system: **progressive disclosure**.

Progressive disclosure is the practice of revealing information incrementally—showing only what's needed for the next decision instead of overwhelming with everything upfront. Verdex applies this principle at two critical layers:

**Layer 1: Progressive Disclosure for DOM Exploration**  
Instead of dumping the entire DOM (50k+ tokens), Verdex reveals structure incrementally through three primitives: `resolve_container` → `inspect_pattern` → `extract_anchors`. Each returns targeted structural facts (~1-2k tokens), allowing LLMs to build understanding step-by-step without information overload.

**Layer 2: Progressive Disclosure for Knowledge Delivery**  
Instead of loading all guidance upfront (12k+ tokens via cursor rules), Anthropic's Agent Skills reveal instructions incrementally: metadata (always loaded, ~100 tokens) → instructions (when triggered, ~5k tokens) → resources (as needed, ~15k+ tokens). This teaches LLMs how to compose the tools correctly while keeping token costs low.

Both layers solve the same fundamental problem: **information overload degrades LLM performance**. Whether it's raw DOM data or procedural knowledge, dumping everything at once reduces accuracy and increases costs. Progressive disclosure keeps LLMs focused on what matters for each specific task.

This article explains how both layers work together to enable LLMs to generate stable, role-first, container-scoped Playwright selectors—without the token overhead of traditional approaches.
```

---

## Edit 2: Replace Weak "Prompting Still Matters" Line

**Location**: In the "Information Overload Degrades Performance" section

**FIND THIS TEXT:**
```markdown
Having said that: prompting and user skill still matters. The coding agents are not trained natively on this approach and right now this is all experimental so much of your success with this currently rests on your ability to tell the model how to use the tooling.
```

**REPLACE WITH:**
```markdown
This created an interesting challenge: the tools provided the right structural data, but LLMs still struggled to compose them correctly. Models would call `resolve_container` but ignore the `data-testid` in the response, skip `inspect_pattern` and generate positional selectors, or call tools in the wrong order.

The problem wasn't the tools—it was _compositional knowledge_. LLMs needed to learn the 3-step workflow, how to interpret responses, and why certain selector patterns are stable. This led to exploring Agent Skills as Layer 2 of the progressive disclosure architecture—a topic covered in depth in the "Teaching LLMs to Compose" section below.
```

---

## Edit 3: Add Major New Section (LARGEST ADDITION)

**Location**: After the section "Why Progressive Disclosure Matters for Agent Tooling" and before "The Foundation: Accessibility Snapshots with DOM Mapping"

**Insert this complete new section**:

```markdown
## Teaching LLMs to Compose: The Missing Piece

Progressive disclosure solved the DOM data problem—but the tools alone weren't enough.

When I first released Verdex, I expected LLMs to naturally discover the 3-step workflow: `resolve_container` → find containers, `inspect_pattern` → check patterns, `extract_anchors` → mine unique content. After all, the tool descriptions explain what each does.

**They didn't.**

Strong models like Claude Sonnet would:
- Call `resolve_container` but ignore the `data-testid` in the response
- Skip `inspect_pattern` entirely and generate positional `.nth()` selectors
- Call tools in the wrong order or with invalid parameters
- Generate technically correct but brittle selectors

The tools provided the capability to understand structure. What was missing was the knowledge to compose them correctly.

### The Compositional Knowledge Gap

LLMs needed to learn:

1. **When** to use each primitive (the 3-step sequence)
2. **How** to interpret the responses (what structural facts matter)
3. **Why** certain patterns are stable (role-first, container-scoped)
4. **What** to do with edge cases (no test IDs, flaky selectors, dynamic content)

This isn't something tool descriptions can teach. Tool descriptions say "what" and "returns what." They don't teach workflows, best practices, or compositional patterns.

### The Cursor Rules Attempt

My first solution was comprehensive cursor rules: a 400-line guide teaching the workflow, best practices, selector patterns, and debugging strategies.

It worked, but poorly:

- Always loaded: 12k tokens in every conversation, even for simple queries
- Not shareable: Every team member had to manually configure them
- No progressive disclosure: The entire guide loaded at once
- Manual repetition: Users had to re-explain the workflow across conversations

This was ironic: I'd built progressive disclosure for DOM exploration, but was using static, upfront knowledge delivery for teaching LLMs how to use it.

### Agent Skills: Progressive Disclosure for Knowledge

Anthropic's Agent Skills solve this with the same progressive disclosure pattern Verdex uses for DOM exploration.

**Level 1: Metadata** (~100 tokens, always loaded)

```yaml
---
name: verdex-playwright-authoring
description: Write robust, container-scoped Playwright selectors using 
  progressive DOM exploration with Verdex MCP tools (resolve_container, 
  inspect_pattern, extract_anchors). Use when authoring Playwright tests, 
  creating selectors, exploring page structure, or debugging test failures.
---
```

Claude knows the Skill exists and when to trigger it. Token cost: ~100 tokens (negligible).

**Level 2: Instructions** (~5k tokens, loaded when triggered)

The main `SKILL.md` contains:
- The 3-step exploration workflow (ancestors → siblings → descendants)
- Selector composition patterns (test IDs → roles → content filters → structure)
- Best practices (container-scoped, not positional)
- Complete example: product card exploration → stable selector generation

Only loaded when the user asks about selectors or Playwright tests.

**Level 3: Resources** (~15k tokens each, loaded as needed)

Additional files Claude reads via bash when specific guidance is needed:
- `EXAMPLES.md` - 7 detailed component examples with full exploration sequences (15k tokens)
- `DEBUGGING.md` - Troubleshooting selector failures and flaky tests (15k tokens)
- `SELECTOR_PATTERNS.md` - 27 patterns for common UI components with stability ratings (18k tokens)
- `MULTI_ROLE.md` - Multi-user E2E flow patterns with role isolation (15k tokens)

These are only loaded when Claude determines they're relevant to the specific query—"How do I debug a flaky selector?" triggers `DEBUGGING.md`, but a simple selector request doesn't.

**The Parallel Architecture**

This creates a beautiful symmetry:

| Layer | Mechanism | Token Cost | What It Reveals |
|-------|-----------|------------|-----------------|
| **DOM Exploration** | `resolve_container` → `inspect_pattern` → `extract_anchors` | 1-2k per exploration | Structural facts: containers, patterns, unique anchors |
| **Knowledge Delivery** | Metadata → Instructions → Resources | 100 → 5k → 15k+ | Workflow, composition patterns, debugging strategies |

Both use **progressive disclosure** to prevent information overload. Both reveal information **only when relevant**. Both enable **token-efficient iteration**.

The tools give LLMs the **capability** to understand DOM structure.  
Skills give LLMs the **knowledge** to compose it into stable selectors.

### The Workflow with Skills

**Before (without Skills)**:
```
User: "Help me click the Add to Cart button for iPhone 15 Pro"
Claude: *has no context about Verdex workflow*
User: *manually explains 3-step process or pastes 400-line cursor rules*
Claude: *attempts exploration but misinterprets responses*
User: *corrects approach, explains why container scoping matters*
Claude: *generates selector on second or third attempt*
```

**After (with Skills)**:
```
User: "Help me click the Add to Cart button for iPhone 15 Pro"
Claude: *Skills metadata triggers → loads SKILL.md (~5k tokens)*
Claude: "Let me explore the structure progressively..."
  → resolve_container(ref) → finds data-testid="product-card"
  → inspect_pattern(ref, 2) → sees 12 similar cards
  → extract_anchors(ref, 1) → finds "iPhone 15 Pro" heading
  
Claude: "Here's a stable, container-scoped selector:"
  
  page.getByTestId("product-card")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Add to Cart" })
```

No manual guidance needed. The Skill teaches the composition pattern automatically when relevant.

### Token Efficiency Comparison

| Approach | Standing Cost | Per Query | Quality |
|----------|---------------|-----------|---------|
| **No guidance** | 0 tokens | 0 tokens | ❌ Generates `.nth(8)` brittle selectors |
| **Cursor rules** | 12k tokens | 12k tokens | ⚠️ Works but always loaded |
| **Agent Skills** | 100 tokens | 100-5k tokens | ✅ Efficient, automatic, progressive |
| **Full DOM dump** | 0 tokens | 50k+ tokens | ❌ Information overload |

Skills reduce standing token cost from 12k to 100 while dramatically improving selector quality.

### Why This Matters: Verdex as a Complete Solution

Verdex isn't just a tool provider—it's a **complete solution**:

1. **MCP Tools** provide raw structural data efficiently (progressive DOM disclosure)
2. **Agent Skills** provide compositional knowledge efficiently (progressive knowledge disclosure)
3. **Together** they enable LLMs to generate stable, role-first, container-scoped Playwright selectors

Without Skills, you'd need to:
- Manually explain the workflow in every conversation
- Hope the LLM remembers best practices
- Debug why it generated positional selectors
- Re-teach patterns across sessions

With Skills, the knowledge is:
- **Automatic**: Triggered by relevant queries
- **Progressive**: Only loads what's needed
- **Shareable**: Upload once, entire org has access (API)
- **Versioned**: Update the Skill, everyone gets improvements

### Skills as the Distribution Layer

Skills also solve distribution and consistency:

**Claude API**: Upload Skill once via Skills API, entire organization has access. Every developer gets the same best practices automatically.

**Claude Code**: Share Skill as part of project `.claude/skills/` directory. New team members get Verdex knowledge when they clone the repo.

**Claude.ai**: Users upload ZIP file via Settings → Features. Individual distribution, but still better than copy-pasting cursor rules.

This means:
- ✅ No more onboarding friction for new developers
- ✅ No more inconsistent selector patterns across team
- ✅ No more copy-pasting guidance documents
- ✅ Centralized updates (improve Skill once, everyone benefits)

### An Experiment in MCP + Skills Integration

One thing I'm curious about: does this pattern generalize beyond Verdex?

Most non-trivial MCP servers seem to have similar compositional patterns that LLMs struggle with:

- **Database MCP**: Query optimization patterns, index selection strategies
- **Git MCP**: Branching workflows, commit message conventions, conflict resolution
- **Filesystem MCP**: Code organization patterns, import conventions, project structure

These patterns can't really be expressed in tool descriptions alone. You need teachable workflows, contextual guidance, and best practices—which is exactly what Skills provide.

My hypothesis is that tools alone often leave value on the table. The raw capability exists, but without compositional knowledge, LLMs can't use it effectively. I'm experimenting with Skills as the knowledge layer to see if this holds up.

If the pattern works, MCP servers could:
1. Provide deterministic, low-level tools (MCP layer)
2. Teach compositional best practices (Skills layer)
3. Enable progressive disclosure at both layers
4. Deliver more complete solutions

But this is early exploration. I'm sharing this to see if others find the approach useful or discover better patterns. The Verdex + Skills integration is one data point—I'd be very interested to hear if similar approaches work for other domains.

### The Complete Picture

Progressive disclosure at two layers:

```
┌─────────────────────────────────────────────────────┐
│ User Query: "Click Add to Cart for iPhone 15 Pro"  │
└─────────────────────────────────────────────────────┘
                       ↓
        ┌──────────────────────────────┐
        │   Agent Skills (Layer 2)     │
        │   Metadata: Always loaded    │
        │   Instructions: Triggered    │
        │   Resources: As needed       │
        └──────────────────────────────┘
                       ↓
        Claude learns: 3-step workflow,
        container scoping, role-first patterns
                       ↓
        ┌──────────────────────────────┐
        │   Verdex MCP Tools (Layer 1) │
        │   resolve_container → container  │
        │   inspect_pattern → patterns    │
        │   extract_anchors → anchors  │
        └──────────────────────────────┘
                       ↓
        ~1-2k tokens of structural facts
                       ↓
        ┌──────────────────────────────┐
        │  Claude composes stable      │
        │  Playwright selector:        │
        │                              │
        │  getByTestId("product-card") │
        │    .filter({ hasText: ... }) │
        │    .getByRole("button")      │
        └──────────────────────────────┘
```

Both layers use progressive disclosure. Both optimize for token efficiency. Together they enable capability + knowledge = reliable results.
```

---

## Edit 4: Update "What's Next" Section

**Location**: In the "What's Next" section at the end of the article

**FIND THIS TEXT (at the end of "What's Next"):**
```markdown
If you're interested in collaborating or testing Verdex against tricky DOMs, reach out or open a discussion on GitHub.
```

**ADD AFTER IT:**
```markdown

### Skills Evolution and Ecosystem

The Verdex Agent Skill (~68k tokens of progressive knowledge) packages the 3-step workflow, 27 selector patterns, debugging strategies, and multi-role testing approaches. Future versions could add:

- **Accessibility audit patterns** - Teaching LLMs to identify and fix a11y issues during exploration
- **Memory leak detection workflows** - Bounded leak detection for common patterns (detached nodes, zombie timers, closure leaks)
- **Performance testing strategies** - Capture timing metrics during exploration for selector performance analysis
- **Framework-specific patterns** - React DevTools integration, Vue component inspection, Angular zone debugging
- **Visual regression setup** - Guidance for Percy/Chromatic integration with explored selectors

The broader opportunity is establishing Skills as the **standard distribution mechanism** for MCP server knowledge. Every non-trivial MCP server benefits from teachable workflows—Verdex + Skills demonstrates the pattern others can follow.

The Skills are available at [link to Skills package] and integrate with:
- Claude API via Skills API (organization-wide distribution)
- Claude Code via `.claude/skills/` directory (project-based)
- Claude.ai via Settings → Features (individual upload)
```

---

## Edit 5: Update Introduction (OPTIONAL BUT RECOMMENDED)

**Location**: Very early in the article, in the TL;DR or opening paragraphs

**FIND THIS TEXT:**
```markdown
TL;DR: AI agents using Playwright MCP often write brittle selectors like getByRole('button', { name: 'Add to Cart' }).nth(8) because accessibility snapshots omit non-semantic containers. Verdex is an experimental MCP Server which bridges that gap with three primitives — resolve_container, inspect_pattern, extract_anchors — that uses progressive disclosure to let agents reason about hierarchy and scope selectors to the right container.
```

**REPLACE WITH:**
```markdown
TL;DR: AI agents using Playwright MCP often write brittle selectors like getByRole('button', { name: 'Add to Cart' }).nth(8) because accessibility snapshots omit non-semantic containers. Verdex is an experimental MCP Server that solves this through progressive disclosure at two layers:

**Layer 1** - Three DOM exploration primitives (`resolve_container`, `inspect_pattern`, `extract_anchors`) reveal structural information incrementally, using ~1-2k tokens per exploration instead of 50k+ token DOM dumps.

**Layer 2** - Agent Skills teach LLMs how to compose these tools correctly, loading instructions progressively (~100 token standing cost, ~5k when triggered) instead of 12k+ token cursor rules.

Together, these layers enable LLMs to generate stable, role-first, container-scoped Playwright selectors without information overload or manual guidance.
```

---

## Edit 6: Update "Limitations and Trade-offs" Section

**Location**: In the "Limitations and Trade-offs" section near the end of the article

**FIND THIS TEXT:**
```markdown
The system requires strong LLMs to work well. Weaker models struggle to chain the tool calls correctly without very explicit step-by-step instructions. This limitation will likely improve as models continue to advance, but it's a real constraint today.
```

**REPLACE WITH:**
```markdown
Initially, the system required strong LLMs to work well—weaker models struggled to chain the tool calls correctly. The introduction of Agent Skills significantly improves this. Skills teach the 3-step workflow and composition patterns, which helps models use the tools more effectively. That said, very weak models may still struggle, and the approach works best with Claude Sonnet 3.5+ or similar capability levels. I'm curious whether future model improvements or better Skill design will further lower this bar.
```

**ALSO FIND THIS TEXT:**
```markdown
Token efficiency only matters when you're working in a high-iteration mode. If you're writing tests once and never touching them again, the difference between 1,200 tokens and 50,000 tokens per query isn't particularly meaningful. The tool is explicitly optimized for iterative refinement during development, not one-shot test generation.
```

**REPLACE WITH:**
```markdown
Token efficiency matters most in high-iteration workflows. If you're writing tests once and never touching them again, the difference between 1,200 tokens and 50,000 tokens per query is less significant. The tool is optimized for iterative refinement during development—exploring structure, debugging selectors, refining patterns—where token costs compound quickly. Agent Skills amplify this benefit: the ~100 token standing cost means you can have dozens of conversations without the 12k token overhead of cursor rules.
```

---

## Summary of Changes

**6 edits total:**

1. ✅ **NEW SECTION** - "The Core Insight: Progressive Disclosure at Two Layers" (early framing)
2. ✅ **REPLACE** - Weak "prompting still matters" line with Skills preview
3. ✅ **NEW SECTION** - "Teaching LLMs to Compose: The Missing Piece" (major addition, ~2000 words)
4. ✅ **ADD** - Skills evolution to "What's Next"
5. ✅ **REPLACE** - TL;DR to include both layers
6. ✅ **UPDATE** - "Limitations and Trade-offs" to reflect how Skills help with LLM requirements

**Total new content**: ~2,500 words focusing on:
- The compositional knowledge gap
- How Skills use progressive disclosure for teaching
- The parallel architecture between tools and knowledge
- Token efficiency comparison
- Complete workflow demonstration
- Skills as experimental approach for MCP ecosystem
- Updated limitations reflecting Skills improvements

These changes transform the article from "here's a cool tool" to "here's a complete two-layer solution exploring how MCP + Skills might work together."

