import {
  Box,
  Button,
  HStack,
  Heading,
  Link,
  List,
  ListItem,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { ManagementV1Self } from "@loft-enterprise/client/gen/models/managementV1Self"
import { useQuery } from "@tanstack/react-query"
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react"
import {
  Outlet,
  Params,
  Path,
  Link as RouterLink,
  createBrowserRouter,
  useNavigate,
  useParams,
} from "react-router-dom"
import { App, ErrorPage } from "./App"
import { useAppReady } from "./App/useAppReady"
import { client as globalClient } from "./client"
import { ToolbarActions, ToolbarTitle, WarningMessageBox, WorkspaceCardHeader } from "./components"
import {
  ProWorkspaceStore,
  TActionID,
  useSettings,
  useWorkspace,
  useWorkspaceStore,
  useWorkspaces,
} from "./contexts"
import { exists } from "./lib"
import { getDisplayName } from "./lib/pro"
import { Source, WorkspaceInstanceCard } from "./pro/WorkspaceInstanceCard"
import { Annotations, Labels } from "./pro/constants"
import { TProID, TProviderID, TSupportedIDE, TWorkspaceID } from "./types"
import { useIDEs } from "./useIDEs"
import {
  Action as ActionView,
  Actions,
  CreateWorkspace,
  ListProviders,
  ListWorkspaces,
  Provider,
  Providers,
  Settings,
  Workspaces,
} from "./views"
import { ProWorkspaceInstance } from "./pro"

export const Routes = {
  ROOT: "/",
  SETTINGS: "/settings",
  WORKSPACES: "/workspaces",
  ACTIONS: "/actions",
  get ACTION(): string {
    return `${Routes.ACTIONS}/:action`
  },
  get WORKSPACE_CREATE(): string {
    return `${Routes.WORKSPACES}/new`
  },
  toWorkspaceCreate(
    options: Readonly<{
      workspaceID: TWorkspaceID | null
      providerID: TProviderID | null
      ide: string | null
      rawSource: string | null
    }>
  ): Partial<Path> {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(options)) {
      if (exists(value)) {
        searchParams.set(key, value)
      }
    }

    return {
      pathname: Routes.WORKSPACE_CREATE,
      search: searchParams.toString(),
    }
  },
  toAction(actionID: TActionID, onSuccess?: string): string {
    if (onSuccess) {
      return `${Routes.ACTIONS}/${actionID}?onSuccess=${encodeURIComponent(onSuccess)}`
    }

    return `${Routes.ACTIONS}/${actionID}`
  },
  getActionID(params: Params<string>): string | undefined {
    // Needs to match `:action` from detail route exactly!
    return params["action"]
  },
  getWorkspaceCreateParamsFromSearchParams(searchParams: URLSearchParams): Partial<
    Readonly<{
      workspaceID: TWorkspaceID
      providerID: TProviderID
      ide: TSupportedIDE
      rawSource: string
    }>
  > {
    return {
      workspaceID: searchParams.get("workspaceID") ?? undefined,
      providerID: searchParams.get("providerID") ?? undefined,
      ide: (searchParams.get("ide") as TSupportedIDE | null) ?? undefined,
      rawSource: searchParams.get("rawSource") ?? undefined,
    }
  },
  PROVIDERS: "/providers",
  get PROVIDER(): string {
    return `${Routes.PROVIDERS}/:provider`
  },
  toProvider(providerID: string): string {
    return `${Routes.PROVIDERS}/${providerID}`
  },
  getProviderId(params: Params<string>): string | undefined {
    // Needs to match `:provider` from detail route exactly!
    return params["provider"]
  },
  PRO: "/pro",
  PRO_INSTANCE: "/pro/:host",
  PRO_WORKSPACE: "/pro/:host/:workspace",
  toProInstance(host: string): string {
    const h = host.replaceAll(".", "-")

    return `/pro/${h}`
  },
  toProWorkspace(host: string, instanceName: string): string {
    const base = this.toProInstance(host)

    return `${base}/${instanceName}`
  },
} as const

export const router = createBrowserRouter([
  {
    path: Routes.ROOT,
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: Routes.PRO,
        element: <Pro />,
        children: [
          {
            path: Routes.PRO_INSTANCE,
            element: <ProInstance />,
            children: [
              {
                index: true,
                element: <ListProWorkspaces />,
              },
              {
                path: Routes.PRO_WORKSPACE,
                element: <ProWorkspace />,
              },
            ],
          },
        ],
      },
      {
        path: Routes.WORKSPACES,
        element: <Workspaces />,
        children: [
          {
            index: true,
            element: <ListWorkspaces />,
          },
          {
            path: Routes.WORKSPACE_CREATE,
            element: <CreateWorkspace />,
          },
        ],
      },
      {
        path: Routes.PROVIDERS,
        element: <Providers />,
        children: [
          { index: true, element: <ListProviders /> },
          {
            path: Routes.PROVIDER,
            element: <Provider />,
          },
        ],
      },
      {
        path: Routes.ACTIONS,
        element: <Actions />,
        children: [{ path: Routes.ACTION, element: <ActionView /> }],
      },
      { path: Routes.SETTINGS, element: <Settings /> },
    ],
  },
])

function Pro() {
  return <Outlet />
}

type TProContext = Readonly<{
  managementSelf: ManagementV1Self
  currentProject: ManagementV1Project
  host: string
}>
const ProContext = createContext<TProContext>(null!)
export function ProProvider({ host, children }: { host: string; children: ReactNode }) {
  const navigate = useNavigate()
  const { store } = useWorkspaceStore<ProWorkspaceStore>()
  const client = useProClient(host)
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
    return client.watchWorkspaces((workspaces) => {
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

  const value = useMemo<TProContext>(() => {
    if (!managementSelf || !currentProject) {
      return null!
    }

    return { managementSelf, currentProject, host }
  }, [currentProject, managementSelf, host])

  // TODO: handle properly with loading indicator
  if (!managementSelf || !currentProject) {
    return null
  }

  return (
    <ProContext.Provider value={value}>
      <ToolbarTitle>
        <Text onClick={() => navigate(Routes.toProInstance(host))} fontWeight="semibold">
          {host}
        </Text>
      </ToolbarTitle>
      <ToolbarActions>
        {projects && projects.length > 0 && (
          <ProjectPicker
            projects={projects}
            currentProject={currentProject}
            onChanged={handleProjectChanged}
          />
        )}
      </ToolbarActions>
      {children}
    </ProContext.Provider>
  )
}

export function useProHost() {
  const { host: urlHost } = useParams<{ host: string | undefined }>()

  const host = useMemo(() => {
    return urlHost?.replaceAll("-", ".")
  }, [urlHost])

  return host
}

function ProInstance() {
  const host = useProHost()
  const { errorModal, changelogModal, proLoginModal } = useAppReady()

  if (host == undefined || host.length === 0) {
    return (
      <WarningMessageBox
        warning={
          <>
            Pro Instance not found
            <br />
            <Link as={RouterLink} to={Routes.ROOT}>
              Go back
            </Link>
          </>
        }
      />
    )
  }

  return (
    <>
      <Outlet />

      {errorModal}
      {changelogModal}
      {proLoginModal}
    </>
  )
}

function ListProWorkspaces() {
  const workspaces = useProWorkspaces()
  const { host } = useContext(ProContext)

  return (
    <div>
      <Heading>Workspaces</Heading>
      <Link as={RouterLink} to="/">
        Home
      </Link>
      <List>
        {workspaces.map((w) => (
          <ListItem key={w.metadata!.name}>
            <WorkspaceInstanceCard host={host} instanceName={w.metadata!.name!} />
          </ListItem>
        ))}
      </List>
    </div>
  )
}

function useProClient(id: TProID) {
  const c = useMemo(() => {
    return globalClient.getProClient(id)
  }, [id])

  return c
}

function useProWorkspaces() {
  const workspaces = useWorkspaces<ProWorkspaceInstance>()
  console.log(workspaces)

  return workspaces
}

const DETAILS_TABS = [
  { label: "Logs", component: <Box w="full" h="full" opacity={0.3} bg="blue" /> },
  { label: "Files", component: <Box w="full" h="full" opacity={0.3} bg="yellow" /> },
  { label: "Configuration", component: <Box w="full" h="full" opacity={0.3} bg="orange" /> },
  { label: "History", component: <Box w="full" h="full" opacity={0.3} bg="green" /> },
]
function ProWorkspace() {
  const { host } = useContext(ProContext)
  const params = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const workspace = useWorkspace<ProWorkspaceInstance>(params.workspace)
  const instance = workspace.data
  const instanceName = instance?.metadata?.name
  const workspaceID = instance?.id
  const { ides } = useIDEs()

  useEffect(() => {
    workspace.current?.connect((e) => {
      if (e.type === "error") {
        console.log(e.error.message)
      } else {
        console.log(e.data.message)
      }
    })
  }, [workspace])

  if (!instance) {
    return <>Instance not found</>
  }

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"

  const handleOpenClicked = () => {
    if (!instanceName || !workspaceID) {
      return
    }
    console.log(workspaceID)

    workspace.start({ id: workspaceID })
    navigate(Routes.toProWorkspace(host, instanceName))
  }

  return (
    <VStack align="start" width="full" height="full">
      <VStack align="start" width="full">
        <Box>
          <Link as={RouterLink} to={Routes.toProInstance(params.host?.replaceAll("-", ".")!)}>
            Back to workspaces
          </Link>
        </Box>
        <Box width="full">
          <WorkspaceCardHeader
            id={instanceName!}
            source={undefined}
            statusBadge={null}
            controls={null}>
            TODO: IMPLEMENT ME
          </WorkspaceCardHeader>
        </Box>
        <HStack>
          <Text>{instance.status?.lastWorkspaceStatus}</Text>
          <Text>{instance.metadata?.labels?.[Labels.WorkspaceUID]}</Text>
          <Text>
            {Source.fromRaw(
              instance.metadata?.annotations?.[Annotations.WorkspaceSource]
            ).stringify()}
          </Text>
          <Text>{instance.spec?.templateRef?.name}</Text>
          <Text>{instance.spec?.runnerRef?.runner}</Text>
          <Text>{instance.metadata?.annotations?.[Annotations.SleepModeLastActivity]}</Text>
        </HStack>
      </VStack>
      <Box width="full" height="full">
        <Tabs isLazy w="full" h="full">
          <TabList marginBottom="6">
            {DETAILS_TABS.map(({ label }) => (
              <Tab key={label}>{label}</Tab>
            ))}
          </TabList>
          <TabPanels w="full" h="full">
            {DETAILS_TABS.map(({ label, component }) => (
              <TabPanel w="full" h="full" padding="0" key={label}>
                {component}
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </Box>
    </VStack>
  )
}

type TProjectPickerProps = Readonly<{
  currentProject: ManagementV1Project
  projects: readonly ManagementV1Project[]
  onChanged: (newProject: ManagementV1Project) => void
}>
function ProjectPicker({ currentProject, projects, onChanged }: TProjectPickerProps) {
  return (
    <Menu closeOnSelect={true} offset={[0, 2]}>
      <MenuButton as={Button} variant="unstyled">
        {getDisplayName(currentProject)}
      </MenuButton>
      <MenuList>
        {projects.map((project) => {
          const id = project.metadata!.name!

          return (
            <MenuItemOption onClick={() => onChanged(project)} key={id} value={id}>
              <HStack>
                <Text>{getDisplayName(project)}</Text>
              </HStack>
            </MenuItemOption>
          )
        })}
      </MenuList>
    </Menu>
  )
}
