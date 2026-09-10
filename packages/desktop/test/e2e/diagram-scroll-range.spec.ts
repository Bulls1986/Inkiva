import { expect, test } from '@playwright/test'
import { launchWithMarkdown } from './helpers'

// Keep this graph large enough to exercise the same layout shape as the
// reported document: long labels, decision nodes, and a few back-edges. The
// source editor for a rendered diagram must not remain part of the scrollable
// overflow after the Mermaid preview has settled.
const LARGE_MERMAID_DOCUMENT = [
  '# Diagram scroll range',
  '',
  'The text after the diagram is the end of the document.',
  '',
  '```mermaid',
  'graph TD',
  '    A(["人工: 创建 Jira 任务 & 拖动状态至 \'方案制定\'"]) --> B("Jira Webhook 触发启动规划流水线")',
  '    B --> C["Jenkins: 启动容器 & 执行 opencode init 自动化工程扫描"]',
  '    C --> D["Jenkins/OpenCode: 结合截图/PRD 及 Agent.md 约束分析需求"]',
  '    D --> E{OpenCode: 检测到需求缺失或逻辑歧义?}',
  '    E -->|是: 遇到歧义| F[OpenCode: 抛出 NEED_HUMAN_CLARIFY 异常]',
  '    F --> G[Jenkins: 在 Jira 评论区发问并暂停流水线]',
  '    G -.-> H([人工: 答复评论并拖回方案制定状态])',
  '    H -.->|二次触发规划流水线| B',
  '    E -->|否: 逻辑闭环| I[OpenCode: 生成技术方案文档]',
  '    I --> J[Jenkins: 将方案回写至 Jira 描述或评论区]',
  '    J --> K[Jenkins: 规划流水线结束并等待人工确认]',
  '    K -.-> L([人工: 审核方案并拖动状态至方案执行])',
  '    L --> M(Jira Webhook 触发编码流水线)',
  '    M --> N[Jenkins: 启动 JetBrains MCP Server 提供本地上下文]',
  '    N --> O[OpenCode: 严格遵循方案文档与 Agent 约束编写代码]',
  '    O --> P{Jenkins/OpenCode: 运行本地编译与测试}',
  '    P -->|测试失败或编译报错| Q[OpenCode: 读取错误日志并自动修复代码]',
  '    Q --> O',
  '    P -->|测试通过| R[Jenkins: Git Commit 并 Push 到 GitLab 分支]',
  '    R --> S[GitLab: 自动创建 Merge Request]',
  '    S --> T[Jenkins: 变更 Jira 状态至 Code Review]',
  '    T --> U(GitLab MR 创建事件触发审查流水线)',
  '    U --> V[Jenkins: 调度 OpenCode 执行交叉审查]',
  '    V --> W[OpenCode: 检查代码规范与 PRD 覆盖率并发布评审意见]',
  '    W --> X[Jenkins: 审查完成并变更 Jira 状态至人工 MR]',
  '    X -.-> Y([人工: 综合评估评审意见后点击 Merge])',
  '    Y -.-> Z[OpenCode: 强制执行 summarize 沉淀本次变更至知识库]',
  '    Z -.-> END([任务流转结束])',
  '```',
  '',
  '## Document end',
  '',
  'This is the end of the document.'
].join('\n')

test.describe('Mermaid diagram scroll range', () => {
  test('does not include the hidden diagram source after preview rendering', async () => {
    const { app, page } = await launchWithMarkdown(LARGE_MERMAID_DOCUMENT)

    try {
      await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.mu-diagram-block').first()).toHaveClass(/mu-diagram-preview-only/)
      await page.waitForTimeout(300)

      const metrics = await page.evaluate(() => {
        const container = document.querySelector('.editor-component') as HTMLElement | null
        const root = container?.firstElementChild as HTMLElement | null
        const diagram = root?.querySelector('.mu-diagram-block') as HTMLElement | null
        const source = diagram?.querySelector('.mu-diagram-container') as HTMLElement | null
        const lastBlock = root?.lastElementChild as HTMLElement | null
        if (!container || !root || !source || !lastBlock) return null

        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        container.scrollTop = maxScrollTop
        const containerRect = container.getBoundingClientRect()
        const lastBlockRect = lastBlock.getBoundingClientRect()

        return {
          maxScrollTop,
          scrollTop: container.scrollTop,
          basePaddingBottom: Number.parseFloat(getComputedStyle(root).paddingBottom) || 0,
          bottomGap: containerRect.bottom - lastBlockRect.bottom,
          sourceOverflow: getComputedStyle(source).overflow,
          sourceComputedHeight: Number.parseFloat(getComputedStyle(source).height) || 0,
          sourceScrollHeight: source.scrollHeight
        }
      })

      expect(metrics).not.toBeNull()
      if (!metrics) throw new Error('Editor scroll metrics were not available')

      // At the end of the editor, only the intentional bottom padding may
      // remain below the final Markdown block. Hidden Mermaid source must not
      // add another scrollable region after it.
      expect(metrics.bottomGap).toBeLessThanOrEqual(metrics.basePaddingBottom + 40)
      expect(metrics.sourceOverflow).not.toBe('visible')
      expect(metrics.sourceComputedHeight).toBe(0)
      expect(metrics.scrollTop).toBe(metrics.maxScrollTop)
    } finally {
      await app.close()
    }
  })
})
