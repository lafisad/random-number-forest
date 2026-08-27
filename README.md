# Random Number Forest

A generative art generator built on Perchance. A WASM module manufactures huge random
decimal numbers, small 4-digit chunks are sampled from random positions inside them and
tested for "feasibility", and every accepted chunk is materialized as a colored cube or
octahedron in an orbiting 3D scene. The forest grows in real time as the number stream
flows.

## What it's doing

Each generation cycle the WASM RNG emits a batch of 65 random 40-digit decimal strings.
From that batch, 5 chunks of 4 consecutive digits are sampled — each from a *random*
position within its parent string. Every chunk is tested against a feasibility rule; the
chunks that pass are rendered into the scene, one object per accepted chunk, and stay
there until the scene reaches its object cap, at which point the oldest objects are
culled. The side ledger shows the current batch of raw numbers, marks sampled chunks,
and keeps a rolling list of recent candidates. Each candidate moves through
`will be tried → feasible / won't work`; the currently queued candidate is temporarily
shown as `rendering` while it is added to the scene.

## How it works

1. **Generate** — the WASM module (`src/rng.wasm`) produces the batch: 65 numbers × 40
   decimal digits, written into WASM linear memory as ASCII.
2. **Sample** — 5 candidates per cycle: for each, pick a random start position inside a
   random number and read 4 consecutive digits.
3. **Test** — apply the feasibility rule (below). Feasible chunks are queued for
   rendering.
4. **Render** — accepted chunks are added to the scene after a short stagger
   (`renderGapMs`), each becoming one instanced cube or octahedron with position, size,
   color and spin derived from its digits. The camera slowly orbits the whole forest.
5. **Ledger** — the current batch of generated numbers and its sampled chunks are shown
   live, while recent candidates and their fates are retained in a rolling list; the
   chunk currently being rendered is highlighted.

## The mathematics

### Chunk sampling

Let the generated number be a string $S$ of $L = 40$ decimal digits. A chunk is 4
consecutive digits starting at a uniformly random position:

$$p \sim \mathrm{Unif}\{0,\, 1,\, \dots,\, L-4\}, \qquad c = (d_1, d_2, d_3, d_4), \quad d_i = S_{p+i-1}$$

### Feasibility rule

A chunk $c$ is feasible iff its first digit is non-zero and its digit sum is divisible by
a configurable divisor $q$ (default $q = 3$):

$$\text{feasible}(c) \iff d_1 \neq 0 \;\wedge\; (d_1 + d_2 + d_3 + d_4) \equiv 0 \pmod{q}$$

The rule lives in `index.html` (`feasible()`) and is trivial to change; only the default
$q = 3$ plus the $d_1 \neq 0$ guard are baked in by the config.

### Shape

The parity of the digit sum picks the geometry:

$$k = (d_1 + d_2 + d_3 + d_4) \bmod 2 \;\Rightarrow\; k = 0 \text{ cube}, \quad k = 1 \text{ octahedron}$$

### Placement in the scene

Let $W$ be the scatter span (`sceneSpan`), and $N = 1000 d_1 + 100 d_2 + 10 d_3 + d_4$ the
numeric value of the chunk. Position:

$$x = \left(\frac{10 d_1 + d_2}{100} - \frac{1}{2}\right) W, \qquad
z = \left(\frac{10 d_3 + d_4}{100} - \frac{1}{2}\right) W$$

$$y = y_{\min} + \bigl(N \bmod (y_{\max} - y_{\min})\bigr)$$

### Color

Hue is derived from the first two digits, saturation from the third, lightness from the
fourth:

$$h = \frac{10 d_1 + d_2}{100} \cdot 360^{\circ}, \qquad
s = 0.65 + 0.33\,\frac{d_3}{9}, \qquad
l = 0.48 + 0.27\,\frac{d_4}{9}$$

### Scale and spin

$$s_x = 0.5 + 0.6\,\frac{d_1 + d_2}{18}, \quad
s_y = 0.5 + 0.6\,\frac{d_3 + d_4}{18}, \quad
s_z = 0.5 + 0.6\,\frac{d_2 + d_4}{18}$$

$$\theta_y = \frac{10 d_2 + d_4}{99} \cdot 2\pi$$

## Architecture

| File | Role |
| --- | --- |
| `src/rng.wat` | Hand-written WAT source of the RNG module (mulberry32, see below). Rebuild with `wabt` → `src/rng.wasm`. |
| `src/rng.wasm` | Compiled 346-byte WASM RNG: `seed()`, `gen(count, digits)` emits digit strings into memory, plus `buffer()` and `next32()` exports used by the page. |
| `src/scene.js` | Shared scene model & camera: cube/octahedron geometry, model matrices, orbiting camera with view-projection. |
| `src/renderer-webgpu.js` | WebGPU backend (storage-buffer instancing; no vertex buffers — some drivers render black otherwise). |
| `src/renderer-webgl2.js` | WebGL2 fallback backend, same lighting model. |
| `index.html` | Layout, ledger UI, and the whole pipeline: batch generation, chunk sampling, feasibility test, scene mapping, render loop. |
| `main.pjs` | Generator metadata and the `config` list (timing, batch size, feasibility divisor, scene params). |

## Configuration

Everything tweakable lives in the `config` list in `main.pjs` (`window.config`): cycle
length, numbers per cycle, digits per number, chunk length, candidates per cycle, the
feasibility divisor, animation timings, scene span / height / object cap, camera distance
and orbit speed.

## Rendering

WebGPU is used when available, otherwise WebGL2 (force with `?backend=gl2`). Both backends
share the same scene model and per-vertex lighting (directional key light, fill light,
rim light, plus a short birth-flash on newly added objects). The scene accumulates up to
`maxObjects` instances, then the oldest are culled.
The runtime caps `maxObjects` at 1024 because both backends use storage or instance
buffers sized for that maximum.

## Deployment and runtime safety

This is a static, client-side application. A web server only needs to serve `index.html`,
`main.pjs`, the JavaScript files, and `src/rng.wasm`; generation, sampling, feasibility
checks, and rendering all run in the visitor's browser. No server-side runtime or API is
required. Serve the directory over HTTP(S) rather than opening `index.html` directly,
because browsers restrict the WASM `fetch()` used by the page on `file://` URLs. WebGPU
requires a secure context; WebGL2 remains the fallback when WebGPU is unavailable.
The WASM response is checked for a successful HTTP status before instantiation, and
renderer initialization failures release any resources created before fallback or retry.

Values supplied through `window.config` are accepted only when finite and within the
runtime's safe bounds. Integer counts are normalized to integers, the chunk length is
limited to the generated number length, and the scene height is kept nonzero. Ledger
content is inserted as text nodes, so generated data is never interpreted as HTML.

## The RNG

The first attempt used an xorshift128 that silently degenerated to a period of 28 — every
number in a batch became a rotation of one string, and the whole scene collapsed into a
single repeated object. The module was rewritten as **mulberry32**, a 32-bit seeded PRNG
with state update

$$s \leftarrow (s + C) \bmod 2^{32}, \qquad C = \texttt{0x6D2B79F5}$$

and a scramble-and-tempering output step (see `src/rng.wat` for the exact bit
operations), giving a full $2^{32}$ period, uniform digit distribution and no short
cycles. Digits are produced one at a time as uniform integers in $[0, 9]$ and written as
ASCII into WASM linear memory.
