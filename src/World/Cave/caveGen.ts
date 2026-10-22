export type CaveSpawn = { x: number; z: number }

export type CaveData = {
  seed: number
  size: number
  cellSize: number
  wallHeight: number
  grid: Uint8Array
  spawns: CaveSpawn[]
}

export const MAP_SIZE = 256
export const CELL_SIZE = 1
export const WALL_HEIGHT = 4
export const SPAWN_COUNT = 6
export const CA_ITERATIONS = 4
export const CA_WALL_THRESHOLD = 5
export const INITIAL_WALL_PERCENT = 52

// xorshift32：纯 uint32 整数运算，同一种子必然生成同一张地图
export function xorshift32(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s
  }
}

// 网格校验哈希：FNV-1a 32 位整数运算
export function hashGrid(grid: Uint8Array) {
  let h = 0x811c9dc5
  for (let i = 0; i < grid.length; i++) {
    h ^= grid[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// 细胞自动机单步：3x3 内墙数 >= 5 则保持墙体
function caStep(grid: Uint8Array, next: Uint8Array, size: number) {
  next.fill(1)
  for (let z = 1; z < size - 1; z++) {
    const row = z * size
    for (let x = 1; x < size - 1; x++) {
      const i = row + x
      let walls = 0
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue
          walls += grid[i + dz * size + dx]
        }
      }
      next[i] = walls >= CA_WALL_THRESHOLD ? 1 : 0
    }
  }
}

// 洪水填充：只保留最大的连通空地，其余填成墙体（剔除孤岛）
function keepLargestRegion(grid: Uint8Array, size: number) {
  const n = size * size
  const seen = new Uint8Array(n)
  const queue = new Int32Array(n)
  let bestStart = -1
  let bestCount = 0

  for (let i = 0; i < n; i++) {
    if (grid[i] === 1 || seen[i]) continue
    let head = 0
    let tail = 0
    queue[tail++] = i
    seen[i] = 1
    while (head < tail) {
      const cur = queue[head++]
      const cx = cur % size
      const cz = (cur / size) | 0
      if (cx > 0) { const k = cur - 1; if (grid[k] === 0 && !seen[k]) { seen[k] = 1; queue[tail++] = k } }
      if (cx < size - 1) { const k = cur + 1; if (grid[k] === 0 && !seen[k]) { seen[k] = 1; queue[tail++] = k } }
      if (cz > 0) { const k = cur - size; if (grid[k] === 0 && !seen[k]) { seen[k] = 1; queue[tail++] = k } }
      if (cz < size - 1) { const k = cur + size; if (grid[k] === 0 && !seen[k]) { seen[k] = 1; queue[tail++] = k } }
    }
    if (tail > bestCount) {
      bestCount = tail
      bestStart = i
    }
  }

  if (bestStart < 0) return
  const keep = new Uint8Array(n)
  let head = 0
  let tail = 0
  queue[tail++] = bestStart
  keep[bestStart] = 1
  while (head < tail) {
    const cur = queue[head++]
    const cx = cur % size
    const cz = (cur / size) | 0
    if (cx > 0) { const k = cur - 1; if (grid[k] === 0 && !keep[k]) { keep[k] = 1; queue[tail++] = k } }
    if (cx < size - 1) { const k = cur + 1; if (grid[k] === 0 && !keep[k]) { keep[k] = 1; queue[tail++] = k } }
    if (cz > 0) { const k = cur - size; if (grid[k] === 0 && !keep[k]) { keep[k] = 1; queue[tail++] = k } }
    if (cz < size - 1) { const k = cur + size; if (grid[k] === 0 && !keep[k]) { keep[k] = 1; queue[tail++] = k } }
  }

  for (let i = 0; i < n; i++) {
    if (grid[i] === 0 && !keep[i]) grid[i] = 1
  }
}

// 最远点采样：在空地里取多个彼此分散的安全出生点
function pickSpawns(grid: Uint8Array, size: number, rand: () => number): CaveSpawn[] {
  const candidates: number[] = []
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      const i = z * size + x
      if (grid[i] !== 0) continue
      let clear = true
      for (let dz = -1; dz <= 1 && clear; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (grid[i + dz * size + dx] !== 0) { clear = false; break }
        }
      }
      if (clear) candidates.push(i)
    }
  }
  if (candidates.length === 0) {
    for (let i = 0; i < grid.length; i++) if (grid[i] === 0) candidates.push(i)
  }
  if (candidates.length === 0) return [{ x: 0, z: 0 }]

  const chosen: number[] = [candidates[rand() % candidates.length]]
  while (chosen.length < SPAWN_COUNT && chosen.length < candidates.length) {
    let best = -1
    let bestDist = -1
    for (const c of candidates) {
      if (chosen.includes(c)) continue
      const cx = c % size
      const cz = (c / size) | 0
      let min = Infinity
      for (const s of chosen) {
        const dx = cx - (s % size)
        const dz = cz - ((s / size) | 0)
        const d = dx * dx + dz * dz
        if (d < min) min = d
      }
      if (min > bestDist) { bestDist = min; best = c }
    }
    if (best < 0) break
    chosen.push(best)
  }

  return chosen.map((i) => ({
    x: (i % size - size / 2 + 0.5) * CELL_SIZE,
    z: (((i / size) | 0) - size / 2 + 0.5) * CELL_SIZE
  }))
}

export function generateCave(seed: number, size = MAP_SIZE): CaveData {
  const rand = xorshift32(seed)
  const n = size * size
  const grid = new Uint8Array(n)
  const next = new Uint8Array(n)

  // 初始随机：边界恒为墙
  for (let i = 0; i < n; i++) grid[i] = 1
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      grid[z * size + x] = rand() % 100 < INITIAL_WALL_PERCENT ? 1 : 0
    }
  }

  for (let iter = 0; iter < CA_ITERATIONS; iter++) {
    caStep(grid, next, size)
    grid.set(next)
  }

  keepLargestRegion(grid, size)
  const spawns = pickSpawns(grid, size, rand)

  return { seed, size, cellSize: CELL_SIZE, wallHeight: WALL_HEIGHT, grid, spawns }
}

// 按队伍取出生点：BEAR / PMC 各一个，其它队伍用后续备用点
export function spawnForTeam(cave: CaveData, team?: string): CaveSpawn {
  const idx = team === 'BEAR' ? 0 : team === 'PMC' ? 1 : 2
  return cave.spawns[Math.min(idx, cave.spawns.length - 1)] || { x: 0, z: 0 }
}

// 世界坐标 -> 格子是否为空地
export function isOpenAt(cave: CaveData, x: number, z: number) {
  const gx = Math.floor(x / cave.cellSize + cave.size / 2)
  const gz = Math.floor(z / cave.cellSize + cave.size / 2)
  if (gx < 0 || gz < 0 || gx >= cave.size || gz >= cave.size) return false
  return cave.grid[gz * cave.size + gx] === 0
}

// 玩家半径内四角都为空地才可站立
export function canStand(cave: CaveData, x: number, z: number, radius = 0.35) {
  return (
    isOpenAt(cave, x - radius, z - radius) &&
    isOpenAt(cave, x + radius, z - radius) &&
    isOpenAt(cave, x - radius, z + radius) &&
    isOpenAt(cave, x + radius, z + radius)
  )
}
