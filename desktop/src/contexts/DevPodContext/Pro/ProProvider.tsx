import { ProClient, client as globalClient } from "@/client"
import { ToolbarActions, ToolbarTitle } from "@/components"
import { Annotations } from "@/lib"
import { Routes } from "@/routes"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { ManagementV1Self } from "@loft-enterprise/client/gen/models/managementV1Self"
import { useQuery } from "@tanstack/react-query"
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ProWorkspaceStore, useWorkspaceStore } from "../workspaceStore"
import { ContextPicker, HOST_OSS } from "./ContextPicker"

type TProContext = Readonly<{
  managementSelf: ManagementV1Self
  currentProject: ManagementV1Project
  host: string
  client: ProClient
  isLoading: boolean
}>
const ProContext = createContext<TProContext>(null!)
export function ProProvider({ host, children }: { host: string; children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { store } = useWorkspaceStore<ProWorkspaceStore>()
  const client = useMemo(() => globalClient.getProClient(host), [host])
  const [selectedProject, setSelectedProject] = useState<ManagementV1Project | null>(null)
  const { data: managementSelf } = useQuery({
    queryKey: ["managementSelf"],
    queryFn: async () => {
      return (await client.getSelf()).unwrap()
    },
  })

  const { data: projects } = useQuery({
    queryKey: ["pro", host, "projects"],
    queryFn: async () => {
      return (await client.listProjects()).unwrap()
    },
  })

  const currentProject = useMemo<ManagementV1Project | undefined>(() => {
    if (selectedProject) {
      return selectedProject
    }

    return projects?.[0]
  }, [projects, selectedProject])

  useEffect(() => {
    setIsLoading(true)

    return client.watchWorkspaces((workspaces) => {
      setIsLoading(false)
      // sort by last activity (newest > oldest)
      const sorted = workspaces.slice().sort((a, b) => {
        const lastActivityA = a.metadata?.annotations?.[Annotations.SleepModeLastActivity]
        const lastActivityB = b.metadata?.annotations?.[Annotations.SleepModeLastActivity]
        if (!(lastActivityA && lastActivityB)) {
          return 0
        }

        return parseInt(lastActivityB, 10) - parseInt(lastActivityA, 10)
      })
      store.setWorkspaces(sorted)
    })
  }, [client, store])

  const handleProjectChanged = (newProject: ManagementV1Project) => {
    setSelectedProject(newProject)
  }

  const handleHostChanged = (newHost: string) => {
    if (newHost === HOST_OSS) {
      navigate(Routes.WORKSPACES)

      return
    }

    navigate(Routes.toProInstance(newHost))
  }

  const value = useMemo<TProContext>(() => {
    if (!managementSelf || !currentProject) {
      return null!
    }

    return { managementSelf, currentProject, host, client, isLoading }
  }, [currentProject, managementSelf, host, client, isLoading])

  // TODO: handle properly with loading indicator
  if (!managementSelf || !currentProject) {
    return null
  }

  return (
    <ProContext.Provider value={value}>
      <ToolbarTitle>{host}</ToolbarTitle>
      <ToolbarActions>
        <ContextPicker
          currentHost={host}
          onHostChange={handleHostChanged}
          projects={projects ?? []}
          currentProject={currentProject}
          onProjectChange={handleProjectChanged}
        />
      </ToolbarActions>
      {children}
    </ProContext.Provider>
  )
}

export function useProContext() {
  return useContext(ProContext)
}
