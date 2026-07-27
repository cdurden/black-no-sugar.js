import type { VNode } from "../virtual-dom.js";
import "css.escape";

export type ComponentId = string & { readonly __brand: "ComponentId" };

export interface Selector {
  readonly id: string; // The unique ComponentId generated during JSON reification
  readonly attribute: string;
  readonly queryString: string;
}

export const Selector = (id: string): Selector => {
  const rawAttributeName = `data-v-${id}`;
  const safeQueryString = `[${CSS.escape(rawAttributeName)}]`;
  return {
    id,
    attribute: rawAttributeName,
    queryString: safeQueryString,
  };
};

export interface ContextProvider<Ctx> {
  // Any state model can implement this to tell the engine how to update the context
  computeNextContext(currentContext: Ctx): Ctx;
}

export interface NodeDefinition<Keys extends string = string> {
  type: Keys;
  id: string;
  key: string;
  raw: any;
  meta: Record<string, any>;
  interceptor: string | undefined;
  children: Record<string, NodeDefinition<Keys>>;
}

export interface BasicNode<ChildKey extends string> {
  type: string;
  key: string;
  children: Record<ChildKey, BasicNode<ChildKey>>;
}

export interface ContainerNode<
  K extends string,
  State extends Record<string, any>,
> {
  readonly layer: "container";
  type: string;
  id: ComponentId;
  key: string;
  state: State;
  children: Partial<Record<K, AnyNode>>;
}

export interface LeafNode<Model> {
  readonly layer: "leaf";
  type: string;
  id: ComponentId;
  key: string;
  state: Model;
  children: Record<string, AnyNode>;
}

export interface AnyModel {
  [key: string]: any;
}

export interface AnyNode {
  layer: "container" | "leaf";
  type: string;
  id: ComponentId;
  key: string;
  state: Record<string, any>;
  children: Record<string, AnyNode>;
}

// 2. Simplify the Infrastructure Union Type Name to PolymorphicNode (or PolmorphicNode tracking variants)
export type PolymorphicNode = LeafNode<AnyModel> | ContainerNode<string, any>;
export const createEmptyNode = <Node>() => {
  return {
    //layer: LeafNode extends Node ? "leaf" : "container",
    type: "empty",
    id: "emptyNode",
    key: "emptyNode",
    state: {},
    children: {},
  } as Node;
};

// --- EXTENSIBLE COMMAND TYPES ---
// 1. Unified Outbound Intents (Commands)
// Describe WHAT needs to happen (Data only, no execution)
export type CoreCmd<Msg> =
  | { type: "None" }
  | { type: "Batch"; cmds: Cmd<Msg>[] }
  | { type: "Delay"; ms: number; onComplete: Msg }
  | { type: "PublishMessage"; channel: string; data: any }
  | {
      type: "FetchResource";
      url: string;
      onResult: (data: any) => Msg;
      onError: (err: Error) => Msg;
    };

// This union type captures both framework primitives AND custom objects
export type Cmd<Msg> =
  | CoreCmd<Msg>
  | { type: "Custom"; capability: string; payload: Record<string, any> };

// --- EXTENSIBLE SUBSCRIPTION TYPES ---

export type CoreSub<Msg> =
  | { type: "None" }
  | { type: "Batch"; subs: Sub<Msg>[] }
  | {
      type: "ListenToChannel";
      channel: string;
      onMessage: (payload: any) => Msg;
    };

// This union type captures both framework primitives AND custom background streams
export type Sub<Msg> =
  | CoreSub<Msg>
  | { type: "Custom"; capability: string; payload: Record<string, any> };

// Helper Factory Object
export const Cmd = {
  none: <Msg>(): Cmd<Msg> => ({ type: "None" }),
  batch: <Msg>(cmds: Cmd<Msg>[]): Cmd<Msg> => ({ type: "Batch", cmds }),
  publish: <Msg>(channel: string, data: any): Cmd<Msg> => ({
    type: "PublishMessage",
    channel,
    data,
  }),
  fetch: <Msg>(
    url: string,
    onResult: (data: any) => Msg,
    onError: (err: any) => Msg,
  ): Cmd<Msg> => ({
    type: "Custom",
    capability: "fetch",
    payload: {
      url,
      onResult,
      onError,
    },
  }),
  custom: <Msg>(
    capability: string,
    payload: Record<string, any>,
  ): Cmd<Msg> => ({
    type: "Custom",
    capability,
    payload,
  }),
};

export const Sub = {
  none: <Msg>(): Sub<Msg> => ({ type: "None" }),
  batch: <Msg>(subs: Sub<Msg>[]): Sub<Msg> => ({ type: "Batch", subs }),
  listen: <Msg>(
    channel: string,
    onMessage: (payload: any) => Msg,
  ): Sub<Msg> => ({ type: "ListenToChannel", channel, onMessage }),
  custom: <Msg>(
    capability: string,
    payload: Record<string, any>,
  ): Sub<Msg> => ({
    type: "Custom",
    capability,
    payload,
  }),
};

export function mapCmd<ChildMsg, ParentMsg>(
  cmd: Cmd<ChildMsg>,
  wrap: (cMsg: ChildMsg) => ParentMsg,
): Cmd<ParentMsg> {
  switch (cmd.type) {
    case "None":
      return { type: "None" };
    case "Delay":
      return {
        type: "Delay",
        ms: cmd.ms,
        onComplete: wrap(cmd.onComplete),
      };
    case "PublishMessage":
      return {
        type: "PublishMessage",
        channel: cmd.channel,
        data: cmd.data,
      };
    case "Batch":
      return {
        type: "Batch",
        cmds: cmd.cmds.map((c) => mapCmd(c, wrap)),
      };
    case "FetchResource":
      return {
        type: "FetchResource",
        url: cmd.url,
        onResult: (data) => wrap(cmd.onResult(data)),
        onError: (err) => wrap(cmd.onError(err)),
      };
    // 🟢 HANDLE THE CUSTOM COMMAND PORTAL EXTRACTION
    case "Custom": {
      // Create a shallow copy of the payload to avoid side-effects
      const mappedPayload = { ...cmd.payload };

      // CRUCIAL: Inspect the payload for any message-producing closures.
      // If a plugin command relies on a callback hook, wrap it into the parent namespace.
      for (const [key, value] of Object.entries(mappedPayload)) {
        if (typeof value === "function") {
          mappedPayload[key] = (...args: any[]) => {
            const childResult = value(...args);
            return wrap(childResult);
          };
        }
      }

      return {
        type: "Custom",
        capability: cmd.capability,
        payload: mappedPayload,
      };
    }
  }
}
export function mapSub<ChildMsg, ParentMsg>(
  sub: Sub<ChildMsg>,
  wrap: (cMsg: ChildMsg) => ParentMsg,
): Sub<ParentMsg> {
  switch (sub.type) {
    case "None":
      return { type: "None" };

    case "Batch":
      // Recursively map an array of child subscriptions into parent subscription boxes
      return {
        type: "Batch",
        subs: sub.subs.map((s) => mapSub(s, wrap)),
      };

    case "ListenToChannel":
      // 1. Maintain the target abstract network channel name
      // 2. Intercept the inbound message callback and wrap it in the parent's message type
      return {
        type: "ListenToChannel",
        channel: sub.channel,
        onMessage: (payload) => wrap(sub.onMessage(payload)),
      };
    // 🟢 HANDLE CUSTOM SUBSCRIPTIONS PORTAL EXTRACTION
    case "Custom": {
      const mappedPayload = { ...sub.payload };

      for (const [key, value] of Object.entries(mappedPayload)) {
        if (typeof value === "function") {
          mappedPayload[key] = (...args: any[]) => {
            const childResult = value(...args);
            return wrap(childResult);
          };
        }
      }

      return {
        type: "Custom",
        capability: sub.capability,
        payload: mappedPayload,
      };
    }
  }
}

export function isComponentMsg<Msg>(msg: any, typePattern: string): msg is Msg {
  const { coreMsg } = unwrapMessage(msg);
  return coreMsg && typeof coreMsg === "object" && coreMsg.type === typePattern;
}
export interface ContextualMessagePacket<T = any> {
  /** The absolute innermost domain message (e.g., { type: "SET_VALUE", text: "alex" }) */
  readonly coreMsg: T;
  /** The first immediate slot key the parent container saw (e.g., "username") */
  readonly key: string | null;
  /** The full chronological path of keys traversed from top to bottom (e.g., ["fieldset", "username"]) */
  readonly path: string[];
}

/**
 * 🟢 CONTEXTUAL BREADCRUMB UNWRAPPER
 * Extracts the innermost component message while gathering the full structural
 * key path it traveled along the way.
 */
export function unwrapMessage(msg: any): ContextualMessagePacket {
  const path: string[] = [];
  let current = msg;

  // Crawl down the ContainerAction envelopes and collect keys chronologically
  while (
    current &&
    typeof current === "object" &&
    current.type === "ContainerAction"
  ) {
    if (typeof current.key === "string") {
      path.push(current.key);
    }
    if ("innerMsg" in current) {
      current = current.innerMsg;
    }
  }
  if (current && typeof current === "object" && current.type === "LeafAction") {
    if (typeof current.key === "string") {
      path.push(current.key);
    }
    current = current.componentMsg;
  }

  return {
    coreMsg: current,
    // The first key is the direct child slot the parent container cares about
    key: path[0] || null,
    // The full path is useful if you need to inspect deep grandchild origins
    path: path,
  };
}

/**
 * The Central Framework Lifecycle SubEngine Plugin.
 * Now cleanly parameterized by 'Node' and accepts 'nodeDefinition' on initiation. [INDEX]
 */
export interface EngineLifecycle<Msg, Node, Ctx> {
  init: (
    nodeDefinition: NodeDefinition,
    ctx: Ctx,
    recurse: (n: NodeDefinition, overrideCtx?: any) => [AnyNode, Cmd<any>],
  ) => [Node, Cmd<any>];

  update: (
    msg: any, // Accepts PolymorphicMsg (like ContainerAction) at the runtime boundary [INDEX]
    node: Node,
    ctx: Ctx,
    recurse: (
      childMsg: any,
      childNode: AnyNode,
      overrideCtx?: any,
    ) => [AnyNode, Cmd<any>],
  ) => [Node, Cmd<any>];

  subscriptions: (
    node: Node,
    ctx: Ctx,
    recurse: (childNode: AnyNode, overrideCtx?: any) => Sub<any>,
  ) => Sub<any>;

  view: (
    node: Node,
    dispatch: (msg: Msg) => void,
    ctx: Ctx,
    recurse: <ChildMsg>(
      childNode: AnyNode,
      childDispatch: (m: ChildMsg) => void,
      overrideCtx?: any,
    ) => VNode,
    selector?: Selector, // Enforces our late-binding DOM tracking selector [INDEX]
  ) => VNode;
}
export interface SubEngine<
  Msg = any,
  Node = any,
  Ctx = any,
> extends EngineLifecycle<Msg, Node, Ctx> {
  readonly type: string; // Adds its specialized dictionary lookup identifier tag [INDEX]
  //  readonly slots: readonly string[];
}
export type GenericSubEngineRegistry = Record<string, SubEngine<any, any, any>>;

// Define what a container-level interceptor looks like
export type ContainerInterceptor<Slots extends string, Msg, Ctx = any> = (
  msg: Msg,
  node: ContainerNode<Slots, any>,
  ctx: Ctx,
  recurse: (m: any, n: any, overrideCtx?: Ctx) => [any, Cmd<any>],
) => {
  nextNode: ContainerNode<Slots, any>;
  outboundCmd?: Cmd<Msg>;
  newCtx: Ctx;
} | null;

export type LeafMsg = {
  type: "LeafAction";
  nodeType: string;
  id: string;
  componentMsg: any;
};
export type ContainerMsg = {
  type: "ContainerAction";
  id: string;
  key: string;
  innerMsg: PolymorphicMsg;
};
export type PolymorphicMsg =
  | ContainerMsg
  | LeafMsg
  | {
      id: string;
      type: "SwapNode";
      targetId: string;
      newDefinition: NodeDefinition;
    }; // ◄ Updated type reference
