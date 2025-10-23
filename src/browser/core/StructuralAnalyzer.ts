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
  BridgeConfig,
} from "../types/index.js";

export class StructuralAnalyzer {
  private bridge: IBridge;
  private config: BridgeConfig;

  constructor(bridge: IBridge, config: BridgeConfig = {}) {
    this.bridge = bridge;
    this.config = config;
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
   * Climbs ancestorLevel ancestors to a container and returns that container's children
   */
  getSiblings(ref: string, ancestorLevel: number): SiblingsResult | null {
    const targetInfo = this.bridge.elements.get(ref);
    if (!targetInfo) return null;

    let container: Element | null = targetInfo.element;
    for (let i = 0; i < ancestorLevel; i++) {
      if (
        !container?.parentElement ||
        container.parentElement === document.body
      ) {
        return null;
      }
      container = container.parentElement;
    }

    if (!container) return null;

    /**
     * Compute targetSiblingIndex: which direct child of `container` contains the target element?
     *
     * - ancestorLevel === 0: container IS the target element → no sibling path → null
     * - ancestorLevel >= 1: walk up (ancestorLevel - 1) from target to find the direct child
     *                       of container that lies on the path to the target
     *
     * Edge case: handle non-element node wrappers with null-safe checks.
     */
    let unitAncestor: Element | null = targetInfo.element;
    for (let i = 0; i < Math.max(ancestorLevel - 1, 0); i++) {
      if (!unitAncestor?.parentElement) break;
      unitAncestor = unitAncestor.parentElement;
    }

    // Ensure unitAncestor is actually a direct child of container
    const unit =
      unitAncestor &&
      unitAncestor instanceof Element &&
      unitAncestor.parentElement === container
        ? unitAncestor
        : null;

    const targetSiblingIndex =
      unit && container ? Array.from(container.children).indexOf(unit) : null;

    const siblings: SiblingInfo[] = Array.from(container.children).map(
      (sibling, index) => ({
        index: index,
        tagName: sibling.tagName.toLowerCase(),
        attributes: DOMAnalyzer.getRelevantAttributes(sibling),
        containsText: DOMAnalyzer.extractMeaningfulTexts(sibling),
        outline: DOMAnalyzer.buildShallowOutline(
          sibling,
          this.config.maxOutlineItems ?? 6,
          this.bridge.elements
        ),
      })
    );

    return {
      ancestorLevel: ancestorLevel,
      containerAt: {
        tagName: container.tagName.toLowerCase(),
        attributes: DOMAnalyzer.getRelevantAttributes(container),
      },
      targetSiblingIndex,
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

      const maxDepth = this.config.maxDepth ?? 4;
      const descendants = this.traverseDescendants(ancestor, maxDepth, 0, 0);

      // Calculate max depth safely
      let maxDepthReached = 0;
      if (descendants && descendants.length > 0) {
        const depths = descendants.map((d) => d?.depth || 1);
        maxDepthReached = Math.max(...depths);
      }

      return {
        ancestorAt: {
          level: ancestorLevel,
          tagName: ancestor.tagName.toLowerCase(),
          attributes: DOMAnalyzer.getRelevantAttributes(ancestor),
        },
        descendants: descendants || [],
        totalDescendants: descendants ? descendants.length : 0,
        maxDepthReached: maxDepthReached,
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
    currentDepth: number = 0,
    totalDescendants: number = 0
  ): DescendantInfo[] {
    const maxDescendants = this.config.maxDescendants ?? 100;

    if (
      currentDepth >= maxDepth ||
      !element?.children ||
      totalDescendants >= maxDescendants
    ) {
      return [];
    }

    const children: DescendantInfo[] = [];

    const maxSiblings = this.config.maxSiblings ?? 15;
    Array.from(element.children)
      .slice(0, maxSiblings) // Limit children for performance
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
            currentDepth + 1,
            totalDescendants + children.length
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
