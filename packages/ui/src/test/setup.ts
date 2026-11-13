// Render unit tests with the real design-system styles.
import './setup.css'

import { beforeEach } from 'vitest'

import { parkPointer } from '../../../../vitest.pointer.js'

// Every test renders in the same spot, so start each with the pointer parked
// away from it.
beforeEach(parkPointer)
