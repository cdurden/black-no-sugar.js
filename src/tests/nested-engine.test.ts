import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cmd, Sub, type SubEngine } from "../framework/base.js";
import { createRealDOM, h, text, type VNode } from "../virtual-dom.js";

// --- 1. DEFINE CORE DISPATCH ARCHITECTURE ---
type AnyNode = any;

// Parent Namespace Messages
type ParentMsg =
  | { type: "TOGGLE_LAYOUT" }
  | { type: "CHILD_ACTION"; payload: any }; // 👈 Namespace wrapper for child updates

// --- 2. CHILD SUB-ENGINE ---
interface ChildState {
  text: string;
}
type ChildMsg = { type: "TRIGGER_ALERT" };

class ChildEngine implements SubEngine<ChildMsg, ChildState, any> {
  type = "child-component";
  init = (): [ChildState, Cmd<ChildMsg>] => [{ text: "Click Me" }, Cmd.none()];
  update = (_msg: ChildMsg, node: ChildState): [ChildState, Cmd<ChildMsg>] => [
    node,
    Cmd.none(),
  ];
  subscriptions = (): Sub<ChildMsg> => Sub.none();

  view(node: ChildState, dispatch: (msg: ChildMsg) => void): VNode {
    return h(
      "button",
      {
        id: "child-btn",
        onClick: () => dispatch({ type: "TRIGGER_ALERT" }), // Emits child msg
      },
      [text(node.text)],
    );
  }
}

// --- 3. PARENT ENGINE (Composing via Recurse) ---
interface ParentState {
  showSidebar: boolean;
  childNodeRef: AnyNode; // Keeps a data reference to child state node tree
}

class ParentEngine implements SubEngine<ParentMsg, ParentState, any> {
  type = "parent-layout";
  init = (): [ParentState, Cmd<ParentMsg>] => [
    { showSidebar: true, childNodeRef: { text: "Nested Button Content" } },
    Cmd.none(),
  ];
  update = (
    _msg: ParentMsg,
    node: ParentState,
  ): [ParentState, Cmd<ParentMsg>] => [node, Cmd.none()];
  subscriptions = (): Sub<ParentMsg> => Sub.none();

  view(
    node: ParentState,
    dispatch: (msg: ParentMsg) => void,
    _ctx: any,
    recurse: (n: AnyNode, disp: (m: any) => void) => VNode,
  ): VNode {
    return h("div", { class: "dashboard-wrapper" }, [
      h("aside", { class: "sidebar" }, [
        text(`Sidebar Open: ${node.showSidebar}`),
      ]),
      // 🟢 SAFELY RECURSING DOM COMPOSITION BELOW
      h("main", { class: "content-area" }, [
        // Invoke the recurse portal to inject the nested layout.
        // We pass a custom dispatch interceptor to encapsulate the child framework scope.
        recurse(node.childNodeRef, (childMsg: ChildMsg) =>
          dispatch({ type: "CHILD_ACTION", payload: childMsg }),
        ),
      ]),
    ]);
  }
}

// --- 4. THE COMPOSITION INTEGRATION SPEC ---
describe("SubEngine Recurse View Composition", () => {
  let root: HTMLElement;
  const mockChildEngine = new ChildEngine();
  const mockParentEngine = new ParentEngine();

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("should cleanly handoff state definitions and maps down the recurse tree pipeline", () => {
    const parentState = {
      showSidebar: true,
      childNodeRef: { text: "Dynamic Child Label" },
    };
    const parentDispatchSpy = vi.fn();
    const mockCtx = {} as any;

    // 1. Create a simulated recurse wrapper engine router stub
    const recurseStub = (
      childNode: AnyNode,
      nestedDispatch: (m: any) => void,
    ): VNode => {
      // Behind the scenes, the framework core maps node types to child engines
      return mockChildEngine.view(childNode, nestedDispatch);
    };

    // 2. Render the top level parent node structure tree
    const generatedVNodeTree = mockParentEngine.view(
      parentState,
      parentDispatchSpy,
      mockCtx,
      recurseStub,
    );

    root.appendChild(createRealDOM(generatedVNodeTree));

    // --- ASSERTIONS ---
    const parentSidebar = root.querySelector(".sidebar");
    const nestedChildBtn = root.querySelector(
      "#child-btn",
    ) as HTMLButtonElement;

    // Verify parent elements render correctly alongside recursively nested structures
    expect(parentSidebar?.textContent).toBe("Sidebar Open: true");
    expect(nestedChildBtn).not.toBeNull();
    expect(nestedChildBtn.textContent).toBe("Dynamic Child Label");

    // Simulate clicking inside the isolated boundaries of the nested child
    nestedChildBtn.click();

    // Verify child actions wrap inside the parent container namespace cleanly
    expect(parentDispatchSpy).toHaveBeenCalledTimes(1);
    expect(parentDispatchSpy).toHaveBeenCalledWith({
      type: "CHILD_ACTION",
      payload: { type: "TRIGGER_ALERT" },
    });
  });
});
