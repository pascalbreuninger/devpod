import { ProClient, client as globalClient } from "@/client"
import { ErrorMessageBox, ProLayout, ToolbarActions, ToolbarTitle } from "@/components"
import { Annotations, Failed } from "@/lib"
import { Routes } from "@/routes"
import { Link, Spinner, Text, VStack } from "@chakra-ui/react"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { ManagementV1Self } from "@loft-enterprise/client/gen/models/managementV1Self"
import { useQuery } from "@tanstack/react-query"
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react"
import { Link as RouterLink, useNavigate } from "react-router-dom"
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
  const [connectionError, setConnectionError] = useState<Failed | null>(null)
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

    return client.watchWorkspaces(
      (workspaces) => {
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
        // dirty, dirty
        setTimeout(() => {
          setIsLoading(false)
        }, 1_000)
      },
      (err) => {
        if (!err.message.startsWith("Command already cancelled")) {
          setConnectionError(err)
          setIsLoading(false)
        }
      }
    )
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

  // TODO: handle properly
  if ((!managementSelf || !currentProject) && !connectionError) {
    return null
  }
  if (connectionError) {
    return <ConnectionErrorBox error={connectionError} host={host} client={client} />
  }

  return (
    <ProContext.Provider value={value}>
      <ToolbarTitle>{host}</ToolbarTitle>
      <ToolbarActions>
        <ContextPicker
          currentHost={host}
          onHostChange={handleHostChanged}
          projects={projects ?? []}
          currentProject={currentProject!}
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

type TConnectionErrorBoxProps = Readonly<{ error: Failed; host: string; client: ProClient }>
function ConnectionErrorBox({ error, host, client }: TConnectionErrorBoxProps) {
  const { data, isLoading } = useQuery({
    queryKey: [host, "error", "healthcheck"],
    queryFn: async () => {
      const res = await client.checkHealth()
      // We expect this to go wrong
      if (res.err) {
        return res.val
      }
    },
  })
  useEffect(() => {
    globalClient.ready()
  }, [])

  return (
    <ProLayout statusBarItems={null} toolbarItems={null}>
      <VStack align="start" gap="4">
        <Text fontSize="md" fontWeight="medium" mb="4">
          Something went wrong connecting to {host} ({error.message}):
        </Text>
        {isLoading ? <Spinner /> : <ErrorMessageBox error={new Error(data?.message)} />}
        <Link as={RouterLink} to={Routes.ROOT}>
          Go to home screen
        </Link>
        <Link as={RouterLink} to={Routes.toProInstance(host)}>
          Reload
        </Link>
      </VStack>
    </ProLayout>
  )
}
