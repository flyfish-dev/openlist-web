import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"

const code = stripTypeScriptTypes(
  await readFile(
    new URL("../../src/flyfish/resident-viewer.ts", import.meta.url),
    "utf8",
  ),
)
const { ResidentViewerPool } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
)
const settle = () => new Promise(setImmediate)

function fixture(limits = {}) {
  let time = 0
  const surfaces = []
  const gates = new Map()
  const create = () => {
    const listeners = new Set()
    let state = { loading: false, ready: false, error: null }
    const surface = {
      loads: [],
      destroyed: false,
      target: null,
      cost: 10,
      attach(target) {
        this.park()
        this.target = target
        target.surface = this
      },
      park() {
        if (this.target) this.target.surface = null
        this.target = null
      },
      async update(source) {
        this.loads.push(source)
        state = { loading: true, ready: false, error: null }
        for (const listener of listeners) listener(state)
        await gates.get(source.url)?.promise
        state = { loading: false, ready: true, error: null }
        for (const listener of listeners) listener(state)
      },
      state: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      estimateBytes() {
        return this.cost
      },
      destroy() {
        this.destroyed = true
        this.park()
        listeners.clear()
      },
    }
    surfaces.push(surface)
    return surface
  }
  const pool = new ResidentViewerPool(create, {
    now: () => time,
    limits: { entries: 3, bytes: 100, idleMs: 1000, ...limits },
  })
  const request = (name, overrides = {}) => ({
    key: name,
    scope: "user-1",
    source: { url: "/p/" + name, filename: name, options: { theme: "light" } },
    retain: true,
    estimatedBytes: 10,
    ...overrides,
  })
  const open = (name, listener = () => {}, overrides = {}, target = {}) =>
    pool.acquire(target, request(name, overrides), listener)
  return {
    pool,
    surfaces,
    gates,
    open,
    tick: (value) => {
      time += value
    },
  }
}

test("idle warm-up creates one empty controller without fetching a document", () => {
  const f = fixture()
  f.pool.warm()
  f.pool.warm()
  assert.equal(f.surfaces.length, 1)
  assert.equal(f.surfaces[0].loads.length, 0)
  f.pool.clear()
})

test("reopening a parked document reuses its live surface without a load or destroy", async () => {
  const f = fixture()
  f.pool.warm()
  const first = f.open("report.docx")
  await settle()
  first.release()
  const target = {}
  const states = []
  f.open("report.docx", (state) => states.push(state), {}, target)
  first.release()
  assert.equal(
    target.surface,
    f.surfaces[0],
    "a stale route cleanup cannot park the new lease",
  )
  assert.equal(f.surfaces[0].loads.length, 1)
  assert.equal(states.at(-1).cacheHit, true)
  assert.equal(states.at(-1).readyMs, 0)
  assert.equal(f.pool.statistics().destroyed, 0)
  f.pool.clear()
})

test("A -> B -> A retains both small documents and their view state", async () => {
  const f = fixture()
  f.open("A.docx")
  await settle()
  f.open("B.pptx")
  await settle()
  const states = []
  f.open("A.docx", (state) => states.push(state))
  assert.equal(f.surfaces.length, 2)
  assert.equal(f.pool.statistics().loads, 2)
  assert.equal(states.at(-1).instance, 1)
  assert.equal(states.at(-1).cacheHit, true)
  f.pool.clear()
})

test("LRU eviction recycles an idle controller instead of recreating its shell", async () => {
  const f = fixture({ entries: 2 })
  f.open("A.docx")
  await settle()
  f.tick(10)
  f.open("B.pptx")
  await settle()
  f.tick(10)
  f.open("C.eml")
  await settle()
  assert.equal(f.surfaces.length, 2)
  assert.equal(f.pool.statistics().resident, 2)
  assert.equal(f.pool.statistics().destroyed, 0)
  assert.deepEqual(
    f.surfaces[0].loads.map((source) => source.filename),
    ["A.docx", "C.eml"],
  )
  f.pool.clear()
})

test("measured memory evicts inactive pages and is not reset by a cache hit", async () => {
  const f = fixture({ bytes: 25 })
  f.open("A.docx")
  f.surfaces[0].cost = 20
  await settle()
  f.open("A.docx")
  f.open("B.docx")
  await settle()
  assert.equal(f.surfaces[0].destroyed, true)
  assert.equal(f.pool.statistics().resident, 1)
  f.pool.clear()
})

test("idle TTL expires inactive documents but never an active preview", async () => {
  const f = fixture()
  const a = f.open("A.docx")
  await settle()
  a.release()
  f.tick(1001)
  f.pool.sweep()
  assert.equal(f.surfaces[0].destroyed, true)
  f.open("B.docx")
  await settle()
  f.tick(1001)
  f.pool.sweep()
  assert.equal(f.pool.statistics().resident, 1)
  f.pool.clear()
})

test("a different authorization scope destroys old surfaces before reuse", async () => {
  const f = fixture()
  f.open("private.docx")
  await settle()
  const states = []
  f.open("private.docx", (value) => states.push(value), { scope: "user-2" })
  await settle()
  assert.equal(f.surfaces[0].destroyed, true)
  assert.equal(states.at(-1).cacheHit, false)
  assert.equal(f.surfaces.length, 2)
  f.pool.clear()
})

test("late async completion does not update the new route or revive a cleared session", async () => {
  const f = fixture()
  let resolve
  f.gates.set("/p/A.docx", {
    promise: new Promise((done) => {
      resolve = done
    }),
  })
  const oldStates = [],
    newStates = []
  f.open("A.docx", (state) => oldStates.push(state))
  await settle()
  f.open("B.pptx", (state) => newStates.push(state))
  await settle()
  const oldCount = oldStates.length,
    newCount = newStates.length
  f.pool.clear()
  resolve()
  await settle()
  assert.equal(oldStates.length, oldCount)
  assert.equal(newStates.length, newCount)
  assert.equal(f.pool.statistics().resident, 0)
})

test("a loading document can finish in the background and be reopened without a second fetch", async () => {
  const f = fixture()
  let resolve
  f.gates.set("/p/A.docx", {
    promise: new Promise((done) => {
      resolve = done
    }),
  })
  f.open("A.docx")
  await settle()
  f.open("B.docx")
  await settle()
  resolve()
  await settle()
  const states = []
  f.open("A.docx", (state) => states.push(state))
  assert.equal(states.at(-1).cacheHit, true)
  assert.equal(f.surfaces[0].loads.length, 1)
  f.pool.clear()
})

test("large and GPU-backed transient previews are released on departure", async () => {
  const f = fixture()
  const lease = f.open("model.ifc", () => {}, { retain: false })
  await settle()
  lease.release()
  assert.equal(f.surfaces[0].destroyed, true)
  assert.equal(f.pool.statistics().resident, 0)
})

test("source revisions and rendering option changes cannot return stale content", async () => {
  const f = fixture()
  f.open("A.docx")
  await settle()
  f.open("A.docx", () => {}, {
    source: {
      url: "/p/A.docx",
      filename: "A.docx",
      options: { theme: "dark" },
    },
  })
  await settle()
  assert.equal(f.surfaces.length, 1)
  assert.equal(f.surfaces[0].loads.length, 2)
  const states = []
  f.open("A.docx", (state) => states.push(state), { key: "A.docx:modified" })
  await settle()
  assert.equal(states.at(-1).cacheHit, false)
  assert.equal(f.pool.statistics().loads, 3)
  f.pool.clear()
})

test("closing a transient preview before its scheduled load prevents the fetch", async () => {
  const f = fixture()
  const lease = f.open("model.ifc", () => {}, { retain: false })
  lease.release()
  await settle()
  assert.equal(f.surfaces[0].loads.length, 0)
  assert.equal(f.surfaces[0].destroyed, true)
})

test("a failed document is not cached as a permanently rejected preview", async () => {
  const f = fixture()
  f.gates.set("/p/A.docx", {
    promise: Promise.reject(new Error("network unavailable")),
  })
  const states = []
  f.open("A.docx", (state) => states.push(state))
  await settle()
  assert.ok(states.at(-1).state.error)
  f.gates.delete("/p/A.docx")
  f.open("A.docx", (state) => states.push(state))
  await settle()
  assert.equal(states.at(-1).state.ready, true)
  assert.equal(states.at(-1).cacheHit, false)
  f.pool.clear()
})
