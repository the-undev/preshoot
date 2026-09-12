interface ChipProps {
  chosen: boolean
  label: string
  onToggle: () => void
  children: React.ReactNode
}

/**
 * One thing that is either picked or not. A plain button rather than the design system's, whose
 * variants set their own dark-mode background and would win over the chosen colour.
 */
export function Chip({ chosen, label, onToggle, children }: ChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={label}
      onClick={onToggle}
      className={
        chosen
          ? "rounded-md border border-chosen bg-chosen px-3 py-1.5 text-sm font-medium text-chosen-foreground"
          : "rounded-md border border-input bg-input/30 px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
      }
    >
      {children}
    </button>
  )
}
