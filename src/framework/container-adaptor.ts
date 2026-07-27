import { Engine } from "../engine.js";
import type {
  AnyNode,
  ContainerNode,
  NodeDefinition,
  ContainerMsg,
  ComponentId,
  Selector,
  EngineLifecycle,
} from "./base.js";
import { Cmd, Sub, mapCmd, mapSub } from "./base.js";

export interface ContainerLayout<
  Slots extends string,
  State extends Record<string, any> = {},
> {
  //readonly slots: readonly Slots[];
  view: (
    model: ContainerNode<Slots, State>,
    renderChild: (child: AnyNode | undefined, overrideCtx?: any) => any,
    dispatch: (msg: any) => void,
    ctx: any,
    selector?: Selector,
  ) => any;
}

export interface ContainerNodeSpec<
  Slots extends string,
  State extends Record<string, any> = {},
> extends ContainerLayout<Slots, State> {
  getContext?: (m: any, ctx: any) => any;
  init?: (
    params: Record<string, any>,
    ctx: any,
    ...args: any[]
  ) => [ContainerNode<Slots, State>, any];
  update?: (
    msg: any,
    model: ContainerNode<Slots, State>,
    ctx: any,
    recurse: (m: any, n: AnyNode, overrideCtx?: any) => [AnyNode, any],
  ) => [ContainerNode<Slots, State>, any];
  subscriptions?: (
    node: ContainerNode<Slots, State>,
    ctx: any,
    recurse: (n: AnyNode, overrideCtx?: any) => any,
  ) => any;
}

type RecurseCallback = (
  n: AnyNode,
  disp: (m: any) => void,
  overrideCtx?: any,
  s?: Selector,
) => any;

export interface ContainerPluginWrapper<
  Slots extends string,
  State extends Record<string, any> = Record<string, any>,
> extends EngineLifecycle<any, ContainerNode<Slots, State>, any> {
  kind: "container";
  type: string;
  spec?: ContainerNodeSpec<Slots, State>;
  interceptor?: any;
  /*
  init: (
    nodeDefinition: NodeDefinition,
    ctx: any,
    recurse: (nodeDef: NodeDefinition, overrideCtx?: any) => [AnyNode, any],
  ) => [ContainerNode<Slots, State>, any];
  update: (
    msg: any,
    model: ContainerNode<Slots, State>,
    ctx: any,
    recurse: (m: any, n: AnyNode, overrideCtx?: any) => [AnyNode, any],
  ) => [ContainerNode<Slots, State>, any];
  subscriptions: (
    node: ContainerNode<Slots, State>,
    ctx: any,
    recurse: (n: AnyNode, overrideCtx?: any) => any,
  ) => any;
  view: (
    node: ContainerNode<Slots, State>,
    dispatch: (msg: any) => void,
    ctx: any,
    recurse: (
      n: AnyNode,
      disp: (m: any) => void,
      overrideCtx?: any,
      s?: Selector,
    ) => any,
    selector?: Selector,
  ) => any;
  */
}

export function createContainerPlugin<
  Slots extends string,
  State extends Record<string, any> = {},
>(
  nodeType: string,
  spec: ContainerNodeSpec<Slots, State>,
  interceptor?: any,
): ContainerPluginWrapper<Slots, State> {
  return {
    kind: "container",
    type: nodeType,
    spec,
    interceptor,

    // --- 1. INITIALIZATION RECURSION PIPELINE ---
    init: (nodeDefinition: NodeDefinition, ctx, recurse) => {
      if (nodeDefinition.type !== nodeType) {
        throw Error(
          `SubEngine's init function was called with a node of the wrong type`,
        );
      }
      const activeCtx =
        spec && typeof spec.getContext === "function"
          ? spec.getContext({ state: nodeDefinition.meta as State }, ctx)
          : ctx;
      const [initialModel, specCmd] =
        spec && typeof spec.init === "function"
          ? spec.init(nodeDefinition.meta, activeCtx)
          : [{ state: nodeDefinition.meta as State }, Cmd.none()]; // FIXME: sanitize the state

      const cmds: any[] = [specCmd];
      const node: ContainerNode<Slots, State> = {
        layer: "container" as const,
        type: nodeType,
        id: nodeDefinition.id as ComponentId,
        key: nodeDefinition.key,
        state: initialModel.state,
        children: Object.entries(nodeDefinition.children || {}).reduce(
          (acc, [childKey, childNodeDefinition]) => {
            const [childNode, childCmd] = recurse(
              childNodeDefinition,
              activeCtx,
            );
            const wrappedCmd = mapCmd(
              childCmd,
              (msg: any): ContainerMsg => ({
                type: "ContainerAction" as const,
                id: nodeDefinition.id,
                key: childNode.key,
                innerMsg: msg,
              }),
            );
            cmds.push(wrappedCmd);
            return { ...acc, [childKey]: childNode };
          },
          {},
        ),
      };
      return [node, Cmd.batch(cmds)];
    },

    // --- 2. CASCADING STATE UPDATE MIDDLEWARE & SUB-ROUTING ---
    update: (
      msg: any,
      model: ContainerNode<Slots, State>,
      ctx: any,
      recurse,
    ): [ContainerNode<Slots, State>, any] => {
      if (model.type !== nodeType) {
        throw Error(
          `update was called on a node that does not match the SubEngine type`,
        );
      }

      // Global context cross-sync interceptor boundary
      if (interceptor) {
        const overrides = interceptor(msg, model, ctx, recurse);
        if (overrides)
          return [overrides.nextNode, overrides.outboundCmd || Cmd.none()];
      }

      const activeCtx =
        spec && typeof spec.getContext === "function"
          ? spec.getContext(model, ctx)
          : ctx;

      let currentModel = model;
      const accumulatedCmds: any[] = [];

      // 🟢 PASS A: Structural Child Routing & Command Mapping
      if (msg.type === "ContainerAction") {
        const targetBranchKey = msg.key;
        const activeRuntimeSlots = Object.keys(currentModel.children || {});

        if (
          targetBranchKey in currentModel.children &&
          activeRuntimeSlots.includes(targetBranchKey)
        ) {
          const currentChildSubModel =
            currentModel.children[targetBranchKey as Slots];

          if (currentChildSubModel) {
            const [nextChildSubModel, childCmd] = recurse(
              msg.innerMsg,
              currentChildSubModel,
              activeCtx,
            );

            // Assemble partial children layout maps safely to tolerate unmount actions
            const updatedChildren: Partial<Record<Slots, AnyNode>> = {
              ...currentModel.children,
              [targetBranchKey]: nextChildSubModel,
            };

            currentModel = {
              ...currentModel,
              children: updatedChildren,
            };

            const wrappedCmd = mapCmd(
              childCmd,
              (m: any): ContainerMsg => ({
                type: "ContainerAction" as const,
                id: msg.id,
                key: targetBranchKey,
                innerMsg: m,
              }),
            );
            accumulatedCmds.push(wrappedCmd);
          }
        }
      }

      // 🟢 PASS B: Cascading Handoff to Component Specifications
      // Forwards the freshly mutated state and message token down into the spec logic
      if (spec && typeof spec.update === "function") {
        const [nextSpecModel, specCmd] = spec.update(
          msg,
          currentModel,
          activeCtx,
          recurse,
        );
        currentModel = nextSpecModel;
        if (specCmd) {
          accumulatedCmds.push(specCmd);
        }
      }

      return [currentModel, Cmd.batch(accumulatedCmds)];
    },

    // --- 3. CASCADING SUBSCRIPTIONS CRAWLER ---
    subscriptions: (node, ctx, recurse) => {
      if (node.type !== nodeType) {
        throw Error(
          `subscriptions was called on a node that does not match the SubEngine type`,
        );
      }

      const accumulatedSubs: any[] = [];

      const activeCtx =
        spec && typeof spec.getContext === "function"
          ? spec.getContext(node, ctx)
          : ctx;

      // 🟢 PASS A: Automated Child Background Listeners Accumulation
      if (node.children) {
        const childrenSubsList = Object.entries(node.children).reduce(
          (acc: any[], [_childKey, childNode]) => {
            if (!childNode) return acc;

            const typedChildNode = childNode as AnyNode;
            const childSub = recurse(typedChildNode, activeCtx);
            const wrappedSub = mapSub(
              childSub,
              (m: any): ContainerMsg => ({
                type: "ContainerAction" as const,
                id: node.id,
                key: typedChildNode.key,
                innerMsg: m,
              }),
            );

            return [...acc, wrappedSub];
          },
          [],
        );

        accumulatedSubs.push(...childrenSubsList);
      }

      // 🟢 PASS B: Component Specification Internal Subscription Binding
      if (spec && typeof spec.subscriptions === "function") {
        const containerOwnSub = spec.subscriptions(node, activeCtx, recurse);
        if (containerOwnSub && containerOwnSub.type !== "None") {
          accumulatedSubs.push(containerOwnSub);
        }
      }

      return accumulatedSubs.length > 0
        ? Sub.batch(accumulatedSubs)
        : Sub.none();
    },

    // --- 4. TYPE-SAFE VIEW RENDERING PORTAL ---
    view: (node, dispatch, ctx, recurse, selector) => {
      if (node.type !== nodeType) {
        throw Error(
          `nodeType passed to SubEngine factory did not match type of node passed to its view method`,
        );
      }

      const activeCtx =
        spec && typeof spec.getContext === "function"
          ? spec.getContext(node, ctx)
          : ctx;

      const renderChildHelper = (
        child: AnyNode | undefined,
        overrideCtx?: any,
      ) => {
        if (!child) return { type: "text", text: "" };

        const targetKey = child.key || "unknown_key";
        return recurse(
          child,
          (childMsg) =>
            dispatch({
              type: "ContainerAction" as const,
              id: node.id,
              key: targetKey,
              innerMsg: childMsg,
            }),
          overrideCtx || activeCtx, // Cascades runtime context modifications downwards
        );
      };

      return spec.view(node, renderChildHelper, dispatch, activeCtx, selector);
    },
  };
}
