export class TokenWorklist<T> {
    private _cursor = 0;
    private readonly _prepended: T[] = [];

    constructor(private readonly _tokens: readonly T[]) {}

    take(): T | undefined {
        if (this._prepended.length)
            return this._prepended.pop();

        if (this._cursor >= this._tokens.length)
            return undefined;

        const token = this._tokens[this._cursor];
        this._cursor += 1;
        return token;
    }

    peek(): T | undefined {
        if (this._prepended.length)
            return this._prepended[this._prepended.length - 1];

        return this._cursor < this._tokens.length
            ? this._tokens[this._cursor]
            : undefined;
    }

    prepend(tokens: readonly T[]) {
        for (let index = tokens.length - 1; index >= 0; index -= 1)
            this._prepended.push(tokens[index]);
    }
}
