import type {
    IDiagramRenderOptions,
    IDiagramRenderResult,
} from './renderer';
import {
    disposeDiagram,
    normalizeDiagramSource,
    renderDiagram,
} from './renderer';

export const DEFAULT_DIAGRAM_RENDER_CONCURRENCY = 2;
const DEFAULT_DIAGRAM_CACHE_SIZE = 64;
const CACHE_KEY_VERSION = 1;
let nextDiagramMountId = 0;

export type DiagramRenderRequestOptions
    = Omit<IDiagramRenderOptions, 'target' | 'isCurrent'>;

export interface IDiagramRenderCoordinatorRequest {
    blockId: string;
    generation: number;
    target: HTMLElement;
    options: DiagramRenderRequestOptions;
    /** An optional owner-side guard, checked immediately before writeback. */
    isCurrent?: () => boolean;
}

export interface IDiagramRenderCoordinatorSuccess {
    status: 'success';
    key: string;
    generation: number;
    fromCache: boolean;
}

export interface IDiagramRenderCoordinatorError {
    status: 'error';
    key: string;
    generation: number;
    error: Error;
}

export interface IDiagramRenderCoordinatorCancelled {
    status: 'cancelled';
    key: string;
    generation: number;
}

export type IDiagramRenderCoordinatorOutcome
    = | IDiagramRenderCoordinatorSuccess
        | IDiagramRenderCoordinatorError
        | IDiagramRenderCoordinatorCancelled;

export interface IDiagramRenderCoordinatorHandle {
    readonly blockId: string;
    readonly generation: number;
    readonly key: string;
    readonly promise: Promise<IDiagramRenderCoordinatorOutcome>;
    cancel: () => void;
    dispose: () => void;
}

export interface IDiagramRenderCoordinatorConstructorOptions {
    /** Number of CPU-heavy renderer jobs allowed to execute concurrently. */
    maxConcurrent?: number;
    /** Bound the in-memory snapshot cache so repeated documents cannot grow it forever. */
    maxCacheEntries?: number;
    /** Injectable adapter used by unit tests and future renderer adapters. */
    render?: (options: IDiagramRenderOptions) => Promise<IDiagramRenderResult>;
}

interface IDiagramRenderSnapshot {
    kind: 'svg' | 'html';
    value: string;
    bindFunctions?: (element: HTMLElement) => void;
}

interface IDiagramIdBinding {
    element: Element;
    originalId: string;
    mountedId: string;
}

interface IDiagramRenderJob {
    id: number;
    blockId: string;
    generation: number;
    target: HTMLElement;
    options: DiagramRenderRequestOptions;
    key: string;
    isCurrent?: () => boolean;
    resolve: (outcome: IDiagramRenderCoordinatorOutcome) => void;
    settled: boolean;
    cancelled: boolean;
}

/**
 * Build the cache identity from every currently supported render input.
 *
 * Source line endings are transport details, while the renderer's themes,
 * PlantUML endpoint, and sequence style all change the rendered output. Keep
 * those values explicit in the key so adding a new render-affecting option
 * cannot silently reuse a stale diagram.
 */
export function createDiagramRenderCacheKey(
    options: DiagramRenderRequestOptions,
): string {
    return JSON.stringify({
        version: CACHE_KEY_VERSION,
        type: options.type,
        source: normalizeDiagramSource(options.code),
        config: {
            mermaidTheme: options.mermaidTheme,
            vegaTheme: options.vegaTheme,
            plantumlServer: options.plantumlServer ?? '',
            sequenceTheme: options.sequenceTheme,
        },
    });
}

function toError(error: unknown): Error {
    if (error instanceof Error)
        return error;

    return new Error(String(error));
}

function normalizeLimit(value: number | undefined, fallback: number): number {
    if (value == null || !Number.isFinite(value))
        return fallback;

    return Math.max(1, Math.floor(value));
}

function remapReference(value: string, ids: Map<string, string>): string {
    return value.replace(
        /url\((['"]?)#([^'")]+)\1\)/g,
        (reference, quote: string, originalId: string) => {
            const mountedId = ids.get(originalId);
            return mountedId ? `url(${quote}#${mountedId}${quote})` : reference;
        },
    );
}

function remapDiagramIds(target: HTMLElement): IDiagramIdBinding[] {
    const bindings: IDiagramIdBinding[] = [];
    const ids = new Map<string, string>();

    target.querySelectorAll('[id]').forEach((element) => {
        const originalId = element.getAttribute('id');
        if (!originalId || ids.has(originalId))
            return;

        const mountedId = `${originalId}-muya-${++nextDiagramMountId}`;
        ids.set(originalId, mountedId);
        bindings.push({ element, originalId, mountedId });
        element.setAttribute('id', mountedId);
    });

    if (ids.size === 0)
        return bindings;

    target.querySelectorAll('*').forEach((element) => {
        for (const attribute of Array.from(element.attributes)) {
            if (attribute.name === 'id')
                continue;

            if (attribute.name === 'href' || attribute.name === 'xlink:href') {
                const originalId = attribute.value.startsWith('#')
                    ? attribute.value.slice(1)
                    : '';
                const mountedId = ids.get(originalId);
                if (mountedId)
                    attribute.value = `#${mountedId}`;
                continue;
            }

            if (attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby') {
                attribute.value = attribute.value
                    .split(/\s+/)
                    .map(id => ids.get(id) ?? id)
                    .join(' ');
                continue;
            }

            attribute.value = remapReference(attribute.value, ids);
        }
    });

    target.querySelectorAll('style').forEach((style) => {
        style.textContent = remapReference(style.textContent ?? '', ids);
    });

    return bindings;
}

/**
 * Coordinates all live diagram preview renders for one Muya instance.
 *
 * The engines render into a detached target and are converted to a replayable
 * snapshot before the owner target is touched. That gives the coordinator one
 * writeback boundary: a cancelled, superseded, or disposed job can finish in
 * the background, but it can never commit its result to the editor.
 */
export class DiagramRenderCoordinator {
    private readonly _maxConcurrent: number;
    private readonly _maxCacheEntries: number;
    private readonly _renderDiagram: (
        options: IDiagramRenderOptions,
    ) => Promise<IDiagramRenderResult>;

    private readonly _queue: IDiagramRenderJob[] = [];
    private readonly _latestByBlock = new Map<string, IDiagramRenderJob>();
    private readonly _cache = new Map<string, IDiagramRenderSnapshot>();
    private readonly _inFlight = new Map<string, Promise<IDiagramRenderSnapshot>>();
    private _activeCount = 0;
    private _nextJobId = 0;
    private _disposed = false;

    constructor(options: IDiagramRenderCoordinatorConstructorOptions = {}) {
        this._maxConcurrent = normalizeLimit(
            options.maxConcurrent,
            DEFAULT_DIAGRAM_RENDER_CONCURRENCY,
        );
        this._maxCacheEntries = normalizeLimit(
            options.maxCacheEntries,
            DEFAULT_DIAGRAM_CACHE_SIZE,
        );
        this._renderDiagram = options.render ?? renderDiagram;
    }

    get activeCount() {
        return this._activeCount;
    }

    get queuedCount() {
        return this._queue.filter(job => !job.cancelled && !job.settled).length;
    }

    get cacheSize() {
        return this._cache.size;
    }

    /**
     * Schedule a render. Scheduling a newer request for the same block
     * immediately cancels its predecessor, including a job already running.
     */
    schedule(request: IDiagramRenderCoordinatorRequest): IDiagramRenderCoordinatorHandle {
        const key = createDiagramRenderCacheKey(request.options);
        let resolve!: (outcome: IDiagramRenderCoordinatorOutcome) => void;
        const promise = new Promise<IDiagramRenderCoordinatorOutcome>((done) => {
            resolve = done;
        });

        const job: IDiagramRenderJob = {
            id: ++this._nextJobId,
            blockId: request.blockId,
            generation: request.generation,
            target: request.target,
            options: request.options,
            key,
            isCurrent: request.isCurrent,
            resolve,
            settled: false,
            cancelled: false,
        };

        if (this._disposed) {
            job.cancelled = true;
            this._settle(job, {
                status: 'cancelled',
                key,
                generation: job.generation,
            });
        }
        else {
            const previous = this._latestByBlock.get(job.blockId);
            previous && this._cancelJob(previous);
            this._latestByBlock.set(job.blockId, job);
            this._queue.push(job);
            this._pump();
        }

        return {
            blockId: job.blockId,
            generation: job.generation,
            key,
            promise,
            cancel: () => this._cancelJob(job),
            dispose: () => this._cancelJob(job),
        };
    }

    cancel(blockId: string) {
        const job = this._latestByBlock.get(blockId);
        if (job)
            this._cancelJob(job);
    }

    dispose(blockId?: string) {
        if (blockId !== undefined) {
            this.cancel(blockId);
            return;
        }

        if (this._disposed)
            return;

        this._disposed = true;
        for (const job of this._latestByBlock.values())
            this._cancelJob(job);
        this._latestByBlock.clear();
        this._queue.length = 0;
        this._cache.clear();
    }

    private _pump() {
        while (!this._disposed && this._activeCount < this._maxConcurrent) {
            const job = this._queue.shift();
            if (!job)
                return;
            if (job.cancelled || job.settled)
                continue;
            if (!this._isCurrent(job)) {
                this._cancelJob(job);
                continue;
            }

            this._activeCount++;
            void this._run(job).catch((error: unknown) => {
                if (this._isCurrent(job)) {
                    this._settle(job, {
                        status: 'error',
                        key: job.key,
                        generation: job.generation,
                        error: toError(error),
                    });
                }
                else {
                    this._cancelJob(job);
                }
            }).finally(() => {
                this._activeCount--;
                this._pump();
            });
        }
    }

    private async _run(job: IDiagramRenderJob) {
        if (!this._isCurrent(job)) {
            this._cancelJob(job);
            return;
        }

        try {
            const cached = this._getCached(job.key);
            const snapshot = cached ?? await this._getOrCreateSnapshot(job.key, job.options);
            const fromCache = cached !== undefined;

            if (!this._isCurrent(job)) {
                this._cancelJob(job);
                return;
            }

            this._applySnapshot(job.target, snapshot);
            this._settle(job, {
                status: 'success',
                key: job.key,
                generation: job.generation,
                fromCache,
            });
        }
        catch (error) {
            if (this._isCurrent(job)) {
                this._settle(job, {
                    status: 'error',
                    key: job.key,
                    generation: job.generation,
                    error: toError(error),
                });
            }
            else {
                this._cancelJob(job);
            }
        }
    }

    private _isCurrent(job: IDiagramRenderJob): boolean {
        if (this._disposed || job.cancelled || job.settled)
            return false;
        if (this._latestByBlock.get(job.blockId) !== job)
            return false;
        if (!job.isCurrent)
            return true;

        try {
            return job.isCurrent();
        }
        catch {
            return false;
        }
    }

    private _cancelJob(job: IDiagramRenderJob) {
        if (job.settled)
            return;

        job.cancelled = true;
        if (this._latestByBlock.get(job.blockId) === job)
            this._latestByBlock.delete(job.blockId);
        this._settle(job, {
            status: 'cancelled',
            key: job.key,
            generation: job.generation,
        });
    }

    private _settle(job: IDiagramRenderJob, outcome: IDiagramRenderCoordinatorOutcome) {
        if (job.settled)
            return;

        job.settled = true;
        if (this._latestByBlock.get(job.blockId) === job)
            this._latestByBlock.delete(job.blockId);
        job.resolve(outcome);
    }

    private _getCached(key: string): IDiagramRenderSnapshot | undefined {
        const snapshot = this._cache.get(key);
        if (!snapshot)
            return undefined;

        // Map insertion order is used as a small LRU: move a hit to the tail.
        this._cache.delete(key);
        this._cache.set(key, snapshot);
        return snapshot;
    }

    private _setCached(key: string, snapshot: IDiagramRenderSnapshot) {
        if (this._disposed)
            return;

        this._cache.delete(key);
        this._cache.set(key, snapshot);
        while (this._cache.size > this._maxCacheEntries)
            this._cache.delete(this._cache.keys().next().value!);
    }

    private _getOrCreateSnapshot(
        key: string,
        options: DiagramRenderRequestOptions,
    ): Promise<IDiagramRenderSnapshot> {
        const existing = this._inFlight.get(key);
        if (existing)
            return existing;

        const promise = this._renderSnapshot(options)
            .then((snapshot) => {
                this._setCached(key, snapshot);
                return snapshot;
            })
            .finally(() => {
                if (this._inFlight.get(key) === promise)
                    this._inFlight.delete(key);
            });
        this._inFlight.set(key, promise);
        return promise;
    }

    private async _renderSnapshot(
        options: DiagramRenderRequestOptions,
    ): Promise<IDiagramRenderSnapshot> {
        const stagingTarget = document.createElement('div');
        const result = await this._renderDiagram({
            ...options,
            target: stagingTarget,
        });

        try {
            if (options.type === 'mermaid') {
                return {
                    kind: 'svg',
                    value: result.svg ?? '',
                    bindFunctions: result.bindFunctions,
                };
            }

            result.commit?.();
            return {
                kind: 'html',
                value: stagingTarget.innerHTML,
            };
        }
        finally {
            result.dispose();
        }
    }

    private _applySnapshot(target: HTMLElement, snapshot: IDiagramRenderSnapshot) {
        disposeDiagram(target);
        target.innerHTML = snapshot.value;
        const idBindings = remapDiagramIds(target);
        if (snapshot.kind !== 'svg' || !snapshot.bindFunctions)
            return;

        // Mermaid's bindFunctions resolve the original IDs through
        // document.querySelector. Keep the mounted IDs unique for the live
        // document, but expose the original IDs during this synchronous bind
        // step so cached diagrams retain their interactions.
        idBindings.forEach(({ element, originalId }) => {
            element.setAttribute('id', originalId);
        });
        try {
            snapshot.bindFunctions(target);
        }
        finally {
            idBindings.forEach(({ element, mountedId }) => {
                element.setAttribute('id', mountedId);
            });
        }
    }
}

const coordinators = new WeakMap<object, DiagramRenderCoordinator>();

/** Keep one bounded cache/queue per Muya owner without retaining destroyed owners. */
export function getDiagramRenderCoordinator(owner: object): DiagramRenderCoordinator {
    let coordinator = coordinators.get(owner);
    if (!coordinator) {
        coordinator = new DiagramRenderCoordinator();
        coordinators.set(owner, coordinator);
    }

    return coordinator;
}
