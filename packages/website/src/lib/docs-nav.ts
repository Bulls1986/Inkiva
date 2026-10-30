export type DocTabId = 'user' | 'dev' | 'zh'

export type DocPage = {
  /** URL slug, joined with `/` becomes the final path under /docs/ */
  slug: string[]
  /** Page title as shown in the sidebar / breadcrumb / palette */
  title: string
  /** Markdown filename, relative to content/docs/ */
  file: string
  /** Optional short subtitle (used in the palette) */
  hint?: string
}

export type DocGroup = {
  label: string
  pages: DocPage[]
}

export type DocTab = {
  id: DocTabId
  label: string
  groups: DocGroup[]
}

export const DOC_TABS: DocTab[] = [
  {
    id: 'user',
    label: 'User docs',
    groups: [
      {
        label: 'Quick start',
        pages: [
          {
            slug: ['introduction'],
            title: 'Introduction',
            file: 'README.md',
            hint: 'Overview & getting started'
          },
          {
            slug: ['installation'],
            title: 'Installation',
            file: 'end-user/INSTALLATION.md',
            hint: 'Download & install on Windows or macOS'
          },
          {
            slug: ['basics'],
            title: 'Basics',
            file: 'end-user/BASICS.md',
            hint: 'The interface, files & tabs'
          },
          {
            slug: ['editing'],
            title: 'Editing in depth',
            file: 'end-user/EDITING.md',
            hint: 'Editing tools, blocks & find/replace'
          },
          {
            slug: ['spelling'],
            title: 'Spelling',
            file: 'end-user/SPELLING.md',
            hint: 'Spell checker & dictionaries'
          },
          {
            slug: ['markdown-syntax'],
            title: 'Markdown syntax',
            file: 'end-user/MARKDOWN_SYNTAX.md',
            hint: 'Every element Inkiva renders'
          }
        ]
      },
      {
        label: 'Configuration',
        pages: [
          {
            slug: ['preferences'],
            title: 'Preferences',
            file: 'end-user/PREFERENCES.md',
            hint: 'App settings reference'
          },
          {
            slug: ['key-bindings'],
            title: 'Key bindings',
            file: 'end-user/KEYBINDINGS.md',
            hint: 'Default & custom shortcuts'
          },
          {
            slug: ['key-bindings-macos'],
            title: 'Key bindings (macOS)',
            file: 'end-user/KEYBINDINGS_OSX.md',
            hint: 'Baseline shortcuts and preset notes'
          },
          {
            slug: ['key-bindings-windows'],
            title: 'Key bindings (Windows)',
            file: 'end-user/KEYBINDINGS_WINDOWS.md',
            hint: 'Baseline shortcuts and preset notes'
          },
          {
            slug: ['application-data-directory'],
            title: 'Application data directory',
            file: 'end-user/APPLICATION_DATA_DIRECTORY.md',
            hint: 'Where Inkiva stores user data'
          },
          {
            slug: ['environment-variables'],
            title: 'Environment variables',
            file: 'end-user/ENVIRONMENT.md',
            hint: 'Runtime environment overrides'
          },
          {
            slug: ['cli'],
            title: 'Command line interface',
            file: 'end-user/CLI.md',
            hint: 'Flags, switches, exit codes'
          }
        ]
      },
      {
        label: 'Export & appearance',
        pages: [
          {
            slug: ['export'],
            title: 'Export a document',
            file: 'end-user/EXPORT.md',
            hint: 'PDF, HTML & print options'
          },
          {
            slug: ['themes'],
            title: 'Appearances',
            file: 'end-user/THEMES.md',
            hint: 'Light, Dark & Paper app surfaces'
          },
          {
            slug: ['export-themes'],
            title: 'Themes for exporting',
            file: 'end-user/EXPORT_THEMES.md',
            hint: 'Style your exported HTML'
          },
          {
            slug: ['images'],
            title: 'Image support',
            file: 'end-user/IMAGES.md',
            hint: 'Copy images to a local folder'
          },
          {
            slug: ['image-uploader'],
            title: 'Image uploader configuration',
            file: 'end-user/IMAGE_UPLOADER_CONFIGRATION.md',
            hint: 'PicGo cloud uploads'
          }
        ]
      },
      {
        label: 'More',
        pages: [
          {
            slug: ['portable'],
            title: 'Portable mode',
            file: 'end-user/PORTABLE.md',
            hint: 'Run Inkiva from a USB stick'
          },
          {
            slug: ['faq'],
            title: 'FAQ',
            file: 'end-user/FAQ.md',
            hint: 'Frequently asked questions'
          }
        ]
      }
    ]
  },
  {
    id: 'dev',
    label: 'Developer docs',
    groups: [
      {
        label: 'Get started',
        pages: [
          {
            slug: ['dev', 'overview'],
            title: 'Developer overview',
            file: 'dev/README.md',
            hint: 'Where to start contributing'
          },
          {
            slug: ['dev', 'build'],
            title: 'Build instructions',
            file: 'dev/BUILD.md',
            hint: 'Build Inkiva from source'
          },
          {
            slug: ['dev', 'debugging'],
            title: 'Debugging',
            file: 'dev/DEBUGGING.md',
            hint: 'Attach to main / renderer'
          }
        ]
      },
      {
        label: 'Architecture & code',
        pages: [
          {
            slug: ['dev', 'architecture'],
            title: 'Architecture',
            file: 'dev/ARCHITECTURE.md',
            hint: 'Process model & module layering'
          },
          {
            slug: ['dev', 'interface'],
            title: 'Interface',
            file: 'dev/INTERFACE.md',
            hint: 'Desktop shell, sidebar & editor layers'
          },
          {
            slug: ['dev', 'ipc'],
            title: 'IPC',
            file: 'dev/IPC.md',
            hint: 'Typed mt:: channel catalog'
          },
          {
            slug: ['dev', 'typescript'],
            title: 'TypeScript',
            file: 'dev/TYPESCRIPT.md',
            hint: 'TS conventions & strict mode'
          },
          {
            slug: ['dev', 'performance'],
            title: 'Performance',
            file: 'dev/PERFORMANCE.md',
            hint: 'Measurement workflow'
          }
        ]
      },
      {
        label: 'Release',
        pages: [
          {
            slug: ['dev', 'release'],
            title: 'Release process',
            file: 'dev/RELEASE.md',
            hint: 'Cut a public release'
          },
          {
            slug: ['dev', 'hotfix'],
            title: 'Hotfix release',
            file: 'dev/RELEASE_HOTFIX.md',
            hint: 'Patch a published release'
          }
        ]
      },
      {
        label: 'Project',
        pages: [
          {
            slug: ['dev', 'code-of-conduct'],
            title: 'Code of conduct',
            file: 'dev/CODE_OF_CONDUCT.md',
            hint: 'Community guidelines'
          },
          { slug: ['changelog'], title: 'Changelog', file: 'CHANGELOG.md', hint: 'Release history' }
        ]
      }
    ]
  },
  {
    id: 'zh',
    label: '中文使用手册',
    groups: [
      {
        label: '入门',
        pages: [
          {
            slug: ['zh-CN', 'introduction'],
            title: '中文使用手册',
            file: 'zh-CN/introduction.md',
            hint: '简介与入门'
          },
          {
            slug: ['zh-CN', 'installation'],
            title: '安装与升级',
            file: 'zh-CN/installation.md',
            hint: 'Windows 与 macOS 安装'
          },
          {
            slug: ['zh-CN', 'basics'],
            title: '基础操作',
            file: 'zh-CN/basics.md',
            hint: '文件、大纲、反向链接和历史'
          },
          {
            slug: ['zh-CN', 'editing'],
            title: '编辑详解',
            file: 'zh-CN/editing.md',
            hint: 'Markdown、表格、链接和恢复'
          },
          {
            slug: ['zh-CN', 'spelling'],
            title: '拼写检查',
            file: 'zh-CN/spelling.md',
            hint: '拼写和词典'
          },
          {
            slug: ['zh-CN', 'markdown-syntax'],
            title: 'Markdown 语法',
            file: 'zh-CN/markdown-syntax.md',
            hint: '常用标准语法'
          }
        ]
      },
      {
        label: '配置与快捷键',
        pages: [
          {
            slug: ['zh-CN', 'preferences'],
            title: '偏好设置',
            file: 'zh-CN/preferences.md',
            hint: '编辑器和应用设置'
          },
          {
            slug: ['zh-CN', 'key-bindings'],
            title: '快捷键',
            file: 'zh-CN/key-bindings.md',
            hint: '常用快捷键总览'
          },
          {
            slug: ['zh-CN', 'key-bindings-macos'],
            title: 'macOS 快捷键',
            file: 'zh-CN/key-bindings-macos.md',
            hint: 'macOS 的默认操作'
          },
          {
            slug: ['zh-CN', 'key-bindings-windows'],
            title: 'Windows 快捷键',
            file: 'zh-CN/key-bindings-windows.md',
            hint: 'Windows 的默认操作'
          },
          {
            slug: ['zh-CN', 'application-data-directory'],
            title: '应用数据目录',
            file: 'zh-CN/application-data-directory.md',
            hint: '偏好设置存放位置'
          },
          {
            slug: ['zh-CN', 'environment-variables'],
            title: '环境变量',
            file: 'zh-CN/environment-variables.md',
            hint: '调试与工具覆盖参数'
          },
          {
            slug: ['zh-CN', 'cli'],
            title: '命令行',
            file: 'zh-CN/cli.md',
            hint: '启动参数和帮助'
          }
        ]
      },
      {
        label: '导出、外观与图片',
        pages: [
          {
            slug: ['zh-CN', 'export'],
            title: '导出与打印',
            file: 'zh-CN/export.md',
            hint: 'PDF、HTML 与打印'
          },
          {
            slug: ['zh-CN', 'themes'],
            title: '外观主题',
            file: 'zh-CN/themes.md',
            hint: 'Light、Dark、Paper'
          },
          {
            slug: ['zh-CN', 'export-themes'],
            title: '导出主题',
            file: 'zh-CN/export-themes.md',
            hint: '导出 CSS 样式'
          },
          {
            slug: ['zh-CN', 'images'],
            title: '图片插入与恢复',
            file: 'zh-CN/images.md',
            hint: '相对路径、粘贴、缩放、重连'
          },
          {
            slug: ['zh-CN', 'image-uploader'],
            title: '图片上传器配置',
            file: 'zh-CN/image-uploader.md',
            hint: 'PicGo 的可选配置'
          }
        ]
      },
      {
        label: '更多',
        pages: [
          {
            slug: ['zh-CN', 'portable'],
            title: '便携模式',
            file: 'zh-CN/portable.md',
            hint: '独立应用数据目录'
          },
          {
            slug: ['zh-CN', 'faq'],
            title: '常见问题',
            file: 'zh-CN/faq.md',
            hint: '常见使用问题'
          }
        ]
      }
    ]
  }
]

/** A flat ordered list of every page across all tabs (for the pager + sitemap). */
export type DocPageWithCtx = DocPage & {
  tab: DocTabId
  tabLabel: string
  group: string
  href: string
}

export const ALL_PAGES: DocPageWithCtx[] = DOC_TABS.flatMap((tab) =>
  tab.groups.flatMap((group) =>
    group.pages.map<DocPageWithCtx>((page) => ({
      ...page,
      tab: tab.id,
      tabLabel: tab.label,
      group: group.label,
      href: '/docs/' + page.slug.join('/') + '/'
    }))
  )
)

const PAGE_BY_KEY = new Map<string, { page: DocPageWithCtx; index: number }>(
  ALL_PAGES.map((page, index) => [page.slug.join('/'), { page, index }])
)

/** Resolve a slug array (from a [...slug] route) to a registry entry, or null. */
export function findPageBySlug(segments: string[]): DocPageWithCtx | null {
  return PAGE_BY_KEY.get(segments.join('/'))?.page ?? null
}

/** prev / next page in the flat ordered list. */
export function neighborsFor(slug: string[]): {
  prev: DocPageWithCtx | null
  next: DocPageWithCtx | null
} {
  const entry = PAGE_BY_KEY.get(slug.join('/'))
  if (!entry) return { prev: null, next: null }
  const { index } = entry
  return {
    prev: index > 0 ? ALL_PAGES[index - 1] : null,
    next: index < ALL_PAGES.length - 1 ? ALL_PAGES[index + 1] : null
  }
}

/** First page of a given tab — used for `/docs` redirect and tab switch fallback. */
export function firstPageOfTab(tab: DocTabId): DocPageWithCtx {
  const p = ALL_PAGES.find((page) => page.tab === tab)
  if (!p) throw new Error(`No pages registered for tab "${tab}"`)
  return p
}
