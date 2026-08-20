/* renderer-webgl2.js — WebGL2 backend for ArtScene.
   preserveDrawingBuffer is enabled so the canvas can be captured (capture()). */
window.ArtRendererGL2 = class ArtRendererGL2 {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.meshes = {};
  }

  init() {
    const gl = this.canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    const vs = `#version 300 es
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in mat4 aModel;
      layout(location=6) in vec4 aColor;
      layout(location=7) in vec4 aExtra;
      uniform mat4 uVP;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec4 vColor;
      out float vBorn;
      void main() {
        vec4 w = aModel * vec4(aPos, 1.0);
        vWorld = w.xyz;
        vNormal = mat3(aModel) * aNormal;
        vColor = aColor;
        vBorn = aExtra.x;
        gl_Position = uVP * w;
      }`;
    const fs = `#version 300 es
      precision highp float;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec4 vColor;
      in float vBorn;
      uniform float uTime;
      uniform vec3 uCam;
      out vec4 fragColor;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 L = normalize(vec3(0.45, 0.85, 0.35));
        float diff = max(dot(n, L), 0.0);
        float fill = max(dot(n, normalize(vec3(-0.5, 0.4, -0.7))), 0.0) * 0.3;
        vec3 V = normalize(uCam - vWorld);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5) * 0.3;
        float age = uTime - vBorn;
        float flash = exp(-max(age, 0.0) * 2.0);
        vec3 col = vColor.rgb * (0.45 + diff * 0.9 + fill) + vec3(rim) * 0.85;
        col += vColor.rgb * flash * 0.8;
        fragColor = vec4(col, 1.0);
      }`;

    const prog = gl.createProgram();
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.uVP = gl.getUniformLocation(prog, "uVP");
    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uCam = gl.getUniformLocation(prog, "uCam");

    this.meshes.cube = this._mesh(ArtGeo.cube());
    this.meshes.octa = this._mesh(ArtGeo.octa());

    this.instanceBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 1024 * 96, gl.DYNAMIC_DRAW);

    this.resize();
    return this;
  }

  _mesh(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    return { vao, count: data.length / 6 };
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  frame(scene, aspect) {
    const gl = this.gl;
    const { viewProj, cam, time } = scene.getViewProj(aspect, false);
    const cubeRows = [];
    const octaRows = [];
    for (const o of scene.instances) {
      const m = ArtGeo.modelMatrix(o);
      const row = [
        m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
        m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15],
        o.r, o.g, o.b, 1,
        o.born, 0, 0, 0,
      ];
      (o.shape === 1 ? octaRows : cubeRows).push(row);
    }
    const all = new Float32Array((cubeRows.length + octaRows.length) * 24);
    let off = 0;
    for (const r of cubeRows) { all.set(r, off); off += 24; }
    for (const r of octaRows) { all.set(r, off); off += 24; }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, all);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uVP, false, viewProj);
    gl.uniform1f(this.uTime, time);
    gl.uniform3fv(this.uCam, cam);
    gl.clearColor(0.09, 0.06, 0.22, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this._draw(this.meshes.cube, 0, cubeRows.length);
    this._draw(this.meshes.octa, cubeRows.length, octaRows.length);
  }

  _draw(mesh, offset, count) {
    if (!count) return;
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    const stride = 96;
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(2 + i);
      gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(2 + i, 1);
    }
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 64);
    gl.vertexAttribDivisor(6, 1);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 4, gl.FLOAT, false, stride, 80);
    gl.vertexAttribDivisor(7, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.count, count);
  }

  capture() {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
};
