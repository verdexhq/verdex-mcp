/**
 * Analyzes DOM structure for ancestors, siblings, and descendants
 */

import { DOMAnalyzer } from "../utils/DOMAnalyzer.js";
import type {
  IBridge,
  AncestorsResult,
  SiblingsResult,
  DescendantsResult,
  AncestorInfo,
  SiblingInfo,
  DescendantInfo,
} from "../types/index.js";

export class StructuralAnalyzer {
  private bridge: IBridge;

  constructor(bridge: IBridge) {
    this.bridge = bridge;
  }

  /**
   * Get ancestor information for an element
   */
  getAncestors(ref: string): AncestorsResult | null {
    const targetInfo = this.bridge.elements.get(ref);
    if (!targetInfo) return null;

    const ancestors: AncestorInfo[] = [];
    let current = targetInfo.element.parentElement;
    let level = 1;

    while (current && current !== document.body) {
      const ancestorInfo: AncestorInfo = {
        level: level,
        tagName: current.tagName.toLowerCase(),
        attributes: DOMAnalyzer.getRelevantAttributes(current),
        childElements: current.children.length,
        containsRefs: DOMAnalyzer.findContainedRefs(
          current,
          this.bridge.elements
        ),
      };

      ancestors.push(ancestorInfo);
      current = current.parentElement;
      level++;
    }

    return {
      target: {
        ref: ref,
        tagName: targetInfo.tagName.toLowerCase(),
        text: targetInfo.element.textContent?.trim() || "",
      },
      ancestors: ancestors,
    };
  }

  /**
   * Get sibling information at a specific ancestor level
   */
  getSiblings(ref: string, ancestorLevel: number): SiblingsResult | null {
    const targetInfo = this.bridge.elements.get(ref);
    if (!targetInfo) return null;

    let ancestor = targetInfo.element;
    for (let i = 0; i < ancestorLevel; i++) {
      if (!ancestor.parentElement || ancestor.parentElement === document.body) {
        return null;
      }
      ancestor = ancestor.parentElement;
    }

    const parent = ancestor.parentElement;
    if (!parent) return null;

    const siblings: SiblingInfo[] = Array.from(parent.children).map(
      (sibling, index) => ({
        index: index,
        tagName: sibling.tagName.toLowerCase(),
        isTargetType: sibling.tagName === ancestor.tagName,
        attributes: DOMAnalyzer.getRelevantAttributes(sibling),
        containsRefs: DOMAnalyzer.findContainedRefs(
          sibling,
          this.bridge.elements
        ),
        containsText: DOMAnalyzer.extractMeaningfulTexts(sibling),
      })
    );

    return {
      ancestorLevel: ancestorLevel,
      siblings: siblings,
    };
  }

  /**
   * Get descendant information at a specific ancestor level
   */
  getDescendants(ref: string, ancestorLevel: number): DescendantsResult {
    try {
      const targetInfo = this.bridge.elements.get(ref);
      if (!targetInfo) {
        return {
          error: `Element ${ref} not found`,
          ancestorAt: null,
          descendants: [],
          totalDescendants: 0,
          maxDepthReached: 0,
        };
      }

      let ancestor = targetInfo.element;
      for (let i = 0; i < ancestorLevel; i++) {
        if (
          !ancestor.parentElement ||
          ancestor.parentElement === document.body
        ) {
          return {
            error: `Ancestor level ${ancestorLevel} is too high - reached document.body`,
            ancestorAt: null,
            descendants: [],
            totalDescendants: 0,
            maxDepthReached: 0,
          };
        }
        ancestor = ancestor.parentElement;
      }

      const descendants = this.traverseDescendants(ancestor, 4, 0);

      // Calculate max depth safely
      let maxDepth = 0;
      if (descendants && descendants.length > 0) {
        const depths = descendants.map((d) => d?.depth || 1);
        maxDepth = Math.max(...depths);
      }

      return {
        ancestorAt: {
          level: ancestorLevel,
          tagName: ancestor.tagName.toLowerCase(),
          attributes: DOMAnalyzer.getRelevantAttributes(ancestor),
        },
        descendants: descendants || [],
        totalDescendants: descendants ? descendants.length : 0,
        maxDepthReached: maxDepth,
      };
    } catch (error) {
      return {
        error: `Error in get_descendants: ${(error as Error).message}`,
        ancestorAt: null,
        descendants: [],
        totalDescendants: 0,
        maxDepthReached: 0,
      };
    }
  }

  /**
   * Recursively traverse descendants with configurable depth
   */
  private traverseDescendants(
    element: Element,
    maxDepth: number = 4,
    currentDepth: number = 0
  ): DescendantInfo[] {
    if (currentDepth >= maxDepth || !element?.children) {
      return [];
    }

    const children: DescendantInfo[] = [];

    Array.from(element.children)
      .slice(0, 15) // Limit to first 15 children for performance
      .forEach((child, index) => {
        const childInfo: DescendantInfo = {
          depth: currentDepth + 1,
          index: index,
          tagName: child.tagName.toLowerCase(),
          attributes: DOMAnalyzer.getRelevantAttributes(child),
        };

        // Check if child has a ref
        const refForChild = Array.from(this.bridge.elements.entries()).find(
          ([_, info]) => info.element === child
        )?.[0];

        if (refForChild) {
          childInfo.ref = refForChild;
          const refInfo = this.bridge.elements.get(refForChild);
          if (refInfo) {
            childInfo.role = refInfo.role;
            childInfo.name = refInfo.name;
          }
        }

        // Get meaningful text content
        const directText = child?.childNodes
          ? Array.from(child.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent?.trim())
              .filter((text) => text && text.length > 0)
              .join(" ")
          : "";

        if (directText && directText.length > 0 && directText.length < 200) {
          childInfo.directText = directText;
        }

        // For semantic elements, capture full text content
        const semanticTags = [
          "H1",
          "H2",
          "H3",
          "H4",
          "H5",
          "H6",
          "P",
          "SPAN",
          "LABEL",
          "BUTTON",
          "A",
        ];
        if (semanticTags.includes(child.tagName)) {
          const fullText = child.textContent?.trim();
          if (
            fullText &&
            fullText.length > 0 &&
            fullText.length < 200 &&
            fullText !== directText
          ) {
            childInfo.fullText = fullText;
          }
        }

        // Add child count for containers
        if (child?.children && child.children.length > 0) {
          childInfo.childCount = child.children.length;

          // Recursively get nested descendants
          const nestedDescendants = this.traverseDescendants(
            child,
            maxDepth,
            currentDepth + 1
          );
          if (nestedDescendants && nestedDescendants.length > 0) {
            childInfo.descendants = nestedDescendants;
          }
        }

        children.push(childInfo);
      });

    return children;
  }
}
