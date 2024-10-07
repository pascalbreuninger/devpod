import {
  Box,
  Heading,
  Link,
  List,
  ListItem,
  VStack,
  Text,
  HStack,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react"
import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react"
import {
  Outlet,
  Params,
  Path,
  Link as ReactRouterLink,
  createBrowserRouter,
  useParams,
} from "react-router-dom"
import { App, ErrorPage } from "./App"
import { client } from "./client"
import { WarningMessageBox } from "./components"
import { TActionID, useSettings } from "./contexts"
import { exists } from "./lib"
import {
  Source,
  WorkspaceControls,
  WorkspaceInstanceCard,
  WorkspaceInstanceHeader,
} from "./pro/WorkspaceInstanceCard"
import { Annotations, Labels } from "./pro/constants"
import { TProID, TProviderID, TSupportedIDE, TWorkspaceID } from "./types"
import {
  Action,
  Actions,
  CreateWorkspace,
  ListProviders,
  ListWorkspaces,
  Provider,
  Providers,
  Settings,
  Workspaces,
} from "./views"
import { useIDEs } from "./useIDEs"

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
  toProWorkspace(host: string, workspaceID: string): string {
    const base = this.toProInstance(host)

    return `${base}/${workspaceID}`
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
        children: [{ path: Routes.ACTION, element: <Action /> }],
      },
      { path: Routes.SETTINGS, element: <Settings /> },
    ],
  },
])

function Pro() {
  return <Outlet />
}

type TProContext = Readonly<{
  workspaces: readonly ManagementV1DevPodWorkspaceInstance[]
}>
const ProContext = createContext<TProContext>({
  workspaces: [],
})
function ProProvider({ host, children }: { host: string; children: ReactNode }) {
  const client = useProClient(host)
  const [workspaces, setWorkspaces] = useState<readonly ManagementV1DevPodWorkspaceInstance[]>([])

  // TODO: Can we merge OSS and pro workspace types here?
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
      setWorkspaces(sorted)
    })
  }, [client])

  const value = useMemo<TProContext>(
    () => ({
      workspaces,
    }),
    [workspaces]
  )

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>
}

function ProInstance() {
  const { host } = useParams<{ host: string | undefined }>()

  if (host == undefined || host.length === 0) {
    return (
      <WarningMessageBox
        warning={
          <>
            Pro Instance not found
            <br />
            <Link as={ReactRouterLink} to={Routes.ROOT}>
              Go back
            </Link>
          </>
        }
      />
    )
  }

  return (
    <ProProvider host={host.replaceAll("-", ".")}>
      {" "}
      <Outlet />
    </ProProvider>
  )
}

function ListProWorkspaces() {
  const workspaces = useProWorkspaces()

  return (
    <div>
      <Heading>Workspaces</Heading>
      <Link as={ReactRouterLink} to="/">
        Home
      </Link>
      <List>
        {workspaces.map((w) => (
          <ListItem key={w.metadata!.name}>
            <WorkspaceInstanceCard instance={w} />
          </ListItem>
        ))}
      </List>
    </div>
  )
}

function useProClient(id: TProID) {
  const c = useMemo(() => {
    return client.getProClient(id)
  }, [id])

  return c
}

function useProWorkspaces() {
  return useContext(ProContext).workspaces
}

const DETAILS_TABS = [
  { label: "Logs", component: <Box w="full" h="full" opacity={0.3} bg="blue" /> },
  { label: "Files", component: <Box w="full" h="full" opacity={0.3} bg="yellow" /> },
  { label: "Configuration", component: <Box w="full" h="full" opacity={0.3} bg="orange" /> },
  { label: "History", component: <Box w="full" h="full" opacity={0.3} bg="green" /> },
]
function ProWorkspace() {
  const params = useParams()
  const settings = useSettings()
  const workspaces = useProWorkspaces()
  const instance = workspaces.find((w) => w.metadata?.name === params.workspace)
  const { ides, defaultIDE } = useIDEs()

  if (!instance) {
    return <>Instance not found</>
  }

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"

  return (
    <VStack align="start" width="full" height="full">
      <VStack align="start" width="full">
        <Box>
          <Link as={ReactRouterLink} to={Routes.toProInstance(params.host?.replaceAll("-", ".")!)}>
            Back to workspaces
          </Link>
        </Box>
        <Box width="full">
          <WorkspaceInstanceHeader
            instance={instance}
            isLoading={isLoading}
            onActionIndicatorClicked={() => {}}
            onSelectionChange={() => {}}
            onCheckStatusClicked={() => {}}>
            <WorkspaceControls
              id={instance.metadata!.name!}
              instance={instance}
              isLoading={isLoading}
              isIDEFixed={settings.fixedIDE}
              ides={ides}
              ideName={""}
              setIdeName={() => {}}
              navigateToAction={() => {}}
              onRebuildClicked={() => {}}
              onResetClicked={() => {}}
              onDeleteClicked={() => {}}
              onStopClicked={() => {}}
              onLogsClicked={() => {}}
            />
          </WorkspaceInstanceHeader>
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
