import { ProWorkspaceInstance, TActionID, useSettings, useWorkspace } from "@/contexts"
import {
  Annotations,
  Source,
  getDisplayName,
  useDeleteWorkspaceModal,
  useResetWorkspaceModal,
  useStopWorkspaceModal,
} from "@/lib"
import { Routes } from "@/routes"
import { useIDEs } from "@/useIDEs"
import { Box, Card, CardBody, CardHeader, HStack, Heading, Text, VStack } from "@chakra-ui/react"
import { ReactNode, useCallback, useState } from "react"
import { useNavigate } from "react-router"

type TWorkspaceInstanceCardProps = Readonly<{
  host: string
  instanceName: string
}>

export function WorkspaceInstanceCard({ instanceName, host }: TWorkspaceInstanceCardProps) {
  const workspace = useWorkspace<ProWorkspaceInstance>(instanceName)
  const instance = workspace.data
  const instanceDisplayName = getDisplayName(instance)
  const workspaceID = instance?.id
  const settings = useSettings()
  const navigate = useNavigate()
  const { ides, defaultIDE } = useIDEs()

  const handleStopClicked = useCallback(() => {
    workspace.stop()
  }, [workspace])
  const handleDeleteClicked = useCallback(
    (force: boolean) => {
      workspace.remove(force)
    },
    [workspace]
  )
  const handleResetClicked = useCallback(() => {
    workspace.reset()
  }, [workspace])
  const handleRebuildClicked = useCallback(() => {
    workspace.rebuild()
  }, [workspace])

  const { modal: stopModal, open: openStopModal } = useStopWorkspaceModal(handleStopClicked)
  const { modal: deleteModal, open: openDeleteModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    handleDeleteClicked
  )
  const { modal: rebuildModal, open: openRebuildModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    handleRebuildClicked
  )
  const { modal: resetModal, open: openResetModal } = useResetWorkspaceModal(
    instanceDisplayName,
    handleResetClicked
  )

  const [ideName, setIdeName] = useState<string | undefined>(() => {
    if (settings.fixedIDE && defaultIDE?.name) {
      return defaultIDE.name
    }

    // TODO: How to handle?
    // return workspace.data?.ide?.name ?? undefined
    return undefined
  })

  const navigateToAction = useCallback(
    (actionID: TActionID | undefined) => {
      if (actionID !== undefined && actionID !== "") {
        navigate(Routes.toAction(actionID))
      }
    },
    [navigate]
  )
  const handleOpenClicked = () => {
    if (!instanceName || !workspaceID) {
      return
    }

    workspace.start({ id: workspaceID, ideConfig: { name: ideName ?? ideName ?? null } })
    navigate(Routes.toProWorkspace(host, instanceName))
  }

  if (!instance) {
    return null
  }

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"
  const source = Source.fromRaw(
    instance.metadata?.annotations?.[Annotations.WorkspaceSource]
  ).toWorkspaceSource()

  return (
    <>
      <Card direction="column" width="full" variant="outline" marginBottom="3" paddingLeft="2">
        <CardHeader
          overflow="hidden"
          w="full"
          cursor="pointer"
          onClick={() => {
            navigate(Routes.toProWorkspace(host, instance.id))
          }}>
          <ProWorkspaceCardHeader
            id={workspaceID!}
            source={<Text>{source?.gitRepository}</Text>}
            controls={null}
          />
        </CardHeader>
        <CardBody>
          <HStack justifyContent="space-between">
            <Box width="full">
              <Text>{instance.status?.phase!}</Text>
            </Box>
            <HStack justifyContent="end" width="full" gap="4">
              <Text>{instance.spec?.templateRef?.name ?? ""}</Text>
              <Text>{instance.spec?.runnerRef?.runner ?? ""}</Text>
              <Text>{instance.metadata?.annotations?.[Annotations.SleepModeLastActivity]}</Text>
            </HStack>
          </HStack>
        </CardBody>
      </Card>

      {resetModal}
      {rebuildModal}
      {deleteModal}
      {stopModal}
    </>
  )
}

type TWorkspaceCardHeaderProps = Readonly<{
  id: string
  controls?: ReactNode
  children?: ReactNode
  source?: ReactNode
}>
function ProWorkspaceCardHeader({ id, controls, source, children }: TWorkspaceCardHeaderProps) {
  return (
    <>
      <VStack align="start" spacing={0}>
        <HStack w="full">
          <Heading size="md">
            <HStack alignItems="baseline" justifyContent="space-between">
              <Text
                as="label"
                fontWeight="bold"
                maxWidth="23rem"
                overflow="hidden"
                whiteSpace="nowrap"
                textOverflow="ellipsis">
                {id}
              </Text>
            </HStack>
          </Heading>
          <Box marginLeft="auto">{controls}</Box>
        </HStack>
        {source}
      </VStack>

      <HStack rowGap={2} marginTop={4} flexWrap="wrap" alignItems="center" paddingLeft="8">
        {children}
      </HStack>
    </>
  )
}
