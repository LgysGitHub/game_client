export interface Role {
  id: number;
  name: string;
  description: string;
  modelUrl: string; // 角色对应的 3D 模型路径
  scale: number; // 模型显示比例
}

// 定义角色数据
export const roles: Role[] = [
  {
    id: 1,
    name: 'Warrior',
    description: 'A strong melee fighter.',
    modelUrl: '/models/Warrior.glb',
    scale: 0.8,
  },
  {
    id: 2,
    name: 'Mage',
    description: 'A powerful spell caster.',
    modelUrl: '/models/Mage.glb',
    scale: 1,
  },
  {
    id: 3,
    name: 'Rogue',
    description: 'A stealthy assassin.',
    modelUrl: '/models/Rogue.glb',
    scale: 0.8,
  },
];
