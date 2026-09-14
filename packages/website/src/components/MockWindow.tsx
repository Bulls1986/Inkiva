import type { CSSProperties, ReactNode } from 'react'
import { SearchIcon } from './Icons'

type Props = {
  title: string
  showActions?: boolean
  windowId?: string
  windowRef?: React.Ref<HTMLDivElement>
  docStyle?: CSSProperties
  menuLabels?: string[]
  children: ReactNode
}

const DEFAULT_MENU = ['File', 'Edit', 'Paragraph', 'Format', 'View', 'Theme', 'Window', 'Help']

export default function MockWindow({
  title,
  showActions = false,
  windowId,
  windowRef,
  docStyle,
  menuLabels = DEFAULT_MENU,
  children
}: Props) {
  return (
    <div className="window" id={windowId} ref={windowRef}>
      <div className="win-bar">
        <div className="traffic">
          <i />
          <i />
          <i />
        </div>
        <div className="app-menu" aria-label="Application menu">
          {menuLabels.map((label, index) => (
            <span className={index === 0 ? 'active' : ''} key={label}>{label}</span>
          ))}
        </div>
        <div className="win-title">
          <span className="dot" /> {title}
        </div>
        {showActions && (
          <div className="win-actions">
            <SearchIcon />
          </div>
        )}
      </div>
      <div className="doc" style={docStyle}>
        {children}
      </div>
    </div>
  )
}
