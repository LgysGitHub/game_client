import { useEffect, useRef } from 'react'
import { Cave } from './cave'
import { selfPos } from './selfPos'
import styles from './map.module.css'

type MapPlayer = { id: string; team?: string; position: number[] }

const teamColor = (team?: string) => (team === 'BEAR' ? '#00ff41' : team === 'PMC' ? '#00ff99' : '#7fffd4')
const VIEW_HALF_ANGLE = Math.PI / 3
const VIEW_RANGE = 35

// M 键 2D 小地图：洞穴底图预渲染一次，每帧只叠玩家/自己
export function Minimap({ cave, players, selfId, selfTeam }: { cave: Cave; players: MapPlayer[]; selfId: string; selfTeam?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const playersRef = useRef(players)
  playersRef.current = players
  const teamRef = useRef(selfTeam)
  teamRef.current = selfTeam

  useEffect(() => {
    const base = document.createElement('canvas')
    base.width = cave.size
    base.height = cave.size
    const ctx = base.getContext('2d')
    if (!ctx) return

    const img = ctx.createImageData(cave.size, cave.size)
    const data = img.data
    for (let i = 0; i < cave.grid.length; i++) {
      const o = i * 4
      if (cave.grid[i] === 1) {
        data[o] = 8; data[o + 1] = 18; data[o + 2] = 13
      } else {
        data[o] = 0; data[o + 1] = 82; data[o + 2] = 44
      }
      data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)

    cave.spawns.forEach((s, idx) => {
      const gx = s.x / cave.cellSize + cave.size / 2
      const gz = s.z / cave.cellSize + cave.size / 2
      ctx.fillStyle = idx === 0 ? '#00ff41' : idx === 1 ? '#00ff99' : '#7fffd4'
      ctx.fillRect(Math.floor(gx) - 2, Math.floor(gz) - 2, 5, 5)
    })

    baseRef.current = base
  }, [cave])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const toPx = (v: number) => ((v / cave.cellSize + cave.size / 2) / cave.size) * canvas.width

    const draw = () => {
      const base = baseRef.current
      if (base) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
      }

      const fx = -Math.sin(selfPos.yaw)
      const fz = -Math.cos(selfPos.yaw)
      const cosLimit = Math.cos(VIEW_HALF_ANGLE)
      const selfTeamNow = teamRef.current

      for (const p of playersRef.current) {
        if (p.id === selfId) continue
        const allied = !!selfTeamNow && p.team === selfTeamNow
        if (!allied) {
          const dx = p.position[0] - selfPos.x
          const dz = p.position[2] - selfPos.z
          const len = Math.hypot(dx, dz)
          if (len < 1e-3 || len > VIEW_RANGE || (dx * fx + dz * fz) / len < cosLimit) continue
        }
        ctx.fillStyle = allied ? teamColor(p.team) : '#ff2b2b'
        ctx.beginPath()
        ctx.arc(toPx(p.position[0]), toPx(p.position[2]), 4, 0, Math.PI * 2)
        ctx.fill()
      }

      const px = toPx(selfPos.x)
      const pz = toPx(selfPos.z)
      const rx = -fz
      const rz = fx
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(px + fx * 11, pz + fz * 11)
      ctx.lineTo(px - fx * 5 - rx * 6, pz - fz * 5 - rz * 6)
      ctx.lineTo(px - fx * 5 + rx * 6, pz - fz * 5 + rz * 6)
      ctx.closePath()
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [cave, selfId])

  return (
    <div className={styles.mapWrap}>
      <div className={styles.mapHead}>
        <span>// SECTOR MAP</span>
        <span className={styles.mapSeed}>SEED {cave.seed}</span>
      </div>
      <canvas ref={canvasRef} width={512} height={512} className={styles.mapCanvas} />
      <div className={styles.mapLegend}>
        <span style={{ color: '#00ff41' }}>■ TEAM</span>
        <span style={{ color: '#ff2b2b' }}>■ HOSTILE</span>
        <span>▲ YOU</span>
      </div>
      <div className={styles.mapHint}>[M] CLOSE</div>
    </div>
  )
}
