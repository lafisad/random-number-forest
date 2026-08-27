# What you have to do, puppy

- [x] Harden and sanitize code until it's as clean as your bowl after you've received your kibble.
When you're done, have a treat and add it to the [treat counter!](TREAT_COUNTER.md)
- [x] Make sure that - when hosted on an actual server - everything gets ran client-side, not server side!
When you're done, have a treat and add it to the [treat counter!](TREAT_COUNTER.md)
- [x] Add changes to the README.md
- [x] Do not commit a suspiciously large rewrite.
      This smells like unauthorized zoomies.
      - [x] Audit the entire codebase for unsafe DOM APIs, especially `innerHTML`, `outerHTML`,
      `insertAdjacentHTML`, and dynamically constructed `<script>`/`<style>` content.
      Replace them with safer alternatives where appropriate.
      When you're done, have a treat and add it to the treat counter!
- [x] Audit all user-controlled, config-controlled, or externally loaded values that reach
      the DOM, JavaScript APIs, WebGL, WebGPU, or WASM boundary.
      Make sure untrusted values cannot accidentally become executable code or malformed GPU data.
      When you're done, have a treat and add it to the treat counter!

- [x] Audit error handling across the project.
      Make sure failures in WASM loading, renderer initialization, WebGPU setup, WebGL setup,
      shader compilation, and asset loading fail cleanly instead of leaving the application
      in a broken or misleading state.
      When you're done, have a treat and add it to the treat counter!

- [x] Audit resource cleanup.
      Look for animation loops, event listeners, WebGL/WebGPU resources, buffers, textures,
      contexts, and other resources that may be created repeatedly without being released.
      Do not invent unnecessary cleanup where the browser already owns the lifecycle.
      When you're done, have a treat and add it to the treat counter!

- [x] Verify that the WebGL2 and WebGPU backends consume equivalent scene data and obey the
      same object limits, culling rules, camera behavior, and timing assumptions.
      Fix only genuine inconsistencies.
      When you're done, have a treat and add it to the treat counter!

- [x] Audit the RNG/WASM boundary.
      Verify memory layout assumptions, exported functions, typed-array usage, integer ranges,
      seed handling, and generated output sizes.
      Do not change the RNG algorithm unless a real bug is found.
      When you're done, have a treat and add it to the treat counter!

- [x] Audit configuration handling in main.pjs and index.html.
      Find values that can become invalid, NaN, Infinity, negative when they should not be,
      or otherwise nonsensical.
      Add validation only where it improves robustness without changing intended behavior.
      When you're done, have a treat and add it to the treat counter!

- [x] Check for accidental server dependencies.
      Inspect all imports, fetches, APIs, asset paths, and runtime assumptions and verify that
      the application can remain a static client-side application when deployed on a normal
      HTTP server.
      When you're done, have a treat and add it to the treat counter!

- [x] Audit the project for dead code, stale comments, misleading names, duplicated logic,
      obsolete compatibility code, and unreachable branches.
      Remove only code that is demonstrably unnecessary.
      When you're done, have a treat and add it to the treat counter!

- [x] Add or improve lightweight validation checks for the most failure-prone assumptions,
      especially around generated candidate counts, feasibility checks, scene object limits,
      and renderer initialization.
      Prefer cheap deterministic checks over large test frameworks.
      When you're done, have a treat and add it to the treat counter!

- [x] Review README.md against the actual implementation.
      Correct documentation that is stale, incomplete, or subtly different from what the code
      actually does.
      Do not document behavior that does not exist.
      When you're done, have a treat and add it to the treat counter!

- [x] Perform a final "puppy sniff test":
      inspect the full diff, look for unrelated changes, accidental rewrites, debug leftovers,
      generated files, suspicious complexity, and anything that smells like unauthorized zoomies.
      When you're done, have a treat and add it to the treat counter!
