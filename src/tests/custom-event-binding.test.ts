import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRealDOM, type VNode, h } from "../virtual-dom.js";

// --- 3. THE VITEST SPECIFICATION SUITE ---
describe("Virtual DOM Engine Custom Event Object Binding", () => {
  let container: HTMLElement;
  const dispatchSpy = vi.fn();

  beforeEach(() => {
    // Re-instantiate a clean document root before every single isolation pass
    container = document.createElement("div");
    document.body.appendChild(container);
    dispatchSpy.mockClear();
  });

  it('should successfully bind agnostic custom events using properties inside the "on" block object literal', () => {
    // Construct a mock node replica imitating your raw custom element layout structure
    const virtualCustomElement: VNode = h(
      "om-resizable",
      {
        id: "test-resizable",
        class: "resizable-component",
        // Our targeted agnostic event listener mapping block under test
        on: {
          "component:mount": (e: CustomEvent) => {
            const componentElement = e.target as HTMLElement;
            const parentElement = componentElement.parentElement;
            if (!componentElement || !parentElement) return;

            dispatchSpy({
              type: "Init",
              el: componentElement,
              parentEl: parentElement,
            });
          },
          "drag:start": (e: CustomEvent) => {
            if (!e.detail?.clientX || !e.detail?.clientY || !e.target) return;

            dispatchSpy({
              type: "PointerDown",
              mode: "drag",
              clientX: e.detail.clientX,
              clientY: e.detail.clientY,
              currentTarget: e.target,
              event: e.detail.originalEvent,
            });
          },
        },
      },
      [],
    );

    // A. Perform Compilation: Translate our template to a physical JSDOM element
    const realDOMNode = createRealDOM(virtualCustomElement) as HTMLElement;
    container.appendChild(realDOMNode);

    // Verify the native tag successfully mounted without error
    expect(realDOMNode).not.toBeNull();
    expect(realDOMNode.tagName).toBe("OM-RESIZABLE");
    expect(realDOMNode.className).toBe("resizable-component");

    // B. Trigger and Verify Event 1: "component:mount" CustomEvent
    const mountEvent = new CustomEvent("component:mount", { bubbles: true });
    realDOMNode.dispatchEvent(mountEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "Init",
      el: realDOMNode,
      parentEl: container, // The custom element captures its parents boundary instantly
    });

    // C. Trigger and Verify Event 2: "drag:start" CustomEvent containing nested detail payloads
    const mockOriginalEvent = new MouseEvent("mousedown");
    const dragStartEvent = new CustomEvent("drag:start", {
      bubbles: true,
      detail: {
        clientX: 150,
        clientY: 300,
        originalEvent: mockOriginalEvent,
      },
    });
    realDOMNode.dispatchEvent(dragStartEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "PointerDown",
      mode: "drag",
      clientX: 150,
      clientY: 300,
      currentTarget: realDOMNode,
      event: mockOriginalEvent,
    });

    // Cleanup JSDOM tree traces
    document.body.removeChild(container);
  });
});
