import { CollapsibleSection, WarningMessageBox, useStreamingTerminal } from "@/components"
import {
  ProWorkspaceInstance,
  useProContext,
  useProjectClusters,
  useTemplates,
  useWorkspace,
} from "@/contexts"
import {
  TWorkspaceResult,
  useWorkspaceActions,
} from "@/contexts/DevPodContext/workspaces/useWorkspace"
import {
  CheckCircle,
  Clock,
  ExclamationCircle,
  ExclamationTriangle,
  Folder,
  Git,
  Globe,
  Image,
  Status,
} from "@/icons"
import {
  Annotations,
  Source,
  TProInstanceDetail,
  getActionDisplayName,
  getDisplayName,
  getLastActivity,
  useDeleteWorkspaceModal,
  useDownloadLogs,
  useRebuildWorkspaceModal,
  useResetWorkspaceModal,
  useStopWorkspaceModal,
} from "@/lib"
import { Routes } from "@/routes"
import { DownloadIcon } from "@chakra-ui/icons"
import {
  Box,
  ComponentWithAs,
  HStack,
  IconButton,
  IconProps,
  LinkBox,
  LinkOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react"
import { ManagementV1DevPodWorkspaceTemplate } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceTemplate"
import dayjs from "dayjs"
import {
  ComponentType,
  ReactElement,
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { BackToWorkspaces } from "./BackToWorkspaces"
import { UpdateWorkspace } from "./CreateWorkspace"
import { WorkspaceCardHeader } from "./WorkspaceCardHeader"
import { WorkspaceStatus } from "./WorkspaceStatus"

const DETAILS_TABS: Readonly<{
  key: TProInstanceDetail
  label: string
  component: ComponentType<TTabProps>
}>[] = [
  { key: "logs", label: "Logs", component: Logs },
  { key: "configuration", label: "Configuration", component: Configuration },
]
export function Workspace() {
  const params = useParams<{ workspace: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: templates } = useTemplates()
  const { data: projectClusters } = useProjectClusters()
  const { host } = useProContext()
  const navigate = useNavigate()
  const workspace = useWorkspace<ProWorkspaceInstance>(params.workspace)
  const instance = workspace.data
  const instanceDisplayName = getDisplayName(instance)
  const headerBackgroundColor = useColorModeValue("white", "black")
  const contentBackgroundColor = useColorModeValue("gray.50", "gray.800")

  const { modal: stopModal, open: openStopModal } = useStopWorkspaceModal(
    useCallback(
      (close) => {
        workspace.stop()
        close()
      },
      [workspace]
    )
  )
  const { modal: deleteModal, open: openDeleteModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    useCallback(
      (force, close) => {
        workspace.remove(force)
        close()
      },
      [workspace]
    )
  )
  const { modal: rebuildModal, open: openRebuildModal } = useRebuildWorkspaceModal(
    instanceDisplayName,
    useCallback(
      (close) => {
        workspace.rebuild()
        close()
      },
      [workspace]
    )
  )
  const { modal: resetModal, open: openResetModal } = useResetWorkspaceModal(
    instanceDisplayName,
    useCallback(
      (close) => {
        workspace.reset()
        close()
      },
      [workspace]
    )
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

  const tabIndex = useMemo(() => {
    const currentTab = Routes.getProWorkspaceDetailsParams(searchParams).tab

    const idx = DETAILS_TABS.findIndex((v) => v.key === currentTab)
    if (idx === -1) {
      return 0
    }

    return idx
  }, [searchParams])

  const handleTabIndexChanged = (newIndex: number) => {
    const key = DETAILS_TABS[newIndex]?.key
    if (!key) return
    setSearchParams((prev) => {
      prev.set("tab", key)

      return prev
    })
  }

  // navigate to pro instance view after successfully deleting the workspace
  useEffect(() => {
    if (workspace.current?.name === "remove" && workspace.current.status === "success") {
      navigate(Routes.toProInstance(host))
    }
  }, [host, navigate, workspace])

  if (!instance) {
    return (
      <VStack align="start" gap="4">
        <BackToWorkspaces />
        <WarningMessageBox
          warning={
            <>
              Instance <b>{params.workspace}</b> not found
            </>
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

          <HStack mt="4" gap="6" flexWrap="wrap">
            <WorkspaceInfoDetail label={<WorkspaceStatus status={instance.status} />} />
            <WorkspaceInfoDetail
              icon={Status}
              label={
                <HStack whiteSpace="nowrap" wordBreak={"keep-all"}>
                  <Text>ID: {instance.id}</Text>
                </HStack>
              }
            />
            {sourceInfo && <WorkspaceInfoDetail icon={sourceInfo.icon} label={sourceInfo.label} />}
            <WorkspaceInfoDetail icon={Status} label={formatTemplateDetail(instance, template)} />
            <WorkspaceInfoDetail icon={Globe} label={<Text>{getDisplayName(runner)}</Text>} />
            {lastActivity && (
              <WorkspaceInfoDetail
                icon={Clock}
                label={<Text>{dayjs(lastActivity).from(Date.now())}</Text>}
              />
            )}
          </HStack>
        </VStack>
        <Box height="full">
          <Tabs
            colorScheme="gray"
            isLazy
            w="full"
            h="full"
            index={tabIndex}
            onChange={handleTabIndexChanged}>
            <TabList ml="-8" px="8" mb="0" bgColor={headerBackgroundColor}>
              {DETAILS_TABS.map(({ key, label }) => (
                <Tab fontWeight="semibold" key={key}>
                  {label}
                </Tab>
              ))}
            </TabList>
            <TabPanels h="full">
              {DETAILS_TABS.map(({ label, component: Component }) => (
                <TabPanel
                  h="full"
                  width="100vw"
                  ml="-8"
                  px="8"
                  pt="8"
                  pb="0"
                  key={label}
                  bgColor={contentBackgroundColor}>
                  <Component
                    host={host}
                    workspace={workspace}
                    instance={instance}
                    template={template}
                  />
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
  host: string
  workspace: TWorkspaceResult<ProWorkspaceInstance>
  instance: ProWorkspaceInstance
  template: ManagementV1DevPodWorkspaceTemplate | undefined
}>

function Logs({ host, workspace, instance }: TTabProps) {
  const { terminal, connectStream, clear: clearTerminal } = useStreamingTerminal()
  const actions = useWorkspaceActions(instance.id)
  const lastActionIDRef = useRef<string | null>(null)
  const actionHoverColor = useColorModeValue("gray.100", "gray.800")
  const subheadingTextColor = useColorModeValue("gray.500", "gray.400")

  const location = useLocation()

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

    let actionID: string | undefined = undefined
    if (location.state?.actionID) {
      actionID = actions?.find((action) => action.id === location.state.actionID)?.id
    } else {
      actionID = actions?.[0]?.id
    }

    if (!actionID || actionID === lastActionIDRef.current) {
      return
    }

    lastActionIDRef.current = actionID
    clearTerminal()
    workspace.history.replay(actionID, connectStream)
  }, [actions, clearTerminal, connectStream, location, workspace])

  return (
    <VStack align="start" w="full">
      {actions && actions.length > 0 && (
        <CollapsibleSection title="All logs" showIcon>
          <VStack align="start" h="72" w="full" overflowY="auto">
            {actions.map((action) => {
              if (action.status === "pending") {
                return null
              }

              return (
                <LinkBox
                  key={action.id}
                  padding={2}
                  fontSize="sm"
                  borderRadius="md"
                  width="full"
                  display="flex"
                  flexFlow="row nowrap"
                  alignItems="center"
                  gap={3}
                  _hover={{ backgroundColor: actionHoverColor }}>
                  {action.status === "success" && <CheckCircle color="green.300" />}
                  {action.status === "error" && <ExclamationCircle color="red.300" />}
                  {action.status === "cancelled" && <ExclamationTriangle color="orange.300" />}

                  <VStack align="start" spacing="0">
                    <Text fontWeight="bold">
                      <LinkOverlay
                        as={RouterLink}
                        to={Routes.toProWorkspaceDetail(host, instance.id, "logs")}
                        state={{ origin: location.pathname, actionID: action.id }}
                        textTransform="capitalize">
                        {getActionDisplayName(action)}
                      </LinkOverlay>
                    </Text>
                    {action.finishedAt !== undefined && (
                      <Text color={subheadingTextColor} marginTop="-1">
                        {dayjs(action.finishedAt).fromNow()}
                      </Text>
                    )}
                  </VStack>

                  <DownloadLogsButton actionID={action.id} />
                </LinkBox>
              )
            })}
          </VStack>
        </CollapsibleSection>
      )}

      <Box h="50vh" w="full" mb="8" mt="8">
        {terminal}
      </Box>
    </VStack>
  )
}

function Configuration({ instance, template }: TTabProps) {
  return <UpdateWorkspace instance={instance} template={template} />
}

type TWorkspaceInfoDetailProps = Readonly<{
  icon?: ComponentWithAs<"svg", IconProps>
  label: ReactElement
}>
function WorkspaceInfoDetail({ icon: Icon, label }: TWorkspaceInfoDetailProps) {
  const l = cloneElement(label, { color: "gray.600" })

  return (
    <HStack gap="1" whiteSpace="nowrap" userSelect="text" cursor="text">
      {Icon && <Icon boxSize="5" color="gray.500" />}
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

function formatTemplateDetail(
  instance: ProWorkspaceInstance,
  template: ManagementV1DevPodWorkspaceTemplate | undefined
): ReactElement {
  const templateName = instance.spec?.templateRef?.name
  const templateDisplayName = getDisplayName(template, templateName)
  let templateVersion = instance.spec?.templateRef?.version
  if (!templateVersion) {
    templateVersion = "latest"
  }

  return (
    <Text>
      {templateDisplayName}/{templateVersion}
    </Text>
  )
}

type TDownloadLogsButtonProps = Readonly<{ actionID: string }>
function DownloadLogsButton({ actionID }: TDownloadLogsButtonProps) {
  const { download, isDownloading } = useDownloadLogs()

  return (
    <Tooltip label="Save Logs">
      <IconButton
        ml="auto"
        mr="4"
        isLoading={isDownloading}
        title="Save Logs"
        variant="outline"
        aria-label="Save Logs"
        icon={<DownloadIcon />}
        onClick={() => download({ actionID })}
      />
    </Tooltip>
  )
}
