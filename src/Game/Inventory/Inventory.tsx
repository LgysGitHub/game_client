import React from 'react'

import { PlayerInfo } from '../../types/player'
import styles from './Inventory.module.css'
import term from '../../styles/terminal.module.css'

// I 键：角色信息 / 预留背包
export const Inventory: React.FC<{ player: PlayerInfo; onClose: () => void }> = ({ player, onClose }) => (
  <div className={term.overlay}>
    <div className={`${styles.inventory} ${term.terminal}`}>
      <button className={styles.invClose} onClick={onClose}>X</button>
      <div className={term.menuTitle}>CHARACTER DATA</div>
      <div className={styles.invBody}>
        <div>ID ......... {player.id}</div>
        <div>NAME ....... {player.name || '--'}</div>
        <div>TEAM ....... {player.team || '--'}</div>
        <div>ROLE ....... {player.role.name}</div>
        <div>DESC ....... {player.role.description}</div>
      </div>
      <div className={styles.invSlotsTitle}>// INVENTORY (RESERVED)</div>
      <div className={styles.invSlots}>
        {[...Array(8)].map((_, i) => <div key={i} className={styles.slot} />)}
      </div>
    </div>
  </div>
)
