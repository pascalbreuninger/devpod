import {
  Box,
  Flex,
  Grid,
  GridItem,
  GridProps,
  HStack,
  Text,
  useColorModeValue,
  useToken,
} from "@chakra-ui/react"
import { useEffect, useMemo } from "react"
import { Outlet, useMatch, useNavigate } from "react-router-dom"
import { useBorderColor } from "../Theme"
import {
  Notifications,
  ProSwitcher,
  Sidebar,
  SidebarMenuItem,
  StatusBar,
  Toolbar,
} from "../components"
import { SIDEBAR_WIDTH, STATUS_BAR_HEIGHT } from "../constants"
import { ToolbarProvider, useSettings } from "../contexts"
import { Briefcase, Cog, Stack3D } from "../icons"
import { isLinux, isMacOS } from "../lib"
import { Routes } from "../routes"
import { useWelcomeModal } from "../useWelcomeModal"
import { showTitleBar, titleBarSafeArea } from "./constants"
import { useAppReady } from "./useAppReady"

export function OSSApp() {
  const { errorModal, changelogModal, proLoginModal } = useAppReady()
  const navigate = useNavigate()
  const rootRouteMatch = useMatch(Routes.ROOT)
  const { sidebarPosition } = useSettings()
  const contentBackgroundColor = useColorModeValue("white", "background.darkest")
  const toolbarHeight = useToken("sizes", showTitleBar ? "28" : "20")
  const borderColor = useBorderColor()
  const showTitle = isMacOS || isLinux

  const mainGridProps = useMemo<GridProps>(() => {
    if (sidebarPosition === "right") {
      return { templateAreas: `"main sidebar"`, gridTemplateColumns: `1fr ${SIDEBAR_WIDTH}` }
    }

    return { templateAreas: `"sidebar main"`, gridTemplateColumns: `${SIDEBAR_WIDTH} 1fr` }
  }, [sidebarPosition])

  useEffect(() => {
    if (rootRouteMatch !== null) {
      navigate(Routes.WORKSPACES)
    }
  }, [navigate, rootRouteMatch])

  const { modal: welcomeModal } = useWelcomeModal()

  return (
    <>
      <Flex width="100vw" maxWidth="100vw" overflow="hidden">
        {showTitleBar && <TitleBar showTitle={showTitle} />}

        <Box width="full" height="full">
          <Grid height="full" {...mainGridProps}>
            <GridItem area="sidebar">
              <Sidebar paddingTop={titleBarSafeArea}>
                <SidebarMenuItem to={Routes.WORKSPACES} icon={<Briefcase />}>
                  Workspaces
                </SidebarMenuItem>
                <SidebarMenuItem to={Routes.PROVIDERS} icon={<Stack3D />}>
                  Providers
                </SidebarMenuItem>
                <SidebarMenuItem to={Routes.SETTINGS} icon={<Cog />}>
                  Settings
                </SidebarMenuItem>
              </Sidebar>
            </GridItem>

            <GridItem area="main" height="100vh" width="full" overflowX="auto">
              <ToolbarProvider>
                <Box
                  data-tauri-drag-region // keep!
                  backgroundColor={contentBackgroundColor}
                  position="relative"
                  width="full"
                  height="full"
                  overflowY="auto">
                  <Toolbar
                    paddingTop={titleBarSafeArea}
                    backgroundColor={contentBackgroundColor}
                    height={toolbarHeight}
                    position="sticky"
                    zIndex={1}
                    width="full">
                    <Grid
                      alignContent="center"
                      templateRows="1fr"
                      templateColumns="minmax(auto, 18rem) 3fr fit-content(15rem)"
                      width="full"
                      paddingX="4">
                      <GridItem display="flex" alignItems="center">
                        <Toolbar.Title />
                      </GridItem>
                      <GridItem
                        marginLeft={2}
                        display="flex"
                        alignItems="center"
                        justifyContent="start"
                        columnGap={4}>
                        <Toolbar.Actions />
                      </GridItem>
                      <GridItem display="flex" alignItems="center" justifyContent="center">
                        <Notifications />
                        <ProSwitcher />
                      </GridItem>
                    </Grid>
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
                    width={`calc(100% - ${SIDEBAR_WIDTH})`}
                    borderTopWidth="thin"
                    borderTopColor={borderColor}
                    backgroundColor={contentBackgroundColor}>
                    <HStack>
                      <StatusBar.Version />
                    </HStack>

                    <HStack>
                      <StatusBar.ZoomMenu />
                      <StatusBar.GitHubStar />
                      <StatusBar.OSSDocs />
                      <StatusBar.OSSReportIssue />
                      <StatusBar.DebugMenu />
                    </HStack>
                  </StatusBar>
                </Box>
              </ToolbarProvider>
            </GridItem>
          </Grid>
        </Box>
      </Flex>

      {welcomeModal}
      {errorModal}
      {changelogModal}
      {proLoginModal}
    </>
  )
}

type TTitleBarProps = Readonly<{
  showTitle?: boolean
}>
function TitleBar({ showTitle = true }: TTitleBarProps) {
  return (
    <Box
      data-tauri-drag-region // keep!
      height={titleBarSafeArea}
      position="fixed"
      top="0"
      width="full"
      textAlign="center"
      zIndex="modal"
      justifyItems="center">
      {showTitle && (
        <Text
          data-tauri-drag-region // keep!
          fontWeight="bold"
          marginTop="2">
          DevPod
        </Text>
      )}
    </Box>
  )
}
