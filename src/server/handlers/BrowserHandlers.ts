import type { MultiContextBrowser } from "../../runtime/MultiContextBrowser.js";

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

    let responseText = `📄 Current Page (Role: ${this.browser.getCurrentRole()}):\n`;

    if (snapshot.pageContext) {
      responseText += `   URL: ${snapshot.pageContext.url}\n`;
      responseText += `   Title: "${snapshot.pageContext.title}"\n\n`;
    }

    responseText += `${snapshot.text}\n\nFound ${snapshot.elementCount} interactive elements`;

    return {
      content: [
        {
          type: "text",
          text: responseText,
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
