import { ProWorkspaceInstance, useProContext, useWorkspaces } from "@/contexts"
import { Heading, Link, List, ListItem } from "@chakra-ui/react"
import { Link as RouterLink } from "react-router-dom"
import { WorkspaceInstanceCard } from "./WorkspaceInstanceCard"

export function ListWorkspaces() {
  const workspaces = useWorkspaces<ProWorkspaceInstance>()
  const { host } = useProContext()

  return (
    <div>
      <Heading>Workspaces</Heading>
      <Link as={RouterLink} to="/">
        Home
      </Link>
      <List>
        {workspaces.map((w) => (
          <ListItem key={w.metadata!.name}>
            <WorkspaceInstanceCard host={host} instanceName={w.metadata!.name!} />
          </ListItem>
        ))}
      </List>
    </div>
  )
}
