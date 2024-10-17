import {
  Box,
  Text,
  Flex,
  HStack,
  IconButton,
  Link,
  useColorModeValue,
  useToken,
} from "@chakra-ui/react"
import { Outlet, Link as RouterLink } from "react-router-dom"
import { useBorderColor } from "../Theme"
import { Notifications, StatusBar, Toolbar } from "../components"
import { STATUS_BAR_HEIGHT } from "../constants"
import {
  ProInstancesProvider,
  ProProvider,
  ProWorkspaceStore,
  ToolbarProvider,
  WorkspaceStoreProvider,
  useProContext,
  useProHost,
} from "../contexts"
import { BellDuotone, CogDuotone } from "../icons"
import { Routes } from "../routes"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { QueryKeys } from "@/queryKeys"

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
  const contentBackgroundColor = useColorModeValue("white", "background.darkest")
  const toolbarHeight = useToken("sizes", "10")
  const borderColor = useBorderColor()
  const iconColor = useColorModeValue("primary.600", "primary.400")
  const connectionStatus = useConnectionStatus()

  return (
    <Flex width="100vw" maxWidth="100vw" overflow="hidden">
      <Box width="full" height="full">
        <Box
          data-tauri-drag-region // keep!
          backgroundColor={contentBackgroundColor}
          position="relative"
          width="full"
          height="full"
          overflowY="auto">
          <Toolbar
            backgroundColor={contentBackgroundColor}
            height={toolbarHeight}
            position="sticky"
            width="full">
            <HStack
              justifyContent="space-between"
              paddingLeft="24" // TODO: Check on other platforms
              data-tauri-drag-region // keep!
            >
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
                <Notifications icon={<BellDuotone color={iconColor} />} />
              </HStack>
            </HStack>
          </Toolbar>
          <Box
            as="main"
            paddingTop="8"
            paddingBottom={STATUS_BAR_HEIGHT}
            paddingX="8"
            width="full"
            height={`calc(100vh - ${toolbarHeight})`}
            overflowY="auto">
            <Outlet />
          </Box>
          <StatusBar
            height={STATUS_BAR_HEIGHT}
            position="fixed"
            bottom="0"
            width="full"
            borderTopWidth="thin"
            borderTopColor={borderColor}
            backgroundColor={contentBackgroundColor}>
            <HStack />
            <HStack>
              <StatusBar.Version />
              <StatusBar.DebugMenu />
              <HStack gap="1">
                <Box
                  boxSize="2"
                  bg={connectionStatus?.state === "connected" ? "green.400" : "red.400"}
                  rounded="full"
                />
                <Text color="gray.600" textTransform="capitalize">
                  {connectionStatus?.state}
                </Text>
              </HStack>
            </HStack>
          </StatusBar>
        </Box>
      </Box>
    </Flex>
  )
}

type TConnectionStatus = Readonly<{
  state: "connected" | "disconnected"
  details?: string
}>
export function useConnectionStatus(): TConnectionStatus | undefined {
  const { host, client } = useProContext()
  const { data: connection } = useQuery({
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

  return connection
}
