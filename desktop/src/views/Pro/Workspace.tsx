import { WarningMessageBox, WorkspaceCardHeader, useStreamingTerminal } from "@/components"
import { ProWorkspaceInstance, useProContext, useWorkspace } from "@/contexts"
import { Annotations, Labels, Source } from "@/lib"
import { Routes } from "@/routes"
import {
  Box,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { BackToWorkspaces } from "./BackToWorkspaces"
import {
  TWorkspaceResult,
  useWorkspaceActions,
} from "@/contexts/DevPodContext/workspaces/useWorkspace"

const DETAILS_TABS = [
  { label: "Logs", component: Logs },
  // { label: "Files", component: <Box w="full" h="full" opacity={0.3} bg="yellow" /> },
  // { label: "Configuration", component: <Box w="full" h="full" opacity={0.3} bg="orange" /> },
  // { label: "History", component: <Box w="full" h="full" opacity={0.3} bg="green" /> },
]
export function Workspace() {
  const { host } = useProContext()
  const params = useParams()
  const navigate = useNavigate()
  const workspace = useWorkspace<ProWorkspaceInstance>(params.workspace)
  const instance = workspace.data
  const instanceName = instance?.metadata?.name
  const workspaceID = instance?.id

  if (!instance) {
    return (
      <VStack align="start" gap="4">
        <BackToWorkspaces />
        <WarningMessageBox
          warning={
            <Text>
              Instance <b>{params.workspace}</b> not found
            </Text>
          }
        />
      </VStack>
    )
  }

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"

  const handleOpenClicked = () => {
    if (!instanceName || !workspaceID) {
      return
    }

    workspace.start({ id: workspaceID })
    navigate(Routes.toProWorkspace(host, instanceName))
  }

  return (
    <VStack align="start" width="full" height="full">
      <VStack align="start" width="full">
        <Box>
          <BackToWorkspaces />
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
          <TabPanels>
            {DETAILS_TABS.map(({ label, component: Component }) => (
              <TabPanel w="full" padding="0" key={label}>
                {<Component workspace={workspace} instance={instance} />}
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </Box>
    </VStack>
  )
}

type TTabProps = Readonly<{
  workspace: TWorkspaceResult<ProWorkspaceInstance>
  instance: ProWorkspaceInstance
}>

function Logs({ workspace, instance }: TTabProps) {
  const { terminal, connectStream, clear: clearTerminal } = useStreamingTerminal()
  const actions = useWorkspaceActions(instance.id)
  const lastActionIDRef = useRef<string | null>(null)

  useEffect(() => {
    if (workspace.current) {
      clearTerminal()
      workspace.current.connect(connectStream)

      return
    }
  }, [clearTerminal, connectStream, workspace])

  useEffect(() => {
    if (workspace.current) {
      return
    }

    const actionID = actions?.find((action) => action.name === "start")?.id
    if (!actionID || actionID === lastActionIDRef.current) {
      return
    }

    lastActionIDRef.current = actionID
    clearTerminal()
    workspace.history.replay(actionID, connectStream)
  }, [actions, clearTerminal, connectStream, workspace])

  return <Box h="70vh">{terminal}</Box>
}
