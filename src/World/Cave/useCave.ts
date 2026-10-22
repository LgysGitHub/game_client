import { useEffect, useState } from 'react'
import { Cave, MAP_SIZE, generateCave, hashGrid } from './cave'

// 生成与渲染解耦：种子变化后先进入 loading，再在下一帧生成纯数据
export function useCave(seed: number | null, expectedHash: number | null, size = MAP_SIZE) {
  const [cave, setCave] = useState<Cave | null>(null)
  const [loading, setLoading] = useState(false)
  const [mismatch, setMismatch] = useState(false)

  useEffect(() => {
    if (seed === null) {
      setCave(null)
      setLoading(false)
      setMismatch(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const id = setTimeout(() => {
      try {
        const next = generateCave(seed, size)
        if (expectedHash !== null && hashGrid(next.grid) !== expectedHash) {
          if (!cancelled) {
            console.error('[cave] hash mismatch', seed, hashGrid(next.grid), expectedHash)
            setCave(null)
            setLoading(false)
            setMismatch(true)
          }
          return
        }
        if (!cancelled) {
          setCave(next)
          setLoading(false)
          setMismatch(false)
        }
      } catch (e) {
        console.error('[cave] generation failed', e)
        if (!cancelled) setLoading(false)
      }
    }, 30)

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [seed, expectedHash, size])

  return { cave, loading, mismatch }
}
