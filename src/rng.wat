;; Random Number Forest — WASM random-number generator.
;; Produces 'count' decimal digit-strings of 'digits' length into linear
;; memory (ASCII '0'-'9', NUL-terminated). PRNG: mulberry32.
;;
;; Rebuild recipe: assemble with wabt, e.g. in a worker:
;;   const wabt = await import("https://esm.sh/wabt@1.0.36");
;;   const { buffer } = wabt.parseWat("rng.wat", wat).toBinary({});
;;   fs.writeFile("src/rng.wasm", new Uint8Array(buffer));
(module
  (memory (export "memory") 1)

  ;; PRNG state (mulberry32, full 2^32 period for any seed)
  (global $s0 (mut i32) (i32.const 0x9e3779b9))

  ;; digit buffer base (first 16 bytes left unused)
  (global $buf i32 (i32.const 16))

  ;; max digits per number (65 * 65 bytes fits comfortably in one page)
  (global $maxDigits i32 (i32.const 64))

  ;; ---- mulberry32 ----
  (func $next32 (result i32)
    (local $z i32)

    ;; state += 0x6D2B79F5
    global.get $s0
    i32.const 0x6D2B79F5
    i32.add
    global.set $s0

    ;; z = state
    global.get $s0
    local.set $z

    ;; z = (z ^ (z >> 15)) * (z | 1)
    local.get $z
    local.get $z
    i32.const 15
    i32.shr_u
    i32.xor
    local.get $z
    i32.const 1
    i32.or
    i32.mul
    local.set $z

    ;; z ^= z + ((z ^ (z >> 7)) * (z | 61))
    local.get $z
    local.get $z
    local.get $z
    local.get $z
    i32.const 7
    i32.shr_u
    i32.xor
    local.get $z
    i32.const 61
    i32.or
    i32.mul
    i32.add
    i32.xor
    local.set $z

    ;; return z ^ (z >> 14)
    local.get $z
    local.get $z
    i32.const 14
    i32.shr_u
    i32.xor
  )

  ;; uniform digit 0..9 via rejection sampling on the HIGH byte of next32
  (func $nextDigit (result i32)
    (local $b i32)
    (block $got
      (loop $try
        call $next32
        i32.const 24
        i32.shr_u
        local.set $b
        local.get $b
        i32.const 250
        i32.lt_u
        br_if $got
        br $try
      )
    )
    local.get $b
    i32.const 10
    i32.rem_u
  )

  ;; seed the PRNG (mulberry32 accepts any seed, including zero)
  (func (export "seed") (param $a i32) (param $b i32)
    ;; mix both seed words into the state
    local.get $a
    local.get $b
    i32.xor
    i32.const 0x6D2B79F5
    i32.mul
    global.set $s0

    ;; warm up so nearby seeds diverge quickly
    call $next32
    drop
    call $next32
    drop
  )

  ;; generate $count numbers, each $digits ASCII '0'-'9' then NUL
  (func (export "gen") (param $count i32) (param $digits i32)
    (local $i i32)
    (local $d i32)
    (local $ptr i32)
    (local $stride i32)

    ;; clamp digits to buffer capacity
    local.get $digits
    global.get $maxDigits
    i32.gt_u
    if
      global.get $maxDigits
      local.set $digits
    end

    ;; stride = digits + 1 (for the NUL terminator)
    local.get $digits
    i32.const 1
    i32.add
    local.set $stride

    ;; i = 0
    i32.const 0
    local.set $i

    (block $outerDone
      (loop $outer
        (br_if $outerDone (i32.ge_u (local.get $i) (local.get $count)))

        ;; ptr = buf + i * stride
        global.get $buf
        local.get $i
        local.get $stride
        i32.mul
        i32.add
        local.set $ptr

        ;; d = 0
        i32.const 0
        local.set $d
        (block $innerDone
          (loop $inner
            (br_if $innerDone (i32.ge_u (local.get $d) (local.get $digits)))
            ;; store ASCII digit
            local.get $ptr
            call $nextDigit
            i32.const 48
            i32.add
            i32.store8
            local.get $ptr
            i32.const 1
            i32.add
            local.set $ptr
            local.get $d
            i32.const 1
            i32.add
            local.set $d
            br $inner
          )
        )

        ;; NUL terminator
        local.get $ptr
        i32.const 0
        i32.store8

        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $outer
      )
    )
  )

  ;; base pointer of the digit buffer
  (func (export "buffer") (result i32)
    global.get $buf
  )

  ;; raw PRNG output, used by JS for chunk-position sampling
  (func (export "next32") (result i32)
    call $next32
  )
)
