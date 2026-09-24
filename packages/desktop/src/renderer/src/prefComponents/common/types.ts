/**
 * Shared types for the preference page leaf control components.
 *
 * Each control accepts a description label, optional explanatory copy, an
 * external "more info" link, and an `onChange` callback. The value prop
 * name varies per control (bool: `bool`, textBox: `input`, others: `value`),
 * so individual controls extend the common base with their own value field.
 */

/** Common props shared by every leaf preference control. */
export type PreferenceEffectTiming = 'immediate' | 'window-reopen' | 'app-restart'

export type PreferenceChangeResult =
  | void
  | { ok: true; applied: Record<string, unknown> }
  | { ok: false; error: string }

export type PreferenceChangeHandler<T> = (
  value: T
) => PreferenceChangeResult | Promise<PreferenceChangeResult>

export interface PrefControlBaseProps {
  /** Label displayed before the input. */
  description?: string
  /** External URL opened when the info icon is clicked. */
  more?: string
  /** When true, the control renders disabled / under-development. */
  disable?: boolean
  /** When a persisted choice becomes effective. Defaults to immediate. */
  effectTiming?: PreferenceEffectTiming
}

/** Generic value-carrying control props. */
export interface PrefControlProps<T> extends PrefControlBaseProps {
  value: T
  onChange: PreferenceChangeHandler<T>
}

/** A `{label, value}` option for `<cur-select>` / similar dropdowns. */
export interface PrefSelectOption<T = string | number> {
  label: string
  value: T
}
