import { describe, it, expect, beforeEach, vi } from "vitest";
// Adjust imports to point to your engine file
import {
  type VNode,
  createRealDOM,
  patchProps,
  patch,
  h,
  text,
} from "../virtual-dom.js";

describe("MVU Virtual DOM Engine", () => {
  let container: HTMLElement;
  let engine: any;

  beforeEach(() => {
    // Reset browser mock environment before every test run
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  // --- UNIT TESTS FOR CREATION AND BASIC RENDERING ---
  describe("createRealDOM", () => {
    it("should correctly render a primitive tex node", () => {
      const txtNode: VNode = text("Hello World");
      const realNode = createRealDOM(txtNode);

      expect(realNode.nodeType).toBe(Node.TEXT_NODE);
      expect(realNode.nodeValue).toBe("Hello World");
    });

    it("should build elements, map attributes, and attach children", () => {
      const elementNode: VNode = h(
        "div",
        { id: "test-id", class: "active-element" },
        [text("Child Content")],
      );

      const realNode = createRealDOM(elementNode) as HTMLElement;

      expect(realNode.tagName).toBe("DIV");
      expect(realNode.id).toBe("test-id");
      expect(realNode.className).toBe("active-element");
      expect(realNode.childNodes.length).toBe(1);
      expect(realNode.textContent).toBe("Child Content");
    });
  });

  // --- UNIT TESTS FOR PATCHING AND PROPERTY DELTAS ---
  describe("patch & patchProps", () => {
    it("should swap nodes entirely if element tags do not match", () => {
      const oldVNode: VNode = h("p", {}, []);
      const newVNode: VNode = h("span", {}, []);

      const initialDOM = createRealDOM(oldVNode);
      container.appendChild(initialDOM);

      // Execute patching cycle
      patch(container.firstChild!, oldVNode, newVNode);

      expect(container.innerHTML).toBe("<span></span>");
    });

    it("should handle updating class strings using className cleanly", () => {
      const oldVNode: VNode = h("div", { class: "old-class" }, []);
      const newVNode: VNode = h("div", { class: "new-class" }, []);

      const el = createRealDOM(oldVNode) as HTMLElement;
      patchProps(el, oldVNode.props, newVNode.props);

      expect(el.className).toBe("new-class");
    });

    it("should cleanly purge missing keys from the underlying DOM node", () => {
      const oldVNode: VNode = h("div", { class: "stale", title: "temp" }, []);
      const newVNode: VNode = h("div", { title: "temp" }, []);

      const el = createRealDOM(oldVNode) as HTMLElement;
      patchProps(el, oldVNode.props, newVNode.props);

      expect(el.className).toBe(""); // Automatically zeroed out
      expect(el.getAttribute("title")).toBe("temp");
    });

    it("should cycle listeners preventing double-execution side-effects", () => {
      const callbackOld = vi.fn();
      const callbackNew = vi.fn();

      const oldVNode: VNode = h("button", { onClick: callbackOld }, []);
      const newVNode: VNode = h("button", { onClick: callbackNew }, []);

      const el = createRealDOM(oldVNode) as HTMLButtonElement;

      // Perform the patch cycle updates
      patchProps(el, oldVNode.props, newVNode.props);
      el.click();

      expect(callbackOld).not.toHaveBeenCalled();
      expect(callbackNew).toHaveBeenCalledTimes(1);
    });
  });

  // --- INTEGRATION TESTS FOR CUSTOM ELEMENT LIFECYCLES ---
  describe("Web Component Integrations", () => {
    it("should fire native lifecycle handlers seamlessly via custom elements", () => {
      const hookTrigger = vi.fn();

      // Setup a minimal mock Web Component
      class TestWidget extends HTMLElement {
        connectedCallback() {
          hookTrigger();
        }
      }
      if (!customElements.get("test-widget")) {
        customElements.define("test-widget", TestWidget);
      }

      const widgetNode: VNode = h("test-widget", {}, []);
      const realDOM = createRealDOM(widgetNode);

      // Lifecycles only execute once appended into an active document structure
      container.appendChild(realDOM);

      expect(hookTrigger).toHaveBeenCalledTimes(1);
    });
  });
});
