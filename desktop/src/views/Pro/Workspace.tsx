import { WorkspaceCardHeader } from "@/components"
import { ProWorkspaceInstance, useProContext, useSettings, useWorkspace } from "@/contexts"
import { Annotations, Labels } from "@/lib"
import { useIDEs } from "@/useIDEs"
import {
  Box,
  HStack,
  Link,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useEffect } from "react"
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom"
import { Source } from "./WorkspaceInstanceCard"
import { Routes } from "@/routes"

const DETAILS_TABS = [
  { label: "Logs", component: <Box w="full" h="full" opacity={0.3} bg="blue" /> },
  { label: "Files", component: <Box w="full" h="full" opacity={0.3} bg="yellow" /> },
  { label: "Configuration", component: <Box w="full" h="full" opacity={0.3} bg="orange" /> },
  { label: "History", component: <Box w="full" h="full" opacity={0.3} bg="green" /> },
]
export function Workspace() {
  const { host } = useProContext()
  const params = useParams()
  const navigate = useNavigate()
  const workspace = useWorkspace<ProWorkspaceInstance>(params.workspace)
  const instance = workspace.data
  const instanceName = instance?.metadata?.name
  const workspaceID = instance?.id

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
