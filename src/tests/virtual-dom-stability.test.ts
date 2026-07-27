import { h, patch, createRealDOM, type VNode, text } from "../virtual-dom.js";
import { test, expect } from "vitest";

declare global {
  interface Element {
    [key: symbol]: unknown; // Allows any symbol indexing
    // OR be explicit:
    // [trackingSymbol]: string;
  }
}

test("Virtual DOM engine preserves node stability using the key attribute during reordering", () => {
  // 1. Create and mount an anchor parent container in the real DOM
  const testContainer = document.createElement("div");
  document.body.appendChild(testContainer);

  // 2. Initial State: Target element is the only child (Index 0)
  // TRY THIS: Remove the 'key' attribute here and the test will now correctly FAIL.
  const renderViewAlpha = (): VNode =>
    h("div", {}, [
      h(
        "om-resizable",
        {
          key: "stable-test-id",
          props: { maximize: false, activeHandles: ["r", "b"] },
        },
        [text("Old Content")],
      ),
    ]);

  // 3. Updated State: Prepend a new element, pushing our target element to Index 1
  const renderViewBeta = (): VNode =>
    h("div", {}, [
      h("span", {}, [text("Newly Inserted Element")]),
      h(
        "om-resizable",
        {
          key: "stable-test-id", // Same key tells VDOM to move the node instead of destroying it
          props: { maximize: true, activeHandles: [] },
        },
        [text("New Content")],
      ),
    ]);

  // 4. Render and Mount Alpha View
  const vnodeAlpha = renderViewAlpha();
  const initialRealDOMTree = createRealDOM(vnodeAlpha);
  testContainer.appendChild(initialRealDOMTree);

  // 5. Locate target node and verify it exists
  const initialTargetNode = testContainer.querySelector("om-resizable");
  expect(initialTargetNode).toBeInstanceOf(HTMLElement);
  if (!initialTargetNode) return;

  // 6. Attach a unique identity tracking marker directly to the DOM reference memory
  const trackingSymbol = Symbol("node-identity-marker");
  initialTargetNode[trackingSymbol] = "I am the original node";

  // 7. Execute your VDOM framework patch/diff mechanism
  const vnodeBeta = renderViewBeta();
  patch(initialTargetNode, vnodeAlpha, vnodeBeta);

  // 8. Query the container to capture the post-patch element
  const postPatchTargetNode = testContainer.querySelector("om-resizable");

  // --- CORE VITEST ASSERTIONS ---
  try {
    // Assert 1: The element was not dropped from the DOM tree entirely
    expect(postPatchTargetNode).not.toBeNull();

    // Assert 2: Verify true DOM reference stability (Memory reference equality)
    expect(postPatchTargetNode).toBe(initialTargetNode);

    // Assert 3: Verify identity marker survived (Confirms node wasn't recreated)
    expect(postPatchTargetNode?.[trackingSymbol]).toBe(
      "I am the original node",
    );

    // Assert 4: Verify props updated successfully on the preserved node
    expect(postPatchTargetNode?.textContent).toBe("New Content");
    //expect(postPatchTargetNode?.getAttribute("maximize")).toBe("true");
  } finally {
    // Clean up testing side-effects from the browser document
    testContainer.remove();
  }
});
