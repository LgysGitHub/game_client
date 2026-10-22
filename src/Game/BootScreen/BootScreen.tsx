import React from 'react'

import { PlayerInfo } from '../../types/player'
import styles from './BootScreen.module.css'
import term from '../../styles/terminal.module.css'

// CRT 启动屏
export const BootScreen: React.FC<{
  player: PlayerInfo | null
  progress: number
  linkError: boolean
  seed: number | null
  mapLoading: boolean
}> = ({ player, progress, linkError, seed, mapLoading }) => (
  <div className={`${styles.boot} ${term.terminal}`}>
    <div className={styles.bootLine}>NEURAL LINK TERMINAL v2.0</div>
    <div className={styles.bootLine}>&gt; ESTABLISHING SECURE CONNECTION ...... {linkError ? 'FAILED' : player ? 'OK' : '...'}</div>
    <div className={styles.bootLine}>&gt; ASSIGNING IDENTITY ...... {player ? `${player.role.name} // ${player.id}` : 'PENDING'}</div>
    <div className={styles.bootLine}>&gt; LOADING WORLD MATRIX ...... {mapLoading ? `GEN ${seed ?? '----'}` : seed ? `SEED ${seed}` : 'PENDING'}</div>
    <div className={styles.progress}>
      <div className={styles.progressFill} style={{ width: `${progress}%` }} />
    </div>
    <div className={styles.pct}>
      {linkError ? 'SERVER OFFLINE - RETRYING' : `${Math.floor(progress)}%`}
    </div>
  </div>
)
