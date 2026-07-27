// src/tests/multi-subscriptions.test.ts
import { describe, it, expect, vi } from "vitest";
import { Engine, type Component } from "../engine.js";
import { type EffectManager } from "../effects.js";
import { h } from "../virtual-dom.js";

// --- 1. MOCK COMPONENT MESSAGES AND STATE STRUCTURES ---
type AppMsg =
  | { type: "RECEIVED_CHAT_MESSAGE"; text: string }
  | { type: "PRESSED_ESCAPE_KEY" };

interface AppModel {
  isChatRoomActive: boolean;
}

// --- 2. IMPLEMENT CHAT STREAM MANAGER ---
class ChatStreamManager implements EffectManager<AppMsg> {
  readonly capability = "chat";
  public syncSpy = vi.fn();

  syncSubscriptions(
    activeChannels: Map<string, Array<(payload: any) => void>>,
  ) {
    const chatChannels = new Map<string, Array<(payload: any) => void>>();

    // Isolate only the channels this specific manager is responsible for
    for (const [channel, handlers] of activeChannels.entries()) {
      if (channel.startsWith("room:")) {
        chatChannels.set(channel, handlers);
      }
    }

    // Trigger our verification spy with the isolated sub map layout
    this.syncSpy(chatChannels);
  }
}

// --- 3. IMPLEMENT KEYBOARD SHORTCUT MANAGER ---
class KeyboardShortcutManager implements EffectManager<AppMsg> {
  readonly capability = "keyboard";
  public syncSpy = vi.fn();

  syncSubscriptions(
    activeChannels: Map<string, Array<(payload: any) => void>>,
  ) {
    const keyChannels = new Map<string, Array<(payload: any) => void>>();

    // Isolate only hotkey related channels
    for (const [channel, handlers] of activeChannels.entries()) {
      if (channel.startsWith("key:")) {
        keyChannels.set(channel, handlers);
      }
    }

    this.syncSpy(keyChannels);
  }
}

// --- 4. THE TEST COMPONENT ---
const testComponent: Component<AppMsg, AppModel, any> = {
  init: () => [{ isChatRoomActive: true }, { type: "None" } as any],
  update: (_msg: AppMsg, model: AppModel) => [model, { type: "None" } as any],
  view: () => h("div", {}, []),

  // Declarative composite subscriptions
  subscriptions: (model: AppModel) => {
    const subs = [];

    // Always listen to global hardware keys
    subs.push({
      type: "ListenToChannel",
      channel: "key:escape",
      onMessage: () => ({ type: "PRESSED_ESCAPE_KEY" }),
    });

    // Conditionally subscribe to chat stream channels based on app model state
    if (model.isChatRoomActive) {
      subs.push({
        type: "ListenToChannel",
        channel: "room:lobby",
        onMessage: (payload: string) => ({
          type: "RECEIVED_CHAT_MESSAGE",
          text: payload,
        }),
      });
    }

    return {
      type: "Batch",
      subs: subs as any[],
    } as any;
  },
};

// --- 5. THE VITEST SUITE ---
describe("Engine Parallel Subscription Broadcasting Matrix", () => {
  it("should deliver active subscription channels concurrently to all registered managers", () => {
    const root = document.createElement("div");
    const mockContext = {} as any;

    // Instantiate both independent managers
    const chatManager = new ChatStreamManager();
    const keyboardManager = new KeyboardShortcutManager();

    // Boot our Engine with our plugins inside the dynamic registry array list
    const engine = new Engine<AppMsg, AppModel, any>(
      testComponent,
      root,
      mockContext,
      [chatManager, keyboardManager], // 👈 Both plugins registered concurrently
    );
    engine.run();

    // --- CHAT MANAGER VALIDATION ---
    expect(chatManager.syncSpy).toHaveBeenCalledTimes(1);

    // Grab the first map payload delivered to the chat manager spy
    const chatMapPassed = chatManager.syncSpy.mock.calls[0][0] as Map<
      string,
      any
    >;
    expect(chatMapPassed.has("room:lobby")).toBe(true);
    expect(chatMapPassed.has("key:escape")).toBe(false); // Filtered out safely!

    // --- KEYBOARD MANAGER VALIDATION ---
    expect(keyboardManager.syncSpy).toHaveBeenCalledTimes(1);

    // Grab the first map payload delivered to the keyboard manager spy
    const keyMapPassed = keyboardManager.syncSpy.mock.calls[0][0] as Map<
      string,
      any
    >;
    expect(keyMapPassed.has("key:escape")).toBe(true);
    expect(keyMapPassed.has("room:lobby")).toBe(false); // Filtered out safely!
  });
});
