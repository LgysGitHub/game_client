import { Canvas, useThree } from '@react-three/fiber'
import { ReactNode, useEffect } from 'react'

import { Cave } from './Cave'
import { CaveMesh } from './CaveMesh'
import { AsciiEffect } from './AsciiEffect'

import styles from './styles.module.css'

const BG = '#05070a'

// 60fps 节流：demand 模式下由固定节拍驱动渲染
function FramePump() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / 60)
    return () => clearInterval(id)
  }, [invalidate])
  return null
}

export function World({ cave, children }: { cave: Cave; children: ReactNode }) {
  return (
    <Canvas className={styles.world} frameloop='demand'>
      <FramePump />
      <color attach='background' args={[BG]} />
      <fog attach='fog' args={[BG, 6, 55]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#8fb89a', '#0a1410', 0.7]} />
      <directionalLight position={[40, 80, 20]} intensity={0.9} />
      <CaveMesh cave={cave} />
      {children}
      <AsciiEffect cols={260} />
    </Canvas>
  )
}
