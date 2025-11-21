/**
 * Priority 1: Multi-Role + Multi-Frame Integration Tests
 *
 * Critical gap: Tests that verify multi-frame operations work correctly
 * when switching between different roles.
 *
 * This is a HIGH PRIORITY test because users will likely need to:
 * - Test iframe interactions as different users (admin vs customer)
 * - Switch roles while interacting with iframe content
 * - Ensure ref isolation works across role + frame boundaries
 */

import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Multi-Role + Multi-Frame Integration", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("should handle frame-qualified refs across role switches", async () => {
    const htmlWithIframe = `
      <h1>Main Content</h1>
      <button id="main-btn">Main Button</button>
      <iframe srcdoc="<button id='child-btn'>Child Button</button>"></iframe>
    `;

    // Admin role navigates to page with iframe
    await browser.selectRole("admin");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithIframe)}`
    );
    const adminSnapshot = await browser.snapshot();

    // Extract refs from admin role
    const adminMainRef = adminSnapshot.text.match(
      /Main Button.*\[ref=(e\d+)\]/
    )?.[1];
    const adminFrameRef = adminSnapshot.text.match(
      /Child Button.*\[ref=(f1_e\d+)\]/
    )?.[1];

    expect(adminMainRef).toBeDefined();
    expect(adminFrameRef).toBeDefined();

    console.log(`Admin refs - main: ${adminMainRef}, frame: ${adminFrameRef}`);

    // Switch to customer role, navigate to different page with iframe
    await browser.selectRole("customer");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithIframe)}`
    );
    const customerSnapshot = await browser.snapshot();

    // Extract refs from customer role
    const customerMainRef = customerSnapshot.text.match(
      /Main Button.*\[ref=(e\d+)\]/
    )?.[1];
    const customerFrameRef = customerSnapshot.text.match(
      /Child Button.*\[ref=(f1_e\d+)\]/
    )?.[1];

    expect(customerMainRef).toBeDefined();
    expect(customerFrameRef).toBeDefined();

    console.log(
      `Customer refs - main: ${customerMainRef}, frame: ${customerFrameRef}`
    );

    // Verify refs are isolated per role - same ref IDs but different contexts
    expect(customerMainRef).toBe(adminMainRef); // Both likely "e1" but in different contexts
    expect(customerFrameRef).toBe(adminFrameRef); // Both likely "f1_e1" but in different contexts

    // Click in customer role (both main and frame)
    await browser.click(customerMainRef!);
    await browser.click(customerFrameRef!);

    // Switch back to admin - refs should still work
    await browser.selectRole("admin");
    await browser.click(adminMainRef!);
    await browser.click(adminFrameRef!);

    console.log("✓ Frame-qualified refs work correctly across role switches");
  });

  test("should maintain separate frame states per role", async () => {
    const htmlWithMultipleIframes = `
      <button>Main</button>
      <iframe id="f1" srcdoc="<button>Frame 1</button>"></iframe>
      <iframe id="f2" srcdoc="<button>Frame 2</button>"></iframe>
    `;

    // Role1: Navigate and interact with frames
    await browser.selectRole("role1");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithMultipleIframes)}`
    );
    const role1Snapshot = await browser.snapshot();

    expect(role1Snapshot.text).toContain("Frame 1");
    expect(role1Snapshot.text).toContain("Frame 2");

    const role1Frame1Ref = role1Snapshot.text.match(
      /Frame 1.*\[ref=(f1_e\d+)\]/
    )?.[1];
    const role1Frame2Ref = role1Snapshot.text.match(
      /Frame 2.*\[ref=(f2_e\d+)\]/
    )?.[1];

    expect(role1Frame1Ref).toBeDefined();
    expect(role1Frame2Ref).toBeDefined();

    // Role2: Navigate to same structure
    await browser.selectRole("role2");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithMultipleIframes)}`
    );
    const role2Snapshot = await browser.snapshot();

    expect(role2Snapshot.text).toContain("Frame 1");
    expect(role2Snapshot.text).toContain("Frame 2");

    const role2Frame1Ref = role2Snapshot.text.match(
      /Frame 1.*\[ref=(f1_e\d+)\]/
    )?.[1];
    const role2Frame2Ref = role2Snapshot.text.match(
      /Frame 2.*\[ref=(f2_e\d+)\]/
    )?.[1];

    // Interact with frames in role2
    await browser.click(role2Frame1Ref!);
    await browser.click(role2Frame2Ref!);

    // Switch back to role1 - should still work
    await browser.selectRole("role1");
    await browser.click(role1Frame1Ref!);
    await browser.click(role1Frame2Ref!);

    console.log("✓ Separate frame states maintained per role");
  });

  test("should handle nested iframes across role switches", async () => {
    const htmlWithNestedIframes = `
      <button>Main</button>
      <iframe srcdoc="
        <button>Level 1</button>
        <iframe srcdoc='<button>Level 2</button>'></iframe>
      "></iframe>
    `;

    // Admin role
    await browser.selectRole("admin");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithNestedIframes)}`
    );
    const adminSnapshot = await browser.snapshot();

    expect(adminSnapshot.text).toContain("Main");
    expect(adminSnapshot.text).toContain("Level 1");
    expect(adminSnapshot.text).toContain("Level 2");

    const adminLevel1Ref = adminSnapshot.text.match(
      /Level 1.*\[ref=(f1_e\d+)\]/
    )?.[1];
    const adminLevel2Ref = adminSnapshot.text.match(
      /Level 2.*\[ref=(f2_e\d+)\]/
    )?.[1];

    expect(adminLevel1Ref).toBeDefined();
    expect(adminLevel2Ref).toBeDefined();

    // Customer role
    await browser.selectRole("customer");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithNestedIframes)}`
    );
    const customerSnapshot = await browser.snapshot();

    expect(customerSnapshot.text).toContain("Level 1");
    expect(customerSnapshot.text).toContain("Level 2");

    const customerLevel1Ref = customerSnapshot.text.match(
      /Level 1.*\[ref=(f1_e\d+)\]/
    )?.[1];
    const customerLevel2Ref = customerSnapshot.text.match(
      /Level 2.*\[ref=(f2_e\d+)\]/
    )?.[1];

    // Interact with nested frames in customer
    await browser.click(customerLevel1Ref!);
    await browser.click(customerLevel2Ref!);

    // Switch back to admin
    await browser.selectRole("admin");
    await browser.click(adminLevel1Ref!);
    await browser.click(adminLevel2Ref!);

    console.log("✓ Nested iframes work across role switches");
  });

  test("should handle structural analysis on iframe elements across roles", async () => {
    const htmlWithStructuredIframe = `
      <div data-testid="container">
        <iframe srcdoc="
          <div data-testid='card'>
            <h3>Product Name</h3>
            <button>Add to Cart</button>
          </div>
        "></iframe>
      </div>
    `;

    // Role1: Analyze iframe structure
    await browser.selectRole("role1");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithStructuredIframe)}`
    );
    const role1Snapshot = await browser.snapshot();

    const role1ButtonRef = role1Snapshot.text.match(
      /Add to Cart.*\[ref=(f1_e\d+)\]/
    )?.[1];
    expect(role1ButtonRef).toBeDefined();

    // Test resolve_container on iframe element
    const role1Container = await browser.resolve_container(role1ButtonRef!);
    // Note: resolve_container returns the local ref (e1), not the qualified ref (f1_e1)
    expect(role1Container.target.ref).toMatch(/^e\d+$/);
    expect(role1Container.ancestors.length).toBeGreaterThan(0);

    // Should find data-testid in ancestors
    const hasDataTestId = role1Container.ancestors.some(
      (a) => a.attributes && "data-testid" in a.attributes
    );
    expect(hasDataTestId).toBe(true);

    // Test inspect_pattern on iframe element
    const role1Pattern = await browser.inspect_pattern(role1ButtonRef!, 1);
    expect(role1Pattern.siblings).toBeDefined();

    // Test extract_anchors on iframe element
    const role1Anchors = await browser.extract_anchors(role1ButtonRef!, 1);
    expect(role1Anchors.descendants).toBeDefined();
    expect(role1Anchors.totalDescendants).toBeGreaterThan(0);

    // Role2: Do same analysis
    await browser.selectRole("role2");
    await browser.navigate(
      `data:text/html,${encodeURIComponent(htmlWithStructuredIframe)}`
    );
    const role2Snapshot = await browser.snapshot();

    const role2ButtonRef = role2Snapshot.text.match(
      /Add to Cart.*\[ref=(f1_e\d+)\]/
    )?.[1];
    expect(role2ButtonRef).toBeDefined();

    const role2Container = await browser.resolve_container(role2ButtonRef!);
    // Note: resolve_container returns the local ref (e1), not the qualified ref (f1_e1)
    expect(role2Container.target.ref).toMatch(/^e\d+$/);

    const role2Pattern = await browser.inspect_pattern(role2ButtonRef!, 1);
    expect(role2Pattern.siblings).toBeDefined();

    const role2Anchors = await browser.extract_anchors(role2ButtonRef!, 1);
    expect(role2Anchors.descendants).toBeDefined();

    console.log("✓ Structural analysis works on iframe elements across roles");
  });

  test("should handle rapid role + frame switches", async () => {
    const htmlWithIframe = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;

    // Rapidly switch roles and interact with frames
    for (let i = 0; i < 5; i++) {
      await browser.selectRole(`role-${i}`);
      await browser.navigate(
        `data:text/html,${encodeURIComponent(htmlWithIframe)}`
      );
      const snapshot = await browser.snapshot();

      const mainRef = snapshot.text.match(/Main.*\[ref=(e\d+)\]/)?.[1];
      const frameRef = snapshot.text.match(/Child.*\[ref=(f1_e\d+)\]/)?.[1];

      expect(mainRef).toBeDefined();
      expect(frameRef).toBeDefined();

      // Interact with both
      await browser.click(mainRef!);
      await browser.click(frameRef!);

      console.log(`✓ Iteration ${i}: role-${i} frame interaction successful`);
    }

    console.log("✓ Rapid role + frame switches handled correctly");
  });

  test("should isolate frame navigation between roles", async () => {
    // Admin navigates to page A with iframe showing iframe content A
    await browser.selectRole("admin");
    const htmlA = `
      <h1>Admin Page</h1>
      <iframe srcdoc="<h1>Admin Iframe</h1><button>Admin Action</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(htmlA)}`);
    const adminSnapshot = await browser.snapshot();

    expect(adminSnapshot.text).toContain("Admin Page");
    expect(adminSnapshot.text).toContain("Admin Iframe");
    expect(adminSnapshot.text).toContain("Admin Action");

    // Customer navigates to page B with iframe showing iframe content B
    await browser.selectRole("customer");
    const htmlB = `
      <h1>Customer Page</h1>
      <iframe srcdoc="<h1>Customer Iframe</h1><button>Customer Action</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(htmlB)}`);
    const customerSnapshot = await browser.snapshot();

    expect(customerSnapshot.text).toContain("Customer Page");
    expect(customerSnapshot.text).toContain("Customer Iframe");
    expect(customerSnapshot.text).toContain("Customer Action");
    expect(customerSnapshot.text).not.toContain("Admin Page");
    expect(customerSnapshot.text).not.toContain("Admin Iframe");

    // Switch back to admin - should still see admin content
    await browser.selectRole("admin");
    const backToAdminSnapshot = await browser.snapshot();

    expect(backToAdminSnapshot.text).toContain("Admin Page");
    expect(backToAdminSnapshot.text).toContain("Admin Iframe");
    expect(backToAdminSnapshot.text).not.toContain("Customer Page");
    expect(backToAdminSnapshot.text).not.toContain("Customer Iframe");

    console.log("✓ Frame navigation isolated between roles");
  });

  test("should handle frame detachment during role switch", async () => {
    const html = `
      <button id="remove">Remove Frame</button>
      <iframe id="target" srcdoc="<button>Child Button</button>"></iframe>
      <script>
        document.getElementById('remove').onclick = () => {
          document.getElementById('target').remove();
        };
      </script>
    `;

    // Role1: Navigate and get refs
    await browser.selectRole("role1");
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const role1Snapshot = await browser.snapshot();

    const removeRef = role1Snapshot.text.match(
      /Remove Frame.*\[ref=(e\d+)\]/
    )?.[1];
    const childRef = role1Snapshot.text.match(/\[ref=(f1_e\d+)\]/)?.[1];

    expect(removeRef).toBeDefined();
    expect(childRef).toBeDefined();

    // Remove the iframe
    await browser.click(removeRef!);

    // Verify iframe is gone
    const snapshotAfterRemoval = await browser.snapshot();
    expect(snapshotAfterRemoval.text).not.toContain(childRef!);

    // Switch to role2 - should have intact iframe
    await browser.selectRole("role2");
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const role2Snapshot = await browser.snapshot();

    const role2ChildRef = role2Snapshot.text.match(/\[ref=(f1_e\d+)\]/)?.[1];
    expect(role2ChildRef).toBeDefined();

    // Should be able to interact with role2's iframe
    await browser.click(role2ChildRef!);

    console.log("✓ Frame detachment handled correctly during role switch");
  });

  test("should maintain correct refIndex across role + frame combinations", async () => {
    const html = `
      <button id="main">Main</button>
      <iframe srcdoc="<button id='child'>Child</button>"></iframe>
    `;

    // Create multiple roles with frames
    for (const role of ["role1", "role2", "role3"]) {
      await browser.selectRole(role);
      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      // Verify refIndex is correctly populated
      const context = await (browser as any)._roleContexts.get(role);
      const refIndex = context.refIndex;

      expect(refIndex.size).toBeGreaterThan(0);
      console.log(`${role}: refIndex has ${refIndex.size} entries`);

      // Verify main frame ref
      const mainRef = snapshot.text.match(/Main.*\[ref=(e\d+)\]/)?.[1];
      if (mainRef) {
        const entry = refIndex.get(mainRef);
        expect(entry).toBeDefined();
        expect(entry?.frameId).toBe(context.mainFrameId);
        expect(entry?.localRef).toBe(mainRef);
      }

      // Verify child frame ref
      const childRef = snapshot.text.match(/Child.*\[ref=(f1_e\d+)\]/)?.[1];
      if (childRef) {
        const entry = refIndex.get(childRef);
        expect(entry).toBeDefined();
        expect(entry?.frameId).not.toBe(context.mainFrameId);
        expect(entry?.localRef).toMatch(/^e\d+$/);
      }
    }

    console.log(
      "✓ RefIndex correctly maintained across role + frame combinations"
    );
  });

  test("should handle errors in iframe interactions across roles", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;

    // Role1: Get valid refs
    await browser.selectRole("role1");
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const role1Snapshot = await browser.snapshot();
    const role1FrameRef = role1Snapshot.text.match(
      /Child.*\[ref=(f1_e\d+)\]/
    )?.[1];

    expect(role1FrameRef).toBeDefined();

    // Role2: Different context
    await browser.selectRole("role2");
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    // Try to use role1's frame ref in role2 (should work - same ref ID, different context)
    // This is correct behavior: refs are scoped per role
    const role2Snapshot = await browser.snapshot();
    const role2FrameRef = role2Snapshot.text.match(
      /Child.*\[ref=(f1_e\d+)\]/
    )?.[1];

    // Both should be same ref ID but in different role contexts
    expect(role2FrameRef).toBe(role1FrameRef);

    // Clicking role1FrameRef in role2 context should work (clicks role2's element)
    await browser.click(role1FrameRef!);

    // Try invalid ref - should throw
    await expect(browser.click("f99_e99")).rejects.toThrow(
      /Unknown element reference/
    );

    console.log(
      "✓ Errors handled correctly in iframe interactions across roles"
    );
  });
});
