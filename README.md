# react-native-gpui-todo

A desktop todo app built with [React Native GPUI](https://streetwriters.github.io/react-native-gpui/), with the UI written in React Native and **all of the todo logic written in Rust**.

- Add, complete, and delete todos
- Filter by **All / Active / Done**
- "N items left" counter and **Clear completed**
- Todos are saved to disk and restored on the next launch

## How it works

React Native GPUI runs a normal React Native app (Hermes JS engine + Fabric) but renders it with [GPUI](https://www.gpui.rs/), the GPU-accelerated Rust UI framework from Zed, instead of iOS/Android views. The desktop host is a Rust binary (`desktop/`), which means you can write native code for the app in Rust as a **TurboModule**.

This app splits the work like this:

```
┌──────────────────────────────┐        ┌───────────────────────────────────┐
│  App.tsx  (React / JS)       │        │  desktop/src/todo_store.rs (Rust) │
│                              │  JSI   │                                   │
│  - renders the list          │ ─────▶ │  - holds the todo list (Mutex)    │
│  - keeps only UI state:      │        │  - validates / trims titles       │
│    input text, filter,       │ ◀───── │  - toggle / remove / clear done   │
│    last TodoState snapshot   │        │  - filtering + counts             │
│                              │        │  - saves/loads todos.json         │
└──────────────────────────────┘        └───────────────────────────────────┘
              ▲                                          ▲
              └──── desktop/src/NativeTodoStore.ts ──────┘
                    (typed spec → generated Rust trait)
```

### 1. The spec: `desktop/src/NativeTodoStore.ts`

A TypeScript TurboModule spec describes the API that Rust exposes to JS:

```ts
export interface Spec extends TurboModule {
  getState(filter: Filter): TodoState; // { items, remaining, total }
  add(title: string): boolean;          // false if title is blank
  toggle(id: number): boolean;
  remove(id: number): boolean;
  clearDone(): number;                  // how many were removed
}
```

### 2. Code generation: `desktop/build.rs`

The build script passes the spec to the codegen:

```rust
rn_gpui_module_build::generate(&["src/NativeTodoStore.ts"]);
```

At build time this creates a Rust trait `NativeTodoStoreSpec`, along with `Todo`, `TodoState`, and `Filter` types that match the TS types. `rn_gpui_module::include_specs!()` in `main.rs` pulls the generated code in. If the Rust implementation doesn't match the spec, the build fails with a compile error, so the JS and Rust sides can't silently drift apart.

### 3. The implementation: `desktop/src/todo_store.rs`

`TodoStore` implements the generated trait. The data is kept in a `Mutex<Data>`. Every method that changes it then writes JSON to disk:

| OS    | File                                                         |
| ----- | ------------------------------------------------------------ |
| macOS | `~/Library/Application Support/react-native-gpui-todo/todos.json` |
| Linux | `$XDG_DATA_HOME` (or `~/.local/share`)`/react-native-gpui-todo/todos.json` |

Methods that return a value run **synchronously on the JS thread**, so `TodoStore.add(text)` in JS returns the Rust result directly, with no `await`. IDs come from a counter that only goes up, so an ID is never reused after a delete. The pure logic (`Data`) is separate from the module glue and has unit tests.

### 4. Registration: `desktop/src/main.rs`

```rust
react_native_gpui::register_module(native_todo_store_module::<todo_store::TodoStore>());
```

Registration happens before the app starts, so `TurboModuleRegistry.getEnforcing('NativeTodoStore')` finds the module in JS.

### 5. The UI: `App.tsx`

The React component holds no todo data of its own. It calls a Rust method and then refreshes its snapshot:

```ts
const addTodo = () => {
  if (TodoStore.add(text)) {   // Rust validates + saves
    setText('');
    refresh();                 // setState(TodoStore.getState(filter))
  }
};
```

It also uses some GPUI desktop-only props, such as `hoverStyle`, `group` / `groupHoverStyle` (the delete ✕ shows only when you hover over a row), and `tooltip`.

## Project layout

```
App.tsx                      React UI
desktop/
  src/main.rs                desktop entry point, registers the Rust module
  src/NativeTodoStore.ts     TurboModule spec (shared JS ⇄ Rust contract)
  src/todo_store.rs          todo logic + persistence + unit tests
  build.rs                   runs the codegen for the spec
  Cargo.toml                 Rust deps (react-native-gpui, serde, serde_json)
  desktop.json               window / packaging config
rust-toolchain.toml          pins the project to rustup's stable Rust
ios/ android/                untouched React Native template targets
```

## Running it

### Requirements

- Node.js 22.13+
- Rust **1.98+** installed with [rustup](https://rustup.rs) (`rust-toolchain.toml` selects `stable`)
- CMake (`brew install cmake`)
- macOS: Xcode command line tools (`xcode-select --install`)

Check your setup with `npx react-native doctor-desktop`.

### Commands

```sh
npm install
npx react-native run-desktop            # dev build with Metro + Fast Refresh
npx react-native run-desktop --release  # optimized build
npx react-native package-desktop        # build an installer for this OS
```

The first build takes a few minutes because it compiles the GPUI renderer. Later builds take seconds.

> **Note:** If you also have Rust from Homebrew, it may come before rustup's
> Rust in your `PATH` and ignore `rust-toolchain.toml`. Run with
> `PATH="$HOME/.cargo/bin:$PATH" npx react-native run-desktop`, or upgrade it
> with `brew upgrade rust`.

### Rust unit tests

```sh
cd desktop && cargo test
```

