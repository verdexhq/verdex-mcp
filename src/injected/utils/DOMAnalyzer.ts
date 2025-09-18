/**
 * DOM analysis utilities for element inspection and text extraction
 */

import type { ElementInfo } from "../types/index.js";

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
}
