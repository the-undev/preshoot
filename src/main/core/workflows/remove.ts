import { rmSync } from "node:fs"
import { join } from "node:path"
import { eq, inArray } from "drizzle-orm"
import { inputsNamedByWorkflow, removeUnnamedFiles } from "../configurations/store"
import { schema, type ProjectDatabase } from "../db"
import { isFinished, runFolder, type RunState } from "../dispatch/run-store"
import { WorkflowError } from "./errors"

/**
 * Removes a workflow's copy from the project with its slots, configurations and runs, then the
 * runs' folders and the input files nothing else names. The source file is never touched. A
 * workflow with a run still queued or running is refused.
 */
export function removeWorkflow(input: {
  db: ProjectDatabase
  directory: string
  workflowId: number
}): void {
  const { db, directory, workflowId } = input
  const workflow = db
    .select({ name: schema.workflows.name })
    .from(schema.workflows)
    .where(eq(schema.workflows.id, workflowId))
    .get()
  if (!workflow) throw WorkflowError.notFound(`Workflow ${workflowId}`)
  const runs = db
    .select({ id: schema.runs.id, state: schema.runs.state })
    .from(schema.runs)
    .where(eq(schema.runs.workflowId, workflowId))
    .all()
  if (runs.some((run) => !isFinished(run.state as RunState))) {
    throw WorkflowError.runsUnfinished(workflow.name)
  }
  const inputs = inputsNamedByWorkflow(db, directory, workflowId)
  const runIds = runs.map((run) => run.id)

  db.transaction((tx) => {
    tx.delete(schema.runOutputs).where(inArray(schema.runOutputs.runId, runIds)).run()
    tx.delete(schema.runs).where(eq(schema.runs.workflowId, workflowId)).run()
    tx.delete(schema.configurations).where(eq(schema.configurations.workflowId, workflowId)).run()
    tx.delete(schema.workflowSlots).where(eq(schema.workflowSlots.workflowId, workflowId)).run()
    tx.delete(schema.workflows).where(eq(schema.workflows.id, workflowId)).run()
  })
  for (const runId of runIds) {
    rmSync(join(directory, runFolder(runId)), { recursive: true, force: true })
  }
  removeUnnamedFiles(db, directory, inputs)
}
