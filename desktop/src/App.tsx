import {
  Box,
  BoxProps,
  Code,
  Container,
  Flex,
  Grid,
  GridItem,
  GridProps,
  HStack,
  Link,
  Text,
  VStack,
  useColorModeValue,
  useToken,
} from "@chakra-ui/react"
import { ReactNode, useEffect, useMemo } from "react"
import { Outlet, Link as RouterLink, useMatch, useNavigate, useRouteError } from "react-router-dom"
import { useBorderColor } from "./Theme"
import {
  Notifications,
  ProSwitcher,
  Sidebar,
  SidebarMenuItem,
  StatusBar,
  Toolbar,
  ToolbarActions,
} from "./components"
import { SIDEBAR_WIDTH, STATUS_BAR_HEIGHT } from "./constants"
import { ToolbarProvider, useChangeSettings, useSettings } from "./contexts"
import { Briefcase, Cog, Stack3D } from "./icons"
import { isLinux, isMacOS, isWindows } from "./lib"
import { Routes } from "./routes"
import { useAppReady } from "./useAppReady"
import { useWelcomeModal } from "./useWelcomeModal"
import { usePreserveLocation } from "./usePreserveLocation"

const showTitleBar = isMacOS || isLinux || isWindows
const titleBarSafeArea: BoxProps["height"] = showTitleBar ? "12" : 0

export function App() {
  const routeMatchPro = useMatch(`${Routes.PRO}/*`)
  const { errorModal, changelogModal, proLoginModal } = useAppReady()
  usePreserveLocation()
  usePartyParrot()

  return routeMatchPro == null ? (
    <OSSApp changelogModal={changelogModal} errorModal={errorModal} proLoginModal={proLoginModal} />
  ) : (
    <ProApp changelogModal={changelogModal} errorModal={errorModal} />
  )
}

type TAppProps = Readonly<{
  errorModal: ReactNode
  changelogModal: ReactNode
}>

type TOSSAppProps = TAppProps &
  Readonly<{
    proLoginModal: ReactNode
  }>
function OSSApp({ changelogModal, proLoginModal, errorModal }: TOSSAppProps) {
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

type TProAppProps = TAppProps
function ProApp({ errorModal, changelogModal }: TProAppProps) {
  const contentBackgroundColor = useColorModeValue("white", "background.darkest")
  const toolbarHeight = useToken("sizes", "10")
  const borderColor = useBorderColor()
  // TODO: load company info
  // TODO: load projects
  // Pass host or provider to CLI

  return (
    <>
      <Flex width="100vw" maxWidth="100vw" overflow="hidden">
        <Box width="full" height="full">
          <ToolbarProvider>
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
          </ToolbarProvider>
        </Box>
      </Flex>

      {errorModal}
      {changelogModal}
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

export function ErrorPage() {
  const error = useRouteError()
  const contentBackgroundColor = useColorModeValue("white", "black")

  return (
    <Box height="100vh" width="100vw" backgroundColor={contentBackgroundColor}>
      <Container padding="16">
        <VStack>
          <Text>Whoops, something went wrong or this page doesn&apos;t exist.</Text>
          <Box paddingBottom="6">
            <Link as={RouterLink} to={Routes.ROOT}>
              Go back to home
            </Link>
          </Box>
          <Code>{JSON.stringify(error, null, 2)}</Code>{" "}
        </VStack>
      </Container>
    </Box>
  )
}

function usePartyParrot() {
  const { set: setSettings, settings } = useChangeSettings()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.shiftKey && event.ctrlKey && event.key.toLowerCase() === "p") {
        const current = settings.partyParrot
        setSettings("partyParrot", !current)
      }
    }
    document.addEventListener("keyup", handler)

    return () => document.addEventListener("keyup", handler)
  }, [setSettings, settings.partyParrot])
}
