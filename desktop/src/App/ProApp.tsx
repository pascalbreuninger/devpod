import { QueryKeys } from "@/queryKeys"
import { Box, HStack, Text, Link, useColorModeValue, IconButton } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Outlet, Link as RouterLink } from "react-router-dom"
import { Notifications, StatusBar, Toolbar, ProLayout } from "../components"
import { BellDuotone, CogDuotone } from "@/icons"
import { Routes } from "@/routes"
import {
  ProInstancesProvider,
  ProProvider,
  ProWorkspaceStore,
  ToolbarProvider,
  WorkspaceStoreProvider,
  useProContext,
  useProHost,
} from "../contexts"

export function ProApp() {
  const host = useProHost()
  if (!host) {
    throw new Error("No host found. This shouldn't happen")
  }

  const store = useMemo(() => new ProWorkspaceStore(host), [host])

  return (
    <WorkspaceStoreProvider store={store}>
      <ProInstancesProvider>
        <ToolbarProvider>
          <ProProvider host={host}>
            <ProAppContent host={host} />
          </ProProvider>
        </ToolbarProvider>
      </ProInstancesProvider>
    </WorkspaceStoreProvider>
  )
}

type TProAppContentProps = Readonly<{ host: string }>
function ProAppContent({ host }: TProAppContentProps) {
  const connectionStatus = useConnectionStatus()
  const iconColor = useColorModeValue("primary.600", "primary.400")

  return (
    <ProLayout
      toolbarItems={
        <>
          <HStack gap="4">
            <Box>
              <Toolbar.Title />
            </Box>
            <Box>
              <Toolbar.Actions />
            </Box>
          </HStack>
          <HStack pr="2">
            <Link as={RouterLink} to={Routes.toProSettings(host)}>
              <IconButton
                variant="ghost"
                size="md"
                rounded="full"
                aria-label="Go to settings"
                icon={<CogDuotone color={iconColor} />}
              />
            </Link>
            <Notifications
              getActionDestination={(action) => Routes.toProWorkspace(host, action.targetID)}
              icon={<BellDuotone color={iconColor} position="absolute" />}
            />
          </HStack>
        </>
      }
      statusBarItems={
        <>
          <HStack />
          <HStack>
            <StatusBar.Version />
            <StatusBar.DebugMenu />
            {!connectionStatus.isLoading && (
              <HStack gap="1">
                <Box
                  boxSize="2"
                  bg={connectionStatus.state === "connected" ? "green.400" : "red.400"}
                  rounded="full"
                />
                <Text color="gray.600" textTransform="capitalize">
                  {connectionStatus.state}
                </Text>
              </HStack>
            )}
          </HStack>
        </>
      }>
      <Outlet />
    </ProLayout>
  )
}

type TConnectionStatus = Readonly<{
  state?: "connected" | "disconnected"
  isLoading: boolean
  details?: string
}>
export function useConnectionStatus(): TConnectionStatus {
  const { host, client } = useProContext()
  const { data: connection, isLoading } = useQuery({
    queryKey: QueryKeys.connectionStatus(host),
    queryFn: async () => {
      const res = await client.checkHealth()
      let state: TConnectionStatus["state"] = "disconnected"
      if (res.err) {
        return { state }
      }

      if (res.val.healthy) {
        state = "connected"
      }

      return { state }
    },
    refetchInterval: 5_000,
  })

  return { ...connection, isLoading }
}
