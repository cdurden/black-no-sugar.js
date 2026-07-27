import {
  Cmd,
  Sub,
  type NodeDefinition,
  Selector,
  type ComponentId,
} from "./framework/base.js"; // ◄ Updated import
import { createRealDOM, patch, type VNode } from "./virtual-dom.js";
import type { EffectManager } from "./effects.js";

export interface Component<Msg, Model, Ctx = any> {
  init: (ctx: Ctx, ...args: any[]) => [Model, Cmd<Msg>]; // ◄ Context added
  update: (msg: Msg, model: Model, ctx: Ctx) => [Model, Cmd<Msg>]; // ◄ Context added
  subscriptions: (model: Model, ctx: Ctx) => Sub<Msg>; // ◄ Context added
  view: (
    model: Model,
    dispatch: (msg: Msg) => void,
    ctx: Ctx,
    selector: Selector,
  ) => VNode; // ◄ Context added
}

export class Engine<Msg, Model, Ctx> {
  private model: Model;
  private component: Component<Msg, Model, Ctx>;
  private context: Ctx;
  private rootElement: HTMLElement;
  private currentVNode: VNode | null = null;
  private initialCmd: Cmd<Msg>;

  // 🟢 The Extensible Plugins/Managers Collection Registry
  private managers: Map<string, EffectManager<Msg>> = new Map();

  constructor(
    component: Component<Msg, Model, Ctx>,
    rootElement: HTMLElement,
    initialContext: Ctx,
    effectManagers: EffectManager<any>[] = [], // 👈 Pass managers on initialization
  ) {
    this.component = component;
    this.rootElement = rootElement;
    this.context = initialContext;

    // Register and initialize effect managers
    effectManagers.forEach((manager) => {
      this.managers.set(manager.capability, manager);
      if (manager.setup) manager.setup(this.dispatch, this.context);
    });

    const [initialModel, initialCmd] = this.component.init(this.context);
    this.model = initialModel;
    this.initialCmd = initialCmd;
  }
  public run() {
    this.executeCmd(this.initialCmd);
    this.processSubscriptions();
    this.render();
  }

  public updateContext(newContext: Ctx) {
    this.context = newContext;
    this.processSubscriptions();
    this.render();
  }

  public dispatch = (msg: Msg): void => {
    const [nextModel, cmd] = this.component.update(
      msg,
      this.model,
      this.context,
    );
    this.model = nextModel;
    // 🟢 2. COMPLETELY GENERIC CONTEXT SYNCHRONIZATION
    // Look for our compute method on the component view or the model instance
    const componentAsProvider = this.component as any;

    if (
      componentAsProvider &&
      typeof componentAsProvider.computeNextContext === "function"
    ) {
      // Run the mapper function defined by the component to safely generate the next context frame
      const nextContext = componentAsProvider.computeNextContext(
        this.model,
        this.context,
      );

      // If the data structure reference shifted, apply it globally and update sub-components
      if (nextContext !== this.context) {
        this.context = nextContext;
      }
    }
    this.executeCmd(cmd);
    this.processSubscriptions();
    this.render();
  };

  // --- REFACTORED DATA DISTRIBUTION ROUTER ---
  private executeCmd(cmd: Cmd<Msg>): void {
    if (!cmd) return;

    switch (cmd.type) {
      case "None":
        break;
      case "Batch":
        cmd.cmds.forEach((c) => this.executeCmd(c));
        break;
      case "Delay":
        setTimeout(() => this.dispatch(cmd.onComplete), cmd.ms);
        break;
      case "Custom":
        // 🟢 UNWRAP CUSTOM PLUGINS INTERCEPTOR: Hand over the payload data directly
        for (const manager of this.managers.values()) {
          if (manager.capability === cmd.capability && manager.executeCommand) {
            manager.executeCommand(cmd.payload, this.dispatch);
          }
        }
        break;
    }
  }

  private processSubscriptions(): void {
    const currentSubs = this.component.subscriptions(this.model, this.context);
    const flattenedChannels = new Map<string, Array<(payload: any) => void>>();
    this.flattenSubs(currentSubs, flattenedChannels);

    // 🟢 DYNAMIC FALLBACK PORTAL: Broadcast subscription maps out to all registered plugins
    for (const manager of this.managers.values()) {
      if (manager.syncSubscriptions) {
        manager.syncSubscriptions(flattenedChannels);
      }
    }
  }

  private flattenSubs(
    sub: Sub<Msg>,
    targetMap: Map<string, Array<(payload: any) => void>>,
  ) {
    if (!sub) return;
    if (sub.type === "Batch") {
      sub.subs.forEach((s) => this.flattenSubs(s, targetMap));
    } else if (sub.type === "ListenToChannel") {
      if (!targetMap.has(sub.channel)) targetMap.set(sub.channel, []);
      targetMap.get(sub.channel)!.push((payload) => {
        this.dispatch(sub.onMessage(payload));
      });
    } else if (sub.type === "Custom") {
      // If the custom subscription maps onto a unique topic channel string inside its payload:
      const channelKey = sub.payload.channel || sub.payload.topic;
      if (channelKey && sub.payload.onMessage) {
        if (!targetMap.has(channelKey)) targetMap.set(channelKey, []);
        targetMap
          .get(channelKey)!
          .push((payload) => this.dispatch(sub.payload.onMessage(payload)));
      }
    }
  }

  private render() {
    const selector = Selector("root" as ComponentId);
    const newVNode = this.component.view(
      this.model,
      this.dispatch,
      this.context,
      selector,
    );
    const firstChild = this.rootElement.childNodes[0];
    if (!this.currentVNode) {
      this.rootElement.appendChild(createRealDOM(newVNode));
    } else if (firstChild) {
      patch(firstChild, this.currentVNode, newVNode);
    } else {
      this.rootElement.appendChild(createRealDOM(newVNode));
    }
    this.currentVNode = newVNode;
  }
}
