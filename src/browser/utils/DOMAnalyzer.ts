/**
 * DOM analysis utilities for element inspection and text extraction
 */

import type { ElementInfo, OutlineItem } from "../types/index.js";

export class DOMAnalyzer {
  private static readonly RELEVANT_ATTRIBUTES = [
    "class",
    "id",
    "data-testid",
    "role",
    "aria-label",
  ];

  private static readonly SEMANTIC_ELEMENTS = [
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BUTTON",
    "A",
    "LABEL",
  ];

  /**
   * Build a shallow, typed outline of salient direct children of `element`.
   * Facts only: (role|tag), text, and data-testid signals.
   * Limited to direct children and a small cap for token efficiency.
   *
   * Refinements:
   * - Enriches with ref data (role/name) when elements have refs
   * - Dedupes by (role|tag, text, testid) combination
   */
  static buildShallowOutline(
    element: Element,
    maxItems: number = 6,
    elementsMap?: Map<string, ElementInfo>
  ): OutlineItem[] {
    const items: OutlineItem[] = [];
    const seen = new Set<string>();

    // Direct children likely to carry anchors
    const selectors = [
      ":scope > h1",
      ":scope > h2",
      ":scope > h3",
      ":scope > h4",
      ":scope > h5",
      ":scope > h6",
      ":scope > button",
      ":scope > a",
      ":scope > label",
      ":scope > [data-testid]",
      // one-level-deep meaningful spans/strong/em with text
      ":scope > span",
      ":scope > strong",
      ":scope > em",
    ].join(",");

    const candidates = Array.from(element.querySelectorAll(selectors));

    // Pre-index only the candidate elements to avoid O(N) scans per child
    let enrichByEl: Map<Element, ElementInfo> | undefined;
    if (elementsMap) {
      const candSet = new Set(candidates);
      enrichByEl = new Map();
      elementsMap.forEach((info) => {
        if (candSet.has(info.element)) {
          enrichByEl!.set(info.element, info);
        }
      });
    }

    for (const el of candidates) {
      if (items.length >= maxItems) break;

      // Enrich with ref data when available (facts only)
      let role: string | undefined = el.getAttribute("role") || undefined;
      let name: string | undefined = undefined;
      const info = enrichByEl?.get(el);
      if (info) {
        role = role || info.role || undefined;
        name = info.name || undefined;
      }

      // Normalize role to lowercase for stable dedupe keys
      const normalizedRole = role?.toLowerCase();

      const tag = el.tagName?.toLowerCase();
      const text = (el.textContent || "").trim();
      const testid = el.getAttribute("data-testid") || undefined;
      const ariaLabel = el.getAttribute("aria-label") || undefined;

      // Keep short, non-empty text; fall back to ref name or aria-label
      const cleanText =
        (text && text.length <= 200 ? text : undefined) || name || ariaLabel;
      if (!cleanText && !testid && !normalizedRole) continue;

      // Dedupe by combination of key fields
      const key = `${normalizedRole || tag}|${cleanText || ""}|${testid || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        role,
        tag,
        text: cleanText,
        testid,
      });
    }

    return items;
  }

  /**
   * Extract relevant attributes from an element
   */
  static getRelevantAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};

    this.RELEVANT_ATTRIBUTES.forEach((attrName) => {
      const value = element.getAttribute(attrName);
      if (value) {
        attrs[attrName] = value;
      }
    });

    return attrs;
  }

  /**
   * Find all element references contained within a container
   */
  static findContainedRefs(
    container: Element,
    elementsMap: Map<string, ElementInfo>
  ): string[] {
    const refs: string[] = [];

    elementsMap.forEach((info, refId) => {
      if (container.contains(info.element) && info.element !== container) {
        refs.push(refId);
      }
    });

    return refs;
  }

  /**
   * Extract meaningful text content from an element and its descendants
   */
  static extractMeaningfulTexts(element: Element): string[] {
    const texts: string[] = [];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Node): number => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text && text.length > 0) {
              return NodeFilter.FILTER_ACCEPT;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (this.SEMANTIC_ELEMENTS.includes(el.tagName)) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          texts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          texts.push(text);
        }
      }
    }

    // Return unique, non-empty texts
    const uniqueTexts = [...new Set(texts)].filter(
      (text) => text.length > 1 && text.trim().length > 0
    );

    return uniqueTexts;
  }

  /**
   * Get all attributes from an element as a record
   */
  static getAllAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};

    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attrs[attr.name] = attr.value;
    }

    return attrs;
  }

  /**
   * Get sibling index of an element among its siblings
   * Returns the 0-based position among all sibling elements
   */
  static getSiblingIndex(element: Element): number {
    if (!element.parentElement) return 0;

    const siblings = Array.from(element.parentElement.children);
    return siblings.indexOf(element);
  }

  /**
   * Find parent element ref in the elements map
   * Walks up the DOM tree to find the first parent that is an interactive element
   */
  static findParentRef(
    element: Element,
    elementsMap: Map<string, ElementInfo>
  ): string | null {
    let parent = element.parentElement;

    while (parent) {
      // Check if this parent is in our elements map
      for (const [ref, info] of elementsMap.entries()) {
        if (info.element === parent) {
          return ref;
        }
      }
      parent = parent.parentElement;
    }

    return null;
  }
}
