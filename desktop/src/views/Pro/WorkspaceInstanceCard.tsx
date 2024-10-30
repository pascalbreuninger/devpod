import { ProWorkspaceInstance, useTemplates, useWorkspace } from "@/contexts"
import { CogOutlined, Status } from "@/icons"
import {
  TParameterWithValue,
  getDisplayName,
  getParametersWithValues,
  useDeleteWorkspaceModal,
  useRebuildWorkspaceModal,
  useResetWorkspaceModal,
  useStopWorkspaceModal,
} from "@/lib"
import { Routes } from "@/routes"
import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  HStack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react"
import { ManagementV1DevPodWorkspaceTemplate } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceTemplate"
import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router"
import { WorkspaceCardHeader } from "./WorkspaceCardHeader"
import { WorkspaceInfoDetail } from "./WorkspaceInfoDetail"

type TWorkspaceInstanceCardProps = Readonly<{
  host: string
  instanceName: string
}>

export function WorkspaceInstanceCard({ instanceName, host }: TWorkspaceInstanceCardProps) {
  const hoverColor = useColorModeValue("gray.50", "gray.800")
  const { data: templates } = useTemplates()
  const workspace = useWorkspace<ProWorkspaceInstance>(instanceName)
  const instance = workspace.data
  const instanceDisplayName = getDisplayName(instance)
  const navigate = useNavigate()

  const { modal: stopModal, open: openStopModal } = useStopWorkspaceModal(
    useCallback(() => workspace.stop(), [workspace])
  )

  const { modal: deleteModal, open: openDeleteModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    useCallback((force: boolean) => workspace.remove(force), [workspace])
  )

  const { modal: rebuildModal, open: openRebuildModal } = useRebuildWorkspaceModal(
    instanceDisplayName,
    useCallback(() => workspace.rebuild(), [workspace])
  )

  const { modal: resetModal, open: openResetModal } = useResetWorkspaceModal(
    instanceDisplayName,
    useCallback(() => workspace.reset(), [workspace])
  )

  const { parameters, template } = useMemo<{
    parameters: readonly TParameterWithValue[]
    template: ManagementV1DevPodWorkspaceTemplate | undefined
  }>(() => {
    // find template for workspace
    const currentTemplate = templates?.workspace.find(
      (template) => instance?.spec?.templateRef?.name === template.metadata?.name
    )
    const empty = { parameters: [], template: undefined }
    if (!currentTemplate || !instance) {
      return empty
    }

    const parameters = getParametersWithValues(instance, currentTemplate)
    if (!parameters) {
      return empty
    }

    return { parameters, template: currentTemplate }
  }, [instance, templates])

  if (!instance) {
    return null
  }

  const handleOpenClicked = (ideName: string) => {
    workspace.start({ id: instance.id, ideConfig: { name: ideName } })
    navigate(Routes.toProWorkspace(host, instance.id))
  }

  const templateRef = instance.spec?.templateRef
  const isRunning = instance.status?.lastWorkspaceStatus === "Running" // TODO: Types

  return (
    <>
      <Card
        direction="column"
        width="full"
        variant="outline"
        marginBottom="3"
        paddingLeft="2"
        _hover={{ bgColor: hoverColor, cursor: "pointer" }}
        boxShadow="0px 2px 4px 0px rgba(0, 0, 0, 0.07)"
        onClick={() => navigate(Routes.toProWorkspace(host, instance.id))}>
        <CardHeader overflow="hidden" w="full">
          <WorkspaceCardHeader instance={instance}>
            <WorkspaceCardHeader.Controls
              onOpenClicked={handleOpenClicked}
              onDeleteClicked={openDeleteModal}
              onRebuildClicked={openRebuildModal}
              onResetClicked={openResetModal}
              onStopClicked={!isRunning ? openStopModal : workspace.stop}
            />
          </WorkspaceCardHeader>
        </CardHeader>
        <CardBody pt="0">
          <HStack gap="6">
            <WorkspaceInfoDetail icon={Status} label={<Text>Status</Text>}>
              <Text>{instance.status?.phase!}</Text>
            </WorkspaceInfoDetail>

            <WorkspaceInfoDetail icon={Status} label={<Text>Template</Text>}>
              <Text>
                {getDisplayName(template, templateRef?.name)}
                {templateRef?.version ? `/${templateRef.version}` : ""}
              </Text>
            </WorkspaceInfoDetail>

            {parameters.length > 0 && (
              <>
                <Divider orientation="vertical" mx="2" h="12" borderColor="gray.400" />

                {parameters.map((param) => (
                  <WorkspaceInfoDetail
                    key={param.variable}
                    icon={CogOutlined}
                    label={<Text>{param.label ?? param.variable ?? ""}</Text>}>
                    <Text>{param.value ?? param.defaultValue ?? ""}</Text>
                  </WorkspaceInfoDetail>
                ))}
              </>
            )}
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
