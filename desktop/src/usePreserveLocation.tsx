import { useEffect } from "react"
import { Location, useLocation } from "react-router"
import { LocalStorageBackend, Store } from "./lib"
import { client } from "./client"

const LOCATION_KEY = "location"
const CURRENT_LOCATION_KEY = "current"
type TLocationStore = { [CURRENT_LOCATION_KEY]: string }
const store = new Store<TLocationStore>(new LocalStorageBackend<TLocationStore>(LOCATION_KEY))

export function usePreserveLocation() {
  const location = useLocation()

  useEffect(() => {
    try {
      store.set(CURRENT_LOCATION_KEY, JSON.stringify(location))
    } catch (err) {
      client.log("error", `Failed to serialize location: ${err}`)
    }
  }, [location])
}

export async function loadLastLocation(): Promise<Location<unknown> | null> {
  const maybeLocation = await store.get(CURRENT_LOCATION_KEY)
  if (!maybeLocation) {
    return null
  }

  try {
    return JSON.parse(maybeLocation) as Location<unknown>
  } catch (err) {
    client.log("error", `Failed to deserialize location: ${err}`)

    return null
  }
}
