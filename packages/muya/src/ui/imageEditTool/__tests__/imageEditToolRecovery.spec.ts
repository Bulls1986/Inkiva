// @vitest-environment happy-dom
import type { Muya } from '../../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditTool } from '..';
import EventCenter from '../../../event';

const original = '![original](assets/missing.png)';
function setup(action: (state: { src: string; alt: string; title: string }) => Promise<string>, changeSrc = true) {
    const eventCenter = new EventCenter();
    const editor = document.createElement('div');
    document.body.appendChild(editor);
    const muya = {
        domNode: editor,
        eventCenter,
        i18n: { t: (value: string) => value },
        ui: { shownFloat: new Set() },
        editor: { inlineRenderer: { renderer: { urlMap: new Map() } } },
    } as unknown as Muya;
    const block = { text: `prefix ${original} suffix`, replaceImage: vi.fn() };
    const reference = document.createElement('span');
    reference.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        right: 20,
        bottom: 20,
        width: 20,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => '',
    }) as DOMRect;
    editor.appendChild(reference);
    const tool = new ImageEditTool(muya, { imageAction: action });
    eventCenter.emit('muya-image-selector', {
        block,
        reference,
        imageInfo: {
            imageId: 'missing-image',
            token: {
                type: 'image',
                raw: original,
                range: { start: 7, end: 7 + original.length },
                attrs: { src: 'assets/missing.png', alt: 'original', title: '' },
            },
        },
    });
    const input = tool.container!.querySelector<HTMLInputElement>('input.src')!;
    if (changeSrc) {
        input.value = 'C:/relinked.png';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const confirm = () => tool.container!.querySelector<HTMLButtonElement>('button.link')!.click();
    return { tool, block, confirm, editor };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
describe('imageEditTool missing-image relink safety', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves original Markdown and offers retry on failed persistence', async () => {
        const action = vi.fn().mockRejectedValue(new Error('EACCES'));
        const { tool, block, confirm } = setup(action);
        const before = block.text;
        confirm();
        await tick();
        expect(action).toHaveBeenCalledTimes(1);
        expect(block.text).toBe(before);
        expect(block.replaceImage).not.toHaveBeenCalled();
        expect(tool.container!.querySelector('[role="alert"]')?.textContent).toContain('EACCES');
        tool.hide();
    });

    it('commits one replacement without transient loading Markdown', async () => {
        let finish!: (src: string) => void;
        const { tool, block, confirm } = setup(() => new Promise<string>((resolve) => {
            finish = resolve;
        }));
        confirm();
        expect(block.replaceImage).not.toHaveBeenCalled();
        finish('assets/relinked.png');
        await tick();
        expect(block.replaceImage).toHaveBeenCalledTimes(1);
        expect(block.replaceImage.mock.calls[0][1]).toEqual({
            src: 'assets/relinked.png',
            alt: 'original',
            title: '',
        });
        tool.hide();
    });

    it('edits local image alt text without needlessly copying its unchanged path', async () => {
        const action = vi.fn().mockResolvedValue('assets/new-copy.png');
        const { tool, block, confirm } = setup(action, false);
        tool.container!.querySelector('span.description a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const alt = tool.container!.querySelector<HTMLInputElement>('input.alt')!;
        alt.value = 'new alternative';
        alt.dispatchEvent(new Event('input', { bubbles: true }));
        confirm();
        await tick();
        expect(action).not.toHaveBeenCalled();
        expect(block.replaceImage).toHaveBeenCalledWith(expect.anything(), {
            src: 'assets/missing.png',
            alt: 'new alternative',
            title: '',
        });
        tool.hide();
    });

    it('keeps the operation single-flight while persistence is pending', async () => {
        let finish!: (src: string) => void;
        const action = vi.fn(() => new Promise<string>((resolve) => {
            finish = resolve;
        }));
        const { tool, block, confirm } = setup(action);
        confirm();
        confirm();
        expect(action).toHaveBeenCalledTimes(1);
        finish('assets/relinked.png');
        await tick();
        expect(block.replaceImage).toHaveBeenCalledTimes(1);
        tool.hide();
    });

    it('can commit to the original document token after the image DOM unmounts', async () => {
        let finish!: (src: string) => void;
        const { tool, block, confirm, editor } = setup(() =>
            new Promise<string>((resolve) => {
                finish = resolve;
            }));
        confirm();
        editor.remove();
        finish('assets/relinked.png');
        await tick();
        expect(block.replaceImage).toHaveBeenCalledTimes(1);
        expect(block.replaceImage.mock.calls[0][1].src).toBe('assets/relinked.png');
        tool.hide();
    });

    it('does not overwrite newer image edits after an asynchronous response', async () => {
        let finish!: (src: string) => void;
        const { tool, block, confirm } = setup(() => new Promise<string>((resolve) => {
            finish = resolve;
        }));
        confirm();
        block.text = 'prefix NEW CONTENT suffix';
        finish('assets/relinked.png');
        await tick();
        expect(block.replaceImage).not.toHaveBeenCalled();
        expect(block.text).toBe('prefix NEW CONTENT suffix');
        tool.hide();
    });
});
