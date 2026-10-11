import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { ReactNode, useEffect } from 'react'
import { TextureLoader } from 'three'

import groundTexture from '../assets/flower_scattered_gravel_diff_4k.jpg'

import styles from './styles.module.css'

const BG = '#FFF'

// 60fps 节流：demand 模式下由固定节拍驱动渲染
function FramePump() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / 60)
    return () => clearInterval(id)
  }, [invalidate])
  return null
}

export function World({
  children
}: { children: ReactNode }) {
  const texture = useLoader(TextureLoader, groundTexture);
  texture.repeat.set(1, 1);

  return (
    <Canvas className={styles.world} frameloop='demand'>
      <FramePump />
      <color attach='background' args={[BG]} />
      <fog attach='fog' args={[BG, 45, 75]} />
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#9affc0', '#203018', 0.8]} />
      <pointLight position={[10,10,10]} />
      {
        children
      }
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </Canvas>
  );
}
