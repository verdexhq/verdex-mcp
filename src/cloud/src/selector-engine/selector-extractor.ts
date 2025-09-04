import { Project, SyntaxKind, Node, PropertyAccessExpression } from "ts-morph";
import * as fs from "fs";
import { Selector } from "./types";

/**
 * AST-based selector extractor for Playwright page objects
 *
 * HANDLES WELL:
 * - Standard constructor assignments: this.modal = page.getByTestId("modal")
 * - Multi-line assignments with complex parameters
 * - Method chaining: page.getByTestId("x").locator("y").first()
 * - Scoped selectors: this.modal.getByRole("button")
 * - Complex parameters: objects, regex, template literals
 *
 * LIMITATIONS - WHAT THIS MISSES:
 * - Cross-method selector construction (setupButtons() called from constructor)
 * - Inheritance-based selectors (super() calls, parent class selectors)
 * - Runtime/dynamic selector generation (config-driven, computed properties)
 * - Decorator-based selectors (@Selector annotations)
 * - Proxy-based selector access (dynamic property creation)
 * - External configuration files (import selectors from JSON)
 * - Framework abstractions (custom testing framework magic)
 * - Conditional assignments in loops or complex control flow
 *
 * COVERAGE: ~80-90% of typical Playwright page objects
 */
export function extractSelectors(filePath: string): Selector[] {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Create project and load file
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(filePath);
  const selectors: Selector[] = [];

  // Find all classes in the file
  const classes = sourceFile.getClasses();

  for (const classDecl of classes) {
    // Get constructor if it exists
    const constructor = classDecl.getConstructors()[0];
    if (!constructor) continue;

    // Find all assignment expressions in constructor: this.prop = value
    const assignments = constructor
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((expr) => {
        const operator = expr.getOperatorToken();
        const left = expr.getLeft();

        // Must be assignment (=) to a this.property
        return (
          operator.getKind() === SyntaxKind.EqualsToken &&
          Node.isPropertyAccessExpression(left) &&
          left.getExpression().getKind() === SyntaxKind.ThisKeyword
        );
      });

    for (const assignment of assignments) {
      try {
        const left = assignment.getLeft() as PropertyAccessExpression;
        const right = assignment.getRight();
        const propertyName = left.getName();

        // Build the full selector string from the right-hand side
        const selectorText = buildSelectorString(right);

        // Determine base reference (page, this.modal, etc.)
        const baseRef = getBaseReference(right);

        // Check if it's a chained selector
        const isChained = isChainedSelector(right);

        if (selectorText) {
          selectors.push({
            name: propertyName,
            selector: selectorText,
            line: assignment.getStartLineNumber(),
            baseReference: baseRef,
            isChained: isChained,
          });
        }
      } catch (error) {
        // Skip problematic assignments but continue processing
        console.warn(
          `Skipping assignment at line ${assignment.getStartLineNumber()}: ${
            (error as Error).message
          }`
        );
      }
    }
  }

  // Resolve scoped selectors by substituting this.property references
  const resolvedSelectors = resolveVariableReferences(selectors);

  return resolvedSelectors;
}

/**
 * Build selector string from AST node
 * Handles: page.getByRole(), this.modal.locator(), chained calls
 */
function buildSelectorString(node: Node): string {
  // Handle simple identifiers
  if (Node.isIdentifier(node)) {
    return node.getText();
  }

  // Handle property access: page.something, this.modal
  if (Node.isPropertyAccessExpression(node)) {
    return node.getText();
  }

  // Handle method calls: page.getByRole("button")
  if (Node.isCallExpression(node)) {
    return node.getText();
  }

  // For other complex expressions, return the full text
  return node.getText();
}

/**
 * Extract base reference from selector
 * Returns: "page", "this.modal", "this.container", etc.
 */
function getBaseReference(node: Node): string | undefined {
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();

    if (Node.isPropertyAccessExpression(expression)) {
      // For page.getByRole() -> return "page"
      // For this.modal.getByRole() -> return "this.modal"
      const baseExpr = expression.getExpression();
      return baseExpr.getText();
    }
  }

  if (Node.isPropertyAccessExpression(node)) {
    const baseExpr = node.getExpression();
    return baseExpr.getText();
  }

  return undefined;
}

/**
 * Check if selector uses method chaining
 * e.g., page.locator().first(), this.modal.getByRole().filter()
 */
function isChainedSelector(node: Node): boolean {
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();

    // If the expression is also a call expression, it's chained
    if (Node.isCallExpression(expression)) {
      return true;
    }

    // Check for property access on call results: something().property
    if (Node.isPropertyAccessExpression(expression)) {
      const baseExpr = expression.getExpression();
      return Node.isCallExpression(baseExpr);
    }
  }

  return false;
}

/**
 * Resolve variable references in selectors
 * Replaces this.property references with their actual selector values
 */
function resolveVariableReferences(selectors: Selector[]): Selector[] {
  // Build a map of property names to their selector values
  const selectorMap = new Map<string, string>();

  // First pass: collect all direct selectors (no this.property references)
  selectors.forEach((selector) => {
    if (!selector.selector.startsWith("this.")) {
      selectorMap.set(selector.name, selector.selector);
    }
  });

  // Second pass: resolve this.property references
  const resolvedSelectors: Selector[] = [];

  selectors.forEach((selector) => {
    let resolvedSelector = selector.selector;

    // Check if this selector starts with this.property
    const thisPropertyMatch = resolvedSelector.match(/^this\.(\w+)/);
    if (thisPropertyMatch) {
      const propertyName = thisPropertyMatch[1];
      const baseSelector = selectorMap.get(propertyName);

      if (baseSelector) {
        // Replace this.property with the actual selector
        resolvedSelector = resolvedSelector.replace(
          `this.${propertyName}`,
          baseSelector
        );
      } else {
        // Keep original if we can't resolve the reference
        console.warn(
          `Cannot resolve reference: this.${propertyName} in selector: ${selector.name}`
        );
      }
    }

    resolvedSelectors.push({
      ...selector,
      selector: resolvedSelector,
    });
  });

  return resolvedSelectors;
}

// Test function
export function testExtractor(filePath: string) {
  try {
    const selectors = extractSelectors(filePath);
    console.log(`Found ${selectors.length} selectors in ${filePath}:`);
    selectors.forEach((s) => {
      console.log(`  Line ${s.line}: ${s.name} = ${s.selector}`);
    });
    return selectors;
  } catch (error) {
    console.error(`Error extracting selectors: ${(error as Error).message}`);
    return [];
  }
}
