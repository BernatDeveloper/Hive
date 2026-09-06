import { createContext } from 'react'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export const ConnectionContext = createContext<ConnectionStatus>('connecting')
