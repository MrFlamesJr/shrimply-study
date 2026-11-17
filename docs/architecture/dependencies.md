# Dependencies

## Packages

No package was added for the workspace. Runtime: `react`, `react-dom`, `fflate` (zip), `@dnd-kit/*` (sorting inside one
list: a sequence's steps, the editor's cards). Tabs and the Explorer drag with native HTML5 drag and drop, which works
across the app's windows and shows the system's move or copy cursor.

## Module graph (arrows: "imports")

```
```
App                 ──> layout/*, screens/*, components/*, hooks/*, state/useWorkspace, storage prefs, route, kit/{shortcuts,windows,layout}
layout/*            ──> components/*, kit/*, logic/*, route, state/useWorkspace (types), model
screens, components ──> state/useWorkspace (types), kit/* (Confetti, windows, ...), route, logic/*, model
state/useWorkspace  ──> state/workspace, storage/*, logic/*, kit/*, model, route (type), components (types: Notify, Choice)
state/workspace     ──> kit/{history,layout,selection}, logic/{contentOps,names,plural,routes}, storage (types), model
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
- `src/storage/` imports no React and no screens, components, layout or state; it imports `model` and `logic`
  (`cloze`, `groups`, `names`, `plural`, `sides`). Holds.
- Screens, components, layout and hooks import `storage` only in the debug page (`screens/DebugScreen.tsx`,
  `screens/debug/*`: `browserBackup`, `resetPrefs`, `format`, `fileStorage`); `App.tsx` imports the preference files,
  `fileStorage` and `loadGuide`. Holds.
- `src/logic/` imports only `model`, other `logic` files and the kit's pure files. Holds now: the routes moved to
  `logic/routes.ts`, so `tabNav.ts` and `workbenchActions.ts` no longer import `src/route.ts` (which holds React hooks).
- `src/state/` imports `storage`, `logic`, `kit`, `model` and, as a type, `src/route.ts`. Violation: `useWorkspace.ts`
  imports two types from `components` (`Notify` from `components/Toasts`, `Choice` from `components/ConfirmDialog`). The
  state layer should not import components; the types should move to a lower layer. (Smaller: the type-only `Route` import in
  `useWorkspace.ts` can come from `logic/routes` as `workspace.ts` does.)
