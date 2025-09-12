import puppeteer, { Browser, BrowserContext, Page } from "puppeteer";
import {
  Snapshot,
  ElementInfo,
  RoleContext,
  RolesConfiguration,
} from "./types.js";
import { injectedCode } from "./injected-code.js";

export class MultiContextBrowser {
  private browser: Browser | null = null;
  private _roleContexts = new Map<string, Promise<RoleContext>>();
  private currentRole: string = "default";
  private rolesConfig: RolesConfiguration | null = null;

  /**
   * Set roles configuration from MCP server
   */
  setRolesConfiguration(config: RolesConfiguration): void {
    this.rolesConfig = config;
  }

  async initialize() {
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
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
        defaultViewport: null,
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

    // Enable required CDP domains for this session
    await cdpSession.send("Runtime.enable");
    await cdpSession.send("Page.enable");
    await cdpSession.send("Network.enable");

    // Get main frame ID (needed for isolated world creation)
    const { frameTree } = await cdpSession.send("Page.getFrameTree");
    const mainFrameId = frameTree.frame.id;

    // Get default URL from configuration if available
    const defaultUrl = this.rolesConfig?.roles[role]?.defaultUrl;

    // Create the context object
    const context: RoleContext = {
      role,
      browserContext,
      page,
      cdpSession,
      isolatedWorldId: null, // Will be set during bridge injection
      bridgeObjectId: null, // Will be set during bridge injection
      mainFrameId,
      defaultUrl,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      hasNavigated: false, // Track if this context has been navigated
    };

    // Set up navigation listener for this specific context
    cdpSession.on("Page.frameNavigated", (event: any) => {
      if (event.frame.id === mainFrameId && !event.frame.parentId) {
        // Only invalidate for main frame navigation (not subframes/iframes)
        context.isolatedWorldId = null;
        context.bridgeObjectId = null;
        console.log(
          `🔄 Bridge invalidated for role ${role} due to main frame navigation`
        );
      }
    });

    return context;
  }

  /**
   * Load authentication data from auth file into browser context
   */
  private async _loadAuthData(
    role: string,
    browserContext: any,
    page: any
  ): Promise<void> {
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
      console.warn(`⚠️ Failed to load auth for role ${role}:`, error);
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

      // Load auth data
      await this._loadAuthData(role, browserContext, page);

      const context = await this._setupRoleContext(role, browserContext, page);
      console.log(`✅ Created main context for default role: ${role}`);
      return context;
    }

    // NON-DEFAULT ROLES: Create isolated contexts for true isolation
    console.log(`🔧 Creating isolated context for role: ${role}`);

    // CRITICAL: Incognito context provides true isolation
    const browserContext = await this.browser.createBrowserContext();

    // Create page in the isolated context
    const page = await browserContext.newPage();

    // Load auth data
    await this._loadAuthData(role, browserContext, page);

    const context = await this._setupRoleContext(role, browserContext, page);
    console.log(`✅ Created isolated context for role: ${role}`);
    return context;
  }

  /**
   * Setup isolated world for a specific context
   */
  private async _setupIsolatedWorldForContext(
    context: RoleContext
  ): Promise<void> {
    const { cdpSession, mainFrameId, role } = context;

    // Create isolated world for this specific context
    const { executionContextId } = await cdpSession.send(
      "Page.createIsolatedWorld",
      {
        frameId: mainFrameId,
        worldName: `bridge_world_${role}_${Date.now()}`, // Unique name per role
        grantUniveralAccess: false,
      }
    );

    context.isolatedWorldId = executionContextId;

    // Create bridge code using shared generator
    const bridgeCode = injectedCode();

    const { result } = await cdpSession.send("Runtime.evaluate", {
      expression: bridgeCode,
      contextId: executionContextId,
      returnByValue: false,
    });

    context.bridgeObjectId = result.objectId || null;

    console.log(`🔧 Bridge injected for role: ${role}`);
  }

  /**
   * CRITICAL: Ensure bridge is alive for a specific role context
   * This handles bridge resurrection after navigation or context destruction
   */
  private async ensureBridgeForContext(context: RoleContext): Promise<void> {
    try {
      // If we don't have a bridge object, create one
      if (!context.bridgeObjectId) {
        await this._setupIsolatedWorldForContext(context);
        return;
      }

      try {
        // Test if the bridge object is still alive
        await context.cdpSession.send("Runtime.callFunctionOn", {
          functionDeclaration: 'function() { return "alive"; }',
          objectId: context.bridgeObjectId,
          returnByValue: true,
        });

        // Bridge is alive, we're good
      } catch (error) {
        // Bridge is dead (navigation, context destroyed, etc.)
        // Clear invalid references
        context.isolatedWorldId = null;
        context.bridgeObjectId = null;

        // Recreate the bridge
        await this._setupIsolatedWorldForContext(context);
      }
    } catch (error) {
      throw new Error(
        `Failed to ensure bridge for role '${context.role}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
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

        const endTime = Date.now();
        const loadTime = endTime - startTime;

        // Capture navigation metadata
        const finalUrl = context.page.url();
        const pageTitle = await context.page.title();
        const statusCode = finalResponse?.status();
        const contentType = finalResponse?.headers()["content-type"];

        // Mark context as navigated and clear bridge state
        context.hasNavigated = true;
        context.isolatedWorldId = null;
        context.bridgeObjectId = null;

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

      // For failed navigation, we still want to return a snapshot with error metadata
      // but we need to throw the error as expected by the current API
      const errorMessage = `Navigate failed for role '${
        this.currentRole
      }' to '${url}': ${
        error instanceof Error ? error.message : String(error)
      }`;

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
        // But still throw error to maintain API contract
      } catch (contextError) {
        // If we can't even get context, just throw original error
      }

      throw new Error(errorMessage);
    }
  }

  async snapshot(): Promise<Snapshot> {
    try {
      const context = await this.ensureCurrentRoleContext();
      await this.ensureBridgeForContext(context);

      const { result } = await context.cdpSession.send(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: "function() { return this.snapshot(); }",
          objectId: context.bridgeObjectId!,
          returnByValue: true,
        }
      );

      return result.value;
    } catch (error) {
      throw new Error(
        `Snapshot failed for role '${this.currentRole}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async click(ref: string): Promise<void> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { this.click(ref); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: false,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async type(ref: string, text: string): Promise<void> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref, text) { this.type(ref, text); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: text }],
      returnByValue: false,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }
  }

  async inspect(ref: string): Promise<ElementInfo | null> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { return this.inspect(ref); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: true,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }

    return response.result.value;
  }

  async get_ancestors(ref: string): Promise<any> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { return this.get_ancestors(ref); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: true,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }

    return response.result.value;
  }

  async get_siblings(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_siblings(ref, level); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }

    return response.result.value;
  }

  async get_descendants(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.ensureCurrentRoleContext();
    await this.ensureBridgeForContext(context);

    const response = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_descendants(ref, level); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    // Check for exceptions thrown by the bridge function
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text ||
          "Element not found"
      );
    }

    return response.result.value;
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

          // Mark as navigated and clear bridge state
          context.hasNavigated = true;
          context.isolatedWorldId = null;
          context.bridgeObjectId = null;
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

      // Cleanup order matters: CDP -> Page -> Context
      if (context.cdpSession) {
        await context.cdpSession.detach();
      }
      if (context.page && !context.page.isClosed()) {
        await context.page.close();
      }
      if (context.browserContext) {
        await context.browserContext.close();
      }

      console.log(`✅ Closed context for role: ${role}`);
    } catch (error) {
      console.error(`❌ Failed to close context for role ${role}:`, error);
    }
  }
}
