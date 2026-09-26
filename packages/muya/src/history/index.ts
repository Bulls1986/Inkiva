import type { JSONOpComponent, JSONOpList } from 'ot-json1';
import type { Muya } from '../muya';
import type { IAnchorFocusInfo, IHistorySelection } from '../selection/types';
import type { DocumentMutationKind } from '../state/tocChange';
import type { TState } from '../state/types';
import type { Nullable } from '../types';
import * as json1 from 'ot-json1';
import { asDoc } from '../state';
import { deepClone } from '../utils';

interface IOptions {
    delay: number;
    maxStack: number;
    userOnly: boolean;
}

interface IOperation {
    id: number;
    operation: JSONOpList;
    selection: Nullable<IHistorySelection>;
    // A `rebuild` entry is applied on undo/redo by dispatching its op to the
    // authoritative json state and rebuilding the live block tree wholesale
    // (ScrollPage.updateState) — NOT through `Editor.updateContents`'
    // incremental pick/drop DOM walker. The walker only handles a few op shapes
    // (single block insert at an index, text edit, checked/meta) and desyncs the
    // DOM from the json state for whole-document ops, so bulk replacements
    // (e.g. exiting source-code mode) are recorded as rebuild entries. The op
    // itself is a normal, fully-invertible ot-json1 op, so compose / transform /
    // invert continue to work unchanged.
    rebuild?: boolean;
}

interface IStack {
    undo: IOperation[];
    redo: IOperation[];
}

// A JSON-serializable view of an ISelection. The live endpoint `block`
// references are dropped — they are an in-memory optimization only.
// `Selection._setCursor` re-resolves the target block from each endpoint's
// `path` via `scrollPage.queryBlock(path)` when no block instance is present,
// so a path-only selection restores the caret losslessly.
type ISerializableAnchorFocusInfo = Pick<IAnchorFocusInfo, 'offset' | 'path'>;

interface ISerializableSelection {
    anchor: ISerializableAnchorFocusInfo;
    focus: ISerializableAnchorFocusInfo;
    isCollapsed: IHistorySelection['isCollapsed'];
    isSelectionInSameBlock: IHistorySelection['isSelectionInSameBlock'];
    direction: IHistorySelection['direction'];
    type: IHistorySelection['type'];
}

interface ISerializableOperation {
    operation: JSONOpList;
    selection: Nullable<ISerializableSelection>;
    rebuild?: boolean;
}

// The public, JSON-serializable shape returned by `getHistory` and accepted by
// `setHistory`. Mirrors the private `_stack` plus the bookkeeping pointers
// (`lastRecorded`, `selectionStack`) needed to round-trip the recording state.
export interface ISerializedHistory {
    stack: {
        undo: ISerializableOperation[];
        redo: ISerializableOperation[];
    };
    lastRecorded: number;
    selectionStack: (Nullable<ISerializableSelection>)[];
}

enum HistoryAction {
    UNDO = 'undo',
    REDO = 'redo',
}

const DEFAULT_OPTIONS = {
    delay: 750,
    maxStack: 100,
    userOnly: true,
};

export type TInputKind = 'insert' | 'delete';

export interface IUserOperationContinuation {
    entryId: number;
}

// Ordinary typing groups by adjacent input timing (`delay`) while the input
// pipeline can close a group when the editing direction switches. Whitespace is
// ordinary character input under US13 and therefore does not create a boundary.
export function classifyInputKind(inputType: string): Nullable<TInputKind> {
    if (inputType.startsWith('insert'))
        return 'insert';
    if (inputType.startsWith('delete'))
        return 'delete';
    return null;
}

export function shouldBreakUndoGroup(
    prevKind: Nullable<TInputKind>,
    kind: Nullable<TInputKind>,
    _data: Nullable<string>,
): boolean {
    if (kind == null)
        return false;
    return prevKind != null && prevKind !== kind;
}

function isStandaloneInput(inputType: string): boolean {
    return /^(?:insertFromPaste|insertFromDrop|insertParagraph|insertLineBreak|insertReplacementText|insertCompositionCommit)$/.test(inputType);
}

function containsContextualRemoval(operation: JSONOpList): boolean {
    for (const entry of operation) {
        if (Array.isArray(entry) && containsContextualRemoval(entry))
            return true;
        if (entry == null || typeof entry !== 'object' || Array.isArray(entry))
            continue;

        const component = entry as JSONOpComponent;
        // ot-json1's `removeOp` uses r:true as a sentinel when the removed
        // value is not embedded. A text/diagram op with that shape still
        // needs invertWithDoc to recover the deleted value.
        if (component.r === true && component.i === undefined)
            return true;
    }
    return false;
}

class History {
    private _lastRecorded: number = 0;
    private _lastInputKind: Nullable<TInputKind> = null;
    private _lastInputAt: number = 0;
    private _closeGroupAfterRecord: boolean = false;
    private _userOperationDepth: number = 0;
    private _userOperationUndoDepth: number = 0;
    private _continuationEntryId: Nullable<number> = null;
    private _nextOperationId: number = 1;
    private _ignoreChange: boolean = false;
    private _selectionStack: (Nullable<IHistorySelection>)[] = [];
    private _stack: IStack = {
        undo: [],
        redo: [],
    };

    private get _selection() {
        return this._muya.editor.selection;
    }

    constructor(private _muya: Muya, private _options: IOptions = DEFAULT_OPTIONS) {
        this._listen();
    }

    private _listen() {
        this._muya.eventCenter.on(
            'json-change',
            (change: {
                op: Nullable<JSONOpList>;
                source: string;
                prevDoc: TState[];
                doc: TState[];
                mutationKind?: DocumentMutationKind;
                inverseOp?: JSONOpList;
            }) => {
                const { op, source, mutationKind } = change;
                if (this._ignoreChange)
                    return;

                // The identity op (`null`) carries no change to record or
                // transform. It can still reach here through `json-change` when
                // queued ops compose away (e.g. IME edits, #4806); `_record`
                // would otherwise crash reading `op.length`.
                if (op == null)
                    return;

                if (!this._options.userOnly || source === 'user') {
                    // Read the lazy inverse only after the ignore/source checks.
                    // Undo/redo rebuilds suppress History and therefore avoid
                    // even the cheap operation-path inversion work.
                    const inverseOp = change.inverseOp;
                    this._record(
                        op,
                        inverseOp !== undefined
                        || mutationKind === 'text-only'
                        || mutationKind === 'diagram'
                            ? undefined
                            : change.prevDoc,
                        mutationKind,
                        inverseOp,
                    );
                }
                else {
                    this._transform(op);
                }
            },
        );
    }

    private _change(source: HistoryAction, dest: HistoryAction) {
        if (this._stack[source].length === 0)
            return;

        const { id, operation, selection, rebuild } = this._stack[source].pop()!;
        const inverseOperation = json1.type.invertWithDoc(
            operation,
            asDoc(this._muya.editor.jsonState.getState()),
        );

        this._stack[dest].push({
            id,
            operation: inverseOperation as JSONOpList,
            selection: this._selection.getSelection(),
            rebuild,
        });

        this.cutoff();
        this._ignoreChange = true;
        try {
            if (rebuild)
                this._muya.editor.rebuildContents(operation, selection, 'user');
            else
                this._muya.editor.updateContents(operation, selection, 'user');
        }
        finally {
            this._ignoreChange = false;
        }

        this._getLastSelection();
    }

    clear() {
        this._stack = { undo: [], redo: [] };
        this._selectionStack = [];
        this._userOperationDepth = 0;
        this._userOperationUndoDepth = 0;
        this._continuationEntryId = null;
        this.cutoff();
        this._ignoreChange = false;
    }

    getHistory(): ISerializedHistory {
        return {
            stack: {
                undo: this._stack.undo.map(op => this._toSerializableOperation(op)),
                redo: this._stack.redo.map(op => this._toSerializableOperation(op)),
            },
            lastRecorded: this._lastRecorded,
            selectionStack: this._selectionStack.map(sel =>
                this._toSerializableSelection(sel),
            ),
        };
    }

    setHistory(history: ISerializedHistory) {
        this._stack = {
            undo: history.stack.undo.map(op => this._fromSerializableOperation(op)),
            redo: history.stack.redo.map(op => this._fromSerializableOperation(op)),
        };
        // Restoring a tab/history snapshot is an operation boundary. The stored
        // timestamp remains serializable for compatibility, but it must never
        // let the first edit after reactivation merge into the outgoing session.
        this._userOperationDepth = 0;
        this._userOperationUndoDepth = this._stack.undo.length;
        this.cutoff();
        this._selectionStack = (history.selectionStack ?? []).map(sel =>
            this._fromSerializableSelection(sel),
        );
    }

    private _toSerializableOperation(op: IOperation): ISerializableOperation {
        return {
            operation: deepClone(op.operation),
            selection: this._toSerializableSelection(op.selection),
            ...(op.rebuild ? { rebuild: true } : {}),
        };
    }

    private _fromSerializableOperation(op: ISerializableOperation): IOperation {
        return {
            id: this._nextOperationId++,
            operation: deepClone(op.operation),
            selection: this._fromSerializableSelection(op.selection),
            ...(op.rebuild ? { rebuild: true } : {}),
        };
    }

    // Strip the live block references and keep only plain paths + offsets.
    private _toSerializableSelection(
        selection: Nullable<IHistorySelection>,
    ): Nullable<ISerializableSelection> {
        if (selection == null)
            return selection;

        return {
            anchor: { offset: selection.anchor.offset, path: deepClone(selection.anchor.path) },
            focus: { offset: selection.focus.offset, path: deepClone(selection.focus.path) },
            isCollapsed: selection.isCollapsed,
            isSelectionInSameBlock: selection.isSelectionInSameBlock,
            direction: selection.direction,
            type: selection.type,
        };
    }

    // Rebuild a selection without live block references. The block instances
    // are intentionally omitted: the only consumers of a restored selection
    // are `editor.updateContents` and `selection._setCursor`, both of which
    // re-resolve the target block from each endpoint's `path` via
    // `scrollPage.queryBlock` when no block instance is present. The return
    // type is `IHistorySelection`, whose endpoint `block` references are
    // optional, so the missing block fields are part of the contract rather
    // than an unsound cast over fabricated `ContentBlock` instances.
    private _fromSerializableSelection(
        selection: Nullable<ISerializableSelection>,
    ): Nullable<IHistorySelection> {
        if (selection == null)
            return selection;

        return {
            anchor: { offset: selection.anchor.offset, path: deepClone(selection.anchor.path) },
            focus: { offset: selection.focus.offset, path: deepClone(selection.focus.path) },
            isCollapsed: selection.isCollapsed,
            isSelectionInSameBlock: selection.isSelectionInSameBlock,
            direction: selection.direction,
            type: selection.type,
        };
    }

    cutoff() {
        this._lastRecorded = 0;
        this._lastInputKind = null;
        this._lastInputAt = 0;
        this._closeGroupAfterRecord = false;
    }

    /**
     * Start one explicit user operation. The outermost operation owns the
     * boundaries; nested helpers participate in the same undo item. This is also
     * used by IME composition, whose lifetime spans several DOM events.
     */
    beginUserOperation(): void {
        if (this._userOperationDepth === 0) {
            this._muya.editor.jsonState.flush();
            this.cutoff();
            this._userOperationUndoDepth = this._stack.undo.length;
        }
        this._userOperationDepth += 1;
    }

    /** Finish the current explicit user operation and close it on both sides. */
    endUserOperation(): void {
        if (this._userOperationDepth === 0)
            return;

        if (this._userOperationDepth === 1) {
            // Keep depth non-zero while flushing so _record() can force every
            // fragment emitted by this user action into the same history item.
            this._muya.editor.jsonState.flush();
            this._userOperationDepth = 0;
            this._userOperationUndoDepth = this._stack.undo.length;
            this.cutoff();
            return;
        }

        this._userOperationDepth -= 1;
    }

    runUserOperation<T>(operation: () => T): T {
        this.beginUserOperation();
        try {
            return operation();
        }
        finally {
            this.endUserOperation();
        }
    }

    /**
     * Capture the latest logical user operation so an async continuation can
     * later amend that exact Undo entry without holding a transaction open
     * across `await`.
     */
    captureUserOperationContinuation(): Nullable<IUserOperationContinuation> {
        this._muya.editor.jsonState.flush();
        const entry = this._stack.undo.at(-1);
        return entry ? { entryId: entry.id } : null;
    }

    /**
     * Run a synchronous continuation of an earlier user operation. If the
     * original entry still exists, `_record` folds the new mutation back into
     * that entry and OT-adjusts any newer Undo/Redo entries around it. If the
     * entry disappeared (undo/history restore), fall back to a safe standalone
     * operation instead of mutating an unrelated history item.
     */
    runUserOperationContinuation<T>(
        continuation: Nullable<IUserOperationContinuation>,
        operation: () => T,
    ): T {
        this._muya.editor.jsonState.flush();
        const entryExists = continuation != null
            && this._stack.undo.some(entry => entry.id === continuation.entryId);
        if (!entryExists)
            return this.runUserOperation(operation);

        this.cutoff();
        this._continuationEntryId = continuation.entryId;
        try {
            return operation();
        }
        finally {
            this._muya.editor.jsonState.flush();
            this._continuationEntryId = null;
            this.cutoff();
        }
    }

    /** Close a typing group after a user-only caret/selection movement. */
    closeCurrentOperation(): void {
        if (this._userOperationDepth > 0)
            return;
        this._muya.editor.jsonState.flush();
        this.cutoff();
    }

    markInputBoundary(inputType: string, data: Nullable<string>): void {
        if (this._userOperationDepth > 0)
            return;
        // A previous standalone input may still be queued in JSONState. Flush it
        // before accepting another operation so two user actions cannot collapse
        // into one json-change frame.
        if (this._closeGroupAfterRecord)
            this._muya.editor.jsonState.flush();

        if (isStandaloneInput(inputType)) {
            this._muya.editor.jsonState.flush();
            this.cutoff();
            this._closeGroupAfterRecord = true;
            return;
        }

        const kind = classifyInputKind(inputType);
        if (kind == null)
            return;

        const timestamp = Date.now();
        if (
            shouldBreakUndoGroup(this._lastInputKind, kind, data)
            || (this._lastInputAt > 0 && timestamp - this._lastInputAt > this._options.delay)
        ) {
            this._muya.editor.jsonState.flush();
            this.cutoff();
        }

        this._lastInputKind = kind;
        this._lastInputAt = timestamp;
    }

    private _getLastSelection() {
        this._selectionStack.push(this._selection.getSelection());

        if (this._selectionStack.length > 2)
            this._selectionStack.shift();

        return this._selectionStack.length === 2 ? this._selectionStack[0] : null;
    }

    private _record(
        op: JSONOpList,
        doc: TState[] | undefined,
        mutationKind?: DocumentMutationKind,
        inverseOp?: JSONOpList,
    ) {
        if (op.length === 0)
            return;

        let selection: Nullable<IHistorySelection> = null;
        let undoOperation: JSONOpList;
        if (inverseOp !== undefined) {
            // JSONState computed this directly against its authoritative
            // pre-change state. Prefer it over materializing `change.prevDoc`,
            // which deep-clones the complete document for structural edits.
            undoOperation = inverseOp;
        }
        else if (
            (mutationKind === 'text-only' || mutationKind === 'diagram')
            && !containsContextualRemoval(op)
        ) {
            // Text-unicode diffs and explicit string replacements carry their
            // deleted content in the operation. Inverting them directly keeps
            // the previous full AST out of the normal typing path.
            try {
                undoOperation = json1.type.invert(op) as JSONOpList;
            }
            catch {
                undoOperation = json1.type.invertWithDoc(op, asDoc(doc ?? [])) as JSONOpList;
            }
        }
        else {
            undoOperation = json1.type.invertWithDoc(op, asDoc(doc ?? [])) as JSONOpList;
        }

        if (
            this._continuationEntryId != null
            && this._mergeContinuation(this._continuationEntryId, op, undoOperation)
        ) {
            this.cutoff();
            return;
        }

        selection = this._getLastSelection();

        this._stack.redo = [];
        const timestamp = Date.now();
        const mergesIntoExplicitOperation
            = this._userOperationDepth > 0
                && this._stack.undo.length > this._userOperationUndoDepth;
        if (
            this._stack.undo.length > 0
            && (
                mergesIntoExplicitOperation
                || (
                    this._lastRecorded > 0
                    && timestamp - this._lastRecorded <= this._options.delay
                )
            )
        ) {
            const { operation: lastOperation, selection: lastSelection }
                = this._stack.undo.pop()!;
            selection = lastSelection;
            undoOperation = json1.type.compose(undoOperation, lastOperation) as JSONOpList;
        }

        if (!undoOperation || undoOperation.length === 0)
            return;

        this._stack.undo.push({
            id: this._nextOperationId++,
            operation: undoOperation,
            selection,
        });
        this._lastRecorded = this._closeGroupAfterRecord ? 0 : timestamp;
        this._closeGroupAfterRecord = false;

        if (this._stack.undo.length > this._options.maxStack)
            this._stack.undo.shift();
    }

    /**
     * Merge an async continuation back into an earlier logical user operation.
     * Newer Undo entries are first transformed against the continuation's
     * forward op. The forward op is then carried backwards through those
     * entries; its inverse at the target revision composes in front of the
     * target's existing inverse, yielding one lossless user Undo item.
     */
    private _mergeContinuation(
        entryId: number,
        forwardOperation: JSONOpList,
        immediateUndoOperation: JSONOpList,
    ): boolean {
        const targetIndex = this._stack.undo.findIndex(entry => entry.id === entryId);
        if (targetIndex < 0)
            return false;

        if (targetIndex === this._stack.undo.length - 1) {
            const target = this._stack.undo[targetIndex];
            target.operation = json1.type.compose(
                immediateUndoOperation,
                target.operation,
            ) as JSONOpList;
            transformStack(this._stack.redo, forwardOperation);
            return true;
        }

        let remoteOperation = forwardOperation;
        const updates: Array<{ index: number; operation: JSONOpList }> = [];
        for (let i = this._stack.undo.length - 1; i > targetIndex; i -= 1) {
            const oldOperation = this._stack.undo[i].operation;
            const transformedUndo = json1.type.transform(
                oldOperation,
                remoteOperation,
                'left',
            ) as JSONOpList;
            updates.push({ index: i, operation: transformedUndo });
            remoteOperation = json1.type.transform(
                remoteOperation,
                oldOperation,
                'right',
            ) as JSONOpList;
        }

        let continuationUndo: JSONOpList;
        try {
            continuationUndo = json1.type.invert(remoteOperation) as JSONOpList;
        }
        catch {
            return false;
        }

        for (const update of updates) {
            if (update.operation.length === 0)
                this._stack.undo.splice(update.index, 1);
            else
                this._stack.undo[update.index].operation = update.operation;
        }

        const target = this._stack.undo[targetIndex];
        target.operation = json1.type.compose(
            continuationUndo,
            target.operation,
        ) as JSONOpList;
        transformStack(this._stack.redo, forwardOperation);
        return true;
    }

    /**
     * Record a whole-document replacement (e.g. exiting source-code mode) as a
     * single, standalone undo boundary that is applied via a full block-tree
     * rebuild rather than the incremental DOM walker.
     *
     * The forward op (`prevDoc` -> current state) is dispatched to the json
     * state by the caller; here we only record its lossless inverse so the first
     * undo reverts the entire bulk change in one step. The entry never coalesces
     * with neighbouring edits: `_lastRecorded` is reset so the next ordinary
     * edit also starts its own boundary, and the redo stack is cleared.
     */
    recordRebuild(op: JSONOpList, prevDoc: TState[], selection: Nullable<IHistorySelection>) {
        if (op.length === 0)
            return;

        const undoOperation = json1.type.invertWithDoc(op, asDoc(prevDoc));

        if (!undoOperation || undoOperation.length === 0)
            return;

        this._stack.redo = [];
        this._stack.undo.push({
            id: this._nextOperationId++,
            operation: undoOperation,
            selection,
            rebuild: true,
        });
        // Force the next ordinary edit into its own undo entry — the bulk
        // replacement must not absorb a later keystroke (or vice versa).
        this.cutoff();

        if (this._stack.undo.length > this._options.maxStack)
            this._stack.undo.shift();
    }

    /**
     * Run `fn` (which dispatches a json-change) WITHOUT recording it on the undo
     * stack. The caller has already recorded the corresponding boundary itself
     * (see `recordRebuild`), so the forward apply must not be double-recorded.
     */
    suppressRecording(fn: () => void) {
        const previous = this._ignoreChange;
        this._ignoreChange = true;
        try {
            fn();
        }
        finally {
            this._ignoreChange = previous;
        }
    }

    canRedo() {
        return this._stack.redo.length > 0;
    }

    redo() {
        this._change(HistoryAction.REDO, HistoryAction.UNDO);
    }

    private _transform(op: JSONOpList) {
        transformStack(this._stack.undo, op);
        transformStack(this._stack.redo, op);
    }

    canUndo() {
        return this._stack.undo.length > 0;
    }

    undo() {
        this._change(HistoryAction.UNDO, HistoryAction.REDO);
    }
}

function transformStack(stack: IOperation[], operation: JSONOpList) {
    let remoteOperation = operation;

    for (let i = stack.length - 1; i >= 0; i -= 1) {
        const { operation: oldOperation } = stack[i];
        // TODO: need test.
        stack[i] = Object.assign(stack[i], {
            operation: json1.type.transform(oldOperation, remoteOperation, 'left'),
        });
        remoteOperation = json1.type.transform(
            remoteOperation,
            oldOperation,
            'right',
        )!;
        if (stack[i].operation.length === 0)
            stack.splice(i, 1);
    }
}

export default History;
