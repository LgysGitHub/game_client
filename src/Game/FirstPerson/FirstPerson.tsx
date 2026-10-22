import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'

import { Cave, canStand } from '../../World/Cave'
import { selfPos } from '../../World/selfPos'
import { socket } from '../../Socket/socket'
import { EYE_OFFSET, EYE_Y, LOCK_COOLDOWN } from '../constants'

export const FirstPerson: React.FC<{ start: number[]; cave: Cave }> = ({ start, cave }) => {
  const { camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const keys = useRef<Record<string, boolean>>({})
  const velY = useRef(0)
  const lastEmit = useRef(0)
  const exitedAt = useRef(0)

  useEffect(() => {
    camera.position.set(start[0], start[1], start[2])
    camera.rotation.order = 'YXZ'
    selfPos.x = start[0]
    selfPos.z = start[2]
    selfPos.yaw = 0

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

    // 分轴碰撞：撞墙时沿另一轴滑动，不会穿墙
    const step = 5 * d
    const nx = camera.position.x + dir.x * f * step + right.x * r * step
    if (canStand(cave, nx, camera.position.z)) camera.position.x = nx
    const nz = camera.position.z + dir.z * f * step + right.z * r * step
    if (canStand(cave, camera.position.x, nz)) camera.position.z = nz

    if (k.Space && camera.position.y <= EYE_Y + 0.001) velY.current = 7
    velY.current -= 20 * d
    camera.position.y = Math.max(EYE_Y, camera.position.y + velY.current * d)
    if (camera.position.y <= EYE_Y) velY.current = 0

    selfPos.x = camera.position.x
    selfPos.z = camera.position.z
    selfPos.yaw = camera.rotation.y

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
