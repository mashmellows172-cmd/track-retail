'use client';

import { useEffect, useRef } from 'react';

const VERTEX_SHADER = [
  'attribute vec2 a_position;',
  'varying vec2 v_texCoord;',
  'void main() {',
  '  v_texCoord = a_position * 0.5 + 0.5;',
  '  gl_Position = vec4(a_position, 0.0, 1.0);',
  '}',
].join('\n');

const FRAGMENT_SHADER = [
  'precision highp float;',
  'varying vec2 v_texCoord;',
  'uniform float u_time;',
  'uniform vec2 u_resolution;',
  'void main() {',
  '  vec2 uv = v_texCoord;',
  '  vec3 color1 = vec3(0.06, 0.07, 0.1);',
  '  vec3 color2 = vec3(0.12, 0.08, 0.2);',
  '  vec3 color3 = vec3(0.05, 0.1, 0.15);',
  '  float noise1 = sin(uv.x * 2.0 + u_time * 0.2) * 0.5 + 0.5;',
  '  float noise2 = cos(uv.y * 3.0 - u_time * 0.3) * 0.5 + 0.5;',
  '  vec3 finalColor = mix(color1, color2, noise1);',
  '  finalColor = mix(finalColor, color3, noise2 * 0.5);',
  '  float glow = smoothstep(0.8, 0.2, distance(uv, vec2(',
  '    0.5 + 0.2 * sin(u_time * 0.1),',
  '    0.5 + 0.2 * cos(u_time * 0.15)',
  '  )));',
  '  finalColor += vec3(0.05, 0.02, 0.1) * glow;',
  '  gl_FragColor = vec4(finalColor, 1.0);',
  '}',
].join('\n');

export default function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
    if (ro) ro.observe(canvas);
    syncSize();

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;

    function createShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');

    let raf: number;
    function render(t: number) {
      if (!canvas || !gl) return;
      if (!ro) syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 w-full h-full -z-20">
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      <div className="fixed inset-0 bg-background/80 -z-10 pointer-events-none" />
    </>
  );
}
