# Verdex Parity Plan

## Phase 1: Text Correctness (Critical)

### 1.1 Fix Text Node Normalization
**Problem:** Currently normalizing each text node individually. Need to buffer adjacent text nodes before normalization.

**Implementation:**
```typescript
private normalizeStringChildren(rootNode: AriaNode) {
  const visit = (ariaNode: AriaNode) => {
    const normalized: (AriaNode | string)[] = [];
    const buffer: string[] = [];

    const flushBuffer = () => {
      if (buffer.length === 0) return;
      const text = this.normalizeWhitespace(buffer.join(''));
      if (text) normalized.push(text);
      buffer.length = 0;
    };

    for (const child of ariaNode.children) {
      if (typeof child === 'string') {
        buffer.push(child);
      } else {
        flushBuffer();
        visit(child);
        normalized.push(child);
      }
    }
    flushBuffer();

    // Remove children that duplicate the name
    if (normalized.length === 1 && normalized[0] === ariaNode.name) {
      ariaNode.children = [];
    } else {
      ariaNode.children = normalized;
    }
  };

  visit(rootNode);
}
```

**Call order:** After tree building, before rendering.

---

### 1.2 Add Block Element Spacing
**Problem:** Text from block elements concatenates without spaces.

**Implementation:**
In `buildChildrenTree()` or `processElement()`, wrap child processing:

```typescript
private processElement(ariaNode: AriaNode, element: Element, parentVisible: boolean) {
  const style = window.getComputedStyle(element);
  const display = style.display || 'inline';
  const treatAsBlock = (display !== 'inline' || element.nodeName === 'BR') ? ' ' : '';

  if (treatAsBlock) {
    ariaNode.children.push(treatAsBlock);
  }

  // Add ::before content
  ariaNode.children.push(this.getCSSContent(element, '::before'));

  // Process children (slots, regular children, shadow DOM)
  // ... existing child processing logic ...

  // Add ::after content
  ariaNode.children.push(this.getCSSContent(element, '::after'));

  if (treatAsBlock) {
    ariaNode.children.push(treatAsBlock);
  }
}
```

---

### 1.3 CSS Pseudo-Element Content
**Problem:** Missing visible content from `::before` and `::after`.

**Implementation:**
```typescript
private getCSSContent(element: Element, pseudo: '::before' | '::after'): string {
  const style = window.getComputedStyle(element, pseudo);
  const content = style.content;

  if (!content || content === 'none' || content === 'normal') {
    return '';
  }

  // Remove surrounding quotes
  let text = content.replace(/^["']|["']$/g, '');

  // Handle CSS escape sequences
  text = text.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return text;
}
```

**Integration:** Call before and after child processing in `processElement()`.

---

## Phase 2: Stability (High Priority)

### 2.1 Ref Caching on Elements
**Problem:** Refs change on every snapshot, breaking incremental exploration.

**Implementation:**
```typescript
type AriaRef = {
  role: string;
  name: string;
  ref: string;
};

private computeAriaRef(ariaNode: AriaNode): void {
  let ariaRef: AriaRef | undefined;
  ariaRef = (ariaNode.element as any)._ariaRef;

  // Only regenerate if role/name changed
  if (!ariaRef || ariaRef.role !== ariaNode.role || ariaRef.name !== ariaNode.name) {
    ariaRef = {
      role: ariaNode.role,
      name: ariaNode.name,
      ref: `e${++this.bridge.counter}`
    };
    (ariaNode.element as any)._ariaRef = ariaRef;
  }

  ariaNode.ref = ariaRef.ref;
}
```

**Call:** In `createAriaNode()` when assigning refs to interactive elements.

---

### 2.2 YAML Rendering with Escaping
**Problem:** Text with quotes, colons, or special characters breaks output format.

**Implementation:**
```typescript
private yamlEscapeKeyIfNeeded(key: string): string {
  // Keys with special YAML characters need quoting
  if (/[:\[\]{}#&*!|>'"%@`]/.test(key) || key.startsWith('-')) {
    return JSON.stringify(key);
  }
  return key;
}

private yamlEscapeValueIfNeeded(value: string): string {
  // Values with special characters or that look like numbers/booleans
  if (!value) return '""';

  if (/^(true|false|null|~)$/i.test(value) ||
      /^[0-9]/.test(value) ||
      /[:\[\]{}#&*!|>'"%@`\n\r]/.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}
```

**Update rendering:**
```typescript
private renderTree(node: AriaNode | string, lines: string[], indent: string): void {
  if (typeof node === 'string') {
    const text = this.yamlEscapeValueIfNeeded(node);
    if (text) {
      lines.push(indent + '- text: ' + text);
    }
    return;
  }

  // Build key
  let key = node.role;
  if (node.name && node.name.length <= 900) {
    key += ' ' + this.yamlEscapeValueIfNeeded(node.name);
  }

  // Add attributes
  // ... existing attribute logic ...

  const escapedKey = indent + '- ' + this.yamlEscapeKeyIfNeeded(key);

  // Render node and children
  // ... existing rendering logic ...
}
```

---

## Phase 3: Polish (Optional)

### 3.1 Props Rendering Format
**Current:** `[url="..." placeholder="..."]`
**Playwright format:** Separate lines with `/` prefix

**Implementation:**
```typescript
private renderTree(node: AriaNode | string, lines: string[], indent: string): void {
  // ... existing node rendering ...

  const hasProps = node.props && Object.keys(node.props).length > 0;

  if (!node.children.length && !hasProps) {
    lines.push(escapedKey);
  } else if (node.children.length === 1 && typeof node.children[0] === 'string' && !hasProps) {
    const text = this.yamlEscapeValueIfNeeded(node.children[0]);
    lines.push(escapedKey + ': ' + text);
  } else {
    lines.push(escapedKey + ':');

    // Render props first
    if (hasProps) {
      for (const [name, value] of Object.entries(node.props)) {
        lines.push(indent + '  - /' + name + ': ' + this.yamlEscapeValueIfNeeded(value));
      }
    }

    // Render children
    for (const child of node.children) {
      this.renderTree(child, lines, indent + '  ');
    }
  }
}
```

---

### 3.2 Text Contribution Filtering
**Purpose:** Omit text children that don't add information beyond the element's name.

**Implementation:**
```typescript
private textContributesInfo(node: AriaNode, text: string): boolean {
  if (!text.length) return false;
  if (!node.name) return true;
  if (node.name.length > text.length) return false;

  // Use longest common substring to detect redundancy
  // Only for reasonable string lengths (performance)
  if (text.length <= 200 && node.name.length <= 200) {
    const lcs = this.longestCommonSubstring(text, node.name);
    let filtered = text;
    while (lcs && filtered.includes(lcs)) {
      filtered = filtered.replace(lcs, '');
    }
    return filtered.trim().length / text.length > 0.1;
  }

  return true;
}

private longestCommonSubstring(str1: string, str2: string): string {
  const len1 = str1.length;
  const len2 = str2.length;
  let maxLen = 0;
  let endIndex = 0;
  const dp: number[][] = Array(len1 + 1).fill(0).map(() => Array(len2 + 1).fill(0));

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endIndex = i;
        }
      }
    }
  }

  return str1.substring(endIndex - maxLen, endIndex);
}
```

**Apply in rendering:**
```typescript
if (typeof node === 'string') {
  if (parentAriaNode && !this.textContributesInfo(parentAriaNode, node)) {
    return; // Skip redundant text
  }
  // ... render text ...
}
```

---

## Implementation Checklist

- [ ] **Phase 1.1:** Implement `normalizeStringChildren()` with buffering
- [ ] **Phase 1.2:** Add block element spacing in tree building
- [ ] **Phase 1.3:** Implement `getCSSContent()` for pseudo-elements
- [ ] **Phase 2.1:** Add ref caching with `_ariaRef` property
- [ ] **Phase 2.2:** Implement YAML escaping utilities
- [ ] **Phase 2.2:** Update rendering to use YAML escaping
- [ ] **Phase 3.1:** Update props rendering to match Playwright format
- [ ] **Phase 3.2:** Add text contribution filtering (optional)

---

## Testing Strategy

### After Phase 1:
- Verify snapshot text matches user-visible content
- Test with block elements (headings, paragraphs, divs)
- Test with CSS content (icon fonts, decorative elements)

### After Phase 2:
- Verify refs stay stable across multiple snapshots
- Test with text containing: quotes, colons, newlines, special chars
- Verify YAML output is parseable

### After Phase 3:
- Compare output format with Playwright snapshots
- Measure token usage with/without text filtering

