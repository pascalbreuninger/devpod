import { Link } from "@chakra-ui/react"
import { Outlet, Link as RouterLink } from "react-router-dom"
import { useProHost } from "@/contexts"
import { Routes } from "@/routes"
import { useAppReady } from "@/App/useAppReady"
import { WarningMessageBox } from "@/components"

export function ProInstance() {
  const host = useProHost()
  const { errorModal, changelogModal, proLoginModal } = useAppReady()

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

  return (
    <>
      <Outlet />

      {errorModal}
      {changelogModal}
      {proLoginModal}
    </>
  )
}
