import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures/muya';
import { editor } from '../helpers/selectors';

/**
 * Perf smoke: a sampled regression guard. The 10k-paragraph setContent
 * workload is intentionally large enough that any quadratic regression on
 * the render path lights up loudly; the wall-clock budgets are generous so
 * CI variance doesn't cause flakes.
 *
 * Observed numbers (local Chromium against the Vite dev server, M-class
 * macOS) at PR-4 baseline:
 *   - setContent(10000 paragraphs): ~20s wall clock. Yes, slow — muya
 *     re-renders synchronously per block via snabbdom and the Vite dev
 *     server adds unbundled-module overhead. Bundled production builds
 *     are materially faster, but we test against the dev server here.
 *   - scrollIntoView + last paragraph visible: well under 1s.
 *
 * Three timeouts are at play here — they intentionally differ; don't try
 * to "consolidate" them:
 *   - playwright.config `timeout: 30_000` — the default for every other
 *     spec. setContent(10k) alone routinely takes 15-25s on the Vite dev
 *     server, so the suite default is too tight for this spec.
 *   - `test.setTimeout(120_000)` below — the ceiling for each independent
 *     sample (setContent + scroll + assertions). Wide enough to ride out CI
 *     variance and still surface a runaway regression as a timeout.
 *   - the budget assertion further down — the actual per-sample setContent
 *     perf guard. The dev-server baseline is 60s locally and 90s on shared
 *     CI runners; a future production-bundle lane can tighten both budgets.
 *
 * Tagged @perf so the PR lane can use `--grep-invert "@perf"` while the
 * scheduled/manual performance lane keeps this coverage active.
 */
const PARAGRAPH_COUNT = 10_000;
const SAMPLE_COUNT = 20;

test.describe('stability / perf smoke @perf', () => {
    // Each sample has its own page and test timeout. Playwright's configured
    // workers schedule these independent samples without serially retaining
    // twenty 10k-paragraph DOM trees in one renderer.
    test.setTimeout(120_000);

    for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
        test(`setContent with 10k paragraphs sample ${sampleIndex + 1}/${SAMPLE_COUNT}`, async ({ page }) => {
            // 10k short paragraphs joined with the blank-line separator marked
            // requires for distinct paragraph nodes. Building the string from
            // inside page.evaluate avoids transferring a multi-MB payload
            // across the Playwright IPC channel for every retry.
            const result = await page.evaluate((paragraphCount) => {
                const lines: string[] = [];
                for (let i = 0; i < paragraphCount; i++)
                    lines.push(`paragraph ${i}`);
                const md = lines.join('\n\n');

                const t0 = performance.now();
                window.muya!.setContent(md);
                const t1 = performance.now();

                return { ms: t1 - t0, n: paragraphCount };
            }, PARAGRAPH_COUNT);

            const reportDirectory = process.env.PERF_RESULTS_DIR?.trim();
            if (reportDirectory) {
                fs.mkdirSync(reportDirectory, { recursive: true });
                fs.writeFileSync(
                    path.join(reportDirectory, `muya-perf-${String(sampleIndex).padStart(2, '0')}.json`),
                    `${JSON.stringify({
                        schemaVersion: 1,
                        suite: 'muya',
                        generatedAt: new Date().toISOString(),
                        environment: {
                            node: process.version,
                            platform: process.platform,
                            sample: String(sampleIndex + 1),
                        },
                        metrics: [{
                            name: 'muya.perf.set-content.10000',
                            unit: 'ms',
                            value: result.ms,
                        }],
                    }, null, 2)}\n`,
                    'utf8',
                );
            }

            const budget = process.env.CI ? 90_000 : 60_000;
            expect(result.ms, `setContent(${result.n} paragraphs) sample ${sampleIndex + 1} took ${result.ms.toFixed(0)}ms (budget ${budget}ms)`)
                .toBeLessThan(budget);

            // Confirm the DOM actually rendered the count we asked for.
            // `count()` walks the page synchronously — we use it once here
            // (not in a polling expect) because rendering completes inside
            // setContent's synchronous call path.
            const paragraphCount = await page.locator(editor.paragraph).count();
            expect(paragraphCount).toBe(result.n);

            // Scroll the last paragraph into view and assert it becomes
            // visible within 5s. The .last() chain selects the bottom of
            // the 10k-paragraph tree. 5s allows for a slow CI runner — the
            // task spec asks for 1s on a fast box; in practice paint after
            // scroll lands in tens of ms.
            const lastParagraph = page.locator(editor.paragraph).last();
            await lastParagraph.scrollIntoViewIfNeeded({ timeout: 5_000 });
            await expect(lastParagraph).toContainText(`paragraph ${result.n - 1}`, { timeout: 5_000 });
        });
    }
});
