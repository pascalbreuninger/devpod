import { useEffect } from "react"
import { Location, useLocation } from "react-router"
import { client } from "../client"
import { LocalStorageBackend, Store } from "../lib"

const LOCATION_KEY = "location"
const CURRENT_LOCATION_KEY = "current"
type TLocationStore = { [CURRENT_LOCATION_KEY]: Location }
const store = new Store<TLocationStore>(new LocalStorageBackend<TLocationStore>(LOCATION_KEY))

export function usePreserveLocation() {
  const location = useLocation()

  useEffect(() => {
    try {
      store.set(CURRENT_LOCATION_KEY, location)
    } catch (err) {
      client.log("error", `Failed to serialize location: ${err}`)
    }
  }, [location])
}
