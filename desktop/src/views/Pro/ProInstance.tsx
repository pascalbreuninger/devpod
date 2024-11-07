import { Button, Container, Heading, Image, Link, VStack, Text } from "@chakra-ui/react"
import { Outlet, Link as RouterLink } from "react-router-dom"
import { useProHost, useProInstances } from "@/contexts"
import { Routes } from "@/routes"
import { useAppReady } from "@/App/useAppReady"
import { WarningMessageBox } from "@/components"
import { useMemo } from "react"
import emptyWorkspacesImage from "@/images/empty_workspaces.svg"
import { DevPodIcon } from "@/icons"
import { useReLoginProModal } from "@/lib"

export function ProInstance() {
  const host = useProHost()
  const { errorModal, changelogModal, proLoginModal } = useAppReady()
  const [[proInstances]] = useProInstances()
  const proInstance = useMemo(() => {
    return proInstances?.find((proInstance) => proInstance.host === host)
  }, [host, proInstances])
  const { modal: reLoginProModal, handleOpenLogin: handleReLoginClicked } = useReLoginProModal()

  if (host == undefined || host.length === 0) {
    return (
      <WarningMessageBox
        warning={
          <>
            Pro Instance not found
            <br />
            <Link as={RouterLink} to={Routes.ROOT}>
              Go back
            </Link>
          </>
        }
      />
    )
  }

  if (proInstance?.authenticated === false) {
    return (
      <Container maxW="container.lg" h="full">
        <VStack align="center" justify="center" w="full" h="full">
          <Heading fontWeight="thin" color="gray.600">
            You&apos;ve been logged out
          </Heading>
          <Text>{host}</Text>
          <Image src={emptyWorkspacesImage} w="100%" h="40vh" my="12" />

          <Button
            variant="solid"
            colorScheme="primary"
            leftIcon={<DevPodIcon boxSize={5} />}
            onClick={() => handleReLoginClicked({ host })}>
            Log In
          </Button>
        </VStack>
        {reLoginProModal}
      </Container>
    )
  }

  return (
    <>
      <Outlet />

      {errorModal}
      {changelogModal}
      {proLoginModal}
    </>
  )
}
