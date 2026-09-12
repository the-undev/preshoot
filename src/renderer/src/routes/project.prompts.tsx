import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@renderer/design-system"
import { useVariants } from "@renderer/features/prompts/use-variants"
import { VariantForm } from "@renderer/features/prompts/variant-form"
import { VariantList } from "@renderer/features/prompts/variant-list"
import { useTRPC, type PromptVariant } from "@renderer/lib/trpc"

export const Route = createFileRoute("/project/prompts")({
  component: Prompts,
})

/** What the form is for: nothing, a copy of a prompt, or a prompt written here. */
type Editing =
  | { kind: "none" }
  | { kind: "copy"; variant: PromptVariant }
  | { kind: "existing"; variant: PromptVariant }

function Prompts(): React.JSX.Element {
  const trpc = useTRPC()
  const targets = useQuery(trpc.prompts.targets.queryOptions())
  const targetId = targets.data?.defaultId ?? ""

  return (
    <main className="mx-auto grid h-full w-full max-w-[1400px] gap-8 overflow-y-auto p-8 lg:grid-cols-[20rem_1fr]">
      {targetId.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading targets…</p>
      ) : (
        <TargetPrompts targetId={targetId} />
      )}
    </main>
  )
}

interface TargetPromptsProps {
  targetId: string
}

/** The system prompts for one target, and the one being read or written. */
function TargetPrompts({ targetId }: TargetPromptsProps): React.JSX.Element {
  const prompts = useVariants(targetId)
  const [editing, setEditing] = useState<Editing>({ kind: "none" })

  const close = (): void => setEditing({ kind: "none" })
  const selected = editing.kind === "none" ? null : editing.variant

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">System prompts</h2>
        <VariantList
          variants={prompts.variants}
          selectedId={selected?.id ?? null}
          onSelect={(variant) =>
            setEditing(variant.editable ? { kind: "existing", variant } : { kind: "copy", variant })
          }
          onCopy={(variant) => setEditing({ kind: "copy", variant })}
          onRemove={prompts.remove}
        />
        {prompts.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{prompts.errorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-4">
        {selected ? (
          <VariantForm
            key={`${editing.kind}:${selected.id}`}
            variant={selected}
            isSaving={prompts.isSaving}
            onCancel={close}
            onSubmit={(fields) => {
              if (editing.kind === "existing") {
                prompts.update(selected.id, fields)
              } else {
                prompts.create(fields)
              }
              close()
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a prompt to read it. A built-in one opens as a copy you can change.
          </p>
        )}
      </section>
    </>
  )
}
