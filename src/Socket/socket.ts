import { io } from 'socket.io-client'

export const socket = io('http://118.89.175.69:1240', { autoConnect: false })

// 心跳：连接期间每 5 秒 ping 一次，服务端 12 秒未收到会踢人
let pingTimer: ReturnType<typeof setInterval> | null = null
socket.on('connect', () => {
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = setInterval(() => socket.emit('ping'), 5000)
})
socket.on('disconnect', () => {
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = null
})
