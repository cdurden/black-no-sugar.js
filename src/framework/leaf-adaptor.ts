/**
 * Strongly-Typed Leaf Component Adaptor Factory.
 * Maps a framework-agnostic Component onto a specific AppSchema slot with 0% loose 'any' leakages.
 */
import { Cmd, mapCmd, mapSub, type LeafMsg } from "./base.js";
import type { ComponentId, EngineLifecycle } from "./base.js";
import { Selector } from "./base.js";

import type { Component } from "../engine.js";

export interface LeafNode<Model> {
  layer: "leaf";
  type: string;
  id: ComponentId;
  key: string;
  state: Model;
  children: Record<string, never>; // Leaf nodes have no nested slots or child paths
}
export interface LeafPluginWrapper<
  Msg,
  Model,
  Ctx = any,
> extends EngineLifecycle<LeafMsg, LeafNode<Model>, Ctx> {
  readonly kind: "leaf";
  readonly type: string;
  readonly name: string;
  readonly component: Component<Msg, Model, Ctx>;
}

export function createLeafPlugin<Msg, Model, Ctx = any>(
  nodeType: string,
  component: Component<Msg, Model, Ctx>,
): LeafPluginWrapper<Msg, Model, Ctx> {
  return {
    kind: "leaf",
    type: nodeType,
    name: nodeType,
    component,

    init: (nodeDefinition, ctx, _recurse) => {
      const initArgs = (nodeDefinition.raw.args as unknown[]) || [];
      const [childModel, childCmd] = component.init(ctx, ...initArgs);
      const leafNode = {
        layer: "leaf" as const,
        type: nodeType,
        id: nodeDefinition.id as ComponentId,
        key: nodeDefinition.key,
        state: childModel, // FIXME: Container components initialize the state to nodeDefinition.meta. We should move this to children.leaf, and handle the state variables the same way here as we do with container components.
        children: {},
      };

      const wrappedCmd = mapCmd(
        childCmd,
        (m): LeafMsg => ({
          type: "LeafAction" as const,
          nodeType,
          id: nodeDefinition.id,
          componentMsg: m,
        }),
      );

      return [leafNode, wrappedCmd];
    },

    update: (
      msg: LeafMsg,
      node: LeafNode<Model>,
      ctx: Ctx,
    ): [LeafNode<Model>, Cmd<LeafMsg>] => {
      // Discriminant type guard narrowing
      if (
        //node.layer === "leaf" &&
        msg.type === "LeafAction" &&
        msg.nodeType === nodeType
      ) {
        const localState = node.state;
        const [nextChildModel, childCmd] = component.update(
          msg.componentMsg,
          localState,
          ctx,
        );

        const nextNode: LeafNode<Model> = {
          ...node,
          state: nextChildModel,
        };

        return [
          nextNode,
          mapCmd(childCmd, (m) => ({
            type: "LeafAction" as const,
            nodeType,
            id: msg.id,
            componentMsg: m,
          })),
        ];
      }
      return [node, Cmd.none()];
    },
    /*
    update: (
      msg: Msg,
      node: LeafNode<Model>,
      ctx: Ctx,
    ): [LeafNode<Model>, Cmd<Msg>] => {
      if (node.type !== nodeType) {
        throw Error(
          `update was called on a node that does not match the SubEngine type`,
        );
      }

      // Route state updates through the child component's pure core update loop
      const [nextState, componentCmd] = component.update(msg, node.state, ctx);

      const nextNode: LeafNode<Model> = {
        ...node,
        state: nextState,
      };

      return [nextNode, componentCmd];
    },
    */
    subscriptions: (node: LeafNode<Model>, ctx: Ctx, _recurse) => {
      //if (model.layer !== "leaf") return Sub.none();
      const localState = node.state;
      return mapSub(component.subscriptions(localState, ctx), (m) => ({
        type: "LeafAction" as const,
        nodeType,
        id: node.id,
        componentMsg: m,
      }));
    },

    view: (
      node: LeafNode<Model>,
      dispatch: (msg: LeafMsg) => void,
      ctx: Ctx,
    ) => {
      //if (model.layer !== "leaf") return h("div", {}, []);
      const localState = node.state as Model;
      const selector = Selector(node.id);
      return component.view(
        localState,
        (cMsg) =>
          dispatch({
            type: "LeafAction" as const,
            nodeType,
            id: node.id,
            componentMsg: cMsg,
          }),
        ctx,
        selector,
      );
    },
    /*
    view: (node: LeafNode<Model>, dispatch: (msg: Msg) => void, ctx: Ctx) => {
      if (node.type !== nodeType) {
        throw Error(
          `nodeType passed to SubEngine factory did not match type of node passed to its view method`,
        );
      }

      // Render out component markup layout
      return component.view(node.state, dispatch, ctx);
    },
    */
  };
}
/*
export interface LeafPluginWrapper<Msg, Model, Ctx> {
  type: "leaf";
  name: string;
  init: (ctx: Ctx, ...args: any[]) => [Model, any];
  update: (msg: Msg, model: Model, ctx: Ctx) => [Model, any];
  view: (model: Model, dispatch: (msg: Msg) => void, ctx: Ctx) => any;
}

export function createLeafPlugin<Msg, Model, Ctx>(
  name: string,
  component: Component<Msg, Model, Ctx>,
): LeafPluginWrapper<Msg, Model, Ctx> {
  return {
    type: "leaf",
    name,
    init: (nodeDefinition, ctx, recurse) => {
      const initArgs = (nodeDefinition.raw.args as unknown[]) || [];
      const [childModel, childCmd] = component.init(ctx, ...initArgs);
      const leafNode: LeafNode<AppSchema[K]["model"]> = {
        //layer: "leaf",
        type: nodeType,
        id: nodeDefinition.id as ComponentId,
        key: nodeDefinition.key,
        state: childModel,
        children: {},
      };

      const wrappedCmd = mapCmd(
        childCmd,
        (m): PolymorphicMsg => ({
          type: "LeafAction" as const,
          nodeType,
          id: nodeDefinition.id,
          componentMsg: m,
        }),
      );

      return [
        leafNode as unknown as LeafNode<AppSchema[K]["model"]>,
        wrappedCmd,
      ];
    },

    update: (msg, node, ctx, recurse) => {
      // Discriminant type guard narrowing
      if (
        //node.layer === "leaf" &&
        msg.type === "LeafAction" &&
        msg.nodeType === nodeType
      ) {
        const localState = node.state as AppSchema[K]["model"];
        const [nextChildModel, childCmd] = component.update(
          msg.componentMsg,
          localState,
          ctx,
        );

        const nextNode: LeafNode<AppSchema[K]["model"]> = {
          ...node,
          state: nextChildModel,
        };

        return [
          nextNode,
          mapCmd(childCmd, (m) => ({
            type: "LeafAction" as const,
            nodeType,
            id: msg.id,
            componentMsg: m,
          })),
        ];
      }
      return [node, Cmd.none()];
    },

    subscriptions: (node, ctx, recurse) => {
      //if (model.layer !== "leaf") return Sub.none();
      const localState = node.state as AppSchema[K]["model"];
      return mapSub(component.subscriptions(localState, ctx), (m) => ({
        type: "LeafAction" as const,
        nodeType,
        id: node.id,
        componentMsg: m,
      }));
    },

    view: (model, dispatch, ctx, recurse) => {
      //if (model.layer !== "leaf") return h("div", {}, []);
      const localState = model.state as AppSchema[K]["model"];
      return component.view(
        localState,
        (cMsg) =>
          dispatch({
            type: "LeafAction" as const,
            nodeType,
            id: model.id,
            componentMsg: cMsg,
          }),
        ctx,
      );
    },
  };
}
*/
/*
export function createLeafPlugin<K extends SchemaType>(
  nodeType: K,
  component: ,
): SubEngine<
  PolymorphicMsg,
  LeafNode<AppSchema[K]["model"]>,
  AppSchema[K]["ctx"]
> {
  return {
    type: nodeType,
    // ◄ 🟢 GUARANTEED MODEL TYPE PARAMETER INTRODUCED!
    init: (nodeDefinition, ctx, recurse) => {
      const initArgs = (nodeDefinition.raw.args as unknown[]) || [];
      const [childModel, childCmd] = component.init(ctx, ...initArgs);
      const leafNode: LeafNode<AppSchema[K]["model"]> = {
        //layer: "leaf",
        type: nodeType,
        id: nodeDefinition.id as ComponentId,
        key: nodeDefinition.key,
        state: childModel,
        children: {},
      };

      const wrappedCmd = mapCmd(
        childCmd,
        (m): PolymorphicMsg => ({
          type: "LeafAction" as const,
          nodeType,
          id: nodeDefinition.id,
          componentMsg: m,
        }),
      );

      return [
        leafNode as unknown as LeafNode<AppSchema[K]["model"]>,
        wrappedCmd,
      ];
    },

    update: (msg, node, ctx, recurse) => {
      // Discriminant type guard narrowing
      if (
        //node.layer === "leaf" &&
        msg.type === "LeafAction" &&
        msg.nodeType === nodeType
      ) {
        const localState = node.state as AppSchema[K]["model"];
        const [nextChildModel, childCmd] = component.update(
          msg.componentMsg,
          localState,
          ctx,
        );

        const nextNode: LeafNode<AppSchema[K]["model"]> = {
          ...node,
          state: nextChildModel,
        };

        return [
          nextNode,
          mapCmd(childCmd, (m) => ({
            type: "LeafAction" as const,
            nodeType,
            id: msg.id,
            componentMsg: m,
          })),
        ];
      }
      return [node, Cmd.none()];
    },

    subscriptions: (node, ctx, recurse) => {
      //if (model.layer !== "leaf") return Sub.none();
      const localState = node.state as AppSchema[K]["model"];
      return mapSub(component.subscriptions(localState, ctx), (m) => ({
        type: "LeafAction" as const,
        nodeType,
        id: node.id,
        componentMsg: m,
      }));
    },

    view: (model, dispatch, ctx, recurse) => {
      //if (model.layer !== "leaf") return h("div", {}, []);
      const localState = model.state as AppSchema[K]["model"];
      return component.view(
        localState,
        (cMsg) =>
          dispatch({
            type: "LeafAction" as const,
            nodeType,
            id: model.id,
            componentMsg: cMsg,
          }),
        ctx,
      );
    },
  };
}
*/
/*
export function createLeafPlugin<K extends SchemaType>(
    nodeType: K,
    component: Component<
        AppSchema[K]["model"],
        AppSchema[K]["msg"],
        AppSchema[K]["ctx"]
    >
): SubEngine<AppSchema[K]["model"], AppSchema[K]["ctx"]> {
    return {
        type: nodeType,

        // 1. Initialization Step: Extract startup array arguments from the public .raw layout data layer
        init: (node, ctx, recurse) => {
            // Safely capture dynamic arguments out of the type-safe raw schema
            const initArgs = (node.raw.args as unknown[]) || [];

            // Execute the component's private domain initialization math
            const [childModel, childCmd] = component.init(ctx, ...initArgs);

            // Construct a strict LeafModel structure, avoiding open index dictionary signatures completely
            const wrappedModel: LeafModel = {
                type: nodeType,
                id: node.id as ComponentId, // Bounded to the branded nominal ComponentId string
                state: childModel, // Locked securely as the private domain state black box
            };

            // Wrap outbound component intents so they match the parent messaging union signatures
            const wrappedCmd = mapCmd(
                childCmd,
                (m): PolymorphicMsg => ({
                    type: "LeafAction" as const,
                    nodeType,
                    id: node.id,
                    componentMsg: m,
                })
            );

            // Cast LeafModel onto PolymorphicModel for the central registry passthrough matrix
            return [wrappedModel, wrappedCmd];
        },

        // 2. Transaction Update Step: Safely narrow the state capsule and forward actions down
        update: (msg, model, ctx, recurse) => {
            // Guard condition: Ensure we are addressing the correct element type and matching ID layout slots
            if (
                model.type === nodeType &&
                msg.type === "LeafAction" &&
                msg.nodeType === nodeType
            ) {
                // 🟢 SAFE NARROWING: We cast 'unknown' model state safely because K matches the strict schema definition!
                const localState = model.state as AppSchema[K]["model"];

                // Execute the inner domain update transaction loop
                const [nextChildModel, childCmd] = component.update(
                    msg.componentMsg,
                    localState,
                    ctx
                );

                const nextModel: LeafModel = {
                    type: nodeType,
                    id: model.id as ComponentId,
                    key: model.key,
                    state: nextChildModel,
                };

                const wrappedCmd = mapCmd(
                    childCmd,
                    (m): PolymorphicMsg => ({
                        type: "LeafAction" as const,
                        nodeType,
                        id: msg.id,
                        componentMsg: m,
                    })
                );

                return [
                    nextModel as unknown as AppSchema[K]["model"],
                    wrappedCmd,
                ];
            }

            return [model, Cmd.none<PolymorphicMsg>()];
        },

        // 3. Real-Time Subscriptions Step: Isolate real-time network topic listeners
        subscriptions: (model, ctx, recurse) => {
            if (model.type !== nodeType) return Sub.none<PolymorphicMsg>();

            // Narrow the state chunk cleanly and parse component topics
            const localState = model.state as AppSchema[K]["model"];

            return mapSub(
                component.subscriptions(localState, ctx),
                (m): PolymorphicMsg => ({
                    type: "LeafAction" as const,
                    nodeType,
                    id: model.id,
                    componentMsg: m,
                })
            );
        },

        // 4. Presentation View Step: Intercept local dispatchers to add tracking envelopes
        view: (model, dispatch, ctx, recurse) => {
            if (model.type !== nodeType) return h("div", {}, []);

            // Narrow the state chunk cleanly for visual rendering evaluation passes
            const localState = model.state as AppSchema[K]["model"];

            return component.view(
                localState,
                (cMsg) =>
                    dispatch({
                        type: "LeafAction" as const,
                        nodeType,
                        id: model.id,
                        componentMsg: cMsg,
                    }),
                ctx
            );
        },
    };
}
*/
