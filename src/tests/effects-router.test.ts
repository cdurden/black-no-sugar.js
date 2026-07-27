import { describe, it, expect, vi } from "vitest";
import { Engine, type Component } from "../engine.js";
import { type EffectManager } from "../effects.js";
import { type Cmd } from "../framework/base.js";
import { h, text } from "../virtual-dom.js";

// --- 1. DEFINE APPLICATION MESSAGE AND STATE MODEL ---
type Msg = { type: "CLICKED_TRACKABLE_ITEM" };
interface Model {
  clickCount: number;
}

// --- 2. IMPLEMENT THE ANALYTICS EFFECT MANAGER ---
class AnalyticsEffectManager implements EffectManager<Msg> {
  readonly capability = "analytics";

  // Create a testing spy to track incoming payloads
  public recordEventSpy = vi.fn();

  executeCommand(payload: any, _dispatch: (msg: Msg) => void) {
    if (payload && payload.eventName) {
      this.recordEventSpy(payload.eventName, payload.metadata);
    }
  }
}

// --- 3. TEST COMPONENT DEMANDING EXTENSIBLE CAPABILITY ---
const testComponent: Component<Msg, Model, any> = {
  init: () => [{ clickCount: 0 }, { type: "None" } as any],

  update: (msg: Msg, model: Model) => {
    switch (msg.type) {
      case "CLICKED_TRACKABLE_ITEM":
        const nextModel = { clickCount: model.clickCount + 1 };

        // 🟢 UPDATED: Conforms to your new open-ended Custom envelope design pattern
        const customAnalyticsCmd: Cmd<Msg> = {
          type: "Custom",
          capability: "analytics",
          payload: {
            eventName: "user_clicked_button",
            metadata: { totalClicks: nextModel.clickCount },
          },
        };
        return [nextModel, customAnalyticsCmd];
      default:
        return [model, { type: "None" } as any];
    }
  },

  subscriptions: () => ({ type: "None" }) as any,

  view: (_model, dispatch) =>
    h(
      "button",
      {
        id: "target-btn",
        onClick: () => dispatch({ type: "CLICKED_TRACKABLE_ITEM" }),
      },
      [text("Click Here")],
    ),
};

// --- 4. THE VITEST SPECIFICATION MATRIX ---
describe("Engine Effect Manager Routing Matrix - Custom Commands", () => {
  it("should unwrap Custom commands and proxy payloads straight to matching registered managers", () => {
    const root = document.createElement("div");
    const mockContext = {};

    const analyticsManager = new AnalyticsEffectManager();

    // Boot your refactored extensible core engine
    const engine = new Engine<Msg, Model, any>(
      testComponent,
      root,
      mockContext,
      [analyticsManager], // Register the plugin manager instance
    );
    engine.run();

    // Grab the mounted button from the JSDOM tree
    const btn = root.querySelector("#target-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();

    // Act: Simulate button interaction
    btn.click();

    // Assert: The message bypassed built-in primitives and triggered the manager payload correctly
    expect(analyticsManager.recordEventSpy).toHaveBeenCalledTimes(1);
    expect(analyticsManager.recordEventSpy).toHaveBeenCalledWith(
      "user_clicked_button",
      {
        totalClicks: 1,
      },
    );
  });

  it("should fall back gracefully without runtime crashes if an unregistered capability type is invoked", () => {
    const root = document.createElement("div");
    const mockContext = {};

    // Boot the exact same application tree but entirely omit the plugin manager registration
    const engine = new Engine<Msg, Model, any>(
      testComponent,
      root,
      mockContext,
      [], // Empty registry list
    );
    engine.run();

    const btn = root.querySelector("#target-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();

    // Verifies that firing a Custom envelope without a matching capability handler drops silently and safely
    expect(() => btn.click()).not.toThrow();
  });
});
