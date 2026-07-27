# black-no-sugar
This framework, which follows The Elm Architecture, should make you feel like you are coding your app in Javascript. It has been written with help from a GPT (Gemini?).

# How it works
It implements the xylem and phloem of a tree of nested components, passing messages up and down from the root. You should know that the components are of two types: containers, and "leaf" components. And each component implements four lifecycle methods: init, view, update, and subscriptions. It's like vanilla javascript!

The signaling goes something like this: Messages dispatch from event listeners defined in views. Every message will reach the root component first (see cascading execution below) and then the message is passed back up (down?) to update the tree. Each update function may generate commands (a command is data representing the *intent* to perform an action). The engine collect the commands and orchestrate their execution, with the help of event managers. The engine also registers subscription callbacks collected from the components' subscription methods.

```
+---------------------+          +------------------------+
|   Effect Managers   | <------- |         Engine         |
+---------------------+          +------------------------+
          |                          .       ^        ^
   Dispatches(Sub)             Initializes & .   Executes(Cmd)
          |                     updates(Msg) .        .
          |                          .       .        .
+------------------------------------.-------.--------.---+
|         |  Top-Level App Component .       .        .   |
|         |                          .       .        .   |
| +-------|--------------------------.-------.--------.-+ |
| |       |  Parent Component        .       .        . | |
| |       |                          v       .        . | |
| |  +----|-----------------------------Dispatches--+ . | |
| |  |    v  Deep Child Component          (Msg)    | . | |
| |  |  +--subscriptions(Msg)--+----view-----|---+  | . | |
| |  |  |                      |         (v)DOM  |  | . | |
| |  |  +--init----------+--update(Msg)----------+  | . | |
| |  |  |                | => [Model, Cmd(Msg)]). . . . | |
| |  |  +----------------+-----------------------+  |   | |     
| |  +----------------------------------------------+   | |
| +-----------------------------------------------------+ |
+---------------------------------------------------------+
```

## Cascading execution
The AI said it use cascading execution (the bubble and intercept pattern), which seems important to mention: When a message is dispatched in a view, the engine constructs a Russian nesting doll of messages, and triggers the update function of the root component first. If the root component is a container, then it routes the message onward to the update function of the component from which it originated. ~~I can't remember how subscriptions work, but this is already probably more than you wanted to know.~~

## Subscriptions
According to the AI (Google Gemini?) "Every component that needs real-time network data must now expose a pure subscriptions function [1]. This function inspects the current Model and returns a list of topics it wants to listen to [1]." (sic) Each subscription can contain callback functions that can be called directly by the root engine.

Interesting concept, hey? Take a moment to ponder... How is the subscriptions mechanism for passing messages different from the messages passed to and from commands? I am still wrapping my mind around this, but here's one way to think about it: Subscriptions pass on messages received from the engine and its connected (backend) resources, whereas messages generating commands (through our update functions) originate from the DOM.

Finally, it is worth keeping in mind that subscription callbacks return component-level messages, which are fed to the update function.
