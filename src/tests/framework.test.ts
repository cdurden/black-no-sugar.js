// src/tests/counter.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type VNode, createRealDOM, patch, h, text } from "../virtual-dom.js";
import { Cmd, Sub, type SubEngine } from "../framework/base.js";

// --- 1. STUB BASICS FOR MVU TYPES ---
type AnyNode = any;

// Target Node definitions for our counter engine layout
interface CounterNode {
  count: number;
}

type CounterMsg = { type: "INCREMENT" } | { type: "DECREMENT" };

// --- 2. IMPLEMENT THE SUBENGINE INTERFACE ---
class CounterEngine implements SubEngine<CounterMsg, CounterNode, any> {
  type = "counter";

  // Initializer matching 'nodeDefinition' parameter updates
  init(
    nodeDefinition: any,
    _ctx: any,
    _recurse: (n: any, overrideCtx?: any) => [AnyNode, Cmd<CounterMsg>],
  ): [CounterNode, Cmd<CounterMsg>] {
    // Read an optional baseline configuration or fallback to 0
    const startCount = nodeDefinition?.initialCount ?? 0;
    return [{ count: startCount }, Cmd.none()];
  }

  // Pure Update matching (msg, node, ctx, recurse) parameters
  update(
    msg: CounterMsg,
    node: CounterNode,
    _ctx: any,
    _recurse: (
      m: CounterMsg,
      n: AnyNode,
      overrideCtx?: any,
    ) => [AnyNode, Cmd<CounterMsg>],
  ): [CounterNode, Cmd<CounterMsg>] {
    switch (msg.type) {
      case "INCREMENT":
        return [{ count: node.count + 1 }, Cmd.none()];
      case "DECREMENT":
        return [{ count: node.count - 1 }, Cmd.none()];
      default:
        return [node, Cmd.none()];
    }
  }

  // Pure Subscriptions block
  subscriptions(
    _node: CounterNode,
    _ctx: any,
    _recurse: (n: AnyNode, overrideCtx?: any) => Sub<CounterMsg>,
  ): Sub<CounterMsg> {
    return Sub.none(); // No background global event listeners or timers needed
  }

  // Pure View mapping matching (node, dispatch, ctx, recurse) parameters
  view(
    node: CounterNode,
    dispatch: (msg: CounterMsg) => void,
    _ctx: any,
    _recurse: (
      n: AnyNode,
      disp: (m: CounterMsg) => void,
      overrideCtx?: any,
    ) => VNode,
  ): VNode {
    return h("div", { class: "counter-wrapper" }, [
      h("span", { id: "count-display" }, [text(`Count: ${node.count}`)]),
      h(
        "button",
        {
          id: "btn-inc",
          onClick: () => dispatch({ type: "INCREMENT" }),
        },
        [text("+")],
      ),
    ]);
  }
}

// --- 3. TEST HARNESS SIMULATING THE MAIN RUNTIME ---
class AppRuntime {
  private engine: CounterEngine;
  private nodeState: CounterNode;
  private currentVNode: VNode | null = null;
  private rootElement: HTMLElement;
  private mockCtx: any = {} as any;

  constructor(root: HTMLElement, engine: CounterEngine, initialCount: number) {
    this.rootElement = root;
    this.engine = engine;

    // Boot via engine init hook
    const [initialNode, _cmds] = this.engine.init(
      { initialCount },
      this.mockCtx,
      () => [{}, Cmd.none()],
    );
    this.nodeState = initialNode;
  }

  public dispatch = (msg: CounterMsg): void => {
    // Route state modifications through engine's update loop
    const [nextNode, _cmds] = this.engine.update(
      msg,
      this.nodeState,
      this.mockCtx,
      () => [{}, Cmd.none()],
    );
    this.nodeState = nextNode;
    this.render();
  };

  public start(): void {
    this.render();
  }

  private render() {
    const defaultRecursePortal = (nestedNode: any): VNode => {
      if (typeof nestedNode === "string") {
        return text(nestedNode);
      }
      return text(nestedNode?.text || String(nestedNode));
    };
    // Generate view blueprint from the engine's view method
    const newVNode = this.engine.view(
      this.nodeState,
      this.dispatch,
      this.mockCtx,
      defaultRecursePortal,
    );

    if (!this.currentVNode) {
      const liveDOM = createRealDOM(newVNode);
      this.rootElement.appendChild(liveDOM);
    } else {
      const firstChild = this.rootElement.childNodes[0];
      if (firstChild) {
        patch(firstChild as Node, this.currentVNode, newVNode);
      } else {
        // Fallback rebuild if it vanished completely
        this.rootElement.appendChild(createRealDOM(newVNode));
      }
    }
    this.currentVNode = newVNode;
  }
}

// --- 4. ENGINE VERIFICATION SPEC ---
describe("SubEngine MVU Integration Spec", () => {
  let root: HTMLElement;
  let runtime: AppRuntime;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);

    const engineInstance = new CounterEngine();
    // Instantiates app starting count at 5 via nodeDefinition initializer map
    runtime = new AppRuntime(root, engineInstance, 5);
    runtime.start();
  });
  afterEach(() => {
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  });

  it("should initialize engine layout with initial values provided by nodeDefinition mapping", () => {
    const display = root.querySelector("#count-display");
    expect(display?.textContent).toBe("Count: 5");
  });
  it("should correctly handle incremental dispatch adjustments via engine update", () => {
    const display = root.querySelector("#count-display")!;
    const btn = root.querySelector("#btn-inc") as HTMLButtonElement;
    expect(display?.textContent).toBe("Count: 5");

    expect(btn).not.toBeNull(); // This assertion will now pass!
    btn.click();
    expect(display.textContent).toBe("Count: 6");
  });
});
