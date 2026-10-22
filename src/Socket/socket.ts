import { io } from 'socket.io-client'

const SOCKET_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:1240'
  : 'http://118.89.175.69:1240'

export const socket = io(SOCKET_URL, { autoConnect: false })

let heartbeat: ReturnType<typeof setInterval> | null = null

const stopHeartbeat = () => {
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
}

socket.on('connect', () => {
  stopHeartbeat()
  socket.emit('ping')
  heartbeat = setInterval(() => socket.emit('ping'), 4000)
})

socket.on('disconnect', stopHeartbeat)
