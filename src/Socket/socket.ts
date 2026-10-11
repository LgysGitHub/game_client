import { io } from 'socket.io-client'

export const socket = io('http://localhost:3322', { autoConnect: false })
