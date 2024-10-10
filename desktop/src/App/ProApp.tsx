import { Box, Flex, HStack, Link, useColorModeValue, useToken } from "@chakra-ui/react"
import { Outlet, Link as RouterLink } from "react-router-dom"
import { useBorderColor } from "../Theme"
import { Notifications, StatusBar, Toolbar } from "../components"
import { STATUS_BAR_HEIGHT } from "../constants"
import {
  ProInstancesProvider,
  ProWorkspaceStore,
  ToolbarProvider,
  WorkspaceStoreProvider,
} from "../contexts"
import { Cog } from "../icons"
import { ProProvider, Routes, useProHost } from "../routes"
import { useMemo } from "react"

export function ProApp() {
  const host = useProHost()
  if (!host) {
    throw new Error("No host found. This shouldn't happen")
  }

  const store = useMemo(() => new ProWorkspaceStore(host), [host])
  const contentBackgroundColor = useColorModeValue("white", "background.darkest")
  const toolbarHeight = useToken("sizes", "10")
  const borderColor = useBorderColor()

  return (
    <WorkspaceStoreProvider store={store}>
      <ProInstancesProvider>
        <ToolbarProvider>
          <ProProvider host={host}>
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
                      <HStack>
                        <Link as={RouterLink} to={Routes.SETTINGS}>
                          {/* TODO: Pro settings! */}
                          <Cog />
                        </Link>
                        <Notifications />
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
                    </HStack>
                  </StatusBar>
                </Box>
              </Box>
            </Flex>
          </ProProvider>
        </ToolbarProvider>
      </ProInstancesProvider>
    </WorkspaceStoreProvider>
  )
}
