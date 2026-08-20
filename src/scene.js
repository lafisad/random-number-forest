/* scene.js — shared scene model, camera and geometry helpers for the
   Random Number Forest. Consumed by renderer-webgl2.js and
   renderer-webgpu.js. Plain-script globals namespaced under window.Art*. */

window.ArtGeo = (function () {
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm3 = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  // unit cube (36 verts, interleaved pos+normal, per-face flat shading)
  function cube() {
    const faces = [
      { n: [1, 0, 0], pts: [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]] },
      { n: [-1, 0, 0], pts: [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]] },
      { n: [0, 1, 0], pts: [[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]] },
      { n: [0, -1, 0], pts: [[-.5,-.5,.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5]] },
      { n: [0, 0, 1], pts: [[-.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5],[.5,-.5,.5]] },
      { n: [0, 0, -1], pts: [[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,-.5]] },
    ];
    const out = [];
    for (const f of faces) {
      const [a, b, c, d] = f.pts;
      for (const p of [a, b, c, a, c, d]) out.push(...p, ...f.n);
    }
    return new Float32Array(out);
  }

  // unit octahedron (24 verts)
  function octa() {
    const v = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const faces = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
    const out = [];
    for (const f of faces) {
      const [a, b, c] = f.map(i => v[i]);
      const n = norm3(cross3(sub3(b, a), sub3(c, a)));
      for (const p of [a, b, c]) out.push(...p, ...n);
    }
    return new Float32Array(out);
  }

  // column-major model matrix for an instance: T * R_y * S
  function modelMatrix(o) {
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    return [
      c * o.sx, 0, -s * o.sx, 0,
      0, o.sy, 0, 0,
      s * o.sz, 0, c * o.sz, 0,
      o.x, o.y, o.z, 1,
    ];
  }

  return { cube, octa, modelMatrix, sub3, cross3, norm3 };
})();

window.ArtScene = {
  instances: [],
  camera: { yaw: 0.6, pitch: 0.3, dist: 34, target: [0, 0, 0] },

  addInstance(o) {
    o.born = performance.now() / 1000;
    this.instances.push(o);
  },

  cull(max) {
    if (this.instances.length > max) {
      this.instances.splice(0, this.instances.length - max);
    }
  },

  // view-projection matrix (column-major) + camera eye + wall-clock seconds
  getViewProj(aspect, webgpu) {
    const { yaw, pitch, dist, target } = this.camera;
    const eye = [
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    const center = target || [0, 0, 0], up = [0, 1, 0];
    const f = ArtGeo.norm3(ArtGeo.sub3(center, eye));
    const s = ArtGeo.norm3(ArtGeo.cross3(f, up));
    const u = ArtGeo.cross3(s, f);
    const view = [
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -(s[0]*eye[0] + s[1]*eye[1] + s[2]*eye[2]),
      -(u[0]*eye[0] + u[1]*eye[1] + u[2]*eye[2]),
       (f[0]*eye[0] + f[1]*eye[1] + f[2]*eye[2]),
      1,
    ];
    const fov = 55 * Math.PI / 180;
    const fovf = 1 / Math.tan(fov / 2);
    const near = 0.1, far = 400;
    let proj;
    if (webgpu) {
      proj = [
        fovf / aspect, 0, 0, 0,
        0, fovf, 0, 0,
        0, 0, far / (near - far), -1,
        0, 0, (far * near) / (near - far), 0,
      ];
    } else {
      proj = [
        fovf / aspect, 0, 0, 0,
        0, fovf, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
      ];
    }
    // column-major multiply proj * view
    const m = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        m[c * 4 + r] =
          proj[r] * view[c * 4] +
          proj[4 + r] * view[c * 4 + 1] +
          proj[8 + r] * view[c * 4 + 2] +
          proj[12 + r] * view[c * 4 + 3];
      }
    }
    return { viewProj: m, cam: eye, time: performance.now() / 1000 };
  },
};
