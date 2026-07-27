import type {
  Cmd,
  ComponentId,
  GenericSubEngineRegistry,
  NodeDefinition,
  PolymorphicMsg,
  Selector,
  Sub,
} from "./framework/base.js";

export interface UnverifiedNodeDefinition {
  readonly type: string;
  readonly id?: string | ComponentId;
  readonly key?: string;
  readonly raw?: any;
  readonly meta?: Record<string, any>;
  readonly interceptor?: string | undefined;
  // Recursively forwards the custom type constraints down to all child levels
  readonly children?: Record<string, UnverifiedNodeDefinition>;
}

export class SubEngineReifier<Registry extends GenericSubEngineRegistry> {
  private registry: Registry;
  constructor(registry: Registry) {
    this.registry = registry;
  }
  public initNode(
    nodeDefinition: NodeDefinition,
    ctx: any,
    ..._args: any[]
  ): [any, Cmd<PolymorphicMsg>] {
    const engine = this.registry[nodeDefinition.type];
    if (engine) {
      return engine.init(
        nodeDefinition,
        ctx,
        (
          childNodeDefinition: NodeDefinition,
          overrideCtx: any, //FIXME
        ) => this.initNode(childNodeDefinition, overrideCtx || ctx),
      );
    }
    throw new Error(`Engine plugin missing for type: ${nodeDefinition.type}`);
  }

  public updateNode(msg: PolymorphicMsg, node: any, ctx: any): [any, Cmd<any>] {
    const engine = this.registry[node.type];
    if (engine) {
      return engine.update(
        msg,
        node,
        ctx,
        (childMsg: any, childModel: any, overrideCtx: any) =>
          this.updateNode(childMsg, childModel, overrideCtx || ctx),
      );
    }
    throw new Error(`Engine plugin missing for type: ${node.type}`);
  }

  public subscriptionsNode(node: any, ctx: any): Sub<any> {
    const engine = this.registry[node.type];
    if (engine) {
      return engine.subscriptions(node, ctx, (childModel, overrideCtx) =>
        this.subscriptionsNode(childModel, overrideCtx || ctx),
      );
    }
    throw new Error(`Engine plugin missing for type: ${node.type}`);
  }

  public viewNode(
    node: any,
    dispatch: (msg: PolymorphicMsg) => void,
    ctx: any,
    selector?: Selector,
  ): any {
    const engine = this.registry[node.type];
    if (engine) {
      return engine.view(
        node,
        dispatch,
        ctx,
        ((
          childModel: any,
          innerDispatch: any,
          overrideCtx: any, // FIXME
          childSelector?: Selector,
        ) =>
          this.viewNode(
            childModel,
            innerDispatch,
            overrideCtx || ctx,
            childSelector,
          )) as any,
        selector,
      );
    }
  }
}

export type SlotsForPlugin<Plugin> = Plugin extends { slots: infer S }
  ? S extends string
    ? S
    : string
  : never;

export type ConfigData<Reg> = {
  [Type in keyof Reg]: Type extends string
    ? {
        type: Type;
        id?: string;
        interceptor?: string;
        meta?: Record<string, any>;
      } & {
        children?: {
          [K in string]?: ConfigData<Reg>;
        };
      }
    : never;
}[keyof Reg];

export function reifyConfig<Registry extends GenericSubEngineRegistry>(
  configData: ConfigData<Registry>,
  pathContext: string = "root",
  key?: string | undefined,
): NodeDefinition<keyof Registry & string> {
  const resolvedId = configData?.id || `${pathContext}_${configData.type}`;
  const children = Object.fromEntries(
    Object.entries(configData.children || {}).map(
      ([childKey, childConfigData]) => {
        return [
          childKey,
          reifyConfig(
            childConfigData as ConfigData<Registry>,
            `${pathContext}_${childKey}`,
            childKey,
          ),
        ];
      },
    ),
  );
  return {
    type: configData.type as keyof Registry & string,
    id: resolvedId as ComponentId,
    key: key || "_non_descendent",
    meta: configData?.meta || {},
    raw: configData,
    interceptor: configData.interceptor,
    children,
  }; // FIXME
}
