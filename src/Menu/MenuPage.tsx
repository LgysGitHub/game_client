import React, { useEffect, useRef, useState } from 'react'
import { Role } from '../types/roles'
import styles from './styles.module.css'

const TEAMS = ['BEAR', 'PMC']

const staticText = `NEURAL LINK TERMINAL v2.0
COPYRIGHT 2033 DIO INDUSTRIES

===== LINK STATUS =====
* UPLINK: STANDBY
* MEMORY: 64KB OK
* REACTOR: ONLINE
* SECURITY: ENABLED

TYPE A COMMAND TO PROCEED
  /start                       RANDOM JACK-IN
  /quit                        SHUT DOWN
  /help                        LIST COMMANDS
`

export type StartOptions = { name?: string; role?: Role; team?: string }

export const MenuPage: React.FC<{
  roles: Role[]
  onStart: (opts: StartOptions) => void
  onQuit: () => void
}> = ({ roles, onStart, onQuit }) => {
  const [typed, setTyped] = useState('')
  const [ready, setReady] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cmdHistory = useRef<string[]>([])
  const draft = useRef('')

  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      i++
      setTyped(staticText.slice(0, i))
      if (i >= staticText.length) {
        clearInterval(t)
        setReady(true)
      }
    }, 18)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (ready) inputRef.current?.focus()
  }, [ready])

  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [typed, history, inputValue])

  const push = (...lines: string[]) => setHistory((h) => [...h, ...lines])

  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

  const runStart = (args: string[]) => {
    if (args.length > 3) {
      push('* USAGE: /start [NAME] [ROLE] [TEAM]')
      return
    }

    let name: string | undefined
    let role: Role | undefined
    let team: string | undefined

    for (const token of args) {
      const matchedRole = roles.find((r) => eq(r.name, token))
      const matchedTeam = TEAMS.find((t) => eq(t, token))
      if (matchedRole) {
        if (role) { push('* DUPLICATE ROLE'); return }
        role = matchedRole
      } else if (matchedTeam) {
        if (team) { push('* DUPLICATE TEAM'); return }
        team = matchedTeam
      } else {
        if (name) { push(`* UNEXPECTED TOKEN: "${token}"`); return }
        if (!/^[a-zA-Z0-9_]{1,12}$/.test(token)) {
          push('* INVALID NAME: 1-12 CHARS, LETTERS / DIGITS / _')
          return
        }
        name = token
      }
    }

    if (!team) team = TEAMS[Math.floor(Math.random() * TEAMS.length)]

    push(`* JACKING IN AS ${name || 'ANON'} // ${role ? role.name : 'RANDOM ROLE'} // ${team}...`)
    setTimeout(() => onStart({ name, role, team }), 500)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const cmd = inputValue.trim()
    if (!cmd) return
    cmdHistory.current.push(cmd)
    setInputValue('')
    setHistIdx(-1)
    if (/^clear$/i.test(cmd)) { setHistory([]); return }

    push(`> ${cmd}`)
    const parts = cmd.split(/\s+/)
    const command = parts[0].toLowerCase()

    if (command === '/start') {
      runStart(parts.slice(1))
    } else if (command === '/quit') {
      push('* TERMINATING SESSION...')
      setTimeout(onQuit, 400)
    } else if (command === '/help') {
      push('* /start [NAME] [ROLE] [TEAM]  ORDER FREE, ALL OPTIONAL')
      push('*   ROLES: WARRIOR / MAGE / ROGUE')
      push('*   TEAMS: BEAR / PMC (RANDOM IF OMITTED)')
      push('* /quit   SHUT DOWN')
      push('* clear    CLEAR SCREEN')
    } else {
      push(`* UNKNOWN COMMAND: "${cmd}"`)
    }
  }

  // 方向键上/下：翻阅历史命令（cmd 风格）
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const cmds = cmdHistory.current
    if (e.code === 'ArrowUp' && cmds.length) {
      e.preventDefault()
      const next = histIdx === -1 ? cmds.length - 1 : Math.max(0, histIdx - 1)
      if (histIdx === -1) draft.current = inputValue
      setHistIdx(next)
      setInputValue(cmds[next])
    } else if (e.code === 'ArrowDown' && histIdx !== -1) {
      e.preventDefault()
      const next = histIdx + 1
      if (next >= cmds.length) {
        setHistIdx(-1)
        setInputValue(draft.current)
      } else {
        setHistIdx(next)
        setInputValue(cmds[next])
      }
    }
  }

  return (
    <div className={styles.hex} onClick={() => inputRef.current?.focus()}>
      <div className={styles.terminal} onClick={() => inputRef.current?.focus()}>
        <div className={styles.screen}>
          <div className={styles.scanlines} />
          <pre className={styles.content}>
            {typed}
            {history.map((line, i) => (
              <React.Fragment key={i}>{line}{'\n'}</React.Fragment>
            ))}
            <div ref={endRef} />
          </pre>
          {ready && (
            <form onSubmit={submit} className={styles.inputForm}>
              <span className={styles.prompt}>&gt;</span>
              <input
                ref={inputRef}
                type='text'
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onInputKeyDown}
                className={styles.cmdInput}
                autoComplete='off'
                autoFocus
                spellCheck={false}
              />
            </form>
          )}
        </div>
        <div className={styles.border}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.corner} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default MenuPage
