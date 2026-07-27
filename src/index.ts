import { Engine } from "./engine.js";
import { createDynamicAppShell } from "./dynamic-root.js"; // ◄ Structural shell compiler
import { type EffectManager } from "./effects.js";
import type {
  GenericSubEngineRegistry,
  NodeDefinition,
} from "./framework/base.js";

export function injectApp<Registry extends GenericSubEngineRegistry>(
  container: HTMLElement,
  config: NodeDefinition<keyof Registry & string>,
  registry: Registry,
  effectManagers: EffectManager<any>[],
) {
  // 2. Lift the pure data into the abstract functor space at the ingestion edge!
  // The engine manages the root dashboard component seamlessly
  if (container) {
    // 4. Generate the root master component using your IoC Data Interpreter
    const dynamicApplicationShell = createDynamicAppShell(config, registry);

    // 5. Spin up the centralized engine timeline wire
    const app = new Engine(
      dynamicApplicationShell,
      container,
      {},
      effectManagers,
    );
    app.run();
  }
}
