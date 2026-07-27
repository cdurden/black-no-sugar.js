// registry.ts
/* -------- Framework essentials ------- */
import type {
  GenericSubEngineRegistry,
  ContainerNode,
} from "./framework/base.js";

export interface BasePluginWrapper {
  kind: "container" | "leaf";
  type: string;
}
// A pure identity helper function to capture implicit type footprints
export function defineRegistry<T extends Record<string, BasePluginWrapper>>(
  registry: T,
): T {
  return registry;
}

interface InterceptorConfigs {
  syncRooms: { node: ContainerNode<"left" | "right", {}>; ctx: any };
}

type InterceptorNames = keyof InterceptorConfigs;

export type ContextForRegistry<
  Registry extends GenericSubEngineRegistry,
  K extends keyof Registry,
> = Registry[K] extends {
  spec: { view: (m: any, r: any, d: any, ctx: infer Ctx) => any };
}
  ? Ctx
  : Registry[K] extends {
        component: { view: (m: any, d: any, ctx: infer Ctx) => any };
      }
    ? Ctx
    : any;
