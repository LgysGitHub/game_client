import React from 'react'

import styles from './ErrorBoundary.module.css'
import term from '../../styles/terminal.module.css'

// 渲染层兜底：3D 场景任何异常都只显示终端提示，不白屏
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error('[render crash]', err) }
  render() {
    if (this.state.failed) {
      return (
        <div className={term.overlay}>
          <div className={`${term.terminal} ${styles.fatal}`}>
            &gt; RENDER FAILURE — WORLD OFFLINE<i className={term.blockCursor} />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
