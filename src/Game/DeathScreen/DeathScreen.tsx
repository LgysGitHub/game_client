import React from 'react'

import styles from './DeathScreen.module.css'
import term from '../../styles/terminal.module.css'

export const DeathScreen: React.FC<{ count: number }> = ({ count }) => (
  <div className={term.overlay}>
    <div className={`${term.terminal} ${styles.respawnBox}`}>
      <div>CONSTRUCT TERMINATED</div>
      <div className={styles.respawnSub}>REBUILDING...</div>
      <div className={styles.respawnCount}>{count}</div>
    </div>
  </div>
)
