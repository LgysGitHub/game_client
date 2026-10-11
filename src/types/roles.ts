export interface Role {
  id: number;
  name: string;
  description: string;
  modelUrl: string; // 角色对应的 3D 模型路径
}

// 定义角色数据
export const roles: Role[] = [
  {
    id: 1,
    name: 'Warrior',
    description: 'A strong melee fighter.',
    modelUrl: '/models/Rogue.glb',
  },
  {
    id: 2,
    name: 'Mage',
    description: 'A powerful spell caster.',
    modelUrl: '/models/Mage.glb',
  },
  {
    id: 3,
    name: 'Rogue',
    description: 'A stealthy assassin.',
    modelUrl: '/models/Rogue.glb',
  },
];
