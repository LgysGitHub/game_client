import { io } from 'socket.io-client'

const SOCKET_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:1240'
  : 'http://118.89.175.69:1240'

export const socket = io(SOCKET_URL, { autoConnect: false })
