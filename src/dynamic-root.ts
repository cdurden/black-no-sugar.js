// dynamicRootComponent.ts
import { Cmd } from "./framework/base.js";
import type { Component } from "./engine.js";
import type {
  GenericSubEngineRegistry,
  NodeDefinition,
  PolymorphicMsg,
} from "./framework/base.js";
import { SubEngineReifier } from "./reifier.js";

export function createDynamicAppShell<
  Registry extends GenericSubEngineRegistry,
>(
  nodeDefinition: NodeDefinition<keyof Registry & string>, // ◄ Accepts your layout configuration data layout structure!
  registry: Registry,
): Component<PolymorphicMsg, any, any> {
  return {
    init: (ctx: any, ...args: any[]): [any, Cmd<PolymorphicMsg>] => {
      return new SubEngineReifier(registry).initNode(nodeDefinition, ctx, args);
    },
    update: (msg, model, ctx) => {
      return new SubEngineReifier(registry).updateNode(msg, model, ctx);
    },
    subscriptions: (model, ctx) => {
      return new SubEngineReifier(registry).subscriptionsNode(model, ctx);
    },
    view: (model, dispatch, ctx, selector) => {
      return new SubEngineReifier(registry).viewNode(
        model,
        dispatch,
        ctx,
        selector,
      );
    },
  };
}
