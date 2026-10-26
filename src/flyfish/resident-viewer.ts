import type { ViewerMountOptions, ViewerState } from "@file-viewer/web"

export interface ResidentSurface<Target> {
  attach(target: Target): void
  park(): void
  update(source: ViewerMountOptions): Promise<void>
  state(): ViewerState
  subscribe(listener: (state: ViewerState) => void): () => void
  estimateBytes(source: ViewerMountOptions): number
  destroy(): void
}

export interface ResidentRequest {
  key: string
  scope: string
  source: ViewerMountOptions
  retain: boolean
  estimatedBytes: number
}

export interface ResidentSnapshot {
  state: ViewerState
  instance: number
  cacheHit: boolean
  readyMs: number | null
}

export interface ResidentLease {
  release(): void
}

interface Entry<Target> {
  id: number
  surface: ResidentSurface<Target>
  request?: ResidentRequest
  state: ViewerState
  options: string
  lastUsed: number
  cost: number
  serial: number
  loading: boolean
  alive: boolean
  lease?: symbol
  listener?: (snapshot: ResidentSnapshot) => void
  cacheHit: boolean
  started: number
  readyMs: number | null
  unsubscribe: () => void
}

export const RESIDENT_LIMITS = {
  entries: 3,
  bytes: 64 * 1024 * 1024,
  idleMs: 5 * 60 * 1000,
}

/** A tab-local LRU of live surfaces, not a persistent or authorization cache. */
export class ResidentViewerPool<Target> {
  private entries: Entry<Target>[] = []
  private active?: Entry<Target>
  private scope?: string
  private sequence = 0
  private counters = { created: 0, destroyed: 0, reused: 0, loads: 0 }
  private create: () => ResidentSurface<Target>
  private now: () => number
  private limits: typeof RESIDENT_LIMITS

  constructor(
    create: () => ResidentSurface<Target>,
    options: {
      now?: () => number
      limits?: Partial<typeof RESIDENT_LIMITS>
    } = {},
  ) {
    this.create = create
    this.now = options.now ?? Date.now
    this.limits = { ...RESIDENT_LIMITS, ...options.limits }
  }

  warm() {
    if (!this.entries.length) this.makeEntry()
  }

  private makeEntry() {
    const surface = this.create()
    const entry: Entry<Target> = {
      id: ++this.sequence,
      surface,
      state: surface.state(),
      options: "",
      lastUsed: this.now(),
      cost: 0,
      serial: 0,
      loading: false,
      alive: true,
      cacheHit: false,
      started: this.now(),
      readyMs: null,
      unsubscribe: () => {},
    }
    this.entries.push(entry)
    this.counters.created++
    entry.unsubscribe = surface.subscribe((state) => {
      if (!entry.alive || !entry.request) return
      entry.state = state
      this.notify(entry)
    })
    surface.park()
    return entry
  }

  acquire(
    target: Target,
    request: ResidentRequest,
    listener: (snapshot: ResidentSnapshot) => void,
  ): ResidentLease {
    if (this.scope !== undefined && this.scope !== request.scope) this.clear()
    this.scope = request.scope
    this.sweep()
    if (this.active?.lease) this.release(this.active, this.active.lease)

    let entry = this.entries.find((item) => item.request?.key === request.key)
    if (entry?.state.error && !entry.loading) {
      this.remove(entry)
      entry = undefined
    }
    const hit = !!entry
    const options = JSON.stringify(request.source.options ?? {})
    const needsUpdate = !entry || entry.options !== options
    if (!entry) {
      entry = this.entries.find((item) => !item.request)
      if (!entry && this.entries.length >= this.limits.entries) {
        const oldest = this.inactive()[0]
        if (oldest && !oldest.loading && !oldest.state.loading) {
          // The controller survives eviction; its SDK disposes the old document.
          entry = oldest
        } else if (oldest) {
          this.remove(oldest)
        }
      }
      entry ??= this.makeEntry()
    }

    const token = Symbol("preview-lease")
    entry.request = request
    entry.lease = token
    entry.listener = listener
    entry.cacheHit = hit
    entry.started = this.now()
    entry.lastUsed = this.now()
    entry.cost = hit
      ? Math.max(entry.cost, request.estimatedBytes)
      : request.estimatedBytes
    entry.readyMs = hit && entry.state.ready && !entry.loading ? 0 : null
    this.active = entry
    entry.surface.attach(target)
    if (hit) this.counters.reused++
    if (needsUpdate) this.load(entry, options)
    else this.notify(entry)
    this.sweep()
    return { release: () => this.release(entry!, token) }
  }

  private load(entry: Entry<Target>, options: string) {
    const serial = ++entry.serial
    entry.options = options
    entry.loading = true
    entry.readyMs = null
    entry.cost = entry.request!.estimatedBytes
    entry.state = { ...entry.state, error: null, loading: true, ready: false }
    this.counters.loads++
    this.notify(entry)
    const source = entry.request!.source
    // Also catch a synchronous adapter failure; stale completions own no lease.
    void Promise.resolve()
      .then(() => {
        if (!entry.alive || entry.serial !== serial) return
        return entry.surface.update(source)
      })
      .then(() => {
        if (!entry.alive || entry.serial !== serial) return
        entry.loading = false
        entry.state = entry.surface.state()
        entry.cost = entry.surface.estimateBytes(source)
        this.notify(entry)
        if (this.active !== entry && !this.canRetain(entry)) this.remove(entry)
        this.sweep()
      })
      .catch((error: unknown) => {
        if (!entry.alive || entry.serial !== serial) return
        entry.loading = false
        entry.state = { ...entry.state, loading: false, ready: false, error }
        this.notify(entry)
        if (this.active !== entry) this.remove(entry)
      })
  }

  private notify(entry: Entry<Target>) {
    if (!entry.alive) return
    const ready = !entry.loading && !entry.state.loading && entry.state.ready
    if (ready && entry.readyMs === null) {
      entry.readyMs = Math.max(0, this.now() - entry.started)
    }
    entry.listener?.({
      state: entry.loading
        ? { ...entry.state, loading: true, ready: false }
        : entry.state,
      instance: entry.id,
      cacheHit: entry.cacheHit,
      readyMs: entry.readyMs,
    })
  }

  private canRetain(entry: Entry<Target>) {
    return (
      !!entry.request?.retain &&
      !entry.state.error &&
      entry.cost <= this.limits.bytes
    )
  }

  private release(entry: Entry<Target>, token: symbol) {
    if (!entry.alive || entry.lease !== token) return
    entry.lease = undefined
    entry.listener = undefined
    entry.lastUsed = this.now()
    if (this.active === entry) this.active = undefined
    if (!this.canRetain(entry)) this.remove(entry)
    else entry.surface.park()
    this.sweep()
  }

  private inactive() {
    return this.entries
      .filter((entry) => entry !== this.active)
      .sort((a, b) => a.lastUsed - b.lastUsed || a.id - b.id)
  }

  sweep() {
    for (const entry of this.inactive()) {
      if (entry.request && this.now() - entry.lastUsed >= this.limits.idleMs) {
        this.remove(entry)
      }
    }
    for (const entry of this.inactive()) {
      if (
        this.entries.length <= this.limits.entries &&
        this.entries.reduce((total, item) => total + item.cost, 0) <=
          this.limits.bytes
      )
        break
      this.remove(entry)
    }
  }

  private remove(entry: Entry<Target>) {
    if (!entry.alive) return
    entry.alive = false
    entry.serial++
    entry.listener = undefined
    entry.unsubscribe()
    entry.surface.destroy()
    this.entries = this.entries.filter((item) => item !== entry)
    if (this.active === entry) this.active = undefined
    this.counters.destroyed++
  }

  clear() {
    for (const entry of [...this.entries]) this.remove(entry)
    this.scope = undefined
  }

  statistics() {
    return {
      ...this.counters,
      resident: this.entries.length,
      estimatedBytes: this.entries.reduce(
        (total, entry) => total + entry.cost,
        0,
      ),
      maxEntries: this.limits.entries,
      maxBytes: this.limits.bytes,
    }
  }
}
