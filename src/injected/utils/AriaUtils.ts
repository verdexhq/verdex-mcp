/**
 * ARIA utilities for element role and name detection
 */

export class AriaUtils {
  private static readonly ROLE_MAP: Record<string, string> = {
    a: "link",
    button: "button",
    img: "image",
    nav: "navigation",
    main: "main",
    header: "banner",
    footer: "contentinfo",
    aside: "complementary",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    ul: "list",
    ol: "list",
    li: "listitem",
    table: "table",
    form: "form",
    article: "article",
    section: "section",
  };

  private static readonly INTERACTIVE_ROLES = [
    "link",
    "button",
    "textbox",
    "checkbox",
    "radio",
    "select",
  ];

  private static readonly LANDMARK_ROLES = [
    "navigation",
    "main",
    "banner",
    "contentinfo",
    "complementary",
  ];

  private static readonly EXCLUDED_TAGS = ["SCRIPT", "STYLE", "NOSCRIPT"];

  private static readonly INTERACTIVE_TAGS = [
    "A",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
  ];

  private static readonly FORM_TAGS = ["INPUT", "SELECT", "TEXTAREA", "FORM"];

  private static readonly TEXT_CONTENT_TAGS = ["A", "BUTTON"];

  private static readonly HEADING_PATTERN = /^H[1-6]$/;

  /**
   * Get the ARIA role for an element
   */
  static getRole(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute("type");

    // Explicit role attribute takes precedence
    if (element.hasAttribute("role")) {
      return element.getAttribute("role")!;
    }

    // Handle input elements with type-specific roles
    if (tagName === "input") {
      return type === "submit" || type === "button" ? "button" : "textbox";
    }

    // Use role map or default to generic
    return this.ROLE_MAP[tagName] || "generic";
  }

  /**
   * Get the accessible name for an element
   */
  static getName(element: Element): string {
    // Check ARIA label first
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    // Check alt attribute (for images)
    const alt = element.getAttribute("alt");
    if (alt) return alt;

    // Check title attribute
    const title = element.getAttribute("title");
    if (title) return title;

    // Handle input elements
    if (element.tagName === "INPUT") {
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) return placeholder;

      const id = (element as HTMLElement).id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label?.textContent) {
          return label.textContent.trim();
        }
      }
    }

    // Handle elements with text content
    if (this.TEXT_CONTENT_TAGS.includes(element.tagName)) {
      return element.textContent?.trim() || "";
    }

    // Handle heading elements
    if (this.HEADING_PATTERN.test(element.tagName)) {
      return element.textContent?.trim() || "";
    }

    return "";
  }

  /**
   * Determine if an element should be included in the accessibility tree
   */
  static shouldInclude(element: Element): boolean {
    // Check if element is visible
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    // Exclude script and style elements
    if (this.EXCLUDED_TAGS.includes(element.tagName)) {
      return false;
    }

    const role = this.getRole(element);

    // Include interactive elements
    if (this.INTERACTIVE_ROLES.includes(role)) {
      return true;
    }

    // Include headings
    if (role === "heading") {
      return true;
    }

    // Include elements with explicit roles
    if (element.hasAttribute("role")) {
      return true;
    }

    // Include form elements
    if (this.FORM_TAGS.includes(element.tagName)) {
      return true;
    }

    // Include landmark elements
    if (this.LANDMARK_ROLES.includes(role)) {
      return true;
    }

    // Include generic elements with test IDs or ARIA labels
    if (role === "generic" && ["DIV", "SPAN"].includes(element.tagName)) {
      return (
        element.hasAttribute("data-testid") ||
        element.hasAttribute("aria-label")
      );
    }

    return false;
  }

  /**
   * Determine if an element is interactive
   */
  static isInteractive(element: Element, role: string): boolean {
    return (
      this.INTERACTIVE_ROLES.includes(role) ||
      this.INTERACTIVE_TAGS.includes(element.tagName)
    );
  }
}
