import { Role } from './roles'

export type PlayerInfo = {
  id: string
  name?: string
  team?: string
  role: Role
  position: number[]
  rotation: number
}
