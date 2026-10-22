import React from 'react'

import { PlayerInfo } from '../../types/player'
import styles from './Scoreboard.module.css'
import term from '../../styles/terminal.module.css'

// 长按 Tab：玩家列表（只读，按队伍上下分区，预留击杀/死亡/助攻/分数）
const ScoreRow: React.FC<{ p: PlayerInfo; selfId: string }> = ({ p, selfId }) => (
  <tr className={p.id === selfId ? styles.selfRow : undefined}>
    <td>{p.name || p.id}{p.id === selfId ? ' (YOU)' : ''}</td>
    <td>{p.role.name}</td>
    <td>0</td><td>0</td><td>0</td><td>0</td>
  </tr>
)

const ScoreSection: React.FC<{ team: string; players: PlayerInfo[]; selfId: string }> = ({ team, players, selfId }) => (
  <div className={styles.scoreSection}>
    <div className={styles.scoreTeamHead}>
      <span className={team === 'BEAR' ? styles.teamBear : team === 'PMC' ? styles.teamPmc : styles.teamNone}>[{team}]</span>
      <span className={styles.scoreCount}>{players.length} NODES</span>
    </div>
    <table className={styles.scoreTable}>
      <thead>
        <tr>
          <th>NAME</th><th>ROLE</th><th>KILLS</th><th>DEATHS</th><th>ASSISTS</th><th>SCORE</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => <ScoreRow key={p.id} p={p} selfId={selfId} />)}
      </tbody>
    </table>
  </div>
)

export const Scoreboard: React.FC<{ players: PlayerInfo[]; selfId: string }> = ({ players, selfId }) => {
  const teams = ['BEAR', 'PMC']
  const groups = teams.map((t) => ({ team: t, list: players.filter((p) => (p.team || '').toUpperCase() === t) }))
  const others = players.filter((p) => !teams.includes((p.team || '').toUpperCase()))
  if (others.length) groups.push({ team: '--', list: others })
  return (
    <div className={styles.scoreWrap}>
      <div className={`${styles.scoreboard} ${term.terminal}`}>
        <div className={styles.scoreTitle}>// NETWORK NODES</div>
        {groups.filter((g) => g.list.length > 0).map((g) => (
          <ScoreSection key={g.team} team={g.team} players={g.list} selfId={selfId} />
        ))}
      </div>
    </div>
  )
}
