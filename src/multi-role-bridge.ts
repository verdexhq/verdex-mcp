import puppeteer, {
  Browser,
  Page,
  CDPSession,
  BrowserContext,
} from "puppeteer";
import { Snapshot, ElementInfo } from "./types.js";
import { generateBridgeCode } from "./bridge-generator.js";
import * as fs from "fs/promises";

// Multi-role interfaces
interface RoleContext {
  role: string;
  browserContext: BrowserContext;
  page: Page;
  cdpSession: CDPSession;
  isolatedWorldId: number | null;
  bridgeObjectId: string | null;
  mainFrameId: string;
  defaultUrl?: string;
  createdAt: number;
  lastUsed: number;
  storageStatePath?: string; // NEW: Path to Playwright storage state file
}

// NEW: Playwright-compatible storage state interface
interface PlaywrightStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
    sessionStorage?: Array<{ name: string; value: string }>; // Optional
  }>;
}

export class BrowserBridge {
  private browser: Browser | null = null;
  private _roleContexts = new Map<string, Promise<RoleContext>>();
  private currentRole: string = "default";
  private persistenceDir: string = "./auth-states";

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

    // Create persistence directory
    try {
      await fs.mkdir(this.persistenceDir, { recursive: true });
    } catch (error) {
      console.warn("Could not create persistence directory:", error);
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
  private async getCurrentContext(): Promise<RoleContext> {
    return this.getOrCreateRole(this.currentRole);
  }

  /**
   * Create a new role context with true isolation
   */
  private async _createRoleContext(role: string): Promise<RoleContext> {
    if (!this.browser) {
      throw new Error("Browser not initialized - call initialize() first");
    }

    console.log(`🔧 Creating isolated context for role: ${role}`);

    // CRITICAL: Incognito context provides true isolation
    const browserContext = await this.browser.createBrowserContext();

    // Create page in the isolated context
    const page = await browserContext.newPage();

    // Get CDP session for this specific page
    const cdpSession = await page.createCDPSession();

    // Enable required CDP domains for this session
    await cdpSession.send("Runtime.enable");
    await cdpSession.send("Page.enable");
    await cdpSession.send("Network.enable");

    // Get main frame ID (needed for isolated world creation)
    const { frameTree } = await cdpSession.send("Page.getFrameTree");
    const mainFrameId = frameTree.frame.id;

    // Create the context object
    const context: RoleContext = {
      role,
      browserContext,
      page,
      cdpSession,
      isolatedWorldId: null, // Will be set during bridge injection
      bridgeObjectId: null, // Will be set during bridge injection
      mainFrameId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    // Set up navigation listener for this specific context
    cdpSession.on("Page.frameNavigated", (event) => {
      if (event.frame.id === mainFrameId && !event.frame.parentId) {
        // Only invalidate for main frame navigation (not subframes/iframes)
        context.isolatedWorldId = null;
        context.bridgeObjectId = null;
        console.log(
          `🔄 Bridge invalidated for role ${role} due to main frame navigation`
        );
      }
    });

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
    const bridgeCode = generateBridgeCode(executionContextId);

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
      console.warn(
        `🔄 Bridge recreation needed for role ${context.role}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Clear invalid references
      context.isolatedWorldId = null;
      context.bridgeObjectId = null;

      // Recreate the bridge
      await this._setupIsolatedWorldForContext(context);
    }
  }

  // Public API methods (unified - no branching)

  async navigate(url: string): Promise<Snapshot> {
    const context = await this.getCurrentContext();

    await context.page.goto(url, { waitUntil: "networkidle0" });

    // CRITICAL: Navigation destroys isolated worlds for this context
    context.isolatedWorldId = null;
    context.bridgeObjectId = null;

    // Bridge will be recreated on next operation that needs it
    return this.snapshot();
  }

  async snapshot(): Promise<Snapshot> {
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    const { result } = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function() { return this.snapshot(); }",
      objectId: context.bridgeObjectId!,
      returnByValue: true,
    });

    return result.value;
  }

  async click(ref: string): Promise<void> {
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { this.click(ref); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async type(ref: string, text: string): Promise<void> {
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref, text) { this.type(ref, text); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: text }],
      returnByValue: false,
    });
  }

  async inspect(ref: string): Promise<ElementInfo | null> {
    const context = await this.getCurrentContext();
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
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    const { result } = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { return this.get_ancestors(ref); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: true,
    });

    return result.value;
  }

  async get_siblings(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    const { result } = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_siblings(ref, level); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    return result.value;
  }

  async get_descendants(ref: string, ancestorLevel: number): Promise<any> {
    const context = await this.getCurrentContext();
    await this.ensureBridgeForContext(context);

    const { result } = await context.cdpSession.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_descendants(ref, level); }",
      objectId: context.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    return result.value;
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
  async switchRole(role: string): Promise<void> {
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
      await this.getCurrentContext();

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

  // NEW: Playwright Storage State Integration

  /**
   * Save current role's auth state in Playwright-compatible format
   * Perfect for integration with playwright.config.ts projects!
   */
  async saveStorageState(filePath?: string): Promise<string> {
    const context = await this.getCurrentContext();
    const outputPath =
      filePath || `${this.persistenceDir}/${this.currentRole}.json`;

    // Use Puppeteer's built-in storage state extraction
    const cookies = await context.page.cookies();

    // Get localStorage and sessionStorage for all origins
    const origins = await context.page.evaluate(() => {
      const originData: Array<{
        origin: string;
        localStorage: Array<{ name: string; value: string }>;
        sessionStorage?: Array<{ name: string; value: string }>;
      }> = [];

      // Get current origin data
      const currentOrigin = window.location.origin;
      const localStorageItems: Array<{ name: string; value: string }> = [];
      const sessionStorageItems: Array<{ name: string; value: string }> = [];

      // Extract localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          localStorageItems.push({
            name: key,
            value: localStorage.getItem(key) || "",
          });
        }
      }

      // Extract sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          sessionStorageItems.push({
            name: key,
            value: sessionStorage.getItem(key) || "",
          });
        }
      }

      if (localStorageItems.length > 0 || sessionStorageItems.length > 0) {
        const originEntry: any = {
          origin: currentOrigin,
          localStorage: localStorageItems,
        };

        if (sessionStorageItems.length > 0) {
          originEntry.sessionStorage = sessionStorageItems;
        }

        originData.push(originEntry);
      }

      return originData;
    });

    const storageState: PlaywrightStorageState = {
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires ? cookie.expires : undefined,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as "Strict" | "Lax" | "None" | undefined,
      })),
      origins,
    };

    // Ensure directory exists
    await fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf("/")), {
      recursive: true,
    });

    // Write Playwright-compatible JSON
    await fs.writeFile(outputPath, JSON.stringify(storageState, null, 2));

    console.log(
      `✅ Saved storage state for role '${this.currentRole}' to: ${outputPath}`
    );
    return outputPath;
  }

  /**
   * Load storage state from Playwright-compatible file for current role
   */
  async loadStorageState(filePath: string): Promise<void> {
    try {
      const storageStateJson = await fs.readFile(filePath, "utf-8");
      const storageState: PlaywrightStorageState = JSON.parse(storageStateJson);

      const context = await this.getCurrentContext();

      // Set cookies
      if (storageState.cookies && storageState.cookies.length > 0) {
        await context.page.setCookie(...storageState.cookies);
      }

      // Set localStorage and sessionStorage
      if (storageState.origins && storageState.origins.length > 0) {
        for (const origin of storageState.origins) {
          await context.page.evaluate(
            ({ origin: originData }) => {
              // Set localStorage
              if (originData.localStorage) {
                for (const item of originData.localStorage) {
                  localStorage.setItem(item.name, item.value);
                }
              }

              // Set sessionStorage
              if (originData.sessionStorage) {
                for (const item of originData.sessionStorage) {
                  sessionStorage.setItem(item.name, item.value);
                }
              }
            },
            { origin }
          );
        }
      }

      console.log(
        `✅ Loaded storage state for role '${this.currentRole}' from: ${filePath}`
      );
    } catch (error) {
      throw new Error(
        `Failed to load storage state from ${filePath}: ${error}`
      );
    }
  }

  /**
   * Create a role with pre-existing Playwright storage state
   * Perfect for loading auth states created by Playwright setup scripts!
   */
  async createRoleFromStorageState(
    role: string,
    storageStatePath: string
  ): Promise<void> {
    // Switch to the role (this will create the context)
    await this.switchRole(role);

    // Read the storage state to determine what origin we need to navigate to
    const storageStateJson = await fs.readFile(storageStatePath, "utf-8");
    const storageState: PlaywrightStorageState = JSON.parse(storageStateJson);

    // Navigate to the first origin in the storage state if available
    if (storageState.origins && storageState.origins.length > 0) {
      const firstOrigin = storageState.origins[0].origin;
      console.log(`🔄 Navigating to origin: ${firstOrigin}`);
      await this.navigate(firstOrigin);
    }

    // Load the storage state
    await this.loadStorageState(storageStatePath);

    console.log(
      `✅ Created role '${role}' with storage state from: ${storageStatePath}`
    );
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
