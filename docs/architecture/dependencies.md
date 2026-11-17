# Dependencies

## Packages

No package was added for the workspace. Runtime: `react`, `react-dom`, `fflate` (zip), `@dnd-kit/*` (sorting inside one
list: a sequence's steps, the editor's cards). Tabs and the Explorer drag with native HTML5 drag and drop, which works
across the app's windows and shows the system's move or copy cursor.

## Module graph (arrows: "imports")

```
App                 ──> layout/*, screens/*, components/*, hooks/*, state/useWorkspace, storage prefs and fileStorage, route, kit/{shortcuts,windows,layout}
layout/*            ──> components/*, kit/*, logic/*, route, state/useWorkspace (types), model, storage/googleDrive (ExplorerPane only: see Checked)
screens, components ──> state/useWorkspace (types), kit/* (Confetti, windows, ...), route, logic/*, model
state/useWorkspace  ──> state/workspace, storage/*, logic/*, kit/*, model, logic/routes
state/workspace     ──> kit/{history,layout,selection}, logic/{contentOps,names,plural,routes,workbenchActions}, storage (types), model
logic/*             ──> model, logic/*, kit's pure files (layout, shortcuts, tree, selection, history)
route               ──> react, logic/routes, model
storage/*           ──> model, logic/*        (no React)
kit/*               ──> react, react-dom, kit/*     (never anything else: kit/boundary.test.ts)
```

Rules: no cycles; `src/kit/` never imports outside itself; only `src/storage/` does I/O; screens never import storage
(the debug page excepted, as before).

## Checked (grep over the source, without tests)

- `src/kit/` imports only `react`, `react-dom`, `react-dom/client` and itself (including `kit/demo`). Holds. (`lodash` and
  `../model` appear only as strings inside `boundary.test.ts`.)
- `src/logic/` imports only `model`, other `logic` files and the kit's pure files. Holds.
- `src/state/` imports `storage`, `logic`, `kit` and `model`, and no component or screen. Holds now: `Notify` moved to
  `logic/pushToast` and `Choice` to `model.ts`.
- `src/storage/` imports no React and no screens, components, layout or state; it imports `model` and `logic`
  (`cloze`, `groups`, `names`, `plural`, `sides`). Holds. Files are reached only through `StorageAdapter`.
- Screens and components import `storage` only in the debug page (`screens/DebugScreen.tsx`, `screens/debug/*`). Holds.
  `App.tsx` and `main.tsx` import the preference files, `fileStorage` and `loadGuide` (the shell).
- Violation: `src/layout/ExplorerPane.tsx` imports `hasFreshToken` and the type `DriveFile` from `storage/googleDrive`. Layout
  files should not touch storage; `useWorkspace` (or `WorkspaceApi.drive`) should expose "has a token that works without a
  popup" and the type instead.
