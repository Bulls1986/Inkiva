import { describe, expect, it } from 'vitest'

import { BUFFERED_RENDERER_CHANNELS } from '../../../src/preload/startupChannels'

describe('renderer startup event buffering', () => {
  it('buffers every event that can arrive before the Vue listeners mount', () => {
    expect(BUFFERED_RENDERER_CHANNELS).toEqual([
      'mt::bootstrap-editor',
      'mt::load-state',
      'mt::ask-for-close',
      'mt::open-directory',
      'mt::update-object-tree'
    ])
  })
})
