import type { ReactNode } from 'react'
import FeatureCard from './FeatureCard'
import { GridSmallIcon, LinesIcon, SearchIcon, TargetIcon } from './Icons'

type Props = {
  locale?: 'en' | 'zh-CN'
}

type WorkflowCard = {
  icon: ReactNode
  title: string
  description: string
}

const COPY = {
  en: {
    kicker: 'A document-first workflow',
    title: 'Everything around the file stays lightweight.',
    description:
      'Inkiva adds useful navigation and recovery around ordinary Markdown files — without turning a folder into a proprietary workspace.',
    cards: [
      {
        icon: <SearchIcon />,
        title: 'Open what matters',
        description:
          'Recent documents, folders, Quick Open and Markdown-only search keep the next file close.'
      },
      {
        icon: <GridSmallIcon />,
        title: 'Compare without clutter',
        description:
          'Tabs and an optional two-pane view make A|B comparison available when the document needs it.'
      },
      {
        icon: <LinesIcon />,
        title: 'Keep links portable',
        description:
          'Use standard relative Markdown links and headings; backlinks and repair prompts never rewrite files silently.'
      },
      {
        icon: <TargetIcon />,
        title: 'Recover with confidence',
        description:
          'Local history, autosave and crash recovery protect the document while keeping edits asynchronous.'
      }
    ]
  },
  'zh-CN': {
    kicker: '以文档为中心的工作流',
    title: '围绕文件的一切，都保持轻量。',
    description: 'Inkiva 为普通 Markdown 文件增加导航与恢复能力，但不会把文件夹变成私有工作区。',
    cards: [
      {
        icon: <SearchIcon />,
        title: '快速打开需要的文档',
        description: '最近文档、文件夹、Quick Open 和 Markdown 搜索，让下一个文件始终在手边。'
      },
      {
        icon: <GridSmallIcon />,
        title: '比较时保持清晰',
        description: '标签页与可选双栏视图支持 A|B 对照，需要时使用，不增加日常干扰。'
      },
      {
        icon: <LinesIcon />,
        title: '保持链接可移植',
        description: '使用标准相对 Markdown 链接和标题；反向链接与修复提示不会静默改写文件。'
      },
      {
        icon: <TargetIcon />,
        title: '放心恢复',
        description: '本地历史、自动保存和崩溃恢复保护文档，同时保持编辑操作异步。'
      }
    ]
  }
} as const

export default function DocumentWorkflow({ locale = 'en' }: Props) {
  const copy = COPY[locale]
  return (
    <section className="block document-workflow" aria-labelledby={`workflow-title-${locale}`}>
      <div className="wrap">
        <div className="sec-head center reveal">
          <span className="kicker">{copy.kicker}</span>
          <h2 className="sec-title" id={`workflow-title-${locale}`}>
            {copy.title}
          </h2>
          <p className="sec-desc">{copy.description}</p>
        </div>
        <div className="grid-3 grid-2">
          {copy.cards.map((card, index) => (
            <FeatureCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
              delay={index === 0 ? undefined : index === 1 ? 'd1' : index === 2 ? 'd2' : 'd3'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
