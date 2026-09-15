// @vitest-environment happy-dom

import type Renderer from '../index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import loadImageAsync from '../loadImageAsync';

// Narrow cast for the fake renderer used in every test below — it only
// implements the two Map fields loadImageAsync touches.
function asRenderer(r: IFakeRenderer | { loadImageMap: Map<string, unknown>; urlMap: Map<string, string> }): Renderer {
    return r as unknown as Renderer;
}

vi.mock('../../../utils/image', () => ({
    loadImage: vi.fn(() => new Promise(() => {})), // never resolves; we only test the sync decision
}));

vi.mock('../../../utils/dom', () => ({
    insertAfter: vi.fn(),
    operateClassName: vi.fn(),
    findScrollContainer: (node: HTMLElement) => {
        let current: HTMLElement | null = node;
        while (current && current !== document.body && current !== document.documentElement) {
            if (current.style.overflowY === 'auto' || current.style.overflowY === 'scroll')
                return current;
            current = current.parentElement;
        }

        return node;
    },
}));

interface IFakeRenderer {
    loadImageMap: Map<string, { id: string; isSuccess: boolean; url?: string; width?: number; height?: number }>;
    urlMap: Map<string, string>;
}

function makeRenderer(): IFakeRenderer {
    return {
        loadImageMap: new Map(),
        urlMap: new Map(),
    };
}

class TestIntersectionObserver {
    static instances: TestIntersectionObserver[] = [];
    private readonly _callback: IntersectionObserverCallback;
    private _target: Element | null = null;
    readonly options: IntersectionObserverInit;

    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
        this._callback = callback;
        this.options = options;
        TestIntersectionObserver.instances.push(this);
    }

    observe(target: Element) {
        this._target = target;
    }

    disconnect() {
        this._target = null;
    }

    trigger(isIntersecting: boolean) {
        if (!this._target) {
            return;
        }

        this._callback([
            {
                target: this._target,
                isIntersecting,
                intersectionRatio: isIntersecting ? 1 : 0,
            } as IntersectionObserverEntry,
        ], this as unknown as IntersectionObserver);
    }
}

async function waitForLazyObserver(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 250));
    if (typeof requestAnimationFrame === 'function') {
        await new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
}

beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    TestIntersectionObserver.instances = [];
});

// Regression for marktext commit bca2ed62 (#3001 / #3010):
// "Internal image cache isn't reset if failed to load".
// The previous cache-key check `!this.loadImageMap.has(src)` would skip
// re-loading even after a transient failure, poisoning the entry forever.
// The fix retries whenever the cached entry has `isSuccess === false`.
describe('loadImageAsync — failed cache should retry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the cached info when the previous load succeeded', async () => {
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();
        r.loadImageMap.set('https://example.com/a.png', {
            id: 'mu-cached-success',
            isSuccess: true,
            width: 100,
            height: 50,
        });

        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/a.png' },
            {},
        );

        expect(out).toEqual({
            id: 'mu-cached-success',
            isSuccess: true,
            width: 100,
            height: 50,
        });
        expect(loadImage).not.toHaveBeenCalled();
    });

    it('re-triggers loadImage when the previous load failed', async () => {
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();
        r.loadImageMap.set('https://example.com/b.png', {
            id: 'mu-cached-fail',
            isSuccess: false,
        });

        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/b.png' },
            {},
        );

        // a fresh id is generated for the new attempt
        expect(out.id).not.toBe('mu-cached-fail');
        // the loader was invoked again
        expect(loadImage).toHaveBeenCalledTimes(1);
        expect(loadImage).toHaveBeenCalledWith('https://example.com/b.png', false);
    });

    it('triggers loadImage when nothing is cached', async () => {
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();

        loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/c.png' },
            {},
        );

        expect(loadImage).toHaveBeenCalledTimes(1);
    });
});

// Regression: "Reload images" (`muya.invalidateImageCache()`) did not refresh
// a local image after its file was replaced on disk. The migration to the TS
// engine dropped the legacy muyajs `?msec=` cache-buster, so a fresh load after
// the cache was cleared re-requested the SAME `file://` URL — which Chromium
// serves from its in-memory image cache, keeping the stale bitmap. Each load
// of a `file://` source must therefore hit a unique URL so the browser
// re-reads the file. Remote (http/https) URLs are left untouched.
describe('loadImageAsync — viewport lazy loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not call loadImage until the image intersects the viewport', async () => {
        vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();
        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/lazy.png' },
            {},
        );

        const wrapper = document.createElement('span');
        wrapper.id = out.id;
        document.body.appendChild(wrapper);
        await waitForLazyObserver();

        expect(TestIntersectionObserver.instances).toHaveLength(1);
        expect(loadImage).not.toHaveBeenCalled();

        const observer = TestIntersectionObserver.instances[0];
        observer.trigger(false);
        await Promise.resolve();
        expect(loadImage).not.toHaveBeenCalled();

        observer.trigger(true);
        expect(loadImage).toHaveBeenCalledTimes(1);
        expect(document.getElementById(out.id)?.getAttribute('data-image-load-start'))
            .toMatch(/^\d+(\.\d+)?$/);
        expect(loadImage).toHaveBeenCalledWith(
            'https://example.com/lazy.png',
            false,
        );
    });

    it('uses the nearest editor scroll container as the observer root', async () => {
        vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
        const r = makeRenderer();
        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/scroll-root.png' },
            {},
        );

        const scrollContainer = document.createElement('div');
        scrollContainer.style.overflowY = 'auto';
        const wrapper = document.createElement('span');
        wrapper.id = out.id;
        scrollContainer.appendChild(wrapper);
        document.body.appendChild(scrollContainer);
        await waitForLazyObserver();

        expect(TestIntersectionObserver.instances[0]?.options.root).toBe(scrollContainer);
    });

    it('does not start a load when the observer reports a transient offscreen hit', async () => {
        vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();
        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/transient.png' },
            {},
        );

        const scrollContainer = document.createElement('div');
        scrollContainer.style.overflowY = 'auto';
        Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
            value: () => ({
                top: 0,
                bottom: 720,
                left: 0,
                right: 1280,
                width: 1280,
                height: 720,
            } as DOMRect),
        });
        const wrapper = document.createElement('span');
        wrapper.id = out.id;
        wrapper.classList.add('mu-inline-image', 'mu-image-loading');
        Object.defineProperty(wrapper, 'getBoundingClientRect', {
            value: () => ({
                top: 900,
                bottom: 1150,
                left: 0,
                right: 400,
                width: 400,
                height: 250,
            } as DOMRect),
        });
        scrollContainer.appendChild(wrapper);
        document.body.appendChild(scrollContainer);
        await waitForLazyObserver();

        TestIntersectionObserver.instances[0]?.trigger(true);
        expect(loadImage).not.toHaveBeenCalled();
        expect(wrapper.getAttribute('data-image-lazy')).toBe('pending');
    });

    it('keeps cached duplicate images lazy until they intersect the viewport', async () => {
        vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();
        r.loadImageMap.set('https://example.com/cached.png', {
            id: 'cached-image',
            isSuccess: true,
            url: 'data:image/png;base64,cached',
            width: 10,
            height: 10,
        });

        const out = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/cached.png' },
            {},
        );

        expect(out.isSuccess).toBeUndefined();
        expect(out.isViewportLazy).toBe(true);

        const wrapper = document.createElement('span');
        wrapper.id = out.id;
        wrapper.classList.add('mu-inline-image', 'mu-image-loading');
        const container = document.createElement('span');
        container.classList.add('mu-image-container');
        wrapper.appendChild(container);
        document.body.appendChild(wrapper);
        await waitForLazyObserver();

        const observer = TestIntersectionObserver.instances[0];
        observer.trigger(false);
        expect(container.querySelector('img')).toBeNull();

        observer.trigger(true);
        expect(loadImage).not.toHaveBeenCalled();
        expect(container.querySelector('img')?.getAttribute('src')).toBe(
            'data:image/png;base64,cached',
        );
        expect(wrapper.classList.contains('mu-image-success')).toBe(true);
    });
});
describe('loadImageAsync — local file cache-busting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('appends a cache-busting query to file:// sources', async () => {
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();

        loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'file:///tmp/pic.png' },
            {},
        );

        expect(loadImage).toHaveBeenCalledTimes(1);
        const loadedUrl = vi.mocked(loadImage).mock.calls[0][0];
        expect(loadedUrl).toMatch(/^file:\/\/\/tmp\/pic\.png\?[^=]+=[^&]+$/);
    });

    it('does NOT touch remote http(s) sources', async () => {
        const { loadImage } = await import('../../../utils/image');
        const r = makeRenderer();

        loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/a.png' },
            {},
        );

        expect(loadImage).toHaveBeenCalledWith('https://example.com/a.png', false);
    });

    it('uses a different URL on each fresh load so a cleared cache refetches from disk', async () => {
        const { loadImage } = await import('../../../utils/image');
        vi.mocked(loadImage).mockImplementation(url =>
            Promise.resolve({ url, width: 10, height: 10 }),
        );
        const r = makeRenderer();

        // First render loads the image and caches it.
        loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'file:///tmp/pic.png' },
            {},
        );
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        // The cache is keyed by the plain src so ordinary re-renders hit it.
        expect(r.loadImageMap.has('file:///tmp/pic.png')).toBe(true);

        // invalidateImageCache() clears the maps; the next render is a cache miss.
        r.loadImageMap.clear();
        loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'file:///tmp/pic.png' },
            {},
        );

        const firstUrl = vi.mocked(loadImage).mock.calls[0][0];
        const secondUrl = vi.mocked(loadImage).mock.calls[1][0];
        expect(secondUrl).not.toBe(firstUrl);
    });
});

// Regression for Copilot review on PR-11a (#224): the `mu-small-image`
// class added in `image.ts` was only applied on re-renders where the
// `loadImageMap` cache held the dimensions. On the *first* render of a
// fresh image (cache miss), `loadImageAsync` resolves asynchronously and
// mutates the DOM directly to add `mu-image-success` — but it never
// added `mu-small-image`, so a newly loaded small image only got the
// class on some unrelated subsequent re-render. The fix is to apply the
// class in `loadImageAsync`'s success handler too, where width/height
// are known.
describe('loadImageAsync — small image class on first load', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    async function runLoad(loadResult: { url: string; width: number; height: number }) {
        const { loadImage } = await import('../../../utils/image');
        vi.mocked(loadImage).mockResolvedValueOnce(loadResult as unknown as Awaited<ReturnType<typeof loadImage>>);

        const r = {
            loadImageMap: new Map(),
            urlMap: new Map(),
        };

        const { id } = loadImageAsync.call(
            asRenderer(r),
            { isUnknownType: false, src: 'https://example.com/fresh.png' },
            {},
        );

        // Stage the same DOM shape the renderer would have emitted:
        //   <span id={id} class="mu-inline-image mu-image-loading">
        //     <span class="mu-image-container"></span>
        //   </span>
        const wrapper = document.createElement('span');
        wrapper.id = id!;
        wrapper.classList.add('mu-inline-image', 'mu-image-loading');
        const container = document.createElement('span');
        container.classList.add('mu-image-container');
        wrapper.appendChild(container);
        document.body.appendChild(wrapper);

        // Flush the loadImage promise + the .then handler.
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        return wrapper;
    }

    it('adds `mu-small-image` when loaded width is below 100px', async () => {
        const wrapper = await runLoad({ url: 'data:image/png;base64,x', width: 60, height: 200 });
        expect(wrapper.classList.contains('mu-image-success')).toBe(true);
        expect(wrapper.classList.contains('mu-small-image')).toBe(true);
    });

    it('adds `mu-small-image` when loaded height is below 100px', async () => {
        const wrapper = await runLoad({ url: 'data:image/png;base64,x', width: 300, height: 80 });
        expect(wrapper.classList.contains('mu-image-success')).toBe(true);
        expect(wrapper.classList.contains('mu-small-image')).toBe(true);
    });

    it('does NOT add `mu-small-image` when both dimensions are >= 100', async () => {
        const wrapper = await runLoad({ url: 'data:image/png;base64,x', width: 400, height: 300 });
        expect(wrapper.classList.contains('mu-image-success')).toBe(true);
        expect(wrapper.classList.contains('mu-small-image')).toBe(false);
    });
});
