import mitt, { type Emitter } from 'mitt'
import type { BusEvents } from '@shared/types/bus'

const emitter: Emitter<BusEvents> = mitt<BusEvents>()

export type { BusEvents } from '@shared/types/bus'
export default emitter
