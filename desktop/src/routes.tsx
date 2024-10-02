/* eslint-disable react-hooks/exhaustive-deps */
import { Heading, Link, List, ListItem } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
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
import { ProClient } from "./client/client"
import { WarningMessageBox } from "./components"
import { TActionID } from "./contexts"
import { exists } from "./lib"
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
  toProInstance(host: string): string {
    const h = host.replaceAll(".", "-")

    return `/pro/${h}`
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
  return (
    <>
      <Outlet />
    </>
  )
}

function ProInstance() {
  const { host } = useParams<{ host: string | undefined }>()
  // FIXME: Can never be undefined!
  const client = useProClient(host?.replaceAll("-", ".")!)
  const { workspaces } = useProWorkspaces(client)

  const handleWorkspaceClicked = (id: string) => {
    console.log(id)
  }

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
    <div>
      <Heading>{host}</Heading>
      {workspaces && (
        <List>
          {workspaces.map((w) => (
            <ListItem
              onClick={() => handleWorkspaceClicked(w.metadata!.name!)}
              key={w.metadata!.name}>
              {w.metadata?.name}
            </ListItem>
          ))}
        </List>
      )}
    </div>
  )
}

function useProClient(id: TProID) {
  const c = useMemo(() => {
    return client.getProClient(id)
  }, [])

  return c
}

function useProWorkspaces(client: ProClient) {
  const {
    data: workspaces,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["PRO"],
    queryFn: async () => {
      const res = (await client.listWorkspaces()).unwrap()

      return res
    },
    refetchInterval: 5_000,
  })

  return { workspaces }
}
