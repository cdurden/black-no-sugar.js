export type LifecycleHook = (el: HTMLElement) => void;

export interface VNodeHooks {
  afterCreate?: LifecycleHook; // Triggered exactly once when the real DOM node is created
  afterUpdate?: LifecycleHook; // Triggered whenever properties or text content change
}

export type VNodeProps = {
  [key: string]: any; // Catch-all for standard HTML attributes (id, class, style)
};

export type VNode =
  | {
      type: "text";
      text: string;
      key?: string;
      el?: Node;
      props: Record<string, any>;
    }
  | {
      type: "element";
      tag: string;
      key: string | undefined;
      props: Record<string, any>; // Attached here
      children: VNode[];
    };

const vnodeToDOMMap = new WeakMap<VNode, Node>();

export function setDOMNode(vnode: VNode, node: Node): void {
  vnodeToDOMMap.set(vnode, node);
}

export function getDOMNode(vnode: VNode): Node | undefined {
  return vnodeToDOMMap.get(vnode);
}
export const h = (
  tag: string,
  props: Record<string, any> = {},
  children: VNode[] = [],
  key: string | undefined = undefined,
): VNode => ({
  type: "element",
  tag,
  props,
  children,
  key,
});

export const text = (str: string, props: Record<string, any> = {}): VNode => ({
  type: "text",
  text: str,
  props,
});
export function patch(realNode: Node, oldNode: VNode, newNode: VNode): Node {
  if (!oldNode || !newNode) {
    return realNode;
  }
  // Scenario A: The element type completely changed (e.g., div turned into header)
  if (
    oldNode.type !== newNode.type ||
    (oldNode.type === "element" &&
      newNode.type === "element" &&
      oldNode.tag !== newNode.tag)
  ) {
    const freshRealNode = createRealDOM(newNode);
    realNode.parentNode?.replaceChild(freshRealNode, realNode);
    return freshRealNode;
  }

  // Scenario B: It's a text node. Check if string values changed.
  if (oldNode.type === "text" && newNode.type === "text") {
    if (oldNode.text !== newNode.text) {
      realNode.nodeValue = newNode.text;
    }
    setDOMNode(newNode, realNode);
    return realNode;
  }

  // Scenario C: Both are elements with the same tag (e.g., matching inputs or divs)
  if (oldNode.type === "element" && newNode.type === "element") {
    const el = realNode as HTMLElement;

    setDOMNode(newNode, el);

    // 1. Synchronize element attributes/properties (classes, inputs values, placeholders)
    // patchProps now returns a boolean indicating if anything actually changed
    patchProps(el, oldNode.props, newNode.props);

    // 2. Synchronize children array structures recursively
    patchChildren(el, oldNode.children, newNode.children);
  }
  return realNode;
}

export function patchChildren(
  parentEl: HTMLElement,
  oldCh: VNode[],
  newCh: VNode[],
): void {
  // 1. Map old children by their keys
  const oldKeyMap = new Map<any, VNode>();
  for (let i = 0; i < oldCh.length; i++) {
    const oldChild = oldCh[i];
    if (oldChild) {
      const key = oldChild.key !== undefined ? oldChild.key : `__index_${i}`;
      oldKeyMap.set(key, oldChild);
    }
  }

  // 2. Iterate backwards (right-to-left) to keep anchors rock-solid
  for (let i = newCh.length - 1; i >= 0; i--) {
    const newChild = newCh[i];
    if (!newChild) continue;

    const key = newChild.key !== undefined ? newChild.key : `__index_${i}`;
    const oldMatch = oldKeyMap.get(key);

    // Find our static reference anchor: the node immediately to the right
    const nextVNode = newCh[i + 1];
    const anchorDOMNode = nextVNode ? getDOMNode(nextVNode) : null;

    if (oldMatch) {
      let realChildNode = getDOMNode(oldMatch);

      if (realChildNode) {
        // Run updates on the node
        realChildNode = patch(realChildNode, oldMatch, newChild);

        const currentNextSibling = realChildNode.nextSibling;
        if (currentNextSibling !== anchorDOMNode) {
          // Safely move it precisely before our stable rightward anchor
          parentEl.insertBefore(realChildNode, anchorDOMNode || null);
        }
        oldKeyMap.delete(key);
        continue;
      }
    } else {
      // Brand new node creation
      const freshRealNode = createRealDOM(newChild);
      parentEl.insertBefore(freshRealNode, anchorDOMNode || null);
    }
  }

  // 3. Clean up unmounted nodes
  for (const [_, oldChildVNode] of oldKeyMap) {
    const deadRealNode = getDOMNode(oldChildVNode);
    if (deadRealNode) {
      parentEl.removeChild(deadRealNode);
    }
  }
}

export function patchProps(
  el: HTMLElement,
  oldProps: Record<string, any>,
  newProps: Record<string, any>,
): boolean {
  let hasChanges = false;

  // Remove attributes or event hooks that exist in old properties but disappeared in new ones
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      hasChanges = true;
      if (key.startsWith("on")) {
        const eventName = key.substring(2).toLowerCase();
        el.removeEventListener(eventName, oldProps[key]);
      }
      // FIX: Clean up classes if they are completely removed
      else if (key === "class") {
        el.className = "";
      } else {
        el.removeAttribute(key);
      }
    }
  }

  // Update modified attributes or assign newly added ones
  for (const [key, value] of Object.entries(newProps)) {
    const oldValue = oldProps[key];
    if (value !== oldValue) {
      if (key.startsWith("on")) {
        const eventName = key.substring(2).toLowerCase();
        // Clear previous event listener reference to prevent double execution triggers
        if (oldValue) el.removeEventListener(eventName, oldValue);
        el.addEventListener(eventName, value);
        // Event listeners changing usually indicates component re-binding/state mutations
        hasChanges = true;
      }
      // CRUCIAL FOCUS FIX: Do not stomp over live input fields unless the state forces a mismatch
      else if (key === "value" && (el as HTMLInputElement).value === value) {
        continue;
      }
      // FIX: Intelligently update the class string using className
      else if (key === "class") {
        el.className = value;
        hasChanges = true;
      } else {
        // Update raw attributes like type, or placeholder
        (el as any)[key] = value;
        hasChanges = true;
      }
    }
  }

  return hasChanges;
}

// Pure recursive tree generator: Turns structured JSON data into browser layout markup
export function createRealDOM(node: VNode): Node {
  if (node.type === "text") {
    const el = document.createTextNode(node.text || "");
    setDOMNode(node, el);
    return el;
  }

  const el = document.createElement(node.tag);

  // Assign properties, classes, and browser events cleanly
  for (const [key, value] of Object.entries(node.props || {})) {
    if (key.startsWith("on") && key !== "on") {
      // Automatically wire event listeners straight back into Engine timeline
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key === "on" && value && typeof value === "object") {
      for (const [eventName, eventHandler] of Object.entries(value)) {
        if (typeof eventHandler === "function") {
          // Bind agnostic custom element event triggers natively using exact naming tokens
          el.addEventListener(eventName, eventHandler as EventListener);
        }
      }
    }
    // FIX: Map 'class' to 'className' or use setAttribute
    else if (key === "class") {
      el.className = value;
    } else {
      if (key in el) {
        (el as any)[key] = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }

  // Recurse down children array structures
  (node.children || []).forEach((child) =>
    el.appendChild(createRealDOM(child)),
  );

  setDOMNode(node, el);
  return el;
}

/*
function patchProp(el: HTMLElement, key: string, nextValue: any) {
  // 1. Handle class / className mismatch
  if (key === "class") {
    el.className = nextValue || "";
  }
  // 2. Handle inline styles
  else if (key === "style" && typeof nextValue === "object") {
    Object.assign(el.style, nextValue);
  }
  // 3. Fallback to direct assignment or attribute setting
  else {
    if (key in el) {
      (el as any)[key] = nextValue;
    } else {
      if (nextValue == null || nextValue === false) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, nextValue);
      }
    }
  }
}

// Pure recursive tree generator: Turns structured JSON data into browser layout markup
export function createRealDOM(vNode: VNode): Node {
  // 1. Handle Text Node Case
  if (vNode.type === "text") {
    return document.createTextNode(vNode.text);
  }

  // 2. Handle Element Node Case
  const el = document.createElement(vNode.tag);
  for (const [key, value] of Object.entries(vNode.props)) {
    if (key !== "hooks") {
      patchProp(el, key, value);
    }
  }

  // Recursively build children
  vNode.children.forEach((child) => {
    el.appendChild(createRealDOM(child));
  });

  // 3. Fire Lifecycle Hooks
  const hooks = vNode.hooks;
  if (hooks) {
    if (hooks.afterCreate) {
      hooks.afterCreate(el);
    }
    if (hooks.afterUpdate) {
      hooks.afterUpdate(el); // Initial load counts as first data reflection
    }
  }

  return el;
}
export function patch(el: Node, newVNode: VNode, oldVNode: VNode): Node {
  const parentEl = el.parentElement;
  // Case A: Types mismatched entirely (e.g., text became element or vice versa) -> Full replace
  if (newVNode.type !== oldVNode.type) {
    const nextEl = createRealDOM(newVNode);
    parentEl.replaceChild(nextEl, el);
    return nextEl;
  }

  // Case B: Both are Text Nodes
  if (newVNode.type === "text" && oldVNode.type === "text") {
    if (newVNode.text !== oldVNode.text) {
      el.nodeValue = newVNode.text;
    }
    return el;
  }

  // Case C: Both are Element Nodes
  if (newVNode.type === "element" && oldVNode.type === "element") {
    // If tags differ (e.g., <div> changed to <p>), swap them completely
    if (newVNode.tag !== oldVNode.tag) {
      const nextEl = createRealDOM(newVNode);
      parentEl.replaceChild(nextEl, el);
      return nextEl;
    }

    const htmlEl = el as HTMLElement;
    let didChange = false;
    // Inside patch element case:
    // Wipe out old attributes that are no longer present
    for (const key of Object.keys(oldVNode.props)) {
      if (key !== "hooks" && !(key in newVNode.props)) {
        if (key === "class") {
          htmlEl.className = "";
        } else {
          htmlEl.removeAttribute(key);
        }
        didChange = true;
      }
    }

    // Assign new or modified attributes
    for (const [key, val] of Object.entries(newVNode.props)) {
      if (key !== "hooks" && oldVNode.props[key] !== val) {
        patchProp(htmlEl, key, val); // 👈 Used here
        didChange = true;
      }
    }

    // Flag changes if child counts differ
    if (newVNode.children.length !== oldVNode.children.length) {
      didChange = true;
    }

    // 🟢 EXECUTE THE AFTERUPDATE HOOK
    if (didChange && newVNode.hooks?.afterUpdate) {
      newVNode.hooks.afterUpdate(htmlEl);
    }

    // Reconcile children list
    const maxLen = Math.max(newVNode.children.length, oldVNode.children.length);
    for (let i = 0; i < maxLen; i++) {
      const childDom = htmlEl.childNodes[i];
      const newChild = newVNode.children[i];
      const oldChild = oldVNode.children[i];

      if (newChild === undefined) {
        htmlEl.removeChild(childDom);
      } else if (oldChild === undefined) {
        htmlEl.appendChild(createRealDOM(newChild));
      } else {
        patch(htmlEl, newChild, oldChild, childDom);
      }
    }
  }

  return el;
}
*/
/*
export function createRealDOM(node: VNode): Node {
  if (node.type === "text") {
    return document.createTextNode(node.text);
  }

  const el = document.createElement(node.tag);

  // Assign properties, classes, and browser events cleanly
  for (const [key, value] of Object.entries(node.props)) {
    if (key.startsWith("on")) {
      // Automatically wire event listeners straight back into Engine timeline
      el.addEventListener(key.substring(2).toLowerCase(), value);
    }
    // FIX: Map 'class' to 'className' or use setAttribute
    else if (key === "class") {
      el.className = value;
    } else {
      (el as any)[key] = value;
    }
  }

  // Recurse down children array structures
  node.children.forEach((child) => el.appendChild(createRealDOM(child)));
  return el;
}
export function patchProps(
  el: HTMLElement,
  oldProps: Record<string, any>,
  newProps: Record<string, any>,
): void {
  // Remove attributes or event hooks that exist in old properties but disappeared in new ones
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      if (key.startsWith("on")) {
        const eventName = key.substring(2).toLowerCase();
        // Since listeners change contexts easily, we handle actual tracking via node metadata maps
        // For our framework implementation, wiping previous listener works cleanly
        el.removeEventListener(eventName, oldProps[key]);
      }
      // FIX: Clean up classes if they are completely removed
      else if (key === "class") {
        el.className = "";
      } else {
        el.removeAttribute(key);
      }
    }
  }
  // Update modified attributes or assign newly added ones
  for (const [key, value] of Object.entries(newProps)) {
    const oldValue = oldProps[key];

    if (value !== oldValue) {
      if (key.startsWith("on")) {
        const eventName = key.substring(2).toLowerCase();
        // Clear previous event listener reference to prevent double execution triggers
        if (oldValue) el.removeEventListener(eventName, oldValue);
        el.addEventListener(eventName, value);
      }
      // CRUCIAL FOCUS FIX: Do not stomp over live input fields unless the state forces a mismatch
      else if (key === "value" && (el as HTMLInputElement).value === value) {
        continue;
      }
      // FIX: Intelligently update the class string using className
      else if (key === "class") {
        el.className = value;
      } else {
        // Update raw attributes like class, type, or placeholder
        (el as any)[key] = value;
      }
    }
  }
}

export function patch(realNode: Node, oldNode: VNode, newNode: VNode): void {
  // Scenario A: The element type completely changed (e.g., div turned into header)
  if (
    oldNode.type !== newNode.type ||
    (oldNode.type === "element" &&
      newNode.type === "element" &&
      oldNode.tag !== newNode.tag)
  ) {
    const freshRealNode = createRealDOM(newNode);
    realNode.parentNode?.replaceChild(freshRealNode, realNode);
    return;
  }

  // Scenario B: It's a text node. Check if string values changed.
  if (oldNode.type === "text" && newNode.type === "text") {
    if (oldNode.text !== newNode.text) {
      realNode.nodeValue = newNode.text;
    }
    return;
  }

  // Scenario C: Both are elements with the same tag (e.g., matching inputs or divs)
  if (oldNode.type === "element" && newNode.type === "element") {
    const el = realNode as HTMLElement;

    // 1. Synchronize element attributes/properties (classes, inputs values, placeholders)
    patchProps(el, oldNode.props, newNode.props);

    // 2. Synchronize children array structures recursively
    const oldChildren = oldNode.children;
    const newChildren = newNode.children;
    const maxLen = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLen; i++) {
      const childRealNode = el.childNodes[i];
      const oldChildVNode = oldChildren[i];
      const newChildVNode = newChildren[i];

      if (!oldChildVNode && newChildVNode) {
        // Child was added -> Create and append it
        el.appendChild(createRealDOM(newChildVNode));
      } else if (oldChildVNode && !newChildVNode) {
        // Child was deleted -> Clean it up from the DOM
        if (childRealNode) el.removeChild(childRealNode);
      } else if (oldChildVNode && newChildVNode) {
        // Child exists in both -> Recursively compare the trees
        patch(childRealNode as Node, oldChildVNode, newChildVNode);
      }
    }
  }
}
*/
