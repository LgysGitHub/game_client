import React, { useEffect, useRef, useState } from 'react'

import { roles } from './types/roles'
import { PlayerInfo } from './types/player'
import Message from './Message/Message'
import { World } from './World'
import { spawnForTeam, useCave } from './World/Cave'
import { Minimap } from './World/Minimap'
import { StartOptions, MenuPage } from './Menu'
import { socket } from './Socket/socket'

import { EYE_Y } from './Game/constants'
import { FirstPerson } from './Game/FirstPerson'
import { RemotePlayers } from './Game/RemotePlayers'
import { BootScreen } from './Game/BootScreen'
import { Scoreboard } from './Game/Scoreboard'
import { Inventory } from './Game/Inventory'
import { SystemMenu } from './Game/SystemMenu'
import { DeathScreen } from './Game/DeathScreen'
import { ErrorBoundary } from './Game/ErrorBoundary'
import { useNetwork } from './Game/useNetwork'
import { useGameControls } from './Game/useGameControls'

import styles from './App.module.css'
import mapStyles from './World/map.module.css'

const closePage = () => {
  window.close()
  setTimeout(() => { window.location.href = 'about:blank' }, 300)
}

const App: React.FC = () => {
  const [phase, setPhase] = useState<'menu' | 'boot' | 'game'>('menu')
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [menu, setMenu] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [scoreboard, setScoreboard] = useState(false)
  const [respawnId, setRespawnId] = useState(0)
  const [respawnIn, setRespawnIn] = useState(0)
  const [mapOpen, setMapOpen] = useState(false)
  const [seedInput, setSeedInput] = useState('')
  const [seedError, setSeedError] = useState('')

  const {
    connected,
    linkError,
    players,
    seed,
    mapHash,
    resetNetwork
  } = useNetwork()

  const { cave, loading: caveLoading, mismatch: caveMismatch } = useCave(seed, mapHash)

  const phaseRef = useRef<'menu' | 'boot' | 'game'>(phase)
  const menuRef = useRef(menu)
  const playerRef = useRef<PlayerInfo | null>(player)
  const respawnFnRef = useRef<() => void>(() => {})
  const startOpts = useRef<StartOptions>({})
  const respawnTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const joinedRef = useRef(false)
  const lastMapSeed = useRef<number | null>(null)
  phaseRef.current = phase
  menuRef.current = menu
  playerRef.current = player
  ;(window as any).__dead = respawnIn > 0

  // 启动进度条：先跑到 90%，等待连接建立角色后再到 100%
  useEffect(() => {
    if (phase !== 'boot') return
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p < 90) return Math.min(90, p + Math.random() * 9 + 3)
        if (playerRef.current) return Math.min(100, p + 10)
        return p
      })
    }, 90)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === 'boot' && progress >= 100) setPhase('game')
  }, [progress, phase])

  // 加入：等洞穴生成完成后，用本队出生点建立角色
  useEffect(() => {
    if (phase !== 'boot' || !cave || !connected || player || joinedRef.current) return
    const opts = startOpts.current
    const role = opts.role || roles[Math.floor(Math.random() * roles.length)]
    const sp = spawnForTeam(cave, opts.team)
    const newPlayer: PlayerInfo = {
      id: socket.id as string,
      name: opts.name,
      team: opts.team,
      role,
      position: [sp.x, EYE_Y, sp.z],
      rotation: 0
    }
    joinedRef.current = true
    setPlayer(newPlayer)
    socket.emit('player joined', { name: newPlayer.name, team: newPlayer.team, roleId: role.id, position: newPlayer.position })
  }, [phase, cave, connected, player])

  // 地图切换：种子变化 -> 洞穴重建 -> 玩家回到本队新出生点
  useEffect(() => {
    if (phase !== 'game' || !cave || !player) return
    if (lastMapSeed.current === null) {
      lastMapSeed.current = cave.seed
      return
    }
    if (lastMapSeed.current === cave.seed) return
    lastMapSeed.current = cave.seed
    const sp = spawnForTeam(cave, player.team)
    const position = [sp.x, EYE_Y, sp.z]
    setPlayer({ ...player, position })
    setRespawnId((x) => x + 1)
    socket.emit('player respawn', { roleId: player.role.id, position })
  }, [phase, cave, player])

  useEffect(() => {
    if (menu || panelOpen || respawnIn > 0) setMapOpen(false)
  }, [menu, panelOpen, respawnIn])

  const startGame = (opts: StartOptions = {}) => {
    const w = window as any
    cancelLock()
    w.__panelOpen = false
    w.__dead = false
    startOpts.current = opts
    joinedRef.current = false
    lastMapSeed.current = null
    setPlayer(null)
    resetNetwork()
    setMapOpen(false)
    setSeedInput('')
    setSeedError('')
    setProgress(0)
    setMenu(false)
    setPanelOpen(false)
    setScoreboard(false)
    setRespawnIn(0)
    setPhase('boot')
    socket.connect()
  }

  const logout = () => {
    const w = window as any
    if (respawnTimer.current) clearInterval(respawnTimer.current)
    cancelLock()
    w.__panelOpen = false
    w.__dead = false
    setRespawnIn(0)
    setPanelOpen(false)
    socket.disconnect()
    if (document.pointerLockElement) document.exitPointerLock()
    setMenu(false)
    setPlayer(null)
    resetNetwork()
    joinedRef.current = false
    lastMapSeed.current = null
    setMapOpen(false)
    setProgress(0)
    setPhase('menu')
  }

  const requestLock = () => window.dispatchEvent(new Event('request-pointer-lock'))

  // 指针锁重试：ESC 冷却时长有波动，在 2.1s 内多次尝试，直到真正锁上；
  // token 保证菜单/聊天/背包打开后旧的重试批次全部作废
  const lockToken = useRef(0)
  const acquireLock = () => {
    const token = ++lockToken.current
    const tryLock = () => {
      if (token !== lockToken.current) return
      const w = window as any
      if (phaseRef.current !== 'game' || menuRef.current || w.__chatOpen || w.__panelOpen) return
      if (document.pointerLockElement) return
      requestLock()
    }
    ;[0, 300, 700, 1100, 1500, 2100].forEach((delay) => setTimeout(tryLock, delay))
  }
  const cancelLock = () => { lockToken.current++ }

  // CONTINUE：点击手势内首次锁定，其余重试兜底
  const resume = () => {
    setMenu(false)
    acquireLock()
  }

  // 关闭背包：立刻尝试锁定，冷却场景由后续重试兜底
  const closePanel = () => {
    const w = window as any
    if (!w.__panelOpen) return
    w.__panelOpen = false
    setPanelOpen(false)
    acquireLock()
  }

  // 重生：点击即"死亡"——立刻夺回指针（手势内可靠），3 秒内冻结一切操作
  const respawn = () => {
    setMenu(false)
    setRespawnIn(3)
    acquireLock()

    respawnTimer.current = setInterval(() => {
      setRespawnIn((n) => {
        if (n > 1) return n - 1
        if (respawnTimer.current) clearInterval(respawnTimer.current)
        // 倒计时结束：新角色 + 新出生点（距点击 3s，仍在浏览器手势激活窗口内）
        const opts = startOpts.current
        const role = roles[Math.floor(Math.random() * roles.length)]
        const sp = cave ? spawnForTeam(cave, opts.team) : { x: 0, z: 0 }
        const newPlayer: PlayerInfo = {
          id: socket.id as string,
          name: opts.name,
          team: opts.team,
          role,
          position: [sp.x, EYE_Y, sp.z],
          rotation: 0
        }
        setPlayer(newPlayer)
        setRespawnId((x) => x + 1)
        socket.emit('player respawn', { roleId: role.id, position: newPlayer.position })
        if (!document.pointerLockElement) requestLock()
        return 0
      })
    }, 1000)
  }

  const dead = respawnIn > 0
  respawnFnRef.current = respawn

  // 随机新地图 / 指定种子加载（服务端校验后广播，所有客户端同步重建）
  const newMap = () => {
    setSeedError('')
    socket.emit('map seed', Math.floor(Math.random() * 0x7fffffff) + 1)
  }
  const loadSeed = () => {
    const value = Number(seedInput.trim())
    if (!Number.isInteger(value) || value < 1 || value > 0x7fffffff) {
      setSeedError('INVALID SEED (1 - 2147483647)')
      return
    }
    setSeedError('')
    socket.emit('map seed', value)
  }

  useGameControls({
    phaseRef,
    menuRef,
    startOpts,
    respawnFnRef,
    setMenu,
    setPanelOpen,
    setScoreboard,
    setMapOpen,
    setPlayer,
    acquireLock,
    cancelLock,
    closePanel
  })

  return (
    <>
      {phase === 'menu' && <MenuPage roles={roles} onStart={startGame} onQuit={closePage} />}

      {phase === 'boot' && (
        <BootScreen
          player={player}
          progress={progress}
          linkError={linkError}
          seed={seed}
          mapLoading={caveLoading}
        />
      )}

      {phase === 'game' && player && cave && (
        <ErrorBoundary>
          <World cave={cave}>
            <FirstPerson key={respawnId} start={player.position} cave={cave} />
            <RemotePlayers players={players} />
          </World>
        </ErrorBoundary>
      )}

      {phase === 'game' && seed !== null && (
        <div className={mapStyles.seedTag}>MAP SEED {seed}{caveLoading ? ' // SYNCING' : ''}</div>
      )}

      {phase === 'game' && caveMismatch && (
        <div className={mapStyles.loadingOverlay}>
          <div className={mapStyles.loadingBox}>
            &gt; CAVE MATRIX HASH MISMATCH // VERSION ANOMALY
            <div className={mapStyles.loadingSeed}>SEED {seed ?? '----'}</div>
          </div>
        </div>
      )}

      {phase === 'game' && caveLoading && (
        <div className={mapStyles.loadingOverlay}>
          <div className={mapStyles.loadingBox}>
            &gt; GENERATING CAVE MATRIX
            <div className={mapStyles.loadingSeed}>SEED {seed ?? '----'}</div>
            <div className={mapStyles.loadingBar}><div className={mapStyles.loadingFill} /></div>
          </div>
        </div>
      )}

      {phase === 'game' && mapOpen && cave && !menu && !panelOpen && !dead && (
        <Minimap cave={cave} players={players} selfId={socket.id as string} selfTeam={player?.team} />
      )}

      {phase === 'game' && <Message></Message>}

      {phase === 'game' && !menu && !panelOpen && !dead && (
        <div className={styles.hint}>[CLICK] ENGAGE · WASD MOVE · SPACE JUMP · ENTER CHAT (/help) · TAB PLAYERS · I CHARACTER · M MAP · ESC MENU</div>
      )}

      {phase === 'game' && scoreboard && !panelOpen && !menu && !dead && (
        <Scoreboard players={players} selfId={socket.id as string} />
      )}

      {phase === 'game' && panelOpen && player && (
        <Inventory player={player} onClose={closePanel} />
      )}

      {dead && <DeathScreen count={respawnIn} />}

      {menu && (
        <SystemMenu
          seed={seed}
          seedInput={seedInput}
          seedError={seedError}
          onSeedInput={setSeedInput}
          onResume={resume}
          onRespawn={respawn}
          onLogout={logout}
          onNewMap={newMap}
          onLoadSeed={loadSeed}
        />
      )}
    </>
  )
}

export default App
