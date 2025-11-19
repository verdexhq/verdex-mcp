/**
 * Enhanced ARIA utilities following W3C specifications
 */
import type { AriaNode } from "../core/SnapshotGenerator.js";

export class AriaUtils {
  // Valid ARIA roles from the specification
  private static readonly VALID_ROLES = [
    "alert",
    "alertdialog",
    "application",
    "article",
    "banner",
    "blockquote",
    "button",
    "caption",
    "cell",
    "checkbox",
    "code",
    "columnheader",
    "combobox",
    "complementary",
    "contentinfo",
    "definition",
    "deletion",
    "dialog",
    "directory",
    "document",
    "emphasis",
    "feed",
    "figure",
    "form",
    "generic",
    "grid",
    "gridcell",
    "group",
    "heading",
    "img",
    "insertion",
    "link",
    "list",
    "listbox",
    "listitem",
    "log",
    "main",
    "mark",
    "marquee",
    "math",
    "meter",
    "menu",
    "menubar",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "navigation",
    "none",
    "note",
    "option",
    "paragraph",
    "presentation",
    "progressbar",
    "radio",
    "radiogroup",
    "region",
    "row",
    "rowgroup",
    "rowheader",
    "scrollbar",
    "search",
    "searchbox",
    "separator",
    "slider",
    "spinbutton",
    "status",
    "strong",
    "subscript",
    "superscript",
    "switch",
    "tab",
    "table",
    "tablist",
    "tabpanel",
    "term",
    "textbox",
    "time",
    "timer",
    "toolbar",
    "tooltip",
    "tree",
    "treegrid",
    "treeitem",
  ];

  // Roles that allow name from content
  private static readonly NAME_FROM_CONTENT_ROLES = [
    "button",
    "cell",
    "checkbox",
    "columnheader",
    "gridcell",
    "heading",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "rowheader",
    "switch",
    "tab",
    "tooltip",
    "treeitem",
  ];

  // Roles that prohibit naming
  private static readonly NAMING_PROHIBITED_ROLES = [
    "caption",
    "code",
    "definition",
    "deletion",
    "emphasis",
    "generic",
    "insertion",
    "mark",
    "paragraph",
    "presentation",
    "strong",
    "subscript",
    "superscript",
    "term",
    "time",
  ];

  // Interactive roles
  private static readonly INTERACTIVE_ROLES = [
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "tab",
    "switch",
    "slider",
    "spinbutton",
    "searchbox",
    "option",
  ];

  // Elements that should be ignored for ARIA
  private static readonly IGNORED_ELEMENTS = [
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
  ];

  // Interactive HTML elements
  private static readonly INTERACTIVE_ELEMENTS = [
    "A",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "DETAILS",
    "IFRAME", // ← iframes need refs for frame resolution
  ];

  /**
   * Get the ARIA role for an element following HTML-AAM specification
   */
  static getRole(element: Element): string {
    // 1. Check explicit role attribute first
    const explicitRole = this.getExplicitRole(element);
    if (explicitRole) {
      if (explicitRole === "none" || explicitRole === "presentation") {
        const implicitRole = this.getImplicitRole(element);
        if (this.hasPresentationConflictResolution(element)) {
          return implicitRole || "generic";
        }
      }
      return explicitRole;
    }

    // 2. Get implicit role based on HTML semantics
    return this.getImplicitRole(element) || "generic";
  }

  /**
   * Get explicit ARIA role from role attribute
   */
  private static getExplicitRole(element: Element): string | null {
    const roleAttr = element.getAttribute("role");
    if (!roleAttr) return null;

    // Find first valid role in space-separated list
    const roles = roleAttr.split(/\s+/).map((role) => role.trim());
    return roles.find((role) => this.VALID_ROLES.includes(role)) || null;
  }

  /**
   * Get implicit role based on HTML element semantics
   */
  private static getImplicitRole(element: Element): string | null {
    const tagName = element.tagName.toUpperCase();

    switch (tagName) {
      case "A":
        return element.hasAttribute("href") ? "link" : null;
      case "AREA":
        return element.hasAttribute("href") ? "link" : null;
      case "ARTICLE":
        return "article";
      case "ASIDE":
        return "complementary";
      case "BLOCKQUOTE":
        return "blockquote";
      case "BUTTON":
        return "button";
      case "CAPTION":
        return "caption";
      case "CODE":
        return "code";
      case "DATALIST":
        return "listbox";
      case "DD":
        return "definition";
      case "DEL":
        return "deletion";
      case "DETAILS":
        return "group";
      case "DFN":
        return "term";
      case "DIALOG":
        return "dialog";
      case "DT":
        return "term";
      case "EM":
        return "emphasis";
      case "FIELDSET":
        return "group";
      case "FIGURE":
        return "figure";
      case "FOOTER":
        return this.isInLandmarkContext(element) ? null : "contentinfo";
      case "FORM":
        return this.hasAccessibleName(element) ? "form" : null;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        return "heading";
      case "HEADER":
        return this.isInLandmarkContext(element) ? null : "banner";
      case "HR":
        return "separator";
      case "HTML":
        return "document";
      case "IFRAME":
        return "iframe";
      case "IMG":
        // Empty alt makes it presentational
        if (
          element.getAttribute("alt") === "" &&
          !element.getAttribute("title") &&
          !this.hasGlobalAriaAttribute(element)
        ) {
          return "presentation";
        }
        return "img";
      case "INPUT":
        return this.getInputRole(element as HTMLInputElement);
      case "INS":
        return "insertion";
      case "LI":
        return "listitem";
      case "MAIN":
        return "main";
      case "MARK":
        return "mark";
      case "MATH":
        return "math";
      case "MENU":
        return "list";
      case "METER":
        return "meter";
      case "NAV":
        return "navigation";
      case "OL":
        return "list";
      case "OPTGROUP":
        return "group";
      case "OPTION":
        return "option";
      case "OUTPUT":
        return "status";
      case "P":
        return "paragraph";
      case "PROGRESS":
        return "progressbar";
      case "SEARCH":
        return "search";
      case "SECTION":
        return this.hasAccessibleName(element) ? "region" : null;
      case "SELECT":
        return (element as HTMLSelectElement).multiple ||
          (element as HTMLSelectElement).size > 1
          ? "listbox"
          : "combobox";
      case "STRONG":
        return "strong";
      case "SUB":
        return "subscript";
      case "SUP":
        return "superscript";
      case "SVG":
        return "img";
      case "TABLE":
        return "table";
      case "TBODY":
        return "rowgroup";
      case "TD":
        return this.isInGridContext(element) ? "gridcell" : "cell";
      case "TEXTAREA":
        return "textbox";
      case "TFOOT":
        return "rowgroup";
      case "TH":
        if (element.getAttribute("scope") === "col") return "columnheader";
        if (element.getAttribute("scope") === "row") return "rowheader";
        return this.isInGridContext(element) ? "gridcell" : "cell";
      case "THEAD":
        return "rowgroup";
      case "TIME":
        return "time";
      case "TR":
        return "row";
      case "UL":
        return "list";
      default:
        return null;
    }
  }

  /**
   * Get role for input elements based on type
   */
  private static getInputRole(input: HTMLInputElement): string {
    const type = input.type.toLowerCase();

    switch (type) {
      case "search":
        return input.hasAttribute("list") ? "combobox" : "searchbox";
      case "email":
      case "tel":
      case "text":
      case "url":
      case "":
        const list = input.list;
        return list ? "combobox" : "textbox";
      case "hidden":
        return "none";
      case "file":
        return "button";
      case "button":
      case "image":
      case "reset":
      case "submit":
        return "button";
      case "checkbox":
        return "checkbox";
      case "radio":
        return "radio";
      case "range":
        return "slider";
      case "number":
        return "spinbutton";
      default:
        return "textbox";
    }
  }

  /**
   * Check if element has accessible name
   */
  private static hasAccessibleName(element: Element): boolean {
    return (
      element.hasAttribute("aria-label") ||
      element.hasAttribute("aria-labelledby") ||
      element.hasAttribute("title")
    );
  }

  /**
   * Check if element has global ARIA attributes
   */
  private static hasGlobalAriaAttribute(element: Element): boolean {
    const globalAttrs = [
      "aria-atomic",
      "aria-busy",
      "aria-controls",
      "aria-current",
      "aria-describedby",
      "aria-details",
      "aria-dropeffect",
      "aria-flowto",
      "aria-grabbed",
      "aria-hidden",
      "aria-keyshortcuts",
      "aria-label",
      "aria-labelledby",
      "aria-live",
      "aria-owns",
      "aria-relevant",
      "aria-roledescription",
    ];
    return globalAttrs.some((attr) => element.hasAttribute(attr));
  }

  /**
   * Check if element is in landmark context (prevents footer/header from being landmarks)
   */
  private static isInLandmarkContext(element: Element): boolean {
    const landmarkSelector =
      "article, aside, main, nav, section, [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";
    return !!element.closest(landmarkSelector);
  }

  /**
   * Check if element is in grid context
   */
  private static isInGridContext(element: Element): boolean {
    const table = element.closest("table");
    if (!table) return false;
    const role = this.getExplicitRole(table);
    return role === "grid" || role === "treegrid";
  }

  /**
   * Check if presentation role has conflict resolution
   */
  private static hasPresentationConflictResolution(element: Element): boolean {
    return this.hasGlobalAriaAttribute(element) || this.isFocusable(element);
  }

  /**
   * Check if element is focusable
   */
  private static isFocusable(element: Element): boolean {
    if (element.hasAttribute("tabindex")) {
      const tabindex = parseInt(element.getAttribute("tabindex") || "0", 10);
      return !isNaN(tabindex);
    }

    const tagName = element.tagName.toUpperCase();
    if (["BUTTON", "DETAILS", "SELECT", "TEXTAREA"].includes(tagName)) {
      return !(element as any).disabled;
    }

    if (tagName === "A" || tagName === "AREA") {
      return element.hasAttribute("href");
    }

    if (tagName === "INPUT") {
      return (
        !(element as HTMLInputElement).disabled &&
        (element as HTMLInputElement).type !== "hidden"
      );
    }

    return false;
  }

  /**
   * Get accessible name following W3C Accessible Name Computation Algorithm
   */
  static getName(element: Element): string {
    const role = this.getRole(element);

    // Step 1: Check if element prohibits naming
    if (this.NAMING_PROHIBITED_ROLES.includes(role)) {
      return "";
    }

    // Step 2a: aria-labelledby (highest priority)
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const names = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((el) => el !== null)
        .map((el) => this.getTextContent(el!))
        .filter((text) => text.length > 0);

      if (names.length > 0) {
        return names.join(" ").trim();
      }
    }

    // Step 2b: aria-label
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    // Step 2c: Native host language labeling
    const nativeLabel = this.getNativeLabel(element);
    if (nativeLabel) return nativeLabel;

    // Step 2d: Embedded controls (name from content)
    if (this.NAME_FROM_CONTENT_ROLES.includes(role)) {
      const textContent = this.getTextContent(element);
      if (textContent) return textContent;
    }

    // Step 2e: title attribute
    const title = element.getAttribute("title");
    if (title && title.trim()) {
      return title.trim();
    }

    // Step 2f: Placeholder for inputs
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const placeholder = element.getAttribute("placeholder");
      if (placeholder && placeholder.trim()) {
        return placeholder.trim();
      }
    }

    return "";
  }

  /**
   * Get native HTML labeling
   */
  private static getNativeLabel(element: Element): string {
    const tagName = element.tagName.toUpperCase();

    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      // Check for label element by for attribute
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
          return this.getTextContent(label);
        }
      }

      // Check if element is wrapped in label
      const parentLabel = element.closest("label");
      if (parentLabel) {
        return this.getTextContent(parentLabel);
      }
    }

    // Handle alt attribute for images
    if (tagName === "IMG") {
      const alt = element.getAttribute("alt");
      if (alt !== null) return alt;
    }

    return "";
  }

  /**
   * Get text content from element, handling various cases
   */
  private static getTextContent(element: Element): string {
    // Handle input elements
    if (element instanceof HTMLInputElement) {
      if (["submit", "reset", "button"].includes(element.type)) {
        return element.value || element.type;
      }
      if (element.type === "image") {
        return element.alt || element.value || "Submit";
      }
    }

    // Handle other form elements
    if (element instanceof HTMLButtonElement) {
      return element.textContent?.trim() || "";
    }

    // Regular text content
    return element.textContent?.trim() || "";
  }

  /**
   * Get ARIA properties for an element
   */
  static getAriaProperties(element: Element, role: string): Partial<AriaNode> {
    const props: Partial<AriaNode> = {};

    // Checked state
    const checkedRoles = [
      "checkbox",
      "radio",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "switch",
    ];
    if (checkedRoles.includes(role)) {
      const ariaChecked = element.getAttribute("aria-checked");
      if (ariaChecked === "mixed") {
        props.checked = "mixed";
      } else if (ariaChecked === "true") {
        props.checked = true;
      } else if (ariaChecked === "false") {
        props.checked = false;
      } else if (element instanceof HTMLInputElement) {
        props.checked = element.checked;
      }
    }

    // Disabled state
    const disabledRoles = [
      "button",
      "checkbox",
      "combobox",
      "gridcell",
      "link",
      "listbox",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "radio",
      "searchbox",
      "slider",
      "spinbutton",
      "switch",
      "tab",
      "textbox",
      "treeitem",
    ];
    if (disabledRoles.includes(role)) {
      const ariaDisabled = element.getAttribute("aria-disabled");
      if (ariaDisabled === "true") {
        props.disabled = true;
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        props.disabled = element.disabled;
      }
    }

    // Expanded state
    const expandedRoles = [
      "button",
      "combobox",
      "gridcell",
      "link",
      "menuitem",
      "row",
      "rowheader",
      "tab",
      "treeitem",
    ];
    if (expandedRoles.includes(role)) {
      const ariaExpanded = element.getAttribute("aria-expanded");
      if (ariaExpanded === "true") {
        props.expanded = true;
      } else if (ariaExpanded === "false") {
        props.expanded = false;
      }
    }

    // Level (for headings, treeitems, etc.)
    const levelRoles = ["heading", "listitem", "row", "treeitem"];
    if (levelRoles.includes(role)) {
      const ariaLevel = element.getAttribute("aria-level");
      if (ariaLevel) {
        const level = parseInt(ariaLevel, 10);
        if (!isNaN(level)) props.level = level;
      } else if (role === "heading" && /^H[1-6]$/.test(element.tagName)) {
        props.level = parseInt(element.tagName[1], 10);
      }
    }

    // Pressed state
    const pressedRoles = ["button"];
    if (pressedRoles.includes(role)) {
      const ariaPressed = element.getAttribute("aria-pressed");
      if (ariaPressed === "mixed") {
        props.pressed = "mixed";
      } else if (ariaPressed === "true") {
        props.pressed = true;
      } else if (ariaPressed === "false") {
        props.pressed = false;
      }
    }

    // Selected state
    const selectedRoles = ["gridcell", "option", "row", "tab", "treeitem"];
    if (selectedRoles.includes(role)) {
      const ariaSelected = element.getAttribute("aria-selected");
      if (ariaSelected === "true") {
        props.selected = true;
      } else if (ariaSelected === "false") {
        props.selected = false;
      }
    }

    // Active element
    props.active = document.activeElement === element;

    return props;
  }

  /**
   * Check if element is visible for ARIA following W3C tree exclusion rules
   */
  static isVisibleForAria(element: Element): boolean {
    // Check if element should be ignored
    if (this.IGNORED_ELEMENTS.includes(element.tagName)) {
      return false;
    }

    // Check aria-hidden on element and ancestors (walks up the tree)
    let current: Element | null = element;
    while (current) {
      if (current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      current = current.parentElement;
    }

    // Check display: none and visibility recursively
    return this.isElementVisible(element);
  }

  /**
   * Check if element is visible (not display:none or visibility:hidden)
   */
  private static isElementVisible(element: Element): boolean {
    let current: Element | null = element;

    while (current) {
      const style = window.getComputedStyle(current);

      // Check display: none
      if (style.display === "none") {
        return false;
      }

      // Handle display: contents special case
      if (style.display === "contents" && current.nodeName !== "SLOT") {
        // Check if any children are visible
        const hasVisibleChildren = Array.from(current.children).some((child) =>
          this.isElementVisible(child)
        );
        if (!hasVisibleChildren) {
          return false;
        }
      }

      // Check visibility: hidden (but not for option elements in select)
      if (
        style.visibility === "hidden" &&
        !(current.tagName === "OPTION" && current.closest("select"))
      ) {
        return false;
      }

      current = current.parentElement;
    }

    // Check shadow DOM slot assignment
    if (element.parentElement?.shadowRoot && !element.assignedSlot) {
      return false;
    }

    return true;
  }

  /**
   * Determine if an element is interactive
   */
  static isInteractive(element: Element, role: string): boolean {
    // Check if element receives pointer events
    const style = window.getComputedStyle(element);
    const receivesPointerEvents = style.pointerEvents !== "none";

    // Check if element is focusable
    const isFocusable = this.isFocusable(element);

    // Check if role is interactive
    const hasInteractiveRole = this.INTERACTIVE_ROLES.includes(role);

    // Check if element is inherently interactive
    const isInteractiveElement = this.INTERACTIVE_ELEMENTS.includes(
      element.tagName
    );

    return (
      receivesPointerEvents &&
      (isFocusable || hasInteractiveRole || isInteractiveElement)
    );
  }
}
