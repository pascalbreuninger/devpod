import { Box, Code, Container, Link, Text, VStack, useColorModeValue } from "@chakra-ui/react"
import { useEffect, useMemo } from "react"
import { Link as RouterLink, useMatch, useRouteError } from "react-router-dom"
import {
  DevPodProvider,
  WorkspaceStore,
  WorkspaceStoreProvider,
  useChangeSettings,
} from "../contexts"
import { Routes } from "../routes"
import { OSSApp } from "./OSSApp"
import { ProApp } from "./ProApp"
import { usePreserveLocation } from "./usePreserveLocation"

export function App() {
  const routeMatchPro = useMatch(`${Routes.PRO}/*`)
  usePreserveLocation()
  usePartyParrot()

  const store = useMemo(() => {
    if (routeMatchPro == null) {
      return new WorkspaceStore()
    }
  }, [routeMatchPro])

  return routeMatchPro == null ? (
    <WorkspaceStoreProvider store={store!}>
      <DevPodProvider>
        <OSSApp />
      </DevPodProvider>
    </WorkspaceStoreProvider>
  ) : (
    <ProApp />
  )
}

export function ErrorPage() {
  const error = useRouteError()
  const contentBackgroundColor = useColorModeValue("white", "black")

  return (
    <Box height="100vh" width="100vw" backgroundColor={contentBackgroundColor}>
      <Container padding="16">
        <VStack>
          <Text>Whoops, something went wrong or this page doesn&apos;t exist.</Text>
          <Box paddingBottom="6">
            <Link as={RouterLink} to={Routes.ROOT}>
              Go back to home
            </Link>
          </Box>
          <Code>{JSON.stringify(error, null, 2)}</Code>{" "}
        </VStack>
      </Container>
    </Box>
  )
}

function usePartyParrot() {
  const { set: setSettings, settings } = useChangeSettings()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.shiftKey && event.ctrlKey && event.key.toLowerCase() === "p") {
        const current = settings.partyParrot
        setSettings("partyParrot", !current)
      }
    }
    document.addEventListener("keyup", handler)

    return () => document.addEventListener("keyup", handler)
  }, [setSettings, settings.partyParrot])
}
