import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'

import { roles, Role } from './types/roles'
import { Model } from './Scene'
import Message from './Message/Message'
import { World } from './World'
import MenuPage, { StartOptions } from './Menu/MenuPage'
import { socket } from './Socket/socket'

import styles from './App.module.css'

type PlayerInfo = { id: string; name?: string; team?: string; role: Role; position: number[]; rotation: number }

const GROUND_Y = -1
const EYE_OFFSET = 1.6
const EYE_Y = GROUND_Y + EYE_OFFSET
const MODEL_LIFT = 0.02
const BOUND = 25
const LOCK_COOLDOWN = 1300

const spawn = (): number[] => [Math.random() * 8 - 4, EYE_Y + 5, Math.random() * 8 - 4]

// 第一人称控制器
const FirstPerson: React.FC<{ start: number[] }> = ({ start }) => {
  const { camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const keys = useRef<Record<string, boolean>>({})
  const velY = useRef(0)
  const lastEmit = useRef(0)
  const exitedAt = useRef(0)

  useEffect(() => {
    camera.position.set(start[0], start[1], start[2])
    camera.rotation.order = 'YXZ'

    const down = (e: KeyboardEvent) => {
      if ((window as any).__chatOpen || (window as any).__panelOpen || (window as any).__dead) return
      keys.current[e.code] = true
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }

    // 记录解锁时间，冷却期内拦截 canvas 点击；ESC 解锁即终止所有当前按键
    const onLockChange = () => {
      if (!document.pointerLockElement) {
        exitedAt.current = performance.now()
        keys.current = {}
        velY.current = 0
      }
    }
    const guardClick = (e: Event) => {
      if (e.target === gl.domElement && performance.now() - exitedAt.current < LOCK_COOLDOWN) {
        e.stopPropagation()
      }
    }
    const requestLock = () => {
      // canvas 已卸载（如 LOG OUT 后遗留的锁定请求）直接忽略
      if (!document.contains(gl.domElement)) return
      try { controlsRef.current?.lock() } catch {}
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('click', guardClick, true)
    window.addEventListener('request-pointer-lock', requestLock)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('click', guardClick, true)
      window.removeEventListener('request-pointer-lock', requestLock)
    }
  }, [])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    const k = keys.current

    // 死亡 / 背包打开：完全冻结（不移动、不转视角、不上报），并清空按键避免残留
    if ((window as any).__dead || (window as any).__panelOpen) {
      keys.current = {}
      return
    }

    // 方向键转视角（与鼠标 PointerLockControls 共用 YXZ 欧拉角）
    const LOOK_SPEED = 1.8
    const yaw = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0)
    const pitch = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0)
    camera.rotation.y -= yaw * LOOK_SPEED * d
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x + pitch * LOOK_SPEED * d,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01
    )

    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()

    camera.position.addScaledVector(dir, f * 5 * d)
    camera.position.addScaledVector(right, r * 5 * d)

    if (k.Space && camera.position.y <= EYE_Y + 0.001) velY.current = 7
    velY.current -= 20 * d
    camera.position.y = Math.max(EYE_Y, camera.position.y + velY.current * d)
    if (camera.position.y <= EYE_Y) velY.current = 0

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -BOUND, BOUND)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -BOUND, BOUND)

    const now = performance.now()
    if (now - lastEmit.current > 50) {
      lastEmit.current = now
      socket.emit('player move', {
        position: [camera.position.x, camera.position.y - EYE_OFFSET, camera.position.z],
        rotation: Math.atan2(dir.x, dir.z)
      })
    }
  })

  return <PointerLockControls ref={controlsRef} />
}

// 其他玩家：快照插值缓冲（entity interpolation）
// 固定延迟 80ms 播放，在两拍快照间插值；缓冲不足才短暂外推，从机制上消除橡皮筋/抖动
const INTERP_DELAY = 80 // ms，大于 1 个快照间隔(50ms)，保证永远有两拍可插
const EXTRAP_MAX = 120 // ms，丢包时最多外推 120ms，超出则停在末帧
const TELEPORT_DIST = 5 // m，单拍位移超此值判定为重生/传送，直接吸附不插值

type Sample = { t: number; pos: THREE.Vector3; rot: number }
const tmpVec = new THREE.Vector3()

const OtherPlayer: React.FC<{ player: PlayerInfo }> = ({ player }) => {
  const group = useRef<THREE.Group>(null)
  const buf = useRef<Sample[]>([])
  const out = useRef(new THREE.Vector3())
  const inited = useRef(false)
  const yaw = useRef(player.rotation)

  useEffect(() => {
    const p = new THREE.Vector3(
      player.position[0],
      player.position[1] + MODEL_LIFT,
      player.position[2]
    )
    const b = buf.current
    const last = b[b.length - 1]
    // 重生/瞬移：清空缓冲直接吸附，避免插值飞越地图
    if (last && last.pos.distanceTo(p) > TELEPORT_DIST) {
      b.length = 0
      inited.current = false
    }
    b.push({ t: performance.now(), pos: p, rot: player.rotation })
    while (b.length > 10) b.shift()
  }, [player.position, player.rotation])

  const lerpAngle = (a: number, b: number, t: number) => {
    let d = (b - a) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return a + d * t
  }

  useFrame(() => {
    const g = group.current
    const b = buf.current
    if (!g || b.length === 0) return

    if (!inited.current) {
      const s = b[b.length - 1]
      g.position.copy(s.pos)
      yaw.current = s.rot
      g.rotation.y = s.rot
      inited.current = true
      return
    }

    const renderT = performance.now() - INTERP_DELAY
    const o = out.current
    let outRot = yaw.current

    // 找 renderT 两侧的快照 a <= renderT <= b
    let i = b.length - 1
    while (i > 0 && b[i - 1].t > renderT) i--

    if (i < b.length - 1) {
      // 正常路径：两拍之间插值
      const a = b[i]
      const c = b[i + 1]
      const span = c.t - a.t || 1
      const alpha = THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1)
      o.lerpVectors(a.pos, c.pos, alpha)
      outRot = lerpAngle(a.rot, c.rot, alpha)
    } else {
      // 快照不足（突发丢包）：用最后两拍速度短暂外推
      const latest = b[b.length - 1]
      const gap = THREE.MathUtils.clamp(performance.now() - latest.t - INTERP_DELAY, 0, EXTRAP_MAX)
      if (b.length >= 2) {
        const prev = b[b.length - 2]
        const dt = (latest.t - prev.t) / 1000 || 0.05
        o.copy(latest.pos).addScaledVector(
          tmpVec.copy(latest.pos).sub(prev.pos).divideScalar(dt),
          gap / 1000
        )
      } else {
        o.copy(latest.pos)
      }
      outRot = latest.rot
    }

    o.y = Math.max(o.y, GROUND_Y + MODEL_LIFT)
    g.position.copy(o)
    yaw.current = outRot
    g.rotation.y = outRot
  })

  return (
    <group ref={group}>
      <Model url={player.role.modelUrl} />
    </group>
  )
}

// CRT 启动屏
const BootScreen: React.FC<{ player: PlayerInfo | null; progress: number; linkError: boolean }> = ({ player, progress, linkError }) => (
  <div className={`${styles.boot} ${styles.terminal}`}>
    <div className={styles.bootLine}>NEURAL LINK TERMINAL v2.0</div>
    <div className={styles.bootLine}>&gt; ESTABLISHING SECURE CONNECTION ...... {linkError ? 'FAILED' : player ? 'OK' : '...'}</div>
    <div className={styles.bootLine}>&gt; ASSIGNING IDENTITY ...... {player ? `${player.role.name} // ${player.id}` : 'PENDING'}</div>
    <div className={styles.bootLine}>&gt; LOADING WORLD MATRIX</div>
    <div className={styles.progress}>
      <div className={styles.progressFill} style={{ width: `${progress}%` }} />
    </div>
    <div className={styles.pct}>
      {linkError ? 'SERVER OFFLINE - RETRYING' : `${Math.floor(progress)}%`}
    </div>
  </div>
)

const closePage = () => {
  window.close()
  setTimeout(() => { window.location.href = 'about:blank' }, 300)
}

// 渲染层兜底：3D 场景任何异常都只显示终端提示，不白屏
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error('[render crash]', err) }
  render() {
    if (this.state.failed) {
      return (
        <div className={styles.overlay}>
          <div className={`${styles.terminal} ${styles.fatal}`}>
            &gt; RENDER FAILURE — WORLD OFFLINE<i className={styles.blockCursor} />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// 长按 Tab：玩家列表（只读，按队伍上下分区，预留击杀/死亡/助攻/分数）
const ScoreRow: React.FC<{ p: PlayerInfo; selfId: string }> = ({ p, selfId }) => (
  <tr className={p.id === selfId ? styles.selfRow : undefined}>
    <td>{p.name || p.id}{p.id === selfId ? ' (YOU)' : ''}</td>
    <td>{p.role.name}</td>
    <td>0</td><td>0</td><td>0</td><td>0</td>
  </tr>
)

const ScoreSection: React.FC<{ team: string; players: PlayerInfo[]; selfId: string }> = ({ team, players, selfId }) => (
  <div className={styles.scoreSection}>
    <div className={styles.scoreTeamHead}>
      <span className={team === 'BEAR' ? styles.teamBear : team === 'PMC' ? styles.teamPmc : styles.teamNone}>[{team}]</span>
      <span className={styles.scoreCount}>{players.length} NODES</span>
    </div>
    <table className={styles.scoreTable}>
      <thead>
        <tr>
          <th>NAME</th><th>ROLE</th><th>KILLS</th><th>DEATHS</th><th>ASSISTS</th><th>SCORE</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => <ScoreRow key={p.id} p={p} selfId={selfId} />)}
      </tbody>
    </table>
  </div>
)

const Scoreboard: React.FC<{ players: PlayerInfo[]; selfId: string }> = ({ players, selfId }) => {
  const teams = ['BEAR', 'PMC']
  const groups = teams.map((t) => ({ team: t, list: players.filter((p) => (p.team || '').toUpperCase() === t) }))
  const others = players.filter((p) => !teams.includes((p.team || '').toUpperCase()))
  if (others.length) groups.push({ team: '--', list: others })
  return (
    <div className={styles.scoreWrap}>
      <div className={`${styles.scoreboard} ${styles.terminal}`}>
        <div className={styles.scoreTitle}>// NETWORK NODES</div>
        {groups.filter((g) => g.list.length > 0).map((g) => (
          <ScoreSection key={g.team} team={g.team} players={g.list} selfId={selfId} />
        ))}
      </div>
    </div>
  )
}

// I 键：角色信息 / 预留背包
const Inventory: React.FC<{ player: PlayerInfo; onClose: () => void }> = ({ player, onClose }) => (
  <div className={styles.overlay}>
    <div className={`${styles.inventory} ${styles.terminal}`}>
      <button className={styles.invClose} onClick={onClose}>X</button>
      <div className={styles.menuTitle}>CHARACTER DATA</div>
      <div className={styles.invBody}>
        <div>ID ......... {player.id}</div>
        <div>NAME ....... {player.name || '--'}</div>
        <div>TEAM ....... {player.team || '--'}</div>
        <div>ROLE ....... {player.role.name}</div>
        <div>DESC ....... {player.role.description}</div>
      </div>
      <div className={styles.invSlotsTitle}>// INVENTORY (RESERVED)</div>
      <div className={styles.invSlots}>
        {[...Array(8)].map((_, i) => <div key={i} className={styles.slot} />)}
      </div>
    </div>
  </div>
)

const App: React.FC = () => {
  const [phase, setPhase] = useState<'menu' | 'boot' | 'game'>('menu')
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [progress, setProgress] = useState(0)
  const [linkError, setLinkError] = useState(false)
  const [menu, setMenu] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [scoreboard, setScoreboard] = useState(false)
  const [respawnId, setRespawnId] = useState(0)
  const [respawnIn, setRespawnIn] = useState(0)

  const playerRef = useRef<PlayerInfo | null>(null)
  const phaseRef = useRef(phase)
  const menuRef = useRef(menu)
  const respawnFnRef = useRef<() => void>(() => {})
  const startOpts = useRef<StartOptions>({})
  const respawnTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  playerRef.current = player
  phaseRef.current = phase
  menuRef.current = menu
  ;(window as any).__dead = respawnIn > 0

  useEffect(() => {
    const onConnect = () => {
      setLinkError(false)
      const opts = startOpts.current
      const role = opts.role || roles[Math.floor(Math.random() * roles.length)]
      const newPlayer: PlayerInfo = {
        id: socket.id as string,
        name: opts.name,
        team: opts.team,
        role,
        position: spawn(),
        rotation: 0
      }
      setPlayer(newPlayer)
      socket.emit('player joined', { name: newPlayer.name, team: newPlayer.team, role: newPlayer.role, position: newPlayer.position })
    }

    socket.on('connect', onConnect)
    socket.on('connect_error', () => setLinkError(true))

    // 服务端权威快照：玩家列表/位置全部以快照为准
    const onState = (list: PlayerInfo[]) => {
      if (Array.isArray(list)) setPlayers(list)
    }
    socket.on('players:state', onState)

    // Esc 解锁后的分流：聊天/背包/死亡都不弹菜单
    const onLockChange = () => {
      if (document.pointerLockElement) return
      if (phaseRef.current !== 'game') return
      const w = window as any
      if (w.__chatOpen || w.__panelOpen) return
      if (w.__dead) {
        // 死亡期间按 ESC：冷却窗口内持续重试夺回指针
        acquireLock()
        return
      }
      cancelLock()
      setMenu(true)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    // Tab：游戏阶段一律拦截浏览器焦点切换；仅按住 Tab 时显示玩家列表
    const tabDown = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      if (phaseRef.current !== 'game') return
      e.preventDefault()
      const w = window as any
      if (e.repeat || w.__chatOpen || w.__panelOpen || w.__dead || menuRef.current) return
      setScoreboard(true)
    }
    const tabUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setScoreboard(false)
    }
    // 窗口失焦（Alt+Tab / 切窗口）时 keyup 可能丢失，强制收起
    const onBlur = () => setScoreboard(false)

    // I：开关背包；背包内 / 菜单打开时 Esc 关闭并继续游戏
    const keyDown = (e: KeyboardEvent) => {
      const w = window as any
      if (phaseRef.current !== 'game' || w.__chatOpen || w.__dead) return
      if (e.code === 'KeyI' && !w.__panelOpen) {
        cancelLock()
        w.__panelOpen = true
        setPanelOpen(true)
        if (document.pointerLockElement) document.exitPointerLock()
      } else if (e.code === 'Escape') {
        if (w.__panelOpen) {
          closePanel()
        } else if (menuRef.current) {
          setMenu(false)
          acquireLock()
        }
      }
    }
    window.addEventListener('keydown', tabDown)
    window.addEventListener('keyup', tabUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', keyDown)

    // 聊天指令：/respawn 走重生流程（死亡/菜单中忽略）
    const onCmdRespawn = () => {
      const w = window as any
      if (phaseRef.current === 'game' && !w.__dead && !menuRef.current) {
        w.__chatOpen = false
        respawnFnRef.current()
      }
    }
    // 聊天指令：/name /role /team 即时同步本地玩家（权威数据仍以下一拍快照为准）
    const onCmdUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      if (detail.name !== undefined) startOpts.current.name = detail.name
      if (detail.team !== undefined) startOpts.current.team = detail.team
      setPlayer((prev) => (prev ? { ...prev, ...detail } : prev))
    }
    window.addEventListener('cmd:respawn', onCmdRespawn)
    window.addEventListener('cmd:update', onCmdUpdate as EventListener)

    // 全局兜底：捕获阶段拦截并阻止后续监听器（含 CRA 错误浮层），任何异常都不弹窗
    const onError = (e: ErrorEvent) => {
      if (/pointer lock/i.test(e.message)) {
        e.stopImmediatePropagation()
        e.preventDefault()
        return
      }
      console.error('[runtime error]', e.message)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const text = (reason && (reason.message || String(reason))) || ''
      if (/pointer lock|exited the lock/i.test(text)) {
        e.stopImmediatePropagation()
        e.preventDefault()
        return
      }
      console.error('[unhandled rejection]', reason)
    }
    window.addEventListener('error', onError, true)
    window.addEventListener('unhandledrejection', onRejection, true)

    // 清理监听器
    return () => {
      socket.off('connect', onConnect)
      socket.off('connect_error')
      socket.off('players:state', onState)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', tabDown)
      window.removeEventListener('keyup', tabUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('cmd:respawn', onCmdRespawn)
      window.removeEventListener('cmd:update', onCmdUpdate as EventListener)
      window.removeEventListener('error', onError, true)
      window.removeEventListener('unhandledrejection', onRejection, true)
    };
  }, []);

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

  const startGame = (opts: StartOptions = {}) => {
    const w = window as any
    cancelLock()
    w.__panelOpen = false
    w.__dead = false
    startOpts.current = opts
    setPlayer(null)
    playerRef.current = null
    setPlayers([])
    setProgress(0)
    setLinkError(false)
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
    setPlayers([])
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
        const newPlayer: PlayerInfo = {
          id: socket.id as string,
          name: opts.name,
          team: opts.team,
          role,
          position: spawn(),
          rotation: 0
        }
        setPlayer(newPlayer)
        setRespawnId((x) => x + 1)
        socket.emit('player respawn', { role, position: newPlayer.position })
        if (!document.pointerLockElement) requestLock()
        return 0
      })
    }, 1000)
  }

  const dead = respawnIn > 0
  respawnFnRef.current = respawn

  return (
    <>
      {phase === 'menu' && <MenuPage roles={roles} onStart={startGame} onQuit={closePage} />}

      {phase === 'boot' && <BootScreen player={player} progress={progress} linkError={linkError} />}

      {phase === 'game' && player && (
        <ErrorBoundary>
          <World>
            <FirstPerson key={respawnId} start={player.position} />
            {
              players.filter((p) => p.id !== socket.id).map((p) => {
                return <OtherPlayer key={p.id} player={p} />
              })
            }
          </World>
        </ErrorBoundary>
      )}

      {phase === 'game' && <Message></Message>}

      {phase === 'game' && !menu && !panelOpen && !dead && (
        <div className={styles.hint}>[CLICK] ENGAGE · WASD MOVE · SPACE JUMP · ENTER CHAT (/help) · TAB PLAYERS · I CHARACTER · ESC MENU</div>
      )}

      {phase === 'game' && scoreboard && !panelOpen && !menu && !dead && (
        <Scoreboard players={players} selfId={socket.id as string} />
      )}

      {phase === 'game' && panelOpen && player && (
        <Inventory player={player} onClose={closePanel} />
      )}

      {dead && (
        <div className={styles.overlay}>
          <div className={`${styles.terminal} ${styles.respawnBox}`}>
            <div>CONSTRUCT TERMINATED</div>
            <div className={styles.respawnSub}>REBUILDING...</div>
            <div className={styles.respawnCount}>{respawnIn}</div>
          </div>
        </div>
      )}

      {menu && (
        <div className={styles.overlay}>
          <div className={`${styles.menu} ${styles.terminal}`}>
            <div className={styles.menuTitle}>SYSTEM MENU</div>
            <button className={styles.btn} onClick={resume}>[ CONTINUE ]</button>
            <button className={styles.btn} onClick={respawn}>[ RESPAWN ]</button>
            <button className={styles.btn} onClick={logout}>[ LOG OUT ]</button>
          </div>
        </div>
      )}
    </>
  )
}

export default App
