/**
 * Manages bridge injection lifecycle via CDP (event-driven).
 */
import type { CDPSession } from "puppeteer";
import { BRIDGE_BUNDLE, BRIDGE_VERSION } from "./bridge-bundle.js";
import type { BridgeConfig, InjectorOptions } from "../browser/types/bridge.js";
import { ManualPromise } from "../utils/ManualPromise.js";
import { FrameDetachedError, FrameInjectionError } from "../shared-types.js";
import { logAndContinue } from "../utils/logging.js";

// NEW: Multi-frame state structure
type FrameState = {
  frameId: string;
  contextId: number;
  bridgeObjectId: string;
  contextReadyPromise: ManualPromise<void>;
};

export class BridgeInjector {
  private worldName: string;
  private config: BridgeConfig;

  // Multi-frame state management
  private frameStates = new Map<CDPSession, Map<string, FrameState>>();

  // Session-level state (not frame-specific)
  private scriptId: string | null = null; // addScriptToEvaluateOnNewDocument identifier
  private manualInjectionMode = false; // Fallback for very old Chromium
  private listeners: Array<{ event: string; handler: Function }> = []; // Track listeners for cleanup

  constructor(options: InjectorOptions = {}) {
    this.worldName = options.worldName ?? "verdex_isolated";
    this.config = options.config ?? {};
  }

  private addListener(cdp: CDPSession, event: string, handler: Function) {
    (cdp as any).on(event, handler);
    this.listeners.push({ event, handler });
  }

  /**
   * Setup automatic bridge injection for all frames in a page.
   *
   * This method establishes an event-driven lifecycle for bridge management:
   *
   * **Event Coordination**:
   * 1. Listeners registered BEFORE enabling domains (prevents race conditions)
   * 2. Domains enabled (triggers existing context events)
   * 3. Auto-injection script registered for new documents
   * 4. Main frame injection as fallback
   *
   * **Navigation Patterns Handled**:
   * - Cross-document navigation: Destroys & recreates contexts
   * - Same-document navigation (SPA): Context survives, bridge instance invalidated
   * - Frame attach/detach: Lazy injection on first use
   *
   * **Why ManualPromise?**:
   * - Allows event handlers to resolve promises awaited elsewhere
   * - No polling or retries needed - purely event-driven
   * - Idempotent - multiple awaits on same promise are safe
   *
   * @param cdp - CDP session for this page
   * @param mainFrameId - ID of the main frame (from Page.getFrameTree)
   */
  async setupAutoInjection(
    cdp: CDPSession,
    mainFrameId: string
  ): Promise<void> {
    // 1) LISTENERS FIRST (Runtime emits existing contexts immediately after enable)

    // Listen for isolated world context creation (cross-document navigation creates new context)
    const onCtx = (evt: any) => {
      const ctx = evt.context;
      const aux = ctx.auxData ?? {};
      const frameId = aux.frameId;
      const matchesWorld =
        ctx.name === this.worldName || aux.name === this.worldName;

      // Populate frameStates for any frame with our world
      if (matchesWorld && frameId) {
        const frameState = this.getOrCreateFrameState(cdp, frameId);
        frameState.contextId = ctx.id;
        frameState.contextReadyPromise.resolve();
      }
    };

    // Listen for same-document navigation (SPA routing like Remix)
    // Context stays alive, but we invalidate the bridge instance handle
    const onSameDoc = (evt: any) => {
      // Invalidate bridge instance for navigated frame
      const sessionStates = this.frameStates.get(cdp);
      const state = sessionStates?.get(evt.frameId);
      if (state) {
        state.bridgeObjectId = ""; // Clear cached instance, keep context
      }
    };

    // Listen for cross-document navigation to reset state
    // Puppeteer's page.waitForNavigation() handles timing, we just track state here
    const onCrossDocNav = (evt: any) => {
      if (evt.frame && !evt.frame.parentId) {
        // Cross-document navigation destroys and recreates execution contexts
        // Clear frame state; Runtime.executionContextCreated will fire with new context
        const sessionStates = this.frameStates.get(cdp);
        if (sessionStates) {
          sessionStates.delete(evt.frame.id);
        }
      }
    };

    this.addListener(cdp, "Runtime.executionContextCreated", onCtx);
    this.addListener(cdp, "Page.navigatedWithinDocument", onSameDoc);
    this.addListener(cdp, "Page.frameNavigated", onCrossDocNav);

    // NEW: Frame lifecycle listeners for multi-frame support
    // Lazy injection pattern: Only track frame, don't inject until needed
    const onFrameAttached = (evt: any) => {
      // Just create placeholder state - injection happens on-demand via ensureFrameState
      this.getOrCreateFrameState(cdp, evt.frameId);
    };

    const onFrameDetached = (evt: any) => {
      const sessionStates = this.frameStates.get(cdp);
      if (sessionStates) {
        const state = sessionStates.get(evt.frameId);
        if (state && !state.contextReadyPromise.isDone()) {
          state.contextReadyPromise.reject(new FrameDetachedError(evt.frameId));
        }
        sessionStates.delete(evt.frameId);
      }
    };

    this.addListener(cdp, "Page.frameAttached", onFrameAttached);
    this.addListener(cdp, "Page.frameDetached", onFrameDetached);

    // 2) ENABLE DOMAINS
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable"); // For frame resolution via DOM.describeNode

    // 3) REGISTER FOR NEW DOCS — Three-tier fallback
    try {
      const { identifier } = await cdp.send(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source: BRIDGE_BUNDLE,
          worldName: this.worldName,
          runImmediately: true,
        } as any
      );
      this.scriptId = identifier;
    } catch {
      try {
        const { identifier } = await cdp.send(
          "Page.addScriptToEvaluateOnNewDocument",
          {
            source: BRIDGE_BUNDLE,
            worldName: this.worldName,
          } as any
        );
        this.scriptId = identifier;
      } catch {
        // Very old Chromium: fallback to manual per-navigation reinjection
        this.manualInjectionMode = true;
      }
    }

    // 4) FALLBACK: Ensure main frame has bridge injected
    try {
      await this.ensureFrameState(cdp, mainFrameId);
    } catch (error) {
      // If main frame injection fails, that's a critical error
      throw new Error(
        `Failed to inject bridge into main frame: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // 5) Manual reinjection mode ONLY if addScriptToEvaluateOnNewDocument unavailable
    if (this.manualInjectionMode) {
      const reinject = async (evt: any) => {
        // Only reinject in main frame (top-level, no parent)
        if (evt.frame && evt.frame.id === mainFrameId && !evt.frame.parentId) {
          try {
            // Use ensureFrameState for consistency
            await this.ensureFrameState(cdp, evt.frame.id);
          } catch {}
        }
      };
      this.addListener(cdp, "Page.frameNavigated", reinject);
    }
  }

  async getBridgeHandle(cdp: CDPSession, frameId: string): Promise<string> {
    // Ensure frame has isolated world and bridge bundle injected
    const state = await this.ensureFrameState(cdp, frameId);

    // If we have a cached bridge instance handle, return it
    if (state.bridgeObjectId) {
      return state.bridgeObjectId;
    }

    // Verify factory exists and version matches
    const { result: factoryType } = await cdp.send("Runtime.evaluate", {
      expression: "typeof globalThis.__VerdexBridgeFactory__",
      contextId: state.contextId,
      returnByValue: true,
    });
    if (factoryType.value !== "object") {
      throw new Error(
        `Bridge factory not available in context (got: ${factoryType.value})`
      );
    }

    const { result: versionCheck } = await cdp.send("Runtime.evaluate", {
      expression: "globalThis.__VerdexBridgeFactory__?.version",
      contextId: state.contextId,
      returnByValue: true,
    });
    if (versionCheck.value !== BRIDGE_VERSION) {
      throw new Error(
        `Bridge version mismatch in context: got ${versionCheck.value}, expected ${BRIDGE_VERSION}`
      );
    }

    // Create bridge instance
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(function(config){ return globalThis.__VerdexBridgeFactory__.create(config); })(${JSON.stringify(
        this.config
      )})`,
      contextId: state.contextId,
      returnByValue: false,
    });
    if (!result.objectId)
      throw new Error("Failed to create bridge instance (no objectId)");

    state.bridgeObjectId = result.objectId;
    return state.bridgeObjectId;
  }

  async callBridgeMethod<T = any>(
    cdp: CDPSession,
    method: string,
    args: any[],
    frameId: string
  ): Promise<T> {
    const objectId = await this.getBridgeHandle(cdp, frameId);

    const response = await cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: `
        function(...args) {
          const fn = this?.[${JSON.stringify(method)}];
          if (typeof fn !== 'function') throw new Error('Bridge method not found: ' + ${JSON.stringify(
            method
          )});
          return fn.apply(this, args);
        }
      `,
      objectId,
      arguments: args.map((v) => ({ value: v })),
      returnByValue: true,
      awaitPromise: true, // Handle async bridge methods correctly
    });

    if ((response as any).exceptionDetails) {
      const d = (response as any).exceptionDetails;
      throw new Error(
        d.exception?.description || d.text || "Bridge method call failed"
      );
    }

    return (response as any).result.value as T;
  }

  async healthCheck(cdp: CDPSession, frameId: string): Promise<boolean> {
    try {
      const state = this.getFrameState(cdp, frameId);
      if (!state?.contextId) return false;

      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
          BRIDGE_VERSION
        )}; })()`,
        contextId: state.contextId,
        returnByValue: true,
      });
      return result.value === true;
    } catch {
      return false;
    }
  }

  // NEW: Multi-frame helper methods
  getFrameState(cdp: CDPSession, frameId: string): FrameState | undefined {
    return this.frameStates.get(cdp)?.get(frameId);
  }

  private getOrCreateFrameState(cdp: CDPSession, frameId: string): FrameState {
    let state = this.getFrameState(cdp, frameId);
    if (state) return state;

    const promise = new ManualPromise<void>();
    // Add a catch handler to prevent unhandled promise rejections
    // (callers who await it will still get the rejection)
    promise.catch(() => {
      // Silently ignore - awaiting callers will handle the error
    });

    state = {
      frameId,
      contextId: 0,
      bridgeObjectId: "",
      contextReadyPromise: promise,
    };

    if (!this.frameStates.has(cdp)) {
      this.frameStates.set(cdp, new Map());
    }
    this.frameStates.get(cdp)!.set(frameId, state);

    return state;
  }

  /**
   * Ensure a frame has an isolated world with bridge injected.
   * This is LAZY - only injects when first called, not on frame attach.
   * Uses ManualPromise to wait for executionContextCreated event.
   *
   * No polling, no retries - event-driven and idempotent.
   */
  async ensureFrameState(
    cdp: CDPSession,
    frameId: string
  ): Promise<FrameState> {
    let state = this.getFrameState(cdp, frameId);

    // If bridge already exists, return immediately (idempotent)
    if (state?.contextReadyPromise.isDone() && state.bridgeObjectId) {
      return state;
    }

    // If injection is in-progress, wait for it
    if (state?.contextReadyPromise && !state.contextReadyPromise.isDone()) {
      try {
        await state.contextReadyPromise;
        return state;
      } catch (error) {
        // Promise was rejected while we were waiting (e.g. frame detached)
        // Clean up state and propagate error to caller
        const sessionStates = this.frameStates.get(cdp);
        if (sessionStates) {
          sessionStates.delete(frameId);
        }
        throw error;
      }
    }

    // If context ready but no bridge instance, we're in same-document navigation state
    // The isolated world context still exists, just need to ensure bundle is present
    if (state?.contextReadyPromise.isDone() && !state.bridgeObjectId) {
      try {
        // Context exists, verify bundle is still there or re-inject
        await cdp.send("Runtime.evaluate", {
          expression: BRIDGE_BUNDLE,
          contextId: state.contextId,
          returnByValue: false,
        });
        return state;
      } catch (error) {
        // Context was destroyed (shouldn't happen for same-doc nav, but handle gracefully)
        // Clean up and fall through to full re-injection
        const sessionStates = this.frameStates.get(cdp);
        if (sessionStates) {
          sessionStates.delete(frameId);
        }
        // Fall through to create new state
      }
    }

    // First call - create state and inject
    state = this.getOrCreateFrameState(cdp, frameId);

    try {
      // Create isolated world (will trigger executionContextCreated event)
      await cdp.send("Page.createIsolatedWorld", {
        frameId,
        worldName: this.worldName,
        grantUniveralAccess: false,
      });

      // Wait for executionContextCreated event to resolve the promise
      await state.contextReadyPromise;

      // Inject bundle (factory) into isolated world
      await cdp.send("Runtime.evaluate", {
        expression: BRIDGE_BUNDLE,
        contextId: state.contextId,
        returnByValue: false,
      });

      return state;
    } catch (error) {
      // Handle non-injectable frames gracefully (cross-origin, about:blank, etc.)
      const errorMsg = String(error);
      const isNonInjectable =
        errorMsg.includes("cross-origin") ||
        errorMsg.includes("about:blank") ||
        errorMsg.includes("Cannot find context") ||
        errorMsg.includes("No frame");

      if (isNonInjectable) {
        // Mark as failed so we don't retry - propagate error to caller
        // Only reject if not already settled (frameDetached event may have already rejected it)
        if (!state.contextReadyPromise.isDone()) {
          const injectionError = new FrameInjectionError(frameId, errorMsg);
          state.contextReadyPromise.reject(injectionError);
        }
        throw new FrameInjectionError(frameId, errorMsg);
      }

      // For real errors, clean up and allow retry
      const sessionStates = this.frameStates.get(cdp);
      if (sessionStates) {
        sessionStates.delete(frameId);
      }
      throw error;
    }
  }

  async dispose(cdp: CDPSession): Promise<void> {
    // Remove auto-injected script
    if (this.scriptId) {
      try {
        await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: this.scriptId,
        } as any);
      } catch (error) {
        logAndContinue(error, "BridgeInjector.dispose:removeScript");
      }
      this.scriptId = null;
    }

    // Remove all registered listeners (critical: prevents memory leaks)
    for (const { event, handler } of this.listeners) {
      try {
        (cdp as any).off?.(event, handler) ??
          (cdp as any).removeListener?.(event, handler);
      } catch (error) {
        logAndContinue(error, "BridgeInjector.dispose:removeListener");
      }
    }
    this.listeners = [];

    // Clean up frame states for this session (prevents memory leaks)
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      // Reject any pending frame state promises
      for (const [frameId, state] of sessionStates.entries()) {
        if (!state.contextReadyPromise.isDone()) {
          state.contextReadyPromise.reject(
            new Error(
              `Session disposed while frame ${frameId} was initializing`
            )
          );
        }
      }
      this.frameStates.delete(cdp);
    }
  }
}
