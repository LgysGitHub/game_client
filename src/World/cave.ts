import * as THREE from 'three'
import { CaveData } from './caveGen'

export type Cave = CaveData
export type { CaveSpawn } from './caveGen'
export {
  MAP_SIZE,
  CELL_SIZE,
  WALL_HEIGHT,
  SPAWN_COUNT,
  xorshift32,
  hashGrid,
  generateCave,
  spawnForTeam,
  isOpenAt,
  canStand
} from './caveGen'

// 只为“空地相邻”的墙面生成几何，全部合并成一个 BufferGeometry
export function buildWallGeometry(cave: Cave): THREE.BufferGeometry {
  const { size, cellSize, wallHeight, grid } = cave
  const isWall = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return true
    return grid[z * size + x] === 1
  }

  let faces = 0
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (grid[z * size + x] === 0) continue
      if (!isWall(x - 1, z)) faces++
      if (!isWall(x + 1, z)) faces++
      if (!isWall(x, z - 1)) faces++
      if (!isWall(x, z + 1)) faces++
    }
  }

  const positions = new Float32Array(faces * 4 * 3)
  const normals = new Float32Array(faces * 4 * 3)
  const colors = new Float32Array(faces * 4 * 3)
  const indices = new Uint32Array(faces * 6)

  const half = size / 2
  let v = 0
  let ii = 0

  const pushFace = (
    ax: number, az: number, bx: number, bz: number,
    nx: number, ny: number, nz: number,
    shade: number
  ) => {
    const base = v / 3
    const bottom = shade * 0.55
    const top = shade
    // 底面两个点 + 顶面两个点，法线/颜色逐顶点写入
    const verts = [
      ax, 0, az, bottom,
      bx, 0, bz, bottom,
      bx, wallHeight, bz, top,
      ax, wallHeight, az, top
    ]
    for (let k = 0; k < 4; k++) {
      positions[v] = verts[k * 4]
      positions[v + 1] = verts[k * 4 + 1]
      positions[v + 2] = verts[k * 4 + 2]
      const c = verts[k * 4 + 3]
      normals[v] = nx
      normals[v + 1] = ny
      normals[v + 2] = nz
      colors[v] = c
      colors[v + 1] = c
      colors[v + 2] = c
      v += 3
    }
    indices[ii++] = base; indices[ii++] = base + 1; indices[ii++] = base + 2
    indices[ii++] = base; indices[ii++] = base + 2; indices[ii++] = base + 3
  }

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (grid[z * size + x] === 0) continue
      const x0 = (x - half) * cellSize
      const x1 = x0 + cellSize
      const z0 = (z - half) * cellSize
      const z1 = z0 + cellSize
      const h = ((x * 73856093) ^ (z * 19349663)) >>> 0
      const shade = 0.72 + (h % 256) / 256 * 0.28

      if (!isWall(x, z - 1)) pushFace(x1, z0, x0, z0, 0, 0, -1, shade * 0.9)
      if (!isWall(x, z + 1)) pushFace(x0, z1, x1, z1, 0, 0, 1, shade * 0.7)
      if (!isWall(x - 1, z)) pushFace(x0, z0, x0, z1, -1, 0, 0, shade)
      if (!isWall(x + 1, z)) pushFace(x1, z1, x1, z0, 1, 0, 0, shade * 0.75)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}
