import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type AnyNode,
  type NodeDefinition,
  type PolymorphicMsg,
  Sub,
  type ContainerMsg,
} from "../framework/base.js";
import { createContainerPlugin } from "../framework/container-adaptor.js";
import { createLeafPlugin, type LeafNode } from "../framework/leaf-adaptor.js";
import { createRealDOM } from "../virtual-dom.js";

// --- 1. DEFINE SYSTEM DOMAIN TYPES ---
type AppMsg = any;
type MockCtx = any;

// Local isolated message types for each layer
type LeafMsg = { type: "INCREMENT_VALUE" };
type ParentMsg = { type: "PARENT_EMPTY_ACTION" };
type GrandparentMsg = { type: "GRANDPARENT_EMPTY_ACTION" };

// --- 2. THE LEAF COMPONENT DEFINITION ---
// --- 1. DEFINE SPECIFIC COMPONENT METHOD SIGNATURES ---
interface LeafState {
  currentClicks: number;
}

// Ensure the local component shape strictly satisfies your framework's primitive types
export const leafComponent = {
  // Explicitly type the initialization parameters and return value
  init: (_ctx: MockCtx): [LeafState, { type: "None" }] => {
    return [{ currentClicks: 0 }, { type: "None" }];
  },

  // Explicitly type the update loop message, current model, and context parameters
  update: (
    msg: LeafMsg,
    model: LeafState,
    _ctx: MockCtx,
  ): [LeafState, { type: "None" }] => {
    switch (msg.type) {
      case "INCREMENT_VALUE":
        return [{ currentClicks: model.currentClicks + 1 }, { type: "None" }];
      default:
        return [model, { type: "None" }];
    }
  },
  subscriptions: (): Sub<LeafMsg> => Sub.none(),

  // Explicitly type the layout view renderer arguments
  view: (
    _model: LeafState,
    dispatch: (m: LeafMsg) => void,
    _ctx: MockCtx,
  ): any => {
    return {
      type: "element",
      tag: "button",
      props: {
        id: "trigger-btn",
        onClick: () => dispatch({ type: "INCREMENT_VALUE" }),
      },
      children: [],
    };
  },
};

// --- 3. THE GENERIC WRAPPER ENGINE REIFIER SIMULATOR ---
// This mocks how your main application engine maps layout schemas down at runtime
class TestAppRouter {
  private activeGrandparentEngine: any;
  private appNodeState: any;
  public dispatchSpy = vi.fn();

  constructor(
    grandparentEngine: any,
    mockTreeDef: NodeDefinition,
    ctx: MockCtx,
  ) {
    this.activeGrandparentEngine = grandparentEngine;

    // Boot the entire nested layout tree recursively using the engine's init loop
    const [initialTreeState] = this.activeGrandparentEngine.init(
      mockTreeDef,
      ctx,
      this.recurseInit,
    );
    this.appNodeState = initialTreeState;
  }

  // Framework-level polymorphic init recursion
  private recurseInit = (
    nodeDef: NodeDefinition,
    ctx: MockCtx,
  ): [AnyNode, any] => {
    if (nodeDef.type === "grandparent" || nodeDef.type === "parent") {
      const containerPlugin =
        nodeDef.type === "grandparent" ? grandparentContainer : parentContainer;
      return containerPlugin.init(nodeDef, ctx, this.recurseInit);
    }
    return leafPlugin.init(nodeDef, ctx, this.recurseInit);
  };

  // Framework-level polymorphic update routing loop
  public runtimeDispatch = (msg: PolymorphicMsg): void => {
    this.dispatchSpy(msg); // Track the global incoming event pipeline

    const recurseUpdate = (
      innerMsg: any,
      childNode: any,
      ctx: any,
    ): [any, any] => {
      if (childNode.layer === "container") {
        const containerPlugin =
          childNode.type === "grandparent"
            ? grandparentContainer
            : parentContainer;
        return containerPlugin.update(innerMsg, childNode, ctx, recurseUpdate);
      }
      return leafPlugin.update(innerMsg, childNode, ctx, recurseUpdate);
    };

    // Begin routing down from the very top Grandparent node boundary
    const [nextTreeState] = this.activeGrandparentEngine.update(
      msg,
      this.appNodeState,
      {} as MockCtx,
      recurseUpdate,
    );
    this.appNodeState = nextTreeState;
  };
}

// --- 4. INSTANTIATE PLUGINS VIA YOUR CORE FACTORIES ---
const leafPlugin = createLeafPlugin<LeafMsg, LeafState, MockCtx>(
  "leaf-btn",
  leafComponent,
);

const parentContainer = createContainerPlugin<"content", {}>("parent", {
  update: (_msg: any, model: any) => [model, { type: "None" }],
  // 🟢 FIX A: Explicitly return the child rendering node structure
  view: (model: any, renderChild: (child: any) => any, _dispatch: any) => {
    return renderChild(model.children.content);
  },
});

const grandparentContainer = createContainerPlugin<"main", {}>("grandparent", {
  update: (_msg: any, model: any) => [model, { type: "None" }],
  // 🟢 FIX B: Explicitly return the child rendering node structure
  view: (model: any, renderChild: (child: any) => any, _dispatch: any) => {
    return renderChild(model.children.main);
  },
});

// --- 5. THE PROPAGATION VERIFICATION SPEC ---
describe("Polymorphic Multi-Level Event Propagation Matrix", () => {
  let mockCtx: MockCtx;

  beforeEach(() => {
    mockCtx = {} as MockCtx;
  });

  it("should cleanly encapsulate and bubble leaf dispatch actions across multiple container layers", () => {
    // A. Construct a Blueprint definition dictionary representing a 3-tier deep component structure
    const nestedMockTreeDefinition: NodeDefinition = {
      type: "grandparent",
      id: "id-grandparent-111",
      key: "key-grandparent",
      meta: {},
      raw: { args: [] },
      interceptor: undefined,
      children: {
        main: {
          type: "parent",
          id: "id-parent-222",
          key: "key-parent",
          meta: {},
          raw: { args: [] },
          interceptor: undefined,
          children: {
            content: {
              type: "leaf-btn",
              id: "id-leaf-333",
              key: "key-leaf",
              meta: {},
              raw: { args: [] },
              children: {},
              interceptor: undefined,
            },
          },
        },
      },
    };

    // B. Spin up the application engine simulation router framework
    const appShell = new TestAppRouter(
      grandparentContainer,
      nestedMockTreeDefinition,
      mockCtx,
    );

    // C. Re-compile the View layer using the exact nested callbacks specified by your container adapters
    const mockViewRecurse = (node: any, dispatch: (m: any) => void): any => {
      if (node.layer === "container") {
        const container =
          node.type === "grandparent" ? grandparentContainer : parentContainer;
        // Inject the recursive custom render child helper loop setup inside view
        return container.view(node, dispatch, mockCtx, mockViewRecurse);
      }
      return leafPlugin.view(node, dispatch, mockCtx, mockViewRecurse);
    };

    // Generate the compiled blueprint markup layout
    const generatedVNodeLayoutTree = mockViewRecurse(
      appShell["appNodeState"],
      appShell.runtimeDispatch,
    );

    const physicalDOM = createRealDOM(generatedVNodeLayoutTree) as HTMLElement;
    document.body.appendChild(physicalDOM);

    // Locate the deeply nested button target index element
    const btn = document.body.querySelector(
      "#trigger-btn",
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();

    // Act: Simulate a physical user click event happening at the core leaf level
    btn.click();

    // --- VERIFY ENCAPSULATION AND WRAPPING BULLETPROOF MATRICES ---
    expect(appShell.dispatchSpy).toHaveBeenCalledTimes(1);

    // Extract the exact Polymorphic payload caught by the root application shell
    const loggedFrameworkMessage = appShell.dispatchSpy.mock
      .calls[0][0] as ContainerMsg;

    // 🟢 ASSERTION 1: The top layer engine captures it mapped specifically as a Grandparent Container action
    expect(loggedFrameworkMessage.type).toBe("ContainerAction");
    expect(loggedFrameworkMessage.id).toBe("id-grandparent-111");
    expect(loggedFrameworkMessage.key).toBe("key-parent"); // The key of the child it controls directly

    // 🟢 ASSERTION 2: Dig down into level 2. The inner message must wrap inside the Parent Container container profile action
    const secondaryNestedAction = (loggedFrameworkMessage as any).innerMsg;
    expect(secondaryNestedAction).toBeDefined();
    expect(secondaryNestedAction.type).toBe("ContainerAction");
    expect(secondaryNestedAction.id).toBe("id-parent-222");
    expect(secondaryNestedAction.key).toBe("key-leaf"); // Points directly down to our destination leaf instance key

    // 🟢 ASSERTION 3: Dig down to the root payload leaf layer. The original pure Leaf message is intact!
    const leafMessage = secondaryNestedAction.innerMsg;
    expect(leafMessage).toBeDefined();
    expect(leafMessage.type).toBe("LeafAction");

    // 🟢 ASSERTION 4: Dig down to the actual leaf component. The original pure Leaf component message is intact!
    const leafComponentMessagePayload = leafMessage.componentMsg;
    expect(leafComponentMessagePayload).toBeDefined();
    expect(leafComponentMessagePayload.type).toBe("INCREMENT_VALUE");

    // Clean up JSDOM elements
    document.body.removeChild(physicalDOM);
  });
});
