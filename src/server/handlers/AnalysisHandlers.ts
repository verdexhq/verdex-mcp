import type { MultiContextBrowser } from "../../multi-context-browser.js";
import type { AncestorInfo, SiblingInfo, DescendantInfo } from "../../types.js";

export class AnalysisHandlers {
  constructor(private browser: MultiContextBrowser) {}

  async handleGetAncestors(args: { ref: string }) {
    const { ref } = args;
    const result = await this.browser.get_ancestors(ref);
    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: `Element ${ref} not found (Role: ${this.browser.getCurrentRole()})`,
          },
        ],
      };
    }

    // Format the result for better readability
    let output = `Ancestry analysis for element ${ref} (Role: ${this.browser.getCurrentRole()}):\n\n`;

    // Target element info
    output += `🎯 Target Element:\n`;
    output += `   Tag: ${result.target.tagName}\n`;
    output += `   Text: "${result.target.text}"\n\n`;

    // Ancestors info
    if (result.ancestors.length === 0) {
      output += `📍 No ancestors found (element is direct child of body)\n`;
    } else {
      output += `📋 Ancestors (${result.ancestors.length} levels up):\n\n`;

      result.ancestors.forEach((ancestor: AncestorInfo, index: number) => {
        output += `Level ${ancestor.level} (${ancestor.tagName}):\n`;
        output += `   Children: ${ancestor.childElements}\n`;

        if (Object.keys(ancestor.attributes).length > 0) {
          output += `   Attributes: ${JSON.stringify(ancestor.attributes)}\n`;
        }

        if (ancestor.containsRefs.length > 0) {
          output += `   Contains refs: ${ancestor.containsRefs.join(", ")}\n`;
        } else {
          output += `   Contains refs: none\n`;
        }

        if (index < result.ancestors.length - 1) {
          output += `\n`;
        }
      });
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }

  async handleGetSiblings(args: { ref: string; ancestorLevel: number }) {
    const { ref, ancestorLevel } = args;
    const result = await this.browser.get_siblings(ref, ancestorLevel);
    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: `Element ${ref} not found or ancestor level ${ancestorLevel} is too high (Role: ${this.browser.getCurrentRole()})`,
          },
        ],
      };
    }

    // Format the result for better readability
    let output = `Sibling analysis for element ${ref} at ancestor level ${ancestorLevel} (Role: ${this.browser.getCurrentRole()}):\n\n`;

    if (result.siblings.length === 0) {
      output += `📍 No siblings found at level ${ancestorLevel}\n`;
    } else {
      output += `👥 Found ${result.siblings.length} siblings at ancestor level ${ancestorLevel}:\n\n`;

      result.siblings.forEach((sibling: SiblingInfo, index: number) => {
        output += `Sibling ${sibling.index + 1} (${sibling.tagName}):\n`;

        if (Object.keys(sibling.attributes).length > 0) {
          output += `   Attributes: ${JSON.stringify(sibling.attributes)}\n`;
        }

        if (sibling.containsRefs.length > 0) {
          output += `   Contains refs: ${sibling.containsRefs.join(", ")}\n`;
        } else {
          output += `   Contains refs: none\n`;
        }

        if (sibling.containsText.length > 0) {
          output += `   Contains text: ${sibling.containsText
            .slice(0, 3)
            .join(", ")}${sibling.containsText.length > 3 ? "..." : ""}\n`;
        }

        if (index < result.siblings.length - 1) {
          output += `\n`;
        }
      });
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }

  async handleGetDescendants(args: { ref: string; ancestorLevel: number }) {
    const { ref, ancestorLevel } = args;
    const result = await this.browser.get_descendants(ref, ancestorLevel);
    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: `Element ${ref} not found or ancestor level ${ancestorLevel} is too high (Role: ${this.browser.getCurrentRole()})`,
          },
        ],
      };
    }

    // Format the result for better readability
    let output = `Descendant analysis for element ${ref} within ancestor level ${ancestorLevel} (Role: ${this.browser.getCurrentRole()}):\n\n`;

    // Handle error cases
    if (result.error) {
      output += `❌ Error: ${result.error}\n`;
      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }

    output += `🏗️ Analyzing within ancestor: ${result.ancestorAt.tagName}`;
    if (
      result.ancestorAt.attributes &&
      Object.keys(result.ancestorAt.attributes).length > 0
    ) {
      output += ` ${JSON.stringify(result.ancestorAt.attributes)}`;
    }
    output += `\n\n`;

    if (!result.descendants || result.descendants.length === 0) {
      output += `📍 No descendants found within ancestor at level ${ancestorLevel}\n`;
    } else {
      output += `🔍 Found ${result.descendants.length} direct children within ancestor:\n\n`;

      // Helper function to format a descendant recursively
      const formatDescendant = (
        descendant: DescendantInfo,
        indent: string = "   "
      ): string => {
        let desc = "";
        desc += `${indent}${descendant.tagName}`;

        // Add ref if present
        if (descendant.ref) {
          desc += ` [ref=${descendant.ref}]`;
          if (descendant.role) desc += ` (${descendant.role})`;
        }

        // Add text content
        if (descendant.directText) {
          desc += ` "${descendant.directText.substring(0, 50)}${
            descendant.directText.length > 50 ? "..." : ""
          }"`;
        } else if (descendant.fullText) {
          desc += ` "${descendant.fullText.substring(0, 50)}${
            descendant.fullText.length > 50 ? "..." : ""
          }"`;
        }

        // Add child count
        if (descendant.childCount) {
          desc += ` (${descendant.childCount} children)`;
        }

        // Add attributes if present
        if (Object.keys(descendant.attributes).length > 0) {
          desc += ` ${JSON.stringify(descendant.attributes)}`;
        }

        desc += `\n`;

        // Recursively format nested descendants
        if (descendant.descendants && descendant.descendants.length > 0) {
          descendant.descendants.forEach((nested) => {
            desc += formatDescendant(nested, indent + "   ");
          });
        }

        return desc;
      };

      (result.descendants || []).forEach(
        (descendant: DescendantInfo, index: number) => {
          output += `Child ${index + 1} (depth ${descendant.depth}):\n`;

          if (Object.keys(descendant.attributes).length > 0) {
            output += `   Attributes: ${JSON.stringify(
              descendant.attributes
            )}\n`;
          }

          // Show immediate content
          if (descendant.ref) {
            output += `   Ref: ${descendant.ref}`;
            if (descendant.role) output += ` (${descendant.role})`;
            if (descendant.name) output += ` "${descendant.name}"`;
            output += `\n`;
          }

          if (descendant.directText) {
            output += `   Direct Text: "${descendant.directText.substring(
              0,
              100
            )}${descendant.directText.length > 100 ? "..." : ""}"\n`;
          }

          if (
            descendant.fullText &&
            descendant.fullText !== descendant.directText
          ) {
            output += `   Full Text: "${descendant.fullText.substring(0, 100)}${
              descendant.fullText.length > 100 ? "..." : ""
            }"\n`;
          }

          // Show nested descendants
          if (descendant.descendants && descendant.descendants.length > 0) {
            output += `   Contains ${descendant.descendants.length} nested elements:\n`;
            descendant.descendants.forEach((nested) => {
              output += formatDescendant(nested, "      ");
            });
          } else if (descendant.childCount && descendant.childCount > 0) {
            output += `   Contains ${descendant.childCount} children (not shown - depth limit reached)\n`;
          }

          if (result.descendants && index < result.descendants.length - 1) {
            output += `\n`;
          }
        }
      );
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
}
