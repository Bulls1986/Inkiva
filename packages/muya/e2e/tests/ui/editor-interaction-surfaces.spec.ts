import { expect, test } from '../fixtures/muya';
import { floats, search } from '../helpers/selectors';

test.describe('editor interaction surfaces', () => {
    test('uses the shared elevated surface contract for Muya float roots', async ({ page }) => {
        const metrics = await page.locator(floats.wrapper).first().evaluate((element) => {
            const styles = getComputedStyle(element);
            return {
                background: styles.backgroundColor,
                border: styles.border,
                borderRadius: styles.borderRadius,
                boxShadow: styles.boxShadow,
            };
        });

        expect(metrics.background).toBe('rgb(255, 255, 255)');
        expect(metrics.border).toContain('1px');
        expect(metrics.borderRadius).toBe('6px');
        expect(metrics.boxShadow).toContain('28px');
    });

    test('keeps the current search match more prominent than other matches', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent('needle one needle two needle three\n');
            window.muya!.search('needle');
        });

        const colors = await page.locator(search.currentMatch + ', ' + search.match).evaluateAll((elements, currentMatch) => {
            const values = new Map<string, string>();
            for (const element of elements) {
                const key = element.matches(currentMatch) ? 'current' : 'other';
                values.set(key, getComputedStyle(element).backgroundColor);
            }
            return Object.fromEntries(values);
        }, search.currentMatch);

        expect(colors.current).toBeTruthy();
        expect(colors.other).toBeTruthy();
        expect(colors.current).not.toBe(colors.other);
    });
});
