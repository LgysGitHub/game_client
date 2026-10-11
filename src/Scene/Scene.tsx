import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { 
  OrbitControls, 
  useGLTF,
  Clone
} from '@react-three/drei'

interface ModelProps {
  url: string,
  position?: [number, number, number]
}

// 加载角色模型
export function Model({ url, position }: ModelProps) {
  const { scene } = useGLTF(url)
  return (
    <Clone object={scene} scale={1} position={position ?? [0, 0, 0]} />
  )
}

interface SceneProps {
  role: string
}
// 3D 场景组件
export function Scene({ role }: SceneProps) { 
  const modelUrl = `/models/${role}.glb`

  return (
    <Canvas style={{ width: '100%', height: '50vh' }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <Model url={modelUrl} />
      </Suspense>
      <OrbitControls />
    </Canvas>
  );
}