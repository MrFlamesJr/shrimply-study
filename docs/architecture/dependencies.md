# Dependencies

## Packages

No package was added for the workspace. Runtime: `react`, `react-dom`, `fflate` (zip), `@dnd-kit/*` (sorting inside one
list: a sequence's steps, the editor's cards). Tabs and the Explorer drag with native HTML5 drag and drop, which works
across the app's windows and shows the system's move or copy cursor.

## Module graph (arrows: "imports")

```
```
App                 ──> layout/*, screens/*, components/*, hooks/*, state/useWorkspace, storage prefs, route, kit/shortcuts
screens, components ──> state/useWorkspace (types), kit/* (Confetti, ...), route, logic/*, model
layout/*            ──> components/*, kit/*, logic/*, route, state/useWorkspace (types), model
state/useWorkspace  ──> state/workspace, storage/*, logic/*, kit/*, model, route, components (types: Notify, Choice)
state/workspace     ──> kit/{history,layout,selection}, logic/{contentOps,names,plural}, storage (types), model, route
logic/*             ──> model, logic/*, route (tabNav, workbenchActions), kit's pure files (layout, shortcuts, tree)
route               ──> react, model, logic/names
storage/*           ──> model, logic/*        (no React)
kit/*               ──> react, react-dom, kit/*     (never anything else: kit/boundary.test.ts)
```

Rules: no cycles; `src/kit/` never imports outside itself; only `src/storage/` does I/O; screens never import storage
(the debug page excepted, as before).

## Checked (grep over the source, without tests)

- `src/kit/` imports only `react`, `react-dom`, `react-dom/client` and itself (including `kit/demo`). Holds.
- `src/storage/` imports no React and no screens, components, layout or state; it imports `model` and `logic`
  (`cloze`, `groups`, `names`, `plural`, `sides`). Holds.
- Screens, components, layout and hooks import `storage` only in `screens/DebugScreen.tsx` (`browserBackup`,
  `resetPrefs`); `App.tsx` imports the preference files, `fileStorage` and `loadGuide`. Holds.
- `src/logic/` imports `model`, other `logic` files and the kit's pure files (`layout`, `shortcuts`, `tree`). Exceptions:
  `logic/tabNav.ts` (type `Nav`, `Route`) and `logic/workbenchActions.ts` (`resolve`, `Route`) import `src/route.ts`,
  which also holds React hooks (`useRoute`, `usePlace`). The rule "logic is pure and imports only model, logic and the
  kit" does not hold for these two.
- `src/state/` imports `storage`, `logic`, `kit` and `model`. Exception: `useWorkspace.ts` imports two types from
  `components` (`Notify` from `components/Toasts`, `Choice` from `components/ConfirmDialog`). The state layer should not
  import components; the types should move to a lower layer.
