/**
 * Manages bridge injection lifecycle via CDP (event-driven).
 */
import type { CDPSession } from "puppeteer";
import { BRIDGE_BUNDLE, BRIDGE_VERSION } from "./bridge-bundle.js";
import type { BridgeConfig, InjectorOptions } from "../browser/types/bridge.js";

export class BridgeInjector {
  private worldName: string;
  private config: BridgeConfig;

  private mainFrameId: string | null = null;
  private contextId: number | null = null; // executionContextId for our world
  private bridgeObjectId: string | null = null; // created instance
  private contextReadyResolvers: Array<() => void> = [];
  private scriptId: string | null = null; // addScriptToEvaluateOnNewDocument identifier
  private manualInjectionMode = false; // Fallback for very old Chromium
  private listeners: Array<{ event: string; handler: Function }> = []; // Track listeners for cleanup

  constructor(options: InjectorOptions = {}) {
    this.worldName = options.worldName ?? "verdex_isolated";
    this.config = options.config ?? {};
    if (options.mainFrameId) this.mainFrameId = options.mainFrameId;
  }

  private addListener(cdp: CDPSession, event: string, handler: Function) {
    (cdp as any).on(event, handler);
    this.listeners.push({ event, handler });
  }

  async setupAutoInjection(
    cdp: CDPSession,
    mainFrameId: string
  ): Promise<void> {
    this.mainFrameId = mainFrameId;

    // 1) LISTENERS FIRST (Runtime emits existing contexts immediately after enable)

    // Listen for isolated world context creation (cross-document navigation creates new context)
    const onCtx = (evt: any) => {
      const ctx = evt.context;
      const aux = ctx.auxData ?? {};
      const matchesWorld =
        ctx.name === this.worldName || aux.name === this.worldName;
      const matchesTop = !this.mainFrameId || aux.frameId === this.mainFrameId;
      if (matchesWorld && matchesTop) {
        this.contextId = ctx.id;
        this.resolveContextReady();
      }
    };

    // Listen for same-document navigation (SPA routing like Remix)
    // Context stays alive, but we invalidate the bridge instance handle
    const onSameDoc = (evt: any) => {
      if (this.isTopFrame(evt.frameId)) {
        this.bridgeObjectId = null;
      }
    };

    // Listen for cross-document navigation to reset state
    // Puppeteer's page.waitForNavigation() handles timing, we just track state here
    const onCrossDocNav = (evt: any) => {
      if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {
        // Cross-document navigation destroys and recreates execution contexts
        // Reset our state; Runtime.executionContextCreated will fire with new context
        this.contextId = null;
        this.bridgeObjectId = null;
      }
    };

    this.addListener(cdp, "Runtime.executionContextCreated", onCtx);
    this.addListener(cdp, "Page.navigatedWithinDocument", onSameDoc);
    this.addListener(cdp, "Page.frameNavigated", onCrossDocNav);

    // 2) ENABLE DOMAINS
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

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

    // 4) FALLBACK: if our world hasn't appeared quickly, inject once for current doc
    let ctxAppeared = false;
    try {
      await this.waitForContextReady(500);
      ctxAppeared = true;
    } catch {
      /* timeout */
    }

    if (!ctxAppeared) await this.injectOnceIntoCurrentDoc(cdp);

    // 5) Manual reinjection mode ONLY if addScriptToEvaluateOnNewDocument unavailable
    if (this.manualInjectionMode) {
      const reinject = async (evt: any) => {
        if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {
          try {
            await this.injectOnceIntoCurrentDoc(cdp);
          } catch {}
        }
      };
      this.addListener(cdp, "Page.frameNavigated", reinject);
    }
  }

  private async injectOnceIntoCurrentDoc(cdp: CDPSession): Promise<void> {
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
      frameId: this.mainFrameId!,
      worldName: this.worldName,
      grantUniveralAccess: false, // CDP uses this spelling
    });
    await cdp.send("Runtime.evaluate", {
      expression: BRIDGE_BUNDLE,
      contextId: executionContextId,
      returnByValue: false,
    });
  }

  private isTopFrame(frameId?: string): boolean {
    return !!this.mainFrameId && frameId === this.mainFrameId;
  }

  private async waitForContextReady(timeoutMs = 3000): Promise<void> {
    // If we already have a context, return immediately
    if (this.contextId) return;

    // Otherwise, wait for Runtime.executionContextCreated event
    let timeoutHandle: NodeJS.Timeout | null = null;
    const p = new Promise<void>((resolve, reject) => {
      const done = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve();
      };
      this.contextReadyResolvers.push(done);
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Isolated world '${this.worldName}' not ready within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });
    return p;
  }

  private resolveContextReady() {
    const resolvers = this.contextReadyResolvers.splice(0);
    resolvers.forEach((fn) => fn());
  }

  async getBridgeHandle(cdp: CDPSession): Promise<string> {
    // If we have a cached bridge handle, check if it's still valid
    if (this.bridgeObjectId) {
      const alive = await this.healthCheck(cdp);
      if (alive) return this.bridgeObjectId;
      this.bridgeObjectId = null;
    }

    // Wait for isolated world context to be ready (if not already)
    await this.waitForContextReady();
    if (!this.contextId)
      throw new Error("No execution context available for the bridge world");

    // Verify factory exists and version matches
    const { result: factoryType } = await cdp.send("Runtime.evaluate", {
      expression: "typeof globalThis.__VerdexBridgeFactory__",
      contextId: this.contextId,
      returnByValue: true,
    });
    if (factoryType.value !== "object") {
      throw new Error(
        `Bridge factory not available in context (got: ${factoryType.value})`
      );
    }

    const { result: versionCheck } = await cdp.send("Runtime.evaluate", {
      expression: "globalThis.__VerdexBridgeFactory__?.version",
      contextId: this.contextId,
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
      contextId: this.contextId,
      returnByValue: false,
    });
    if (!result.objectId)
      throw new Error("Failed to create bridge instance (no objectId)");

    this.bridgeObjectId = result.objectId;
    return this.bridgeObjectId;
  }

  async callBridgeMethod<T = any>(
    cdp: CDPSession,
    method: string,
    args: any[] = []
  ): Promise<T> {
    const objectId = await this.getBridgeHandle(cdp);

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

  async healthCheck(cdp: CDPSession): Promise<boolean> {
    try {
      if (!this.contextId) return false;
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
          BRIDGE_VERSION
        )}; })()`,
        contextId: this.contextId,
        returnByValue: true,
      });
      return result.value === true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.contextId = null;
    this.bridgeObjectId = null;
  }

  async dispose(cdp: CDPSession): Promise<void> {
    // Remove auto-injected script
    if (this.scriptId) {
      try {
        await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: this.scriptId,
        } as any);
      } catch {
        /* ignore */
      }
      this.scriptId = null;
    }
    // Remove all registered listeners (critical: prevents memory leaks)
    for (const { event, handler } of this.listeners) {
      try {
        (cdp as any).off?.(event, handler) ??
          (cdp as any).removeListener?.(event, handler);
      } catch {}
    }
    this.listeners = [];
  }
}
