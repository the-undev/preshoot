import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { shortcutGroups, shortcutKeys } from "./shortcuts"

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Every shortcut the app has, read from the same list the bindings come from. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            A shortcut without a modifier does nothing while you are typing into a field.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {shortcutGroups().map(({ group, shortcuts }) => (
            <section key={group} className="flex flex-col gap-1">
              <h3 className="font-heading text-xs font-semibold text-muted-foreground uppercase">
                {group}
              </h3>
              <ul className="flex flex-col">
                {shortcuts.map((shortcut) => (
                  <li
                    key={shortcut.id}
                    className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0"
                  >
                    <span className="text-sm">{shortcut.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {shortcutKeys(shortcut).map((key) => (
                        <kbd
                          key={key}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
