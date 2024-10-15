import { ProWorkspaceInstance, useProContext, useWorkspaces } from "@/contexts"
import { DevPodIcon } from "@/icons"
import { Routes } from "@/routes"
import { Box, Button, HStack, Heading, List, ListItem } from "@chakra-ui/react"
import { useNavigate } from "react-router"
import { WorkspaceInstanceCard } from "./WorkspaceInstanceCard"
import { getProjectNamespace } from "@loft-enterprise/client"
import { useMemo } from "react"

export function ListWorkspaces() {
  const instances = useWorkspaces<ProWorkspaceInstance>()
  const { host, currentProject, managementSelf } = useProContext()
  const navigate = useNavigate()

  const handleCreateClicked = () => {
    navigate(Routes.toProWorkspaceCreate(host))
  }

  const projectInstances = useMemo(() => {
    return instances.filter(
      (instance) =>
        instance.metadata?.namespace ===
        getProjectNamespace(
          currentProject.metadata!.name!,
          managementSelf.status?.projectNamespacePrefix
        )
    )
  }, [currentProject.metadata, instances, managementSelf.status?.projectNamespacePrefix])

  return (
    <Box>
      <HStack align="center" justify="space-between" mb="8">
        <Heading fontWeight="thin">Workspaces</Heading>
        <Button
          variant="outline"
          colorScheme="primary"
          leftIcon={<DevPodIcon boxSize={5} />}
          onClick={handleCreateClicked}>
          Create Workspace
        </Button>
      </HStack>
      <List>
        {projectInstances.map((instance) => (
          <ListItem key={instance.id}>
            <WorkspaceInstanceCard host={host} instanceName={instance.id} />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
