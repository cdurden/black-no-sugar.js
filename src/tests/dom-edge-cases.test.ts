import { describe, it, expect, beforeEach, vi } from "vitest";
// Adjust imports to point to your engine file
import { type VNode, createRealDOM, patchProps, h } from "../virtual-dom.js";

describe("DOM Engine Attribute Mapping Edge Cases", () => {
  it("should add onClick as an event listener and NOT leak it as a raw object property", () => {
    const clickSpy = vi.fn();
    const node: VNode = h("button", { id: "test-btn", onClick: clickSpy }, []);

    const el = createRealDOM(node) as HTMLButtonElement;

    // A. Verify the element built successfully and didn't crash out
    expect(el).not.toBeNull();
    expect(el.id).toBe("test-btn");

    // B. Check the leak: Did it assign onClick as an object attribute?
    // In a browser, raw event props should remain unpolluted by virtual props objects
    expect((el as any).onClick).toBeUndefined();

    // C. Verify the native listener actually fires
    el.click();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('should map the "class" attribute to "className" without leaking raw "class" string properties', () => {
    const node: VNode = h("div", { class: "my-custom-class" }, []);

    const el = createRealDOM(node) as HTMLDivElement;

    expect(el.className).toBe("my-custom-class");
    // Elements use "className" internally, raw "class" keys must not exist as JavaScript props
    expect((el as any)["class"]).toBeUndefined();
  });

  it("should safely replace old event listeners with new ones during patching without compounding them", () => {
    const oldSpy = vi.fn();
    const newSpy = vi.fn();

    const el = document.createElement("button");

    const oldProps = { onClick: oldSpy };
    const newProps = { onClick: newSpy };

    // Set initial listener manually to simulate initial render state
    el.addEventListener("click", oldSpy);

    // Run patchProps
    patchProps(el, oldProps, newProps);

    // Fire simulated click event
    el.click();

    // The old listener must be fully unbound; only the new closure should trigger
    expect(oldSpy).not.toHaveBeenCalled();
    expect(newSpy).toHaveBeenCalledTimes(1);
  });

  it("should completely purge custom props from the element if omitted in the next VNode frame", () => {
    const node: VNode = h(
      "div",
      { title: "Initial Title", class: "active" },
      [],
    );

    const el = createRealDOM(node) as HTMLDivElement;
    expect(el.getAttribute("title")).toBe("Initial Title");
    expect(el.className).toBe("active");

    // Remove props entirely in next step
    patchProps(el, { title: "Initial Title", class: "active" }, {});

    expect(el.getAttribute("title")).toBeNull();
    expect(el.className).toBe("");
  });
});
