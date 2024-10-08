import { useCallback, useSyncExternalStore } from "react"
import { TWorkspace } from "../../../types"
import { WorkspaceStore, useWorkspaceStore } from "../workspaceStore"

export function useWorkspaces(): readonly TWorkspace[] {
  const { store } = useWorkspaceStore<WorkspaceStore>()
  const workspaces = useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    () => store.getAll()
  )

  return workspaces
}
