import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@renderer/design-system"

/** The tab look, since the tabs are links rather than panels. */
const tabClass = buttonVariants({ variant: "ghost", size: "sm" })
const activeTab = { className: "bg-accent text-accent-foreground" }

/**
 * The screens of an open project. Library is the user's own folder, shared by every project, and
 * Saved is the starting points kept in this one.
 */
export function ProjectNav(): React.JSX.Element {
  return (
    <nav className="flex items-center gap-1">
      <Link
        to="/project"
        activeOptions={{ exact: true }}
        className={tabClass}
        activeProps={activeTab}
      >
        Clips
      </Link>
      <Link to="/project/library" className={tabClass} activeProps={activeTab}>
        Library
      </Link>
      <Link to="/project/saved" className={tabClass} activeProps={activeTab}>
        Saved
      </Link>
      <Link to="/project/workflows" className={tabClass} activeProps={activeTab}>
        Workflows
      </Link>
    </nav>
  )
}
