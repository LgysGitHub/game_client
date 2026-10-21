import { useEffect, useMemo } from 'react'
import { Cave, buildWallGeometry } from './cave'

// 墙体渲染：整张地图只生成一个合并后的 BufferGeometry
export function CaveMesh({ cave }: { cave: Cave }) {
  const geometry = useMemo(() => buildWallGeometry(cave), [cave])

  useEffect(() => () => geometry.dispose(), [geometry])

  const span = cave.size * cave.cellSize

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial color='#111a16' roughness={1} metalness={0} />
      </mesh>
    </>
  )
}
