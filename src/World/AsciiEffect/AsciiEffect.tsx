import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 字符由暗到亮，索引即亮度档位
const CHARS = ' .-=+*ah#MW&8@$'
const CELL_W = 64
const CELL_H = 116
const CHAR_ASPECT = CELL_W / CELL_H

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// 低分辨率场景 -> 按格取亮度选字符，字符颜色沿用场景原色
const FRAG = `
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uCount;
varying vec2 vUv;

void main() {
  vec2 cell = floor(vUv * uRes);
  vec2 local = fract(vUv * uRes);

  vec3 lin = texture2D(uScene, (cell + 0.5) / uRes).rgb;
  vec3 srgb = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));

  float l = dot(srgb, vec3(0.299, 0.587, 0.114));
  l = pow(clamp(l, 0.0, 1.0), 0.8);
  float idx = floor(l * (uCount - 1.0) + 0.5);

  vec2 atlasUv = vec2((idx + local.x) / uCount, 1.0 - local.y);
  float glyph = texture2D(uAtlas, atlasUv).a;

  gl_FragColor = vec4(srgb * glyph, 1.0);
}
`

// 字符图集：Canvas2D 程序生成，避免外部字体资源
function makeAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = CELL_W * CHARS.length
  canvas.height = CELL_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ascii atlas: 2d context unavailable')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.font = `${CELL_H - 10}px Consolas, "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < CHARS.length; i++) {
    ctx.fillText(CHARS[i], i * CELL_W + CELL_W / 2, CELL_H / 2 + 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

// ASCII 后处理：接管渲染循环，先渲染到低分辨率缓冲，再全屏输出字符
export function AsciiEffect({ cols = 260 }: { cols?: number }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const rows = Math.max(1, Math.round((cols * size.height * CHAR_ASPECT) / Math.max(1, size.width)))

  const atlas = useMemo(makeAtlas, [])

  const quad = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uScene: { value: null },
        uAtlas: { value: atlas },
        uRes: { value: new THREE.Vector2(cols, rows) },
        uCount: { value: CHARS.length }
      },
      depthTest: false,
      depthWrite: false
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    mesh.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(mesh)
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { material, mesh, scene: quadScene, camera: quadCamera }
  }, [atlas])

  const rt = useMemo(
    () =>
      new THREE.WebGLRenderTarget(cols, rows, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false
      }),
    [cols, rows]
  )

  useEffect(() => {
    quad.material.uniforms.uRes.value.set(cols, rows)
    quad.material.uniforms.uScene.value = rt.texture
  }, [quad, rt, cols, rows])

  useEffect(() => () => rt.dispose(), [rt])

  useEffect(() => {
    return () => {
      atlas.dispose()
      quad.material.dispose()
      quad.mesh.geometry.dispose()
    }
  }, [atlas, quad])

  // 接管渲染，R3F 不再自动渲染
  useFrame(() => {
    gl.setRenderTarget(rt)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(quad.scene, quad.camera)
  }, 1)

  return null
}
