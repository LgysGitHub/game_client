import { useEffect, useState } from 'react'

import { socket } from '../Socket/socket'
import { PlayerInfo } from '../types/player'

// 服务端权威状态：连接、地图种子与玩家快照
export const useNetwork = () => {
  const [connected, setConnected] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [seed, setSeed] = useState<number | null>(null)
  const [mapHash, setMapHash] = useState<number | null>(null)

  useEffect(() => {
    const onConnect = () => {
      setLinkError(false)
      setConnected(true)
    }
    const onDisconnect = () => setConnected(false)
    const onMapSeed = (value: number | { seed: number; hash: number }) => {
      const nextSeed = typeof value === 'number' ? value : value?.seed
      const nextHash = typeof value === 'number' ? null : value?.hash
      if (Number.isInteger(nextSeed) && nextSeed > 0) {
        setSeed(nextSeed)
        setMapHash(typeof nextHash === 'number' && Number.isInteger(nextHash) ? nextHash : null)
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', () => setLinkError(true))
    socket.on('map:seed', onMapSeed)

    // 服务端权威快照：玩家列表/位置全部以快照为准
    const onState = (list: PlayerInfo[]) => {
      if (Array.isArray(list)) setPlayers(list)
    }
    socket.on('players:state', onState)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error')
      socket.off('map:seed', onMapSeed)
      socket.off('players:state', onState)
    }
  }, [])

  const resetNetwork = () => {
    setPlayers([])
    setSeed(null)
    setMapHash(null)
    setLinkError(false)
  }

  return { connected, linkError, setLinkError, players, setPlayers, seed, mapHash, resetNetwork }
}
