import puppeteer from "puppeteer";
import { createSnapshot } from "./scripts/browser-scripts.js";
export class BrowserBridge {
    browser = null;
    page = null;
    async initialize() {
        // Only create browser if it doesn't exist
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: false,
                args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
                defaultViewport: null, // This makes the page use full window size
            });
        }
        // Ensure we have a page
        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages[0] || (await this.browser.newPage());
        }
        // Inject our helper code that runs on every page
        await this.page.evaluateOnNewDocument(() => {
            window.__bridge = {
                elements: new Map(),
                counter: 0,
            };
        });
        // Also inject on the current page immediately
        await this.page.evaluate(() => {
            window.__bridge = {
                elements: new Map(),
                counter: 0,
            };
        });
    }
    async navigate(url) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.goto(url, { waitUntil: "networkidle0" });
        return this.snapshot();
    }
    async snapshot() {
        if (!this.page)
            throw new Error("Not initialized");
        // Convert function to string and execute
        return await this.page.evaluate(createSnapshot);
    }
    async click(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                throw new Error(`Element ${ref} not found`);
            info.element.click();
        }, ref);
        // Wait a bit for page to update
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    async type(ref, text) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.evaluate((ref, text) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                throw new Error(`Element ${ref} not found`);
            const el = info.element;
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }, ref, text);
    }
    async getSelector(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        const result = await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            return info?.selector || "";
        }, ref);
        return result;
    }
    async getElementInfo(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            // Return a copy of the ElementInfo (excluding the actual DOM element for serialization)
            return {
                element: null, // Can't serialize actual DOM elements
                tagName: info.tagName,
                role: info.role,
                name: info.name,
                selector: info.selector,
                attributes: info.attributes,
                siblingIndex: info.siblingIndex,
                parentRef: info.parentRef,
            };
        }, ref);
    }
    async inspect(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            const el = info.element;
            const rect = el.getBoundingClientRect();
            return {
                ref: ref,
                element: info.element,
                tagName: info.tagName,
                role: info.role,
                name: info.name,
                selector: info.selector,
                attributes: info.attributes,
                siblingIndex: info.siblingIndex,
                parentRef: info.parentRef,
                text: el.textContent?.trim(),
                visible: rect.width > 0 && rect.height > 0,
                bounds: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
            };
        }, ref);
    }
    async explore(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            return {
                target: {
                    ref: ref,
                    tagName: info.tagName,
                    role: info.role,
                    name: info.name,
                    selector: info.selector,
                    attributes: info.allAttributes,
                    siblingIndex: info.siblingIndex,
                    parentRef: info.parentRef,
                },
            };
        }, ref);
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
