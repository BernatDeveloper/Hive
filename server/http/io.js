import { Server } from 'socket.io'
import { corsOrigin } from '../config/cors.js'

export function createIo(httpServer) {
  return new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  })
}
