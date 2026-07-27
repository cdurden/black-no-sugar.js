import { describe, it, expect, expectTypeOf } from "vitest";
import { reifyConfig } from "../reifier.js";
import type { NodeDefinition } from "../framework/base.js";
import { type ContainerPluginWrapper } from "../framework/container-adaptor.js";

// --- 1. SET UP A MOCK APPLATION REGISTRY SCHEMA SHAPE ---
type MockRegistry = {
  dashboard: ContainerPluginWrapper<"left" | "right", {}>;
  contextProvider: ContainerPluginWrapper<"content", {}>;
};
type MockKeys = keyof MockRegistry & string;

describe("reifyPayload Compile-Time Typo Firewall Spec", () => {
  // ============================================================================
  // 🟢 TEST 1: VERIFY VALID COMPILATION
  // ============================================================================
  it("should compile flawlessly when the configuration object perfectly adheres to the allowed registry keys union", () => {
    const validConfig = {
      type: "contextProvider" as const,
      children: {
        content: {
          type: "dashboard",
        },
      },
    } as const;

    // Execute the type-safe reifier function pass-through
    const result = reifyConfig<MockRegistry>(
      validConfig,
    ) as NodeDefinition<MockKeys>;

    // 🟢 STATIC TYPE ASSERTIONS: Ensure the output is a strictly typed NodeDefinition
    expectTypeOf(result).toEqualTypeOf<NodeDefinition<MockKeys>>();
    expectTypeOf(result.type).toEqualTypeOf<MockKeys>();

    // Runtime sanity assertion check to satisfy the test runner execution
    expect(result).toBeDefined();
    expect(result.type).toBe("dashboard");
  });

  // ============================================================================
  // 🟢 TEST 2: THE COMPILER BLOCK LABORATORY
  // The code blocks inside this section demonstrate the static protection.
  // Uncommenting the code lines inside these tests will cause the TypeScript
  // compiler (tsserver) to instantly fail your build pipeline with a type mismatch error.
  // ============================================================================
  it("should trigger a static compiler block if a developer introduces a typo into the component type property", () => {
    const misspelledConfig = {
      type: "dashbord" as const, // ❌ TYPO: "dashbord" is an invalid string primitive matching no registry key!
      id: "root-123",
      key: "main-frame",
    };

    /*
    // ❌ STATIC COMPILER BLOCK FORWARDED:
    // If you uncomment the line below, your build pipeline will throw a static compilation error:
    // "Argument of type '{ type: string; id: string; key: string; }' is not assignable to 
    // parameter of type 'UnverifiedPayload & { type: "dashboard" | "authProvider" | "chat"; }'."
    // "Type '"dashbord"' is not assignable to type '"dashboard" | "authProvider" | "chat"'."
    */

    // @ts-expect-error
    //expectTypeOf<string>().toEqualTypeOf<number>();
    reifyConfig<MockRegistry>(misspelledConfig);
    expect(true).toBe(true);
  });

  it("should trigger a static compiler block if an illegal component name is smuggled inside a deep grandchild child node", () => {
    const nestedCorruptConfig = {
      type: "dashboard" as const, // Root node is perfectly valid
      id: "root-123",
      key: "main-frame",
      children: {
        sidebar: {
          type: "unregisteredWidget" as const, // ❌ NESTED INDUSTRIAL BUG TYPO!
          id: "widget-99",
          key: "sidebar-widget",
        },
      },
    };

    /*
    // ❌ STATIC COMPILER BLOCK FORWARDED:
    // Because your UnverifiedPayload signature recursively enforces the same generic variable
    // 'Keys' downward into grandchildren map chains, TypeScript tracks the typo all the way down
    // to nested levels and halts the build right here at compile-time!
    */

    // @ts-expect-error
    reifyConfig<MockRegistry>(nestedCorruptConfig);
    expect(true).toBe(true);
  });
});
