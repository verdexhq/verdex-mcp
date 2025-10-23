import type { MultiContextBrowser } from "../../multi-context-browser.js";
import type { InspectResult } from "../../types.js";

export class BrowserHandlers {
  constructor(private browser: MultiContextBrowser) {}

  async handleInitialize() {
    await this.browser.initialize();
    return {
      content: [
        {
          type: "text",
          text: "Multi-role browser initialized successfully",
        },
      ],
    };
  }

  async handleNavigate(args: { url: string }) {
    const { url } = args;
    const snapshot = await this.browser.navigate(url);

    let responseText = "";

    if (snapshot.navigation) {
      const nav = snapshot.navigation;
      responseText = `Navigation ${
        nav.success ? "successful" : "failed"
      } (Role: ${this.browser.getCurrentRole()})

📍 Navigation Details:
   Requested URL: ${nav.requestedUrl}
   Final URL: ${nav.finalUrl}
   Page Title: "${nav.pageTitle}"
   Load Time: ${nav.loadTime}ms${
        nav.statusCode
          ? `
   Status Code: ${nav.statusCode}`
          : ""
      }${
        nav.redirectCount
          ? `
   Redirects: ${nav.redirectCount}`
          : ""
      }${
        nav.contentType
          ? `
   Content Type: ${nav.contentType}`
          : ""
      }

📄 Page Snapshot:
${snapshot.text}

Found ${snapshot.elementCount} interactive elements`;
    } else {
      // Fallback for snapshots without navigation metadata
      responseText = `Navigated to ${url} (Role: ${this.browser.getCurrentRole()})

Page Snapshot:
${snapshot.text}

Found ${snapshot.elementCount} interactive elements`;
    }

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  }

  async handleSnapshot() {
    const snapshot = await this.browser.snapshot();
    return {
      content: [
        {
          type: "text",
          text: `Current Page Snapshot (Role: ${this.browser.getCurrentRole()}):\n${
            snapshot.text
          }\n\nFound ${snapshot.elementCount} interactive elements`,
        },
      ],
    };
  }

  async handleClick(args: { ref: string }) {
    const { ref } = args;
    await this.browser.click(ref);
    return {
      content: [
        {
          type: "text",
          text: `Clicked element ${ref} (Role: ${this.browser.getCurrentRole()})`,
        },
      ],
    };
  }

  async handleType(args: { ref: string; text: string }) {
    const { ref, text } = args;
    await this.browser.type(ref, text);
    return {
      content: [
        {
          type: "text",
          text: `Typed "${text}" into element ${ref} (Role: ${this.browser.getCurrentRole()})`,
        },
      ],
    };
  }

  async handleInspect(args: { ref: string }) {
    const { ref } = args;
    const info: InspectResult | null = await this.browser.inspect(ref);
    if (!info) {
      return {
        content: [
          {
            type: "text",
            text: `Element ${ref} not found (Role: ${this.browser.getCurrentRole()})`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Element ${ref} details (Role: ${this.browser.getCurrentRole()}):
                  Role: ${info.role}
                  Name: ${info.name}
                  Tag: ${info.tagName}
                  Text: ${info.text}
                  Visible: ${info.visible}
                  Sibling Index: ${info.siblingIndex}
                  Parent Ref: ${info.parentRef || "(none)"}
                  Bounds: x=${info.bounds.x}, y=${info.bounds.y}, width=${
            info.bounds.width
          }, height=${info.bounds.height}
                  Attributes: ${JSON.stringify(info.attributes, null, 2)}`,
        },
      ],
    };
  }

  async handleWait(args: { milliseconds?: number }) {
    const { milliseconds = 1000 } = args;
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    return {
      content: [
        {
          type: "text",
          text: `Waited ${milliseconds}ms`,
        },
      ],
    };
  }

  async handleClose() {
    await this.browser.close();
    return {
      content: [
        {
          type: "text",
          text: "Multi-role browser closed successfully",
        },
      ],
    };
  }
}
