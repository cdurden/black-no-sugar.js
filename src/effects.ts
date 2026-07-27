export interface EffectManager<Msg> {
  // Unique string to match against custom command/subscription categories
  readonly capability: string;

  // Called once on framework boot to wire up the global dispatch portal
  setup?(dispatch: (msg: Msg) => void, context: any): void;

  // Processes an outbound application command matching this capability
  executeCommand?(cmd: any, dispatch: (msg: Msg) => void): void;

  // Processes active sub-channels whenever the component subscription state ticks
  syncSubscriptions?(
    activeChannels: Map<string, Array<(payload: any) => void>>,
  ): void;
}
