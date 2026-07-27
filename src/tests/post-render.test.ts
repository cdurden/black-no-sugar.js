import { describe, it, expect, vi, beforeEach } from "vitest";
import { h, text, type VNode } from "../virtual-dom.js";

// --- 1. THE EMBEDDED LIFECYCLE COMPONENT IMPLEMENTATION ---

class PostRenderElement extends HTMLElement {
  connectedCallback() {
    // Executes exactly when this custom tag enters an active document tree
    if (typeof (this as any).onMount === "function") {
      (this as any).onMount(this.parentElement);
    }
  }
}

if (typeof window !== "undefined" && !customElements.get("post-render")) {
  customElements.define("post-render", PostRenderElement);
}

function afterRender(callback: (parentEl: HTMLElement | null) => void): VNode {
  return h("post-render", { onMount: callback }, []);
}

// --- 2. ISOLATED VIRTUAL DOM GENERATION ENGINE ---

function createRealDOM(node: VNode): Node {
  if (node.type === "text") return document.createTextNode(node.text || "");

  const el = document.createElement(node.tag);

  // Cleanly wire properties straight to the object instance
  for (const [key, value] of Object.entries(node.props || {})) {
    if (key.startsWith("on") && key !== "onMount") {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key === "class") {
      el.className = value;
    } else {
      // Allows the PostRenderElement instance to read 'onMount' as a function property
      (el as any)[key] = value;
    }
  }

  (node.children || []).forEach((child) =>
    el.appendChild(createRealDOM(child)),
  );
  return el;
}

// --- 3. THE VITEST SPECIFICATION ---

describe("Post-Render Anchor Lifecycle Callback Engine", () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Reset simulated JSDOM body container between test isolation boundaries
    container = document.createElement("div");
    container.id = "app-root";
    document.body.appendChild(container);
  });

  it("should automatically fire the post-render callback only AFTER mounting to a live DOM parent", () => {
    const postRenderSpy = vi.fn();

    // Construct a sample component layout structure containing our declarative anchor
    const layoutNode: VNode = h(
      "section",
      { id: "card-container", class: "panel" },
      [
        h("h1", {}, [text("Card Header")]),
        // Inject the post render listener target into our virtual layout tree
        afterRender(postRenderSpy),
      ],
    );

    // A. Perform compilation: Convert Virtual VNode elements to real browser elements in-memory
    const liveDOM = createRealDOM(layoutNode);

    // Assert: In-memory DOM creation is NOT enough; the element must enter the active document context first
    expect(postRenderSpy).not.toHaveBeenCalled();

    // B. Perform Mounting: Append the compiled element directly into the document root tree
    container.appendChild(liveDOM);

    // Assert: Insertion into the active document tree forces the custom element's native hook to execute
    expect(postRenderSpy).toHaveBeenCalledTimes(1);

    // C. Verify Context Integrity: The custom anchor must pass a valid reference of its physical container node
    const capturedParentElement = postRenderSpy.mock.calls[0][0] as HTMLElement;

    expect(capturedParentElement).not.toBeNull();
    expect(capturedParentElement.tagName).toBe("SECTION");
    expect(capturedParentElement.id).toBe("card-container");
    expect(capturedParentElement.className).toBe("panel");
  });
});
