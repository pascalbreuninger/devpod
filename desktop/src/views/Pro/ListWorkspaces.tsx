import { ProWorkspaceInstance, useProContext, useWorkspaces } from "@/contexts"
import { DevPodIcon } from "@/icons"
import emptyWorkspacesImage from "@/images/empty_workspaces.svg"
import { getDisplayName } from "@/lib"
import { Routes } from "@/routes"
import {
  Button,
  Container,
  HStack,
  Heading,
  Image,
  List,
  ListItem,
  Table,
  Tbody,
  Td,
  Tr,
  VStack,
} from "@chakra-ui/react"
import { getProjectNamespace } from "@loft-enterprise/client"
import { useMemo } from "react"
import { useNavigate } from "react-router"
import { WorkspaceInstanceCard } from "./WorkspaceInstanceCard"

export function ListWorkspaces() {
  const instances = useWorkspaces<ProWorkspaceInstance>()
  const { host, currentProject, managementSelf, isLoading } = useProContext()
  const navigate = useNavigate()

  const handleCreateClicked = () => {
    navigate(Routes.toProWorkspaceCreate(host))
  }

  const projectInstances = useMemo(() => {
    const currentProjectNs = getProjectNamespace(
      currentProject.metadata!.name!,
      managementSelf.status?.projectNamespacePrefix
    )

    return instances.reduce(
      (acc, instance) => {
        if (instance.metadata?.namespace !== currentProjectNs) {
          return acc
        }

        const owner = instance.spec?.owner
        if (
          (owner?.user && owner.user === managementSelf.status?.user?.name) ||
          (owner?.team && owner.team === managementSelf.status?.team?.name)
        ) {
          acc.currentUser.push(instance)

          return acc
        }

        acc.others.push(instance)

        return acc
      },
      { currentUser: [] as ProWorkspaceInstance[], others: [] as ProWorkspaceInstance[] }
    )
  }, [currentProject, instances, managementSelf])

  const hasWorkspaces =
    projectInstances.currentUser.length > 0 && projectInstances.others.length > 0

  return (
    <VStack align="start" gap="4" w="full" h="full">
      {hasWorkspaces && (
        <>
          <HStack align="center" justify="space-between" mb="8" w="full">
            <Heading fontWeight="thin">Workspaces</Heading>
            <Button
              variant="outline"
              colorScheme="primary"
              leftIcon={<DevPodIcon boxSize={5} />}
              onClick={handleCreateClicked}>
              Create Workspace
            </Button>
          </HStack>
          <Heading size="lg" fontWeight="thin">
            My Workspaces
          </Heading>
          <List w="full" mb="4">
            {projectInstances.currentUser.map((instance) => (
              <ListItem key={instance.id}>
                <WorkspaceInstanceCard host={host} instanceName={instance.id} />
              </ListItem>
            ))}
          </List>

          <Heading size="lg" fontWeight="thin">
            Team Workspaces
          </Heading>
          <Table w="full" borderStyle="solid" borderWidth="thin" borderColor="gray.200">
            <Tbody>
              {projectInstances.others.map((instance) => (
                <Tr key={instance.id}>
                  <Td>{getDisplayName(instance)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}

      {!hasWorkspaces && !isLoading && (
        <Container maxW="container.lg" h="full">
          <VStack align="center" justify="center" w="full" h="full">
            <Heading fontWeight="thin" color="gray.600">
              Create a DevPod Workspace
            </Heading>
            <Image src={emptyWorkspacesImage} w="100%" h="40vh" my="12" />

            <Button
              variant="solid"
              colorScheme="primary"
              leftIcon={<DevPodIcon boxSize={5} />}
              onClick={handleCreateClicked}>
              Create Workspace
            </Button>
          </VStack>
        </Container>
      )}
    </VStack>
  )
}
