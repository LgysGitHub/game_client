import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { socket } from '../../Socket/socket'
import { PlayerInfo } from '../../types/player'
import { GROUND_Y, MODEL_LIFT } from '../constants'

// 远端玩家：以 players:state 为唯一数据源，差量同步到本地 Map
const INTERP_DELAY = 80 // ms，大于 1 个快照间隔(50ms)，保证永远有两拍可插
const EXTRAP_MAX = 120 // ms，丢包时最多外推 120ms，超出则停在末帧
const TELEPORT_DIST = 5 // m，单拍位移超此值判定为重生/传送，直接吸附不插值

type Sample = { t: number; pos: THREE.Vector3; rot: number }
type RemoteEntry = {
  data: PlayerInfo
  object: THREE.Group
  url: string
  scale: number
  buf: Sample[]
  inited: boolean
  yaw: number
}

const tmpVec = new THREE.Vector3()
const tmpVel = new THREE.Vector3()
const modelCache = new Map<string, Promise<THREE.Object3D>>()

const loadModel = (url: string) => {
  let task = modelCache.get(url)
  if (!task) {
    task = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene)
    modelCache.set(url, task)
  }
  return task
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export const RemotePlayers: React.FC<{ players: PlayerInfo[] }> = ({ players }) => {
  const group = useRef<THREE.Group>(null)
  const entries = useRef(new Map<string, RemoteEntry>())
  const alive = useRef(true)

  const attachModel = (id: string, url: string, scale: number) => {
    loadModel(url).then((scene) => {
      const e = entries.current.get(id)
      if (!alive.current || !e || e.url !== url) return
      const model = cloneSkeleton(scene)
      const s = Number.isFinite(scale) && scale > 0 ? scale : 1
      model.scale.setScalar(s)
      e.object.add(model)
    }).catch((err) => console.error('[model load error]', url, err))
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      entries.current.forEach((e) => e.object.removeFromParent())
      entries.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = entries.current
    const root = group.current
    if (!root) return

    const list = players.filter((p) => p.id !== socket.id)
    const ids = list.map((p) => p.id)

    // 服务端没有、本地有的：销毁并移除
    const present = new Set(ids)
    const removed: string[] = []
    map.forEach((e, id) => {
      if (present.has(id)) return
      e.object.removeFromParent()
      map.delete(id)
      removed.push(id)
    })

    // 服务端有、本地没有的新建；两边都有则更新数据与快照缓冲
    const added: string[] = []
    for (const p of list) {
      let e = map.get(p.id)
      if (!e) {
        const object = new THREE.Group()
        const pos = new THREE.Vector3(p.position[0], p.position[1] + MODEL_LIFT, p.position[2])
        object.position.copy(pos)
        object.rotation.y = p.rotation
        root.add(object)
        e = {
          data: p,
          object,
          url: p.role.modelUrl,
          scale: p.role.scale,
          buf: [{ t: performance.now(), pos, rot: p.rotation }],
          inited: true,
          yaw: p.rotation
        }
        map.set(p.id, e)
        attachModel(p.id, e.url, e.scale)
        added.push(p.id)
        continue
      }

      e.data = p
      if (p.role.modelUrl !== e.url || p.role.scale !== e.scale) {
        e.url = p.role.modelUrl
        e.scale = p.role.scale
        e.object.clear()
        e.buf.length = 0
        e.inited = false
        attachModel(p.id, e.url, e.scale)
      }

      const pos = new THREE.Vector3(p.position[0], p.position[1] + MODEL_LIFT, p.position[2])
      const last = e.buf[e.buf.length - 1]
      if (last && last.pos.distanceTo(pos) <= 0 && last.rot === p.rotation) continue
      // 重生/瞬移：清空缓冲直接吸附，避免插值飞越地图
      if (last && last.pos.distanceTo(pos) > TELEPORT_DIST) {
        e.buf.length = 0
        e.inited = false
      }
      e.buf.push({ t: performance.now(), pos, rot: p.rotation })
      while (e.buf.length > 10) e.buf.shift()
    }

    if (added.length) console.log('[players:state] add:', added)
    if (removed.length) console.log('[players:state] remove:', removed)
  }, [players])

  useFrame(() => {
    entries.current.forEach((e) => {
      const g = e.object
      const b = e.buf
      if (b.length === 0) return

      if (!e.inited) {
        const s = b[b.length - 1]
        g.position.copy(s.pos)
        e.yaw = s.rot
        g.rotation.y = s.rot
        e.inited = true
        return
      }

      const renderT = performance.now() - INTERP_DELAY
      const o = tmpVec
      let outRot = e.yaw

      // 找 renderT 两侧的快照 a <= renderT <= c
      let i = b.length - 1
      while (i > 0 && b[i - 1].t > renderT) i--

      if (i < b.length - 1) {
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
            tmpVel.copy(latest.pos).sub(prev.pos).divideScalar(dt),
            gap / 1000
          )
        } else {
          o.copy(latest.pos)
        }
        outRot = latest.rot
      }

      o.y = Math.max(o.y, GROUND_Y + MODEL_LIFT)
      g.position.copy(o)
      e.yaw = outRot
      g.rotation.y = outRot
    })
  })

  return <group ref={group} />
}
