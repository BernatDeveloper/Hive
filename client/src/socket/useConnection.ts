import { useContext } from 'react'
import { ConnectionContext } from './connection-context'

export function useConnection() {
  return useContext(ConnectionContext)
}
