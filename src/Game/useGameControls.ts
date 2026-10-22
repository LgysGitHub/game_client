import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react'

import { StartOptions } from '../Menu/MenuPage'
import { PlayerInfo } from '../types/player'

type Args = {
  phaseRef: MutableRefObject<'menu' | 'boot' | 'game'>
  menuRef: MutableRefObject<boolean>
  startOpts: MutableRefObject<StartOptions>
  respawnFnRef: MutableRefObject<() => void>
  setMenu: Dispatch<SetStateAction<boolean>>
  setPanelOpen: Dispatch<SetStateAction<boolean>>
  setScoreboard: Dispatch<SetStateAction<boolean>>
  setMapOpen: Dispatch<SetStateAction<boolean>>
  setPlayer: Dispatch<SetStateAction<PlayerInfo | null>>
  acquireLock: () => void
  cancelLock: () => void
  closePanel: () => void
}

// 指针锁分流、全局快捷键、聊天指令与全局异常兜底
export const useGameControls = ({
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
}: Args) => {
  useEffect(() => {
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

    // I：开关背包；M：开关 2D 小地图；背包内 / 菜单打开时 Esc 关闭并继续游戏
    const keyDown = (e: KeyboardEvent) => {
      const w = window as any
      if (phaseRef.current !== 'game' || w.__chatOpen || w.__dead) return
      if (e.code === 'KeyI' && !w.__panelOpen) {
        cancelLock()
        w.__panelOpen = true
        setPanelOpen(true)
        if (document.pointerLockElement) document.exitPointerLock()
      } else if (e.code === 'KeyM') {
        if (e.repeat || w.__panelOpen || menuRef.current) return
        setMapOpen((v) => !v)
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

    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', tabDown)
      window.removeEventListener('keyup', tabUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('cmd:respawn', onCmdRespawn)
      window.removeEventListener('cmd:update', onCmdUpdate as EventListener)
      window.removeEventListener('error', onError, true)
      window.removeEventListener('unhandledrejection', onRejection, true)
    }
  }, [])
}
