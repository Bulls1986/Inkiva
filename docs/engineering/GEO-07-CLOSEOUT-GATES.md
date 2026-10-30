# GEO-07：Inkiva GEO 专项收口判定与持续监测交接

- 检查日期：2026-10-30
- 代码与文档基线：`develop` / `d334e029463a35cdac73f5b5f0120c6b19fcb9f0`
- 关联：[Issue #265](https://github.com/Bulls1986/Inkiva/issues/265)
- 结论：**首轮技术 GEO 交付已完成；整个 GEO 专项尚不满足严格的数据验收收口条件。外部目录审核不应阻塞工程收口。**
- 约束：本阶段仅记录和跟踪，没有更改编辑器产品功能、用户 Markdown 格式、网站线上实现或外部第三方投稿内容。

## 1. 已完成、可接受的交付

| 类别 | 完成事实 | 证据 |
|---|---|---|
| 官网技术 SEO | 静态输出、robots.txt、sitemap.xml、canonical、hreflang、JSON-LD、llms.txt 已建立 | GEO-01/03/04/06 |
| 生产站点访问 | 首页、robots、sitemap、llms 和两条中英文对比页面为 HTTP 200；域名、尾斜杠重定向正常 | GEO-06 |
| 品牌实体 | GitHub Description、Website、11 Topics 已核对；Inkiva/墨映命名一致 | GEO-06 |
| 内容 | 中英文 Inkiva / Typora / MarkText 对比及首页/FAQ/README 实体描述已上线 | GEO-03 |
| 发布版本 | v0.6.0 已发布，线上首页为 v0.6.0 | GEO-06 |
| GSC 初始基线 | Google 生成式 AI 功能在 2026-09-06～10-27 区间记录站点级 12 次曝光 | GEO-06 |
| Ahrefs 初始基线 | DR 0，679 backlinks，513 referring domains，AI Brand Radar 0 responses；大量低质链接已评估，未发现应立即 Disavow 的证据 | GEO-06，第 11、18～25 节 |
| 开源目录投稿 | Markdown Guide PR #316、Awesome Markdown PR #165 已提交；MarkdownList 用户确认已提交但尚未发现公开列表 | Issue #265、第三方 PR |

已完成事项不是“排名上涨”的证据。技术站点可抓取 ≠ Google 已收录全部新页面 ≠ AI 已主动推荐 Inkiva。

## 2. 当前仍影响严格收口的两道内部验收门禁（P0）

### Gate A：Search Console 索引与 Sitemap 事实核对

需要从已验证的 `sc-domain:inkiva.net` 的**专用报告**保留：

- Page indexing：准确的已收录/未收录数量，排除原因和受影响 URL。不要沿用首页混杂的 34/7 与 35/3 两组口径。
- Sitemaps：`https://www.inkiva.net/sitemap.xml` 的提交/处理结果、最近读取日期及发现页面数。
- URL Inspection：`/compare/typora/` 与 `/zh-CN/compare/typora/` 的索引状态；如符合条件而未收录，则正常请求抓取，不保证 Google 接受。
- 若旧 v0.5.0 snippet 仍在，按 URL Inspection 重新抓取首页和 changelog。

**本次受限于登录浏览器的会话来源**：浏览器读取接口返回“Browser access requires the originating browser context”；没有这些专用报告的新读数，不能声称 Gate A 通过。需要在支持浏览器连接的桌面会话或授权的 Search Console 数据连接中完成。

### Gate B：可重现的真实 AI 回答基线

使用 GEO-02 的固定 8 条中英文问题，在 ChatGPT Search、Gemini、Claude、Perplexity 的*无 Inkiva 历史上下文新会话*中重复测试。

每次记录：时间（含时区）、平台及模型版本、是否启用搜索、地区/语言、原始提示词、完整回答、引用 URL、是否提及 Inkiva、是否正确推荐、产品事实正确性、竞品及推荐顺序。推荐至少 2 次/提示词/平台（目标 4×8×2=64 个样本）。

指标分别计算：

- 品牌提及率 = 提及 Inkiva 的有效结果数 / 有效结果总数；
- 适配推荐率 = 面向符合产品支持范围的需求、实际推荐 Inkiva 的结果数 / 有效结果总数；
- 官网引用率 = 提及 Inkiva 且带官网/仓库/文档引用的结果数 / 提及 Inkiva 的结果数；
- 事实正确率与关键错误率（例如错误宣称 Linux/云协作/AI 功能）单独统计。

**不允许**以本会话、普通网页搜索排名、Ahrefs Brand Radar 数量或 GSC AI 曝光代替真实模型回答。结果未采集前不写虚构的 0% 或任何综合 GEO 分数。

## 3. 不阻塞工程收口的外部依赖

- [Markdown Guide 投稿 PR #316](https://github.com/mattcone/markdown-guide/pull/316)：2026-10-30 核对为 OPEN、mergeable，尚无审查意见。预览页先前已 HTTP 200，不能算正式上线。
- [Awesome Markdown 投稿 PR #165](https://github.com/BubuAnabelas/awesome-markdown/pull/165)：2026-10-30 核对为 OPEN、mergeable，等待审核。
- MarkdownList：此前用户确认已提交，本轮公开检查 `https://markdownlist.com/tools/inkiva` 仍为 HTTP 404，首页也无 Inkiva。该 URL 未经站方确认，仅用作查找候选，不等于被拒稿。后续以实际可公开访问的正式产品链接确认上线。
- 已设置独立的每日“仅变化通知”监测，跟踪两个 PR 的审核结果与 MarkdownList 是否确实公开上线。外部内容维护者的审查不是 Inkiva 仓库可自行完成的事项。

无需追加营销账户、买外链、购买 Ahrefs 套餐，也无需将第三方 PR 合并纳入 Inkiva 工程 CI 门禁。

## 4. P2 缺陷和已接受的评估结论

- 中文静态根节点 `<html lang="en">`：仍未修复。已有运行时脚本修正 `document.documentElement.lang`，但静态语义与无障碍不准确。应另起受控任务，遵守 AGENTS.md 的测试先行/架构要求，不能在 GEO 文档 PR 中顺带改生产代码；这不是已证实的 Google 排名惩罚。
- 大量 Ahrefs SPAM 标签外链：此前已检查 513 引用域名，完成不做 Disavow 的阶段判断。若无 Google Manual Action、佣金链接/人工操纵证据或异常持续下滑，不重复消耗成本排查每个垃圾源。
- GEO 的名次本身不是单一稳定的“榜单排名”。以实际站点收录、适配推荐率、可靠引用和长期趋势为准。

## 5. 明确的收口判定

### 第一层：GEO 技术交付

**完成。** GEO-01～06 的已实施产出已落地并保留验收资料。本阶段的文档 PR 合并后，可对技术 SEO/公开信息资产改造标记已收口。

### 第二层：GEO 首轮专项（严格验收）

**未完成。** Gate A 和 Gate B 都需要真实证据。两项可并行做，不需要等待外部 PR/目录收录；两项达到数据完整性验收后就可关闭本轮 GEO 专项，并移交持续效果跟踪。任何外部审核或流量上涨都不设为“必须等待”的工程门槛。

### 第三层：长期增长效果

**长期运营观察。** 建议在上述首轮严格验收完成后观察同一问题集与相同平台配置下的 30 天/60 天趋势（或至少两次可比的复测），这不应反向阻塞首轮工程收口，也不应保证排名提升。

## 6. 当前交接与下一动作

1. 在可以读取已登录 Search Console 专用页面的浏览器会话中执行 Gate A；逐条记录 7 个或实际数量的索引排除原因，而非猜测。
2. 完成四平台新会话测试并保留原始输出，执行 Gate B，形成有效基线，不追求立即“排名上涨”。
3. 两项 P0 完成后，在 Issue #265 更新证据、关闭首轮 GEO 专项，并把第三方 PR、MarkdownList 公开发布和 P2 HTML 语义独立保留为非阻塞跟踪。
4. 下一阶段开始前再核对 `develop`、AGENTS 和工程文档，不重复已经完成的技术审计。

## 7. 经验复盘

- 把工程可交付、搜索引擎索引、AI 回答及外部目录审核分成四类证据；一类验收成功不能替代另一类。
- SEO 不是堆关键词。重点应是实体一致性、可抓取页面、产品真实差异、可追踪的推荐引用和真实编辑场景。
- 对外 PR 的 mergeable 和 preview success 不等于上游正式收录；仅跟踪状态变化即可。
- 已知噪声（大量 nofollow 垃圾链接）在无处罚证据时不要反复调查或用 Disavow 增加风险。
