import { ProWorkspaceInstance, useProContext, useWorkspaces } from "@/contexts"
import { DevPodIcon } from "@/icons"
import { Routes } from "@/routes"
import { Box, Button, HStack, Heading, List, ListItem } from "@chakra-ui/react"
import { useNavigate } from "react-router"
import { WorkspaceInstanceCard } from "./WorkspaceInstanceCard"

export function ListWorkspaces() {
  const workspaces = useWorkspaces<ProWorkspaceInstance>()
  const { host } = useProContext()
  const navigate = useNavigate()

  const handleCreateClicked = () => {
    navigate(Routes.toProWorkspaceCreate(host))
  }

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
        {workspaces.map((w) => (
          <ListItem key={w.metadata!.name}>
            <WorkspaceInstanceCard host={host} instanceName={w.metadata!.name!} />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
