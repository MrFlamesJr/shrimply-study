/**
 * Shows the key that triggers an action, as one keycap box with the keys. Visual only: the screen handles the key.
 * Hidden on small and touch screens. `keys` like "Enter" or "Ctrl+S".
 */
export function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="shortcut" aria-hidden="true">
      {keys.split('+').map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  )
}
