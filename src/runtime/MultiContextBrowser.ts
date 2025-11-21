import puppeteer, { Browser, BrowserContext, Page } from "puppeteer";
import {
  RoleContext,
  RolesConfiguration,
  GlobalRefIndex,
  RefIndexEntry,
  FailureLog,
} from "./types.js";
import { BridgeInjector } from "./BridgeInjector.js";
import {
  Snapshot,
  FrameDetachedError,
  NavigationError,
  UnknownRefError,
  AuthenticationError,
} from "../shared-types.js";
import { RefFormatter } from "../utils/RefFormatter.js";
import { logAndContinue } from "../utils/logging.js";

export class MultiContextBrowser {
  private browser: Browser | null = null;
  private _roleContexts = new Map<string, Promise<RoleContext>>();
  private currentRole: string = "default";
  private rolesConfig: RolesConfiguration | null = null;
  private bridgeConfig: Record<string, any> = {};

  /**
   * Set roles configuration from MCP server
   */
  setRolesConfiguration(config: RolesConfiguration): void {
    this.rolesConfig = config;
  }

  /**
   * Set bridge configuration programmatically.
   * This takes precedence over environment variables.
   *
   * @param config - Performance limits for bridge operations
   */
  setBridgeConfiguration(config: {
    maxDepth?: number;
    maxSiblings?: number;
    maxDescendants?: number;
  }): void {
    this.bridgeConfig = { ...config };
  }

  /**
   * Load bridge configuration from environment variables.
   * Environment variables only override values that weren't explicitly set.
   *
   * Precedence order:
   * 1. Programmatic config (via setBridgeConfiguration)
   * 2. Environment variables (BRIDGE_MAX_DEPTH, etc.)
   * 3. Default values (set in bridge creation)
   */
  private loadBridgeConfigFromEnv(): void {
    if (
      process.env.BRIDGE_MAX_DEPTH &&
      this.bridgeConfig.maxDepth === undefined
    ) {
      const parsed = parseInt(process.env.BRIDGE_MAX_DEPTH, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.bridgeConfig.maxDepth = parsed;
      }
    }

    if (
      process.env.BRIDGE_MAX_SIBLINGS &&
      this.bridgeConfig.maxSiblings === undefined
    ) {
      const parsed = parseInt(process.env.BRIDGE_MAX_SIBLINGS, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.bridgeConfig.maxSiblings = parsed;
      }
    }

    if (
      process.env.BRIDGE_MAX_DESCENDANTS &&
      this.bridgeConfig.maxDescendants === undefined
    ) {
      const parsed = parseInt(process.env.BRIDGE_MAX_DESCENDANTS, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.bridgeConfig.maxDescendants = parsed;
      }
    }
  }

  async initialize() {
    // Load bridge configuration from environment variables
    this.loadBridgeConfigFromEnv();

    // Close any existing browser if it exists
    if (this.browser) {
      try {
        await this.browser.version();
      } catch (error) {
        this.browser = null;
      }
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: { width: 1280, height: 720 },
      });
    }
  }

  /**
   * Get or create a role context with lazy initialization
   */
  async getOrCreateRole(role: string): Promise<RoleContext> {
    // Check if we already have a promise for this role
    if (!this._roleContexts.has(role)) {
      // Create and cache the promise (not the resolved value)
      this._roleContexts.set(role, this._createRoleContext(role));
    }

    try {
      const context = await this._roleContexts.get(role)!;

      // Update last used timestamp for cleanup
      context.lastUsed = Date.now();

      return context;
    } catch (error) {
      // CRITICAL: Clear failed promise so retry works
      this._roleContexts.delete(role);
      throw new Error(
        `Failed to create role '${role}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get the current context (lazy creation)
   */
  private async ensureCurrentRoleContext(): Promise<RoleContext> {
    try {
      return await this.getOrCreateRole(this.currentRole);
    } catch (error) {
      throw new Error(
        `Failed to ensure context for role '${this.currentRole}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Setup CDP session and create role context from browser context and page
   */
  private async _setupRoleContext(
    role: string,
    browserContext: BrowserContext,
    page: Page
  ): Promise<RoleContext> {
    // Get CDP session for this specific page
    const cdpSession = await page.createCDPSession();

    // Get main frame ID (needed for isolated world creation)
    const { frameTree } = await cdpSession.send("Page.getFrameTree");
    const mainFrameId = frameTree.frame.id;

    // Create bridge injector with salted world name
    const salt = (process.pid ?? Math.floor(Math.random() * 100000)) % 1000;
    const bridgeInjector = new BridgeInjector({
      worldName: `verdex_${role}_${salt}`,
      config: this.bridgeConfig,
    });

    // Setup auto-injection (registers listeners, enables domains, injects bundle)
    await bridgeInjector.setupAutoInjection(cdpSession, mainFrameId);

    // Get default URL from configuration if available
    const defaultUrl = this.rolesConfig?.roles[role]?.defaultUrl;

    // Create the context object
    const context: RoleContext = {
      role,
      browserContext,
      page,
      cdpSession,
      bridgeInjector,
      mainFrameId,
      defaultUrl,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      hasNavigated: false, // Track if this context has been navigated
    };

    return context;
  }

  /**
   * Load authentication data from auth file into browser context.
   * Throws on failure - caller decides if critical based on authRequired.
   */
  private async _loadAuthData(role: string, page: Page): Promise<void> {
    const authPath = this.rolesConfig?.roles[role]?.authPath;
    if (!authPath) return;

    try {
      const fs = await import("fs");
      const authData = JSON.parse(fs.readFileSync(authPath, "utf8"));

      console.log(`🔐 Loading auth data for role: ${role}`);

      // Load cookies
      if (authData.cookies) {
        console.log(`🍪 Loading ${authData.cookies.length} cookies`);
        await page.setCookie(...authData.cookies);
      }

      // Load localStorage (simple: just do the first origin)
      if (authData.origins?.[0]?.localStorage) {
        const origin = authData.origins[0];
        console.log(`💾 Loading localStorage for: ${origin.origin}`);
        await page.goto(origin.origin);
        for (const item of origin.localStorage) {
          await page.evaluate(
            (name: string, value: string) => {
              localStorage.setItem(name, value);
            },
            item.name,
            item.value
          );
        }
      }

      console.log(`✅ Auth data loaded for role: ${role}`);
    } catch (error) {
      // Throw proper Error with context
      const errorMsg = error instanceof Error ? error.message : String(error);
      const authError = new Error(
        `Failed to load auth from ${authPath}: ${errorMsg}`
      );
      (authError as any).authPath = authPath; // Attach metadata
      throw authError;
    }
  }

  /**
   * Create a new role context with true isolation
   */
  private async _createRoleContext(role: string): Promise<RoleContext> {
    if (!this.browser) {
      throw new Error("Browser not initialized - call initialize() first");
    }

    // SPECIAL CASE: Default role uses main browser context (no isolation)
    if (role === "default") {
      console.log(`🔧 Creating main context for default role: ${role}`);

      // Use main browser context instead of creating an isolated one
      const browserContext = this.browser.defaultBrowserContext();

      // Reuse existing page if available
      const pages = await browserContext.pages();
      const page = pages[0] || (await browserContext.newPage());

      // Try to load auth data
      let authError: Error | undefined;
      try {
        await this._loadAuthData(role, page);
      } catch (error) {
        authError = error instanceof Error ? error : new Error(String(error));
      }

      const context = await this._setupRoleContext(role, browserContext, page);

      // Track auth failure in FailureLog
      if (authError) {
        const failures = this.ensureFailureLog(context);
        failures.authLoadError = {
          error: authError.message,
          authPath: (authError as any).authPath || "unknown",
          timestamp: Date.now(),
        };

        // DECISION POINT: Check if auth is required
        const roleConfig = this.rolesConfig?.roles[role];
        if (roleConfig?.authRequired) {
          throw new AuthenticationError(
            role,
            (authError as any).authPath || "unknown",
            authError.message
          );
        }

        // Non-critical: log and continue
        console.warn(
          `⚠️ Role '${role}' created without authentication (optional)`
        );
      }

      console.log(`✅ Created main context for default role: ${role}`);
      return context;
    }

    // NON-DEFAULT ROLES: Create isolated contexts for true isolation
    console.log(`🔧 Creating isolated context for role: ${role}`);

    // CRITICAL: Incognito context provides true isolation
    const browserContext = await this.browser.createBrowserContext();

    // Create page in the isolated context
    const page = await browserContext.newPage();

    // Try to load auth data
    let authError: Error | undefined;
    try {
      await this._loadAuthData(role, page);
    } catch (error) {
      authError = error instanceof Error ? error : new Error(String(error));
    }

    const context = await this._setupRoleContext(role, browserContext, page);

    // Track auth failure in FailureLog
    if (authError) {
      const failures = this.ensureFailureLog(context);
      failures.authLoadError = {
        error: authError.message,
        authPath: (authError as any).authPath || "unknown",
        timestamp: Date.now(),
      };

      // DECISION POINT: Check if auth is required
      const roleConfig = this.rolesConfig?.roles[role];
      if (roleConfig?.authRequired) {
        // Cleanup before throwing
        await page.close().catch(logAndContinue);
        await browserContext.close().catch(logAndContinue);

        throw new AuthenticationError(
          role,
          (authError as any).authPath || "unknown",
          authError.message
        );
      }

      // Non-critical: log and continue
      console.warn(
        `⚠️ Role '${role}' created without authentication (optional)`
      );
    }

    console.log(`✅ Created isolated context for role: ${role}`);
    return context;
  }

  // Public API methods (unified - no branching)

  async navigate(url: string): Promise<Snapshot> {
    const startTime = Date.now();
    let redirectCount = 0;
    let finalResponse: any = null;

    try {
      const context = await this.ensureCurrentRoleContext();

      // Track redirects by monitoring responses
      const responseHandler = (response: any) => {
        if (
          response.url() !== url &&
          response.status() >= 300 &&
          response.status() < 400
        ) {
          redirectCount++;
        }
        // Keep track of the final response
        finalResponse = response;
      };

      context.page.on("response", responseHandler);

      try {
        // Perform navigation
        const response = await context.page.goto(url, {
          waitUntil: "networkidle0",
        });
        finalResponse = response || finalResponse;

        // NEW: Discover and inject bridges into all frames
        await this.discoverAndInjectFrames(context);

        const endTime = Date.now();
        const loadTime = endTime - startTime;

        // Capture navigation metadata
        const finalUrl = context.page.url();
        const pageTitle = await context.page.title();
        const statusCode = finalResponse?.status();
        const contentType = finalResponse?.headers()["content-type"];

        // Mark context as navigated (injector handles bridge lifecycle)
        context.hasNavigated = true;

        // Get snapshot
        const snapshot = await this.snapshot();

        // Add navigation metadata to snapshot
        snapshot.navigation = {
          success: true,
          requestedUrl: url,
          finalUrl,
          pageTitle,
          statusCode,
          loadTime,
          redirectCount: redirectCount > 0 ? redirectCount : undefined,
          contentType,
          timestamp: endTime,
        };

        return snapshot;
      } finally {
        // Clean up event listener
        context.page.off("response", responseHandler);
      }
    } catch (error) {
      const endTime = Date.now();
      const loadTime = endTime - startTime;

      // Try to get current page state for error context
      try {
        const context = await this.ensureCurrentRoleContext();
        const currentUrl = context.page.url();
        const currentTitle = await context.page.title().catch(() => "Unknown");

        // Create error snapshot
        const errorSnapshot = await this.snapshot().catch(
          (): Snapshot => ({
            text: "Navigation failed - unable to capture page state",
            elementCount: 0,
          })
        );

        errorSnapshot.navigation = {
          success: false,
          requestedUrl: url,
          finalUrl: currentUrl,
          pageTitle: currentTitle,
          statusCode: finalResponse?.status(),
          loadTime,
          redirectCount: redirectCount > 0 ? redirectCount : undefined,
          contentType: finalResponse?.headers()["content-type"],
          timestamp: endTime,
        };

        // Store error snapshot in context for potential retrieval
        context.lastErrorSnapshot = errorSnapshot;
        console.debug(`Error snapshot stored in context.lastErrorSnapshot`);
      } catch (contextError) {
        // If we can't even get context, just throw original error
      }

      throw new NavigationError(
        url,
        this.currentRole,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Discover all frames in page and inject bridges into each.
   * Called after navigation to ensure bridges exist in all frames.
   *
   * DECISION POINT: Throws if main frame injection fails (critical).
   * Logs if child frame injection fails (acceptable).
   */
  private async discoverAndInjectFrames(context: RoleContext): Promise<void> {
    try {
      // Get complete frame tree
      const { frameTree } = await context.cdpSession.send("Page.getFrameTree");

      // Inject into all frames recursively (main frame marked as critical)
      await this.injectFrameTreeRecursive(context, frameTree, true);

      // DECISION POINT: Check if main frame failed
      const mainFrameFailed = context.failures?.frameInjectionFailures.some(
        (f) => f.isMainFrame
      );

      if (mainFrameFailed) {
        // CRITICAL: Cannot snapshot without main frame
        throw new Error(
          `Main frame injection failed - page cannot be automated`
        );
      }
    } catch (error) {
      // Track discovery failure
      const failures = this.ensureFailureLog(context);
      failures.frameDiscoveryError = {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      // Re-throw - this is critical
      throw error;
    }
  }

  /**
   * Recursively inject bridges into frame tree.
   * Uses parallel processing for speed.
   */
  private async injectFrameTreeRecursive(
    context: RoleContext,
    frameTree: any,
    isMainFrame: boolean = false
  ): Promise<void> {
    // Inject into this frame
    try {
      await context.bridgeInjector.ensureFrameState(
        context.cdpSession,
        frameTree.frame.id
      );
    } catch (error) {
      // Frame detachment is normal - don't treat as error
      if (this.isFrameDetachedError(error)) {
        console.debug(`Frame ${frameTree.frame.id} detached during injection`);
        return;
      }

      // Track non-detachment failures
      const failures = this.ensureFailureLog(context);
      failures.frameInjectionFailures.push({
        frameId: frameTree.frame.id,
        error: error instanceof Error ? error.message : String(error),
        reason: this.classifyFrameError(error),
        isMainFrame, // Track if this is the main frame
        timestamp: Date.now(),
      });

      console.warn(`Failed to inject into frame ${frameTree.frame.id}:`, {
        reason: this.classifyFrameError(error),
        error: error instanceof Error ? error.message : String(error),
        isMainFrame,
      });
      return;
    }

    // Recursively inject into children (PARALLEL for speed, child frames not main)
    if (frameTree.childFrames && frameTree.childFrames.length > 0) {
      const results = await Promise.allSettled(
        frameTree.childFrames.map(
          (child: any) => this.injectFrameTreeRecursive(context, child, false) // child frames not critical
        )
      );

      // Check for failures (non-critical for child frames)
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const failures = this.ensureFailureLog(context);

        console.warn(
          `${failed.length}/${frameTree.childFrames.length} child frames failed injection`
        );

        failed.forEach((result, idx) => {
          if (result.status === "rejected") {
            const childFrame = frameTree.childFrames[idx];
            failures.frameInjectionFailures.push({
              frameId: childFrame.frame.id,
              error: String(result.reason),
              reason: this.classifyFrameError(result.reason),
              isMainFrame: false,
              timestamp: Date.now(),
            });
          }
        });
      }
    }
  }

  private isFrameDetachedError(error: any): boolean {
    // Check for our custom error type first
    if (error instanceof FrameDetachedError) {
      return true;
    }

    // Fallback to message checking for external errors
    if (!error?.message) return false;
    const msg = error.message.toLowerCase();
    return (
      msg.includes("frame detached") ||
      msg.includes("frame has been detached") ||
      msg.includes("cannot find execution context") ||
      msg.includes("execution context was destroyed") ||
      msg.includes("frame with the given id was not found") ||
      msg.includes("no frame for given id") ||
      msg.includes("target closed") ||
      msg.includes("session closed")
    );
  }

  /**
   * Ensure context has failure log initialized
   */
  private ensureFailureLog(context: RoleContext): FailureLog {
    if (!context.failures) {
      context.failures = {
        frameInjectionFailures: [],
        frameExpansionFailures: [],
        cleanupErrors: [],
      };
    }
    return context.failures;
  }

  /**
   * Classify frame injection error
   */
  private classifyFrameError(
    error: any
  ): "cross-origin" | "detached" | "timeout" | "unknown" {
    const msg = error?.message?.toLowerCase() || "";
    if (msg.includes("cross-origin")) return "cross-origin";
    if (this.isFrameDetachedError(error)) return "detached";
    if (msg.includes("timeout")) return "timeout";
    return "unknown";
  }

  /**
   * Resolve an iframe element reference to its CDP frameId.
   *
   * Uses CDP's DOM.describeNode to get the child frameId from an iframe element.
   * Works with objectIds from any execution context (isolated world, main world, etc.)
   * because DOM methods operate at the document level, not the execution context level.
   *
   * This is the same approach Playwright uses in ElementHandle.contentFrame().
   */
  private async resolveFrameFromRef(
    context: RoleContext,
    parentFrameId: string,
    iframeRef: string
  ): Promise<{ frameId: string } | null> {
    try {
      // Get bridge handle for the parent frame
      const bridgeObjectId = await context.bridgeInjector.getBridgeHandle(
        context.cdpSession,
        parentFrameId
      );

      // Get the iframe element's objectId from the isolated world bridge
      // KEY: returnByValue = false means we get a remote object with objectId
      const { result } = await context.cdpSession.send(
        "Runtime.callFunctionOn",
        {
          objectId: bridgeObjectId,
          functionDeclaration: `function(ref) { 
          // Get the ElementInfo which contains the actual DOM element
          const info = this.elements.get(ref);
          if (!info) return null;
          
          // Verify it's an iframe
          if (info.tagName.toUpperCase() !== 'IFRAME') return null;
          
          // Return the element itself (will have objectId)
          return info.element;
        }`,
          arguments: [{ value: iframeRef }],
          returnByValue: false, // CRITICAL: Get as remote object, not value
        }
      );

      if (!result.objectId) {
        console.warn(`No objectId for iframe ref ${iframeRef}`);
        return null;
      }

      // Use the isolated world objectId directly with DOM.describeNode
      // This works because DOM methods operate at the document level, not execution context level
      const { node } = await context.cdpSession.send("DOM.describeNode", {
        objectId: result.objectId,
        pierce: true, // Enables traversal into iframe's content document
      });

      // Get the child frameId from the node info
      // CDP returns either node.frameId or node.contentDocument.frameId depending on browser version
      const childFrameId = node.frameId || node.contentDocument?.frameId;

      if (!childFrameId) {
        console.warn(
          `Element ${iframeRef} has no associated frame (might be empty or not yet loaded)`
        );
        return null;
      }

      return { frameId: childFrameId };
    } catch (error: any) {
      // Handle cross-origin iframes gracefully
      if (
        error?.message?.includes("cross-origin") ||
        error?.message?.includes("Cannot find context")
      ) {
        console.warn(
          `Iframe ${iframeRef} is cross-origin and cannot be accessed`
        );
        return null;
      }
      console.warn(`Failed to resolve frame from ref ${iframeRef}:`, error);
      return null;
    }
  }

  /**
   * Recursively expand iframe markers in snapshot text.
   * For each "- iframe [ref=eN]" line:
   *   1. Resolve element ref to frame ID
   *   2. Snapshot that child frame
   *   3. Rewrite child refs with frame prefix (fX_eN)
   *   4. Recursively expand any iframes in child
   *   5. Indent and merge child content
   */
  private async expandIframes(
    context: RoleContext,
    snapshotText: string,
    currentFrameId: string,
    ordinalCounter: number,
    refIndex: GlobalRefIndex
  ): Promise<{
    text: string;
    elementCount: number;
    nextOrdinal: number;
    errors: Array<{ ref: string; error: string; detached: boolean }>; // NEW
  }> {
    const lines = snapshotText.split("\n");
    const result: string[] = [];
    let totalElements = 0;
    let nextOrdinal = ordinalCounter;
    const errors: Array<{ ref: string; error: string; detached: boolean }> = []; // NEW

    for (const line of lines) {
      // Match iframe markers: "- iframe [ref=eN]" or "  - iframe "Name" [ref=eN]"
      const match = line.match(
        /^(\s*)- iframe(?:\s+"[^"]*")?\s+\[ref=([^\]]+)\]/
      );

      if (!match) {
        // Not an iframe marker, keep as-is
        result.push(line);
        continue;
      }

      const indentation = match[1];
      const iframeRef = match[2];

      // Keep the original iframe line (with colon to indicate children)
      result.push(line + ":");

      try {
        // Resolve iframe element ref to frame ID
        const frameInfo = await this.resolveFrameFromRef(
          context,
          currentFrameId,
          iframeRef
        );

        if (!frameInfo) {
          result.push(indentation + "  [Frame content unavailable]");
          errors.push({
            // NEW
            ref: iframeRef,
            error: "Frame content unavailable",
            detached: false,
          });
          continue;
        }

        // Assign frame ordinal (f1, f2, f3, ...)
        const frameOrdinal = ++nextOrdinal;

        // Snapshot child frame
        const childSnapshot = (await context.bridgeInjector.callBridgeMethod(
          context.cdpSession,
          "snapshot",
          [],
          frameInfo.frameId
        )) as {
          text: string;
          elementCount: number;
        };

        totalElements += childSnapshot.elementCount;

        // Recursively expand any iframes in child frame
        const expandedChild = await this.expandIframes(
          context,
          childSnapshot.text,
          frameInfo.frameId,
          nextOrdinal,
          refIndex
        );

        nextOrdinal = expandedChild.nextOrdinal;
        totalElements +=
          expandedChild.elementCount - childSnapshot.elementCount;
        errors.push(...expandedChild.errors); // NEW: Merge child errors

        // Rewrite refs in child frame: eN → fX_eN
        // Only rewrite local refs (starting with 'e'), not already-qualified refs (starting with 'f')
        const rewritten = expandedChild.text.replace(
          /\[ref=(e[^\]]+)\]/g,
          (_whole, localRef) => {
            // Only rewrite local refs, not already-qualified refs
            if (!RefFormatter.isLocal(localRef)) {
              return `[ref=${localRef}]`; // Already qualified, keep as-is
            }

            const globalRef = RefFormatter.toGlobal(frameOrdinal, localRef);
            refIndex.set(globalRef, { frameId: frameInfo.frameId, localRef });
            return `[ref=${globalRef}]`;
          }
        );

        // Indent child frame content and add to result
        for (const childLine of rewritten.split("\n")) {
          if (childLine.trim()) {
            result.push(indentation + "  " + childLine);
          }
        }
      } catch (error) {
        const isDetached = this.isFrameDetachedError(error);
        const errorMsg = error instanceof Error ? error.message : String(error);

        // NEW: Track error
        errors.push({
          ref: iframeRef,
          error: errorMsg,
          detached: isDetached,
        });

        // Frame detachment is normal, generic errors need logging
        if (isDetached) {
          console.debug(`Frame ${iframeRef} detached during expansion`);
          result.push(indentation + "  [Frame detached]");
        } else {
          console.warn(`Frame expansion error for ${iframeRef}:`, {
            error: errorMsg,
          });
          result.push(indentation + `  [Error: ${errorMsg}]`);
        }
        continue;
      }
    }

    return {
      text: result.join("\n"),
      elementCount: totalElements,
      nextOrdinal,
      errors, // NEW
    };
  }

  /**
   * Parse a global ref into { frameId, localRef } using the snapshot-built refIndex.
   * All refs (main frame and child frames) are in refIndex for consistent lookup.
   *
   * @param ref - Global ref from snapshot (e1, f1_e1, f2_e1, etc.)
   * @param context - Role context containing refIndex
   * @returns Frame ID and local ref for routing interactions
   * @throws Error if ref is not in refIndex (stale or invalid)
   */
  private parseRef(
    ref: string,
    context: RoleContext
  ): { frameId: string; localRef: string } {
    // Check if refIndex exists (should be populated by snapshot())
    if (!context.refIndex) {
      throw new Error(
        "No refIndex found. Take a snapshot first before interacting with elements."
      );
    }

    // Lookup in refIndex (includes both main frame and child frame refs)
    const entry = context.refIndex.get(ref);
    if (entry) {
      return { frameId: entry.frameId, localRef: entry.localRef };
    }

    // If not found, ref is stale or invalid
    throw new UnknownRefError(ref);
  }

  async snapshot(): Promise<Snapshot> {
    try {
      const context = await this.ensureCurrentRoleContext();

      // Get main frame snapshot (with iframe markers from bridge)
      const mainSnapshot = (await context.bridgeInjector.callBridgeMethod(
        context.cdpSession,
        "snapshot",
        [],
        context.mainFrameId
      )) as Snapshot;

      // Build refIndex for interaction routing (Phase 6)
      const refIndex = new Map<string, RefIndexEntry>();

      // Populate with main frame refs first
      const mainFrameRefs = mainSnapshot.text.matchAll(/\[ref=([^\]]+)\]/g);
      for (const match of mainFrameRefs) {
        const ref = match[1];
        refIndex.set(ref, { frameId: context.mainFrameId, localRef: ref });
      }

      // Recursively expand iframe markers
      const expanded = await this.expandIframes(
        context,
        mainSnapshot.text,
        context.mainFrameId,
        0, // ordinal counter starts at 0
        refIndex
      );

      // Store refIndex on context for interaction routing (Phase 6)
      context.refIndex = refIndex;

      // NEW: Track expansion errors
      if (expanded.errors.length > 0) {
        const failures = this.ensureFailureLog(context);
        failures.frameExpansionFailures.push(
          ...expanded.errors.map((e) => ({
            ref: e.ref,
            error: e.error,
            detached: e.detached,
            timestamp: Date.now(),
          }))
        );
      }

      const snapshot: Snapshot = {
        text: expanded.text,
        elementCount: mainSnapshot.elementCount + expanded.elementCount,
        pageContext: {
          url: context.page.url(),
          title: await context.page.title(),
        },
      };

      // Add expansion errors to snapshot if any
      if (expanded.errors.length > 0) {
        snapshot.expansionErrors = expanded.errors;
      }

      // Build warnings from FailureLog
      snapshot.warnings = this.buildWarningsFromFailureLog(context);

      return snapshot;
    } catch (error) {
      throw new Error(
        `Snapshot failed for role '${this.currentRole}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Build warnings for snapshot from FailureLog.
   * Returns undefined if no warnings.
   */
  private buildWarningsFromFailureLog(context: RoleContext) {
    const failures = context.failures;
    if (!failures) return undefined;

    const warnings: any = {};
    let hasWarnings = false;

    // Check for inaccessible frames (non-main frames that failed)
    const inaccessibleFrames = failures.frameInjectionFailures.filter(
      (f) => !f.isMainFrame
    );

    if (inaccessibleFrames.length > 0) {
      warnings.inaccessibleFrames = inaccessibleFrames.length;
      warnings.details = warnings.details || [];
      inaccessibleFrames.forEach((f) => {
        warnings.details.push(`Frame ${f.frameId}: ${f.reason}`);
      });
      hasWarnings = true;
    }

    // Check for unauthenticated status
    if (failures.authLoadError) {
      warnings.authStatus = "unauthenticated";
      warnings.details = warnings.details || [];
      warnings.details.push(`Auth failed: ${failures.authLoadError.error}`);
      hasWarnings = true;
    }

    // Check for partial content (frame expansion failures)
    if (failures.frameExpansionFailures.length > 0) {
      warnings.partialContent = true;
      warnings.details = warnings.details || [];
      const detached = failures.frameExpansionFailures.filter(
        (f) => f.detached
      ).length;
      warnings.details.push(
        `${failures.frameExpansionFailures.length} iframe(s) inaccessible (${detached} detached)`
      );
      hasWarnings = true;
    }

    return hasWarnings ? warnings : undefined;
  }

  /**
   * Get the last error snapshot if available.
   * Useful for debugging navigation failures.
   *
   * @returns Last error snapshot or null if none available
   */
  async getLastErrorSnapshot(): Promise<Snapshot | null> {
    try {
      const context = await this.ensureCurrentRoleContext();
      return context.lastErrorSnapshot || null;
    } catch {
      return null;
    }
  }

  /**
   * Get failure log for current role (for debugging).
   * Returns empty log if no failures.
   */
  async getFailures(): Promise<FailureLog> {
    try {
      const context = await this.ensureCurrentRoleContext();
      return (
        context.failures || {
          frameInjectionFailures: [],
          frameExpansionFailures: [],
          cleanupErrors: [],
        }
      );
    } catch {
      return {
        frameInjectionFailures: [],
        frameExpansionFailures: [],
        cleanupErrors: [],
      };
    }
  }

  /**
   * Clear failure log for current role (useful between test runs).
   */
  async clearFailures(): Promise<void> {
    try {
      const context = await this.ensureCurrentRoleContext();
      context.failures = {
        frameInjectionFailures: [],
        frameExpansionFailures: [],
        cleanupErrors: [],
      };
    } catch (error) {
      logAndContinue(error, "clearFailures");
    }
  }

  /**
   * Click an interactive element.
   *
   * **Navigation Handling**:
   * - Sets up navigation listener BEFORE clicking (prevents race)
   * - Waits up to 1 second for navigation (fast feedback for non-nav clicks)
   * - Uses networkidle2 for real-world app compatibility
   *
   * **Why 1 Second Timeout?**:
   * - Most clicks don't navigate (buttons, accordions, modals)
   * - 1s is long enough to detect navigation start
   * - If navigation starts, we wait full networkidle2 duration
   * - Balances responsiveness with reliability
   *
   * **Cross-Frame Support**:
   * - Ref is parsed to determine target frame
   * - Click is routed to correct iframe if needed
   *
   * @param ref - Global element reference (e.g. "e1" or "f2_e5")
   */
  async click(ref: string): Promise<void> {
    const context = await this.ensureCurrentRoleContext();

    // Parse ref to get frame and local ref
    const { frameId, localRef } = this.parseRef(ref, context);

    // Set up navigation listener BEFORE clicking (prevents race condition)
    // networkidle2: Waits for ≤2 network connections for 500ms (good for real-world apps)
    // 1s timeout: Fast feedback for non-navigating clicks (most common case)
    const navigationPromise = context.page
      .waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 1000,
      })
      .catch((error) => {
        // Only suppress timeout errors (expected for non-navigating clicks)
        if (
          error.message?.includes("Timeout") ||
          error.message?.includes("timeout")
        ) {
          return null;
        }
        // Re-throw real errors (network failures, etc.)
        throw error;
      });

    try {
      // Execute the click (routes to correct frame!)
      await context.bridgeInjector.callBridgeMethod(
        context.cdpSession,
        "click",
        [localRef],
        frameId
      );

      // Wait for navigation to complete (if it happens)
      // For cross-document navigation, this resolves when page is loaded
      // For same-document navigation (SPA/Remix), this times out and returns null
      await navigationPromise;

      // No additional wait needed - networkidle2 already waits 500ms after network settles
      // Bridge is automatically re-injected via CDP events for cross-document navigation
      // Bridge context stays valid for same-document navigation (SPA/Remix)
    } catch (error) {
      // CRITICAL: Await navigationPromise even on error to prevent "Navigating frame was detached"
      // If we don't wait for it, the promise keeps running during browser cleanup
      await navigationPromise.catch(() => {
        /* Ignore navigation errors when click itself failed */
      });
      throw error;
    }
  }

  async type(ref: string, text: string): Promise<void> {
    const context = await this.ensureCurrentRoleContext();

    // Parse ref to get frame and local ref
    const { frameId, localRef } = this.parseRef(ref, context);

    // Route to correct frame!
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "type",
      [localRef, text],
      frameId
    );
  }

  async resolve_container(ref: string): Promise<any> {
    const context = await this.ensureCurrentRoleContext();

    // Parse ref to get frame and local ref
    const { frameId, localRef } = this.parseRef(ref, context);

    // Route to correct frame!
    return await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "resolve_container",
      [localRef],
      frameId
    );
  }

  async inspect_pattern(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.ensureCurrentRoleContext();

    // Parse ref to get frame and local ref
    const { frameId, localRef } = this.parseRef(ref, context);

    // Route to correct frame!
    return await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "inspect_pattern",
      [localRef, ancestorLevel],
      frameId
    );
  }

  async extract_anchors(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.ensureCurrentRoleContext();

    // Parse ref to get frame and local ref
    const { frameId, localRef } = this.parseRef(ref, context);

    // Route to correct frame!
    return await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "extract_anchors",
      [localRef, ancestorLevel],
      frameId
    );
  }

  // Role management API (kept for compatibility)

  /**
   * Get current role
   */
  getCurrentRole(): string {
    return this.currentRole;
  }

  /**
   * List all available roles
   */
  listRoles(): string[] {
    return Array.from(this._roleContexts.keys());
  }

  /**
   * Switch to a different role
   */
  async selectRole(role: string): Promise<void> {
    // Guard: Don't switch to same role
    if (role === this.currentRole) {
      return;
    }

    // Remember old role for rollback
    const oldRole = this.currentRole;

    try {
      // Switch role pointer
      this.currentRole = role;

      // Trigger context creation to validate role works
      const context = await this.ensureCurrentRoleContext();

      // Auto-navigate to default URL only for contexts that haven't been navigated yet
      // This preserves navigation state when switching between existing roles
      if (context.defaultUrl && !context.hasNavigated) {
        const currentUrl = context.page.url();
        if (
          currentUrl === "about:blank" ||
          currentUrl === "" ||
          currentUrl === "chrome://newtab/"
        ) {
          console.log(
            `🔄 Initial navigation to default URL for new role '${role}': ${context.defaultUrl}`
          );
          await context.page.goto(context.defaultUrl, {
            waitUntil: "networkidle0",
          });

          // Mark as navigated (injector handles bridge lifecycle)
          context.hasNavigated = true;
        }
      }

      console.log(`✅ Switched to role: ${role}`);
    } catch (error) {
      // CRITICAL: Rollback on failure
      this.currentRole = oldRole;
      throw new Error(
        `Failed to switch to role '${role}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async close() {
    console.log("🧹 Starting browser cleanup...");

    // Clean up all role contexts
    if (this._roleContexts.size > 0) {
      console.log(`Cleaning up ${this._roleContexts.size} role contexts...`);

      const closePromises = [];
      for (const [role, contextPromise] of this._roleContexts.entries()) {
        closePromises.push(this._closeRoleContext(role, contextPromise));
      }

      try {
        await Promise.all(closePromises);
      } catch (error) {
        console.error("Some contexts failed to close cleanly:", error);
      }

      this._roleContexts.clear();
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
      } catch (error) {
        console.error("Failed to close browser:", error);
      }
    }

    console.log("✅ Browser cleanup completed");
  }

  private async _closeRoleContext(
    role: string,
    contextPromise: Promise<RoleContext>
  ): Promise<void> {
    try {
      const context = await contextPromise;
      const failures = this.ensureFailureLog(context);

      // Track each cleanup step
      if (context.bridgeInjector) {
        try {
          await context.bridgeInjector.dispose(context.cdpSession);
        } catch (error) {
          failures.cleanupErrors.push({
            step: "bridge-dispose",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (context.cdpSession) {
        try {
          await context.cdpSession.detach();
        } catch (error) {
          failures.cleanupErrors.push({
            step: "cdp-detach",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (context.page && !context.page.isClosed()) {
        try {
          await context.page.close();
        } catch (error) {
          failures.cleanupErrors.push({
            step: "page-close",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (context.browserContext && role !== "default") {
        try {
          await context.browserContext.close();
        } catch (error) {
          failures.cleanupErrors.push({
            step: "context-close",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failures.cleanupErrors.length > 0) {
        console.error(
          `Context cleanup for role '${role}' had ${failures.cleanupErrors.length} failures:`,
          failures.cleanupErrors
        );
      } else {
        console.log(`✅ Closed context for role: ${role}`);
      }
    } catch (error) {
      console.error(`❌ Failed to close context for role ${role}:`, error);
    }
  }
}
