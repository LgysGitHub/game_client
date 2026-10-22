import React from 'react'

import styles from './SystemMenu.module.css'
import term from '../../styles/terminal.module.css'

type Props = {
  seed: number | null
  seedInput: string
  seedError: string
  onSeedInput: (value: string) => void
  onResume: () => void
  onRespawn: () => void
  onLogout: () => void
  onNewMap: () => void
  onLoadSeed: () => void
}

export const SystemMenu: React.FC<Props> = ({
  seed,
  seedInput,
  seedError,
  onSeedInput,
  onResume,
  onRespawn,
  onLogout,
  onNewMap,
  onLoadSeed
}) => (
  <div className={term.overlay} onClick={(e) => { if (e.target === e.currentTarget) onResume() }}>
    <div className={styles.menuCard} onClick={(e) => e.stopPropagation()}>
      <div className={`${styles.menu} ${term.terminal}`} >
        <div className={term.menuTitle}>SYSTEM MENU</div>
        <button className={term.btn} onClick={onResume}>[ CONTINUE ]</button>
        <button className={term.btn} onClick={onRespawn}>[ RESPAWN ]</button>
        <button className={term.btn} onClick={onLogout}>[ LOG OUT ]</button>

        <div className={styles.seedSection}>
          <div className={styles.seedLabel}>// WORLD MATRIX · CURRENT SEED {seed ?? '--'}</div>
          <button className={term.btn} onClick={onNewMap}>[ GENERATE NEW MAP ]</button>
          <div className={styles.seedRow}>
            <input
              className={styles.seedInput}
              value={seedInput}
              onChange={(e) => onSeedInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onLoadSeed() }}
              placeholder='SEED 1 - 2147483647'
              spellCheck={false}
            />
            <button className={term.btn} onClick={onLoadSeed}>[ LOAD ]</button>
          </div>
          {seedError && <div className={styles.seedError}>{seedError}</div>}
        </div>
      </div>
    </div>
  </div>
)
