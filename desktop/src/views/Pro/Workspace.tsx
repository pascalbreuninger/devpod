import { WarningMessageBox, useStreamingTerminal } from "@/components"
import { ProWorkspaceInstance, useProContext, useWorkspace } from "@/contexts"
import {
  TWorkspaceResult,
  useWorkspaceActions,
} from "@/contexts/DevPodContext/workspaces/useWorkspace"
import { Clock, Folder, Git, Globe, Image, Status } from "@/icons"
import {
  Annotations,
  Source,
  getDisplayName,
  getLastActivity,
  useDeleteWorkspaceModal,
  useRebuildWorkspaceModal,
  useResetWorkspaceModal,
  useStopWorkspaceModal,
} from "@/lib"
import { Routes } from "@/routes"
import {
  Box,
  ComponentWithAs,
  HStack,
  IconProps,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import dayjs from "dayjs"
import { ReactElement, cloneElement, useCallback, useEffect, useMemo, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { BackToWorkspaces } from "./BackToWorkspaces"
import { useProjectClusters } from "./CreateWorkspace/useRunners"
import { useTemplates } from "./CreateWorkspace/useTemplates"
import { WorkspaceCardHeader } from "./WorkspaceCardHeader"

const DETAILS_TABS = [
  { label: "Logs", component: Logs },
  // { label: "Files", component: <Box w="full" h="full" opacity={0.3} bg="yellow" /> },
  // { label: "Configuration", component: <Box w="full" h="full" opacity={0.3} bg="orange" /> },
  // { label: "History", component: <Box w="full" h="full" opacity={0.3} bg="green" /> },
]
export function Workspace() {
  const { data: templates } = useTemplates()
  const { data: projectClusters } = useProjectClusters()
  const { host } = useProContext()
  const params = useParams()
  const navigate = useNavigate()
  const workspace = useWorkspace<ProWorkspaceInstance>(params.workspace)
  const instance = workspace.data
  const instanceDisplayName = getDisplayName(instance)

  const { modal: stopModal, open: openStopModal } = useStopWorkspaceModal(
    useCallback(() => workspace.stop(), [workspace])
  )
  const { modal: deleteModal, open: openDeleteModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    useCallback(
      (force: boolean) => {
        workspace.remove(force)
        navigate(Routes.toProInstance(host))
      },
      [workspace, host, navigate]
    )
  )
  const { modal: rebuildModal, open: openRebuildModal } = useRebuildWorkspaceModal(
    instanceDisplayName,
    useCallback(() => workspace.rebuild(), [workspace])
  )
  const { modal: resetModal, open: openResetModal } = useResetWorkspaceModal(
    instanceDisplayName,
    useCallback(() => workspace.reset(), [workspace])
  )
  const template = useMemo(
    () =>
      templates?.workspace.find(
        (template) => template.metadata?.name === instance?.spec?.templateRef?.name
      ),
    [instance, templates]
  )
  const runner = useMemo(
    () =>
      projectClusters?.runners.find(
        (runner) => runner.metadata?.name === instance?.spec?.runnerRef?.runner
      ),
    [projectClusters, instance]
  )

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

  const isRunning = instance.status?.lastWorkspaceStatus == "Running"

  const handleOpenClicked = (ideName: string) => {
    workspace.start({ id: instance.id, ideConfig: { name: ideName } })
    navigate(Routes.toProWorkspace(host, instance.id))
  }

  const sourceInfo = getSourceInfo(
    Source.fromRaw(instance.metadata?.annotations?.[Annotations.WorkspaceSource])
  )

  const lastActivity = getLastActivity(instance)

  return (
    <>
      <VStack align="start" width="full" height="full">
        <BackToWorkspaces />
        <VStack align="start" width="full" py="4">
          <Box w="full">
            <WorkspaceCardHeader instance={instance} showSource={false}>
              <WorkspaceCardHeader.Controls
                onOpenClicked={handleOpenClicked}
                onDeleteClicked={openDeleteModal}
                onRebuildClicked={openRebuildModal}
                onResetClicked={openResetModal}
                onStopClicked={!isRunning ? openStopModal : workspace.stop}
              />
            </WorkspaceCardHeader>
          </Box>

          <HStack mt="4" gap="8">
            <WorkspaceInfoDetail
              icon={Status}
              label={<Text>{instance.status?.lastWorkspaceStatus ?? ""}</Text>}
            />
            <WorkspaceInfoDetail icon={Status} label={<Text>ID/UID</Text>} />
            {sourceInfo && <WorkspaceInfoDetail icon={sourceInfo.icon} label={sourceInfo.label} />}
            <WorkspaceInfoDetail
              icon={Status}
              label={<Text>{getDisplayName(template, instance.spec?.templateRef?.name)}</Text>}
            />
            <WorkspaceInfoDetail icon={Globe} label={<Text>{getDisplayName(runner)}</Text>} />
            {lastActivity && (
              <WorkspaceInfoDetail
                icon={Clock}
                label={<Text>{dayjs(lastActivity).from(Date.now())}</Text>}
              />
            )}
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

      {stopModal}
      {rebuildModal}
      {resetModal}
      {deleteModal}
    </>
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

type TWorkspaceInfoDetailProps = Readonly<{
  icon: ComponentWithAs<"svg", IconProps>
  label: ReactElement
}>
function WorkspaceInfoDetail({ icon: Icon, label }: TWorkspaceInfoDetailProps) {
  const l = cloneElement(label, { color: "gray.600" })

  return (
    <HStack gap="1">
      <Icon boxSize="5" color="gray.500" />
      {l}
    </HStack>
  )
}

function getSourceInfo(
  source: Source | undefined
): Readonly<{ icon: ComponentWithAs<"svg", IconProps>; label: ReactElement }> | undefined {
  if (!source) {
    return undefined
  }

  switch (source.type) {
    case "git":
      return {
        icon: Git,
        label: <Text>{source.value}</Text>,
      }
    case "image":
      return {
        icon: Image,
        label: <Text>{source.value}</Text>,
      }
    case "local":
      return {
        icon: Folder,
        label: <Text>{source.value}</Text>,
      }
  }
}
