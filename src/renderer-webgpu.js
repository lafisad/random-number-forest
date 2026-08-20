/* renderer-webgpu.js — WebGPU backend for ArtScene.
   NOTE: on some driver/browser stacks, binding vertex/instance buffers
   (buffer-attribute fetch) in combination with instance_index produces
   black output. This renderer therefore avoids vertex buffers entirely:
   mesh geometry and per-instance data live in a STORAGE buffer, indexed
   with @builtin(vertex_index) / @builtin(instance_index). Verified to
   rasterize correctly (including lighting + depth) on those stacks. */

window.ArtRendererWG = class ArtRendererWG {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.depth = null;
  }

  async init() {
    if (!navigator.gpu) throw new Error("WebGPU unavailable");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no GPU adapter");
    this.device = await adapter.requestDevice();
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context = this.canvas.getContext("webgpu");
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });

    // storage buffer layout (in vec4s):
    //   [0, 72)        cube verts: per vert pos(vec4,w=1) + normal(vec4,w=0)
    //   [72, 120)      octa verts: same
    //   [120, ...)     instances: per instance 6 vec4s (m0..m3, color, born)
    this.GEOM_VECS = 120;
    this.CUBE_VERTS = 36;
    this.OCTA_VERTS = 24;
    this.MAX_INSTANCES = 1024;
    this.INSTANCE_VECS = 6;

    var geo = new Float32Array(this.GEOM_VECS * 4);
    this._packGeometry(geo, 0, ArtGeo.cube(), this.CUBE_VERTS);
    this._packGeometry(geo, this.CUBE_VERTS, ArtGeo.octa(), this.OCTA_VERTS);

    this.geoBuf = this.device.createBuffer({
      size: (this.GEOM_VECS + this.MAX_INSTANCES * this.INSTANCE_VECS) * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.geoBuf, 0, geo);

    var code = `
struct Uniforms {
  viewProj : mat4x4f,
  time : f32,
  cam : vec4f,
  geoBase : f32,
  instStart : f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<storage, read> G : array<vec4f>;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) world : vec3f,
  @location(1) normal : vec3f,
  @location(2) color : vec4f,
  @location(3) born : f32,
};

@vertex
fn vs(@builtin(vertex_index) i : u32, @builtin(instance_index) k : u32) -> VSOut {
  let gv = u.geoBase + f32(i);
  let pos = G[u32(gv) * 2u];
  let normal = G[u32(gv) * 2u + 1u];
  let ib = u32(u.instStart) + k * 6u;
  let model = mat4x4f(G[ib], G[ib + 1u], G[ib + 2u], G[ib + 3u]);
  let w = model * vec4f(pos.xyz, 1.0);
  var out : VSOut;
  out.pos = u.viewProj * w;
  out.world = w.xyz;
  out.normal = (model * vec4f(normal.xyz, 0.0)).xyz;
  out.color = G[ib + 4u];
  out.born = G[ib + 5u].x;
  return out;
}

@fragment
fn fs(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  if (!ff) { n = -n; }
  let L = normalize(vec3f(0.45, 0.85, 0.35));
  let diff = max(dot(n, L), 0.0);
  let fill = max(dot(n, normalize(vec3f(-0.5, 0.4, -0.7))), 0.0) * 0.3;
  let V = normalize(u.cam.xyz - in.world);
  let rim = pow(1.0 - max(dot(n, V), 0.0), 2.5) * 0.3;
  let age = u.time - in.born;
  let flash = exp(-max(age, 0.0) * 2.0);
  var col = in.color.rgb * (0.45 + diff * 0.9 + fill) + vec3f(rim) * 0.85;
  col += in.color.rgb * flash * 0.8;
  return vec4f(col, 1.0);
}
`;

    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({ code }),
        entryPoint: "vs",
      },
      fragment: {
        module: this.device.createShaderModule({ code }),
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    // one uniform buffer per geometry: the same buffer can't be shared by
    // two draw calls in one encoder (both would read the last write)
    this.uniformBufs = [this.device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
                        this.device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })];
    this.bindGroups = this.uniformBufs.map(function (ub) {
      return this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: ub } },
          { binding: 1, resource: { buffer: this.geoBuf } },
        ],
      });
    }, this);

    this.resize();
    return this;
  }

  // pack `verts` interleaved pos+normal floats into geo (vec4 layout):
  // per vertex: pos(vec4,w=1) then normal(vec4,w=0), at vertexBase offset.
  _packGeometry(geo, vertexBase, floats, vertexCount) {
    for (var i = 0; i < vertexCount; i++) {
      var src = i * 6;
      var dst = (vertexBase + i) * 8;
      geo[dst] = floats[src];
      geo[dst + 1] = floats[src + 1];
      geo[dst + 2] = floats[src + 2];
      geo[dst + 3] = 1;
      geo[dst + 4] = floats[src + 3];
      geo[dst + 5] = floats[src + 4];
      geo[dst + 6] = floats[src + 5];
      geo[dst + 7] = 0;
    }
  }

  resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (!this.depth || this.depth.width !== w || this.depth.height !== h) {
      if (this.depth) this.depth.destroy();
      this.depth = this.device.createTexture({
        size: [w, h],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
  }

  _writeInstanceData(scene) {
    var cubeRows = [];
    var octaRows = [];
    for (var i = 0; i < scene.instances.length; i++) {
      var o = scene.instances[i];
      var m = ArtGeo.modelMatrix(o);
      var row = [
        m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
        m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15],
        o.r, o.g, o.b, 1,
        o.born, 0, 0, 0,
      ];
      (o.shape === 1 ? octaRows : cubeRows).push(row);
    }
    var all = new Float32Array((cubeRows.length + octaRows.length) * 24);
    var off = 0;
    for (var ci = 0; ci < cubeRows.length; ci++) { all.set(cubeRows[ci], off); off += 24; }
    for (var oi = 0; oi < octaRows.length; oi++) { all.set(octaRows[oi], off); off += 24; }
    var byteOffset = this.GEOM_VECS * 16;
    this.device.queue.writeBuffer(this.geoBuf, byteOffset, all);
    return { cubeCount: cubeRows.length, octaCount: octaRows.length };
  }

  _writeUniforms(buf, vp, geoBase, instStart) {
    var u = new Float32Array(28);
    u.set(vp.viewProj, 0);
    u[16] = vp.time;
    u[20] = vp.cam[0];
    u[21] = vp.cam[1];
    u[22] = vp.cam[2];
    u[23] = 1;
    u[24] = geoBase;
    u[25] = instStart;
    this.device.queue.writeBuffer(buf, 0, u);
  }

  _draw(enc, colorView, counts, aspect) {
    var vp = window.ArtScene.getViewProj(aspect, true);
    var pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          clearValue: { r: 0.09, g: 0.06, b: 0.22, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setPipeline(this.pipeline);
    if (counts.cubeCount) {
      // write each geometry's uniforms BEFORE the pass body so the encoder
      // records commands against the correct per-geometry uniform buffer
      this._writeUniforms(this.uniformBufs[0], vp, 0, this.GEOM_VECS);
      pass.setBindGroup(0, this.bindGroups[0]);
      pass.draw(this.CUBE_VERTS, counts.cubeCount, 0, 0);
    }
    if (counts.octaCount) {
      this._writeUniforms(this.uniformBufs[1], vp, this.CUBE_VERTS, this.GEOM_VECS + counts.cubeCount * this.INSTANCE_VECS);
      pass.setBindGroup(0, this.bindGroups[1]);
      pass.draw(this.OCTA_VERTS, counts.octaCount, 0, 0);
    }
    pass.end();
  }

  frame(scene, aspect) {
    var counts = this._writeInstanceData(scene);
    var enc = this.device.createCommandEncoder();
    this._draw(enc, this.context.getCurrentTexture().createView(), counts, aspect);
    this.device.queue.submit([enc.finish()]);
  }

  async capture() {
    // Render into an offscreen texture (not the swapchain, whose
    // presentation behavior can't be relied on in every environment),
    // then copy that texture to a mappable buffer.
    var aspect = (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1);
    var counts = this._writeInstanceData(window.ArtScene);

    var w = this.canvas.width, h = this.canvas.height;
    var bytesPerRow = Math.ceil((w * 4) / 256) * 256;

    if (!this.shotTex || this.shotTex.width !== w || this.shotTex.height !== h) {
      if (this.shotTex) this.shotTex.destroy();
      this.shotTex = this.device.createTexture({
        size: [w, h],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    }

    var buf = this.device.createBuffer({
      size: bytesPerRow * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    var enc = this.device.createCommandEncoder();
    this._draw(enc, this.shotTex.createView(), counts, aspect);
    enc.copyTextureToBuffer(
      { texture: this.shotTex },
      { buffer: buf, bytesPerRow: bytesPerRow, rowsPerImage: h },
      { width: w, height: h }
    );
    this.device.queue.submit([enc.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    await buf.mapAsync(GPUMapMode.READ);
    var px = new Uint8Array(buf.getMappedRange());
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(w, h);
    // WebGPU readbacks are top-down (unlike WebGL readPixels): no flip.
    for (var y = 0; y < h; y++) {
      img.data.set(px.subarray(y * bytesPerRow, y * bytesPerRow + w * 4), y * w * 4);
    }
    // A bgra8unorm format yields BGRA bytes while ImageData is RGBA:
    // swap the red and blue channels per pixel (img.data is contiguous, so
    // row padding is not a concern here).
    if (this.format === "bgra8unorm") {
      for (var pi = 0; pi < w * h; pi++) {
        var j = pi * 4;
        var t = img.data[j];
        img.data[j] = img.data[j + 2];
        img.data[j + 2] = t;
      }
    }
    ctx.putImageData(img, 0, 0);
    buf.unmap();
    buf.destroy();
    return c.toDataURL("image/png");
  }
};
