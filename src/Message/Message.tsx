import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../Socket/socket';
import { roles, Role } from '../types/roles';
import styles from '../App.module.css';

const TEAMS = ['BEAR', 'PMC'];

const HELP_LINES = [
  '[HELP] /team [BEAR|PMC] [ROLE]  SWITCH TEAM (+ROLE)',
  '[HELP] /name [NAME]   /role [ROLE]',
  '[HELP] /respawn       REBUILD + RANDOM ROLE',
  '[HELP] ROLES: WARRIOR / MAGE / ROGUE',
];

type ChatMsg = { id: string; message: string; sid?: string; team?: string };
type LocalLine = { local: true; text: string };

const Message: React.FC = () => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [locals, setLocals] = useState<LocalLine[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const printLocal = (lines: string[]) =>
    setLocals((prev) => [...prev, ...lines.map((text) => ({ local: true as const, text }))].slice(-6));

  const closeInput = () => {
    setOpen(false);
    (window as any).__chatOpen = false;
  };

  useEffect(() => {
    // 监听服务器发送的消息
    socket.on('chat message', (data: ChatMsg) => {
      setMessages((prevMessages) => {
        if(prevMessages.length >= 5){
          return [...prevMessages.slice(-4), data]
        }
        return [...prevMessages, data]
      });
    });

    // Enter 打开聊天框：保持鼠标锁定，不出现光标
    const openChat = (e: KeyboardEvent) => {
      const w = window as any;
      if (e.code === 'Enter' && document.pointerLockElement && !w.__chatOpen && !w.__dead && !w.__panelOpen) {
        e.preventDefault();
        w.__chatOpen = true;
        setOpen(true);
      }
    };
    window.addEventListener('keydown', openChat);

    // 清理监听器
    return () => {
      socket.off('chat message');
      window.removeEventListener('keydown', openChat);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 斜杠指令：本地解析；/respawn 交给 App 流程，其余发服务端合并广播
  const runCommand = (raw: string) => {
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (cmd === '/help') {
      printLocal(HELP_LINES);
      return;
    }

    if (cmd === '/respawn') {
      window.dispatchEvent(new Event('cmd:respawn'));
      return;
    }

    if (cmd === '/name') {
      const name = args[0];
      if (args.length !== 1 || !/^[a-zA-Z0-9_]{1,12}$/.test(name || '')) {
        printLocal(['[ERR] USAGE: /name [NAME]  1-12 CHARS, LETTERS/DIGITS/_']);
        return;
      }
      socket.emit('player update', { name });
      window.dispatchEvent(new CustomEvent('cmd:update', { detail: { name } }));
      return;
    }

    if (cmd === '/role') {
      if (args.length !== 1) {
        printLocal(['[ERR] USAGE: /role [WARRIOR|MAGE|ROGUE]']);
        return;
      }
      const role = roles.find((r) => r.name.toLowerCase() === args[0].toLowerCase());
      if (!role) {
        printLocal(['[ERR] UNKNOWN ROLE — WARRIOR / MAGE / ROGUE']);
        return;
      }
      socket.emit('player update', { roleId: role.id });
      window.dispatchEvent(new CustomEvent('cmd:update', { detail: { role } }));
      return;
    }

    if (cmd === '/team') {
      if (args.length < 1 || args.length > 2) {
        printLocal(['[ERR] USAGE: /team [BEAR|PMC] [ROLE?]']);
        return;
      }
      const teamTok = args.find((a) => TEAMS.includes(a.toUpperCase()));
      if (!teamTok) {
        printLocal(['[ERR] TEAM MUST BE BEAR OR PMC']);
        return;
      }
      const team = teamTok.toUpperCase();
      const roleTok = args.find((a) => !TEAMS.includes(a.toUpperCase()));
      let role: Role | undefined;
      if (roleTok) {
        role = roles.find((r) => r.name.toLowerCase() === roleTok.toLowerCase());
        if (!role) {
          printLocal(['[ERR] UNKNOWN ROLE — WARRIOR / MAGE / ROGUE']);
          return;
        }
      } else {
        // 切队伍同时更换角色
        role = roles[Math.floor(Math.random() * roles.length)];
      }
      socket.emit('player update', { team, roleId: role.id });
      window.dispatchEvent(new CustomEvent('cmd:update', { detail: { team, role } }));
      return;
    }

    printLocal([`[ERR] UNKNOWN COMMAND: ${raw}  — TYPE /help`]);
  };

  const sendMessage = () => {
    const text = inputValue.trim();
    if (text) {
      if (text.startsWith('/')) runCommand(text);
      else socket.emit('chat message', text);
      setInputValue('');
    }
    closeInput();
  };

  const renderLine = (msg: ChatMsg) => {
    if (msg.sid === socket.id) return `> ${msg.message}`;
    if (msg.id === '[SYS]') return msg.message;
    return `[${msg.team || '--'}][${msg.id}] ${msg.message}`;
  };

  const lines: { key: string; node: React.ReactNode; self?: boolean }[] = [
    ...messages.map((m, i) => ({ key: `s${i}`, node: renderLine(m), self: m.sid === socket.id })),
    ...locals.map((l, i) => ({ key: `l${i}`, node: l.text })),
  ].slice(-6);

  return (
    <div className={styles.chat}>
      <ul>
        {lines.map((l) => (
          <li key={l.key} className={l.self ? styles.selfMessage : undefined}>
            {l.node}
          </li>
        ))}
      </ul>
      {open && (
        <div className={styles.chatLine}>
          <span className={styles.chatPrompt}>&gt;</span>
          <div className={styles.inputWrap}>
            <div className={styles.inputMirror}>{inputValue}<i className={styles.blockCursor} /></div>
            <input
              ref={inputRef}
              className={styles.hiddenInput}
              type="text"
              value={inputValue}
              autoFocus
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  sendMessage()
                }
                if (e.key === 'Escape') closeInput()
              }}
              onBlur={closeInput}
            />
          </div>
        </div>
      )}
    </div>
  );
};


export default Message
