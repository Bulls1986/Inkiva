import type Renderer from './index';
import { CLASS_NAMES, VIRTUAL_BLOCK_MOUNT_EVENT } from '../../config';
import { getUniqueId } from '../../utils';
import { findScrollContainer, insertAfter, operateClassName } from '../../utils/dom';
import { loadImage } from '../../utils/image';

const INITIAL_IMAGE_LAYOUT_SETTLE_MS = 250;
const LAZY_LOAD_BOTTOM_MARGIN_PX = 64;

interface ILoadedImage {
    url: string;
    width: number;
    height: number;
}

function mountLoadedImage(
    imageText: HTMLElement,
    { url, width, height }: ILoadedImage,
    attrs: Record<string, string>,
    className?: string,
    imageClass?: string,
) {
    const img = document.createElement('img');
    img.src = url;
    if (attrs.alt)
        img.alt = attrs.alt.replace(/[`*{}[\]()#+\-.!_>~:|<$]/g, '');
    if (attrs.title)
        img.setAttribute('title', attrs.title);
    if (attrs.width && typeof attrs.width === 'number')
        img.setAttribute('width', attrs.width);

    if (attrs.height && typeof attrs.height === 'number')
        img.setAttribute('height', attrs.height);

    if (imageClass)
        img.classList.add(imageClass);

    imageText.setAttribute('data-image-load-ready', String(performance.now()));
    if (imageText.classList.contains(`${CLASS_NAMES.MU_INLINE_IMAGE}`)) {
        const imageContainer = imageText.querySelector(
            `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
        );
        const oldImage = imageContainer!.querySelector('img');
        if (oldImage)
            oldImage.remove();

        imageContainer!.appendChild(img);
        imageText.classList.remove(CLASS_NAMES.MU_IMAGE_LOADING);
        imageText.classList.add(CLASS_NAMES.MU_IMAGE_SUCCESS);
        // Tag small images on the first async load — otherwise the class
        // would only appear on the next re-render after the cache is
        // populated. See `image.ts` for why the class is kept as a theming
        // hook with no in-package CSS consumer; downstream stylesheets own
        // the visual treatment.
        if (width < 100 || height < 100)
            imageText.classList.add(CLASS_NAMES.MU_SMALL_IMAGE);
    }
    else {
        operateClassName(imageText, 'remove', CLASS_NAMES.MU_IMAGE_LOADING);
        insertAfter(img, imageText);
        if (className)
            operateClassName(imageText, 'add', className);
    }
}

function observeInViewport(
    id: string,
    callback: () => void,
    observerDelayMs = INITIAL_IMAGE_LAYOUT_SETTLE_MS,
    ownerRoot: HTMLElement | null = null,
): void {
    let observer: IntersectionObserver | null = null;
    let scrollContainer: HTMLElement | null = null;

    const isInScrollport = (imageText: HTMLElement): boolean => {
        const detectedScrollContainer = findScrollContainer(imageText);
        scrollContainer = detectedScrollContainer === imageText
            ? null
            : detectedScrollContainer;
        const targetRect = imageText.getBoundingClientRect();
        // Lightweight hosts and happy-dom can report no layout box even when
        // the observer explicitly says the target intersects. Keep that
        // fallback permissive; real editor placeholders have dimensions from
        // the image loading style, so the geometry guard below is active there.
        if (targetRect.width === 0 && targetRect.height === 0)
            return true;

        const viewportRect = scrollContainer?.getBoundingClientRect();
        const top = viewportRect?.top ?? 0;
        const bottom = (
            viewportRect?.bottom
            ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
        ) - LAZY_LOAD_BOTTOM_MARGIN_PX;
        const left = viewportRect?.left ?? 0;
        const right = viewportRect?.right
            ?? (typeof window !== 'undefined' ? window.innerWidth : 0);

        return (
            targetRect.bottom > top
            && targetRect.top < bottom
            && targetRect.right > left
            && targetRect.left < right
        );
    };

    const onIntersect: IntersectionObserverCallback = (entries) => {
        if (!entries.some(entry =>
            entry.isIntersecting || entry.intersectionRatio > 0)) {
            return;
        }

        const imageText = (typeof document !== 'undefined' ? document.getElementById(id) : null)
            ?? ownerRoot?.querySelector<HTMLElement>(`#${id}`)
            ?? null;
        if (!imageText || !imageText.isConnected || !isInScrollport(imageText))
            return;

        observer?.disconnect();

        imageText.removeAttribute('data-image-lazy');
        callback();
    };

    const installObserver = () => {
        const imageText = (typeof document !== 'undefined' ? document.getElementById(id) : null)
            ?? ownerRoot?.querySelector<HTMLElement>(`#${id}`)
            ?? null;
        if (!imageText)
            return;

        // A virtualized block may still be detached here. Keep the placeholder
        // cold and arm a one-shot mount listener; ScrollPage dispatches it only
        // after the owning top-level block has entered the live DOM.
        if (!imageText.isConnected) {
            imageText.setAttribute('data-image-lazy', 'pending');
            imageText.addEventListener(VIRTUAL_BLOCK_MOUNT_EVENT, installObserver, { once: true });
            return;
        }

        const detectedScrollContainer = findScrollContainer(imageText);
        scrollContainer = detectedScrollContainer === imageText
            ? null
            : detectedScrollContainer;
        observer = new IntersectionObserver(onIntersect, {
            root: scrollContainer,
            // Do not make a load decision in the editor's bottom edge. Native
            // window chrome and nested scrollports can differ by a few dozen
            // pixels; the guard keeps expensive image decode for content that
            // is comfortably visible instead of a transient boundary hit.
            rootMargin: `0px 0px -${LAZY_LOAD_BOTTOM_MARGIN_PX}px 0px`,
        });
        imageText.setAttribute('data-image-lazy', 'pending');
        observer.observe(imageText);
    };

    // Mark the placeholder immediately, even though observer registration is
    // delayed. The performance gate and the renderer both use this state to
    // distinguish an intentionally deferred image from an eager load.
    setTimeout(() => {
        const imageText = (typeof document !== 'undefined' ? document.getElementById(id) : null)
            ?? ownerRoot?.querySelector<HTMLElement>(`#${id}`)
            ?? null;
        imageText?.setAttribute('data-image-lazy', 'pending');
    }, 0);

    // The image wrapper is created during the same render pass as its
    // surrounding blocks. Wait for two paint boundaries before observing so
    // the editor scrollport and any block height hints have settled; otherwise
    // the initial IntersectionObserver delivery can see a transient geometry
    // and start every image load before the final layout is established.
    const scheduleObserverInstall = () => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(installObserver));
        }
        else {
            installObserver();
        }
    };

    // Diagram previews use the same initial window to settle their reserved
    // height before rendering a visible result. Do not let images make a
    // viewport decision during that transition: a wrapper can be visible
    // before a diagram settles and offscreen immediately afterwards.
    setTimeout(scheduleObserverInstall, observerDelayMs);
}

export default function loadImageAsync(
    this: Renderer,
    imageInfo: {
        isUnknownType: boolean;
        src: string;
    },
    attrs: Record<string, string>,
    className?: string,
    imageClass?: string,
    ownerRoot: HTMLElement | null = null,
) {
    const { src, isUnknownType } = imageInfo;
    let id: string;
    let isSuccess: boolean | undefined;
    let url: string | undefined;
    let w;
    let h;
    let isViewportLazy = false;

    const cached = this.loadImageMap.get(src);
    // Retry when the previous load failed: a transient failure should not
    // permanently poison the cache (marktext#3001 / #3010, commit bca2ed62).
    if (!cached || !cached.isSuccess) {
        id = getUniqueId();
        // Cache-bust local files so a fresh load reads the file off disk
        // instead of Chromium's in-memory image cache. Without this, replacing
        // an image on disk and running `invalidateImageCache()` (View → Reload
        // images) re-requests the same `file://` URL and the stale bitmap is
        // served. The cache key (`src`) stays unbusted so ordinary re-renders
        // still hit the cache; only the load/`<img>` URL carries the token.
        // `id` is monotonic (collision-free), unlike legacy muyajs's `?msec=`.
        const loadSrc = /^file:\/\//i.test(src)
            ? `${src}${src.includes('?') ? '&' : '?'}mucache=${id}`
            : src;
        const startLoad = () => {
            const imageText = document.getElementById(id);
            imageText?.setAttribute('data-image-load-start', String(performance.now()));
            loadImage(loadSrc, isUnknownType)
                .then(({ url, width, height }) => {
                    const imageText = document.getElementById(id);
                    if (imageText)
                        mountLoadedImage(imageText, { url, width, height }, attrs, className, imageClass);

                    if (this.urlMap.has(src))
                        this.urlMap.delete(src);

                    this.loadImageMap.set(src, {
                        id,
                        isSuccess: true,
                        url,
                        width,
                        height,
                    });
                })
                .catch(() => {
                    const imageText: HTMLElement | null = document.querySelector(`#${id}`);
                    if (imageText) {
                        operateClassName(imageText, 'remove', CLASS_NAMES.MU_IMAGE_LOADING);
                        operateClassName(imageText, 'add', CLASS_NAMES.MU_IMAGE_FAIL);
                        const image = imageText.querySelector('img');
                        if (image)
                            image.remove();
                    }

                    if (this.urlMap.has(src))
                        this.urlMap.delete(src);

                    this.loadImageMap.set(src, {
                        id,
                        isSuccess: false,
                    });
                });
        };

        if (typeof IntersectionObserver === 'undefined') {
            startLoad();
        }
        else {
            isViewportLazy = true;
            observeInViewport(id, startLoad, INITIAL_IMAGE_LAYOUT_SETTLE_MS, ownerRoot);
        }
    }
    else if (typeof IntersectionObserver !== 'undefined') {
        // A successful cache hit used to return an eager `<img>` for every
        // occurrence of the same source. In a document with repeated images,
        // that bypassed viewport lazy loading for all offscreen duplicates.
        // Give each occurrence its own lazy placeholder while retaining the
        // decoded source and dimensions from the shared cache.
        id = getUniqueId();
        isViewportLazy = true;
        const cachedImage: ILoadedImage = {
            url: cached.url ?? src,
            width: cached.width ?? 0,
            height: cached.height ?? 0,
        };
        observeInViewport(id, () => {
            const imageText = document.getElementById(id)
                ?? ownerRoot?.querySelector<HTMLElement>(`#${id}`)
                ?? null;
            if (imageText)
                mountLoadedImage(imageText, cachedImage, attrs, className, imageClass);
        }, 0, ownerRoot);
    }
    else {
        id = cached.id;
        isSuccess = cached.isSuccess;
        url = cached.url;
        w = cached.width;
        h = cached.height;
    }

    // marktext's loadImageAsync returns `domsrc` (the resolved URL — for
    // remote sources it's just the src, for local files it carries a cache-
    // busting query). Reference images need this so the rendered <img> uses
    // the resolved URL rather than the raw label-derived href.
    if (isViewportLazy)
        return { id, isSuccess, url, width: w, height: h, isViewportLazy: true };

    return { id, isSuccess, url, width: w, height: h };
}
