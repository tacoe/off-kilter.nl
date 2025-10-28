const canvas = document.getElementById("logo-canvas");
const gl = canvas.getContext("webgl2");

const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_uv;

uniform vec2 u_translation;
uniform vec2 u_scale;

varying vec2 v_uv;

void main() {
  vec2 scaled = a_position * u_scale;
  vec2 position = scaled + u_translation;
  gl_Position = vec4(position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const fragmentShaderSource = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_texture;
uniform vec3 u_color;
uniform vec2 u_gradientStart;
uniform vec2 u_gradientEnd;
uniform float u_maxBlur;
uniform vec2 u_blurDirection;
uniform vec2 u_texelSize;

vec4 sampleMask(vec2 uv) {
  return texture2D(u_texture, uv);
}

void main() {
  vec2 gradientVector = u_gradientEnd - u_gradientStart;
  float gradientLength = length(gradientVector);
  float blurAmount = 0.0;

  if (u_maxBlur > 0.0 && gradientLength > 0.0) {
    vec2 gradientDir = gradientVector / gradientLength;
    float projection = dot(v_uv - u_gradientStart, gradientDir);
    float t = clamp(projection / gradientLength, 0.0, 1.0);
    blurAmount = t * u_maxBlur;
  }

  vec4 maskSample;

  if (blurAmount <= 0.0001) {
    maskSample = sampleMask(v_uv);
  } else {
    vec2 blurVector = u_blurDirection;
    float blurVectorLength = length(blurVector);

    if (blurVectorLength <= 0.0001) {
      maskSample = sampleMask(v_uv);
    } else {
      vec2 blurDir = blurVector / blurVectorLength;
      vec4 accumulated = vec4(0.0);
      float totalWeight = 0.0;

      const int SAMPLE_COUNT = 9;
      for (int i = 0; i < SAMPLE_COUNT; i++) {
        float offsetIndex = float(i) - 4.0;
        float weight = 1.0;
        float offsetPixels = blurAmount * (offsetIndex / 4.0);
        vec2 offsetUV = blurDir * offsetPixels * u_texelSize;
        accumulated += sampleMask(v_uv + offsetUV) * weight;
        totalWeight += weight;
      }

      maskSample = accumulated / totalWeight;
    }
  }

  float alpha = maskSample.a;
  vec3 color = u_color * alpha;

  gl_FragColor = vec4(color, alpha);
}
`;

function createShader(glContext, type, source) {
  const shader = glContext.createShader(type);
  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);

  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    const info = glContext.getShaderInfoLog(shader);
    glContext.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }

  return shader;
}

function createProgram(glContext, vertexSource, fragmentSource) {
  const program = glContext.createProgram();
  const vertexShader = createShader(glContext, glContext.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);

  glContext.attachShader(program, vertexShader);
  glContext.attachShader(program, fragmentShader);
  glContext.linkProgram(program);

  if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
    const info = glContext.getProgramInfoLog(program);
    glContext.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }

  glContext.deleteShader(vertexShader);
  glContext.deleteShader(fragmentShader);

  return program;
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

const positions = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

const uvs = new Float32Array([
  0, 1,
  1, 1,
  0, 0,
  1, 0,
]);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

const uvBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

gl.useProgram(program);

const attribLocations = {
  position: gl.getAttribLocation(program, "a_position"),
  uv: gl.getAttribLocation(program, "a_uv"),
};

const uniformLocations = {
  translation: gl.getUniformLocation(program, "u_translation"),
  scale: gl.getUniformLocation(program, "u_scale"),
  color: gl.getUniformLocation(program, "u_color"),
  gradientStart: gl.getUniformLocation(program, "u_gradientStart"),
  gradientEnd: gl.getUniformLocation(program, "u_gradientEnd"),
  maxBlur: gl.getUniformLocation(program, "u_maxBlur"),
  blurDirection: gl.getUniformLocation(program, "u_blurDirection"),
  texelSize: gl.getUniformLocation(program, "u_texelSize"),
  texture: gl.getUniformLocation(program, "u_texture"),
};

gl.enableVertexAttribArray(attribLocations.position);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.vertexAttribPointer(attribLocations.position, 2, gl.FLOAT, false, 0, 0);

gl.enableVertexAttribArray(attribLocations.uv);
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0);

gl.uniform1i(uniformLocations.texture, 0);

gl.clearColor(0, 0, 0, 1);

gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE);

gl.disable(gl.DEPTH_TEST);

const image = new Image();
image.src = "../assets/o.svg";
image.addEventListener("load", () => {
  initializeTexture(image);
  startRenderLoop(image);
});

function initializeTexture(imageSource) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageSource
  );
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);

  return { dpr, width: canvas.width, height: canvas.height };
}

function startRenderLoop(imageSource) {
  const textureWidth = imageSource.naturalWidth || imageSource.width;
  const textureHeight = imageSource.naturalHeight || imageSource.height;
  const aspectRatio = textureHeight / textureWidth;
  const passes = [
    {
      color: [0, 1, 0],
      offset: { x: 0, y: 0 },
      gradientStart: [0.0, 0.0],
      gradientEnd: [0.0, 0.0],
      maxBlur: 0,
      blurDirection: [1, 0],
    },
    {
      color: [1, 0, 0],
      offset: { x: -35, y: 28 },
      gradientStart: [0.0, 0.5],
      gradientEnd: [1.0, 0.5],
      maxBlur: 30,
      blurDirection: [1.0, 0.0],
    },
    {
      color: [0, 0, 1],
      offset: { x: 35, y: -22 },
      gradientStart: [1.0, 0.5],
      gradientEnd: [0.0, 0.5],
      maxBlur: 30,
      blurDirection: [-1.0, 0.0],
    },
  ];

  const texelSize = [1 / textureWidth, 1 / textureHeight];

  let lastTime = 0;

  function renderFrame(time) {
    const { dpr, width: canvasWidth, height: canvasHeight } = resizeCanvas();

    const desiredWidth = 200 * dpr;
    const desiredHeight = desiredWidth * aspectRatio;

    const baseScale = {
      x: desiredWidth / canvasWidth,
      y: desiredHeight / canvasHeight,
    };

    const delta = time - lastTime;
    lastTime = time;

    updateFrame({ time, delta });

    gl.clear(gl.COLOR_BUFFER_BIT);

    passes.forEach((pass) => {
      drawPass(pass, baseScale, texelSize, { canvasWidth, canvasHeight, dpr });
    });

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}

function pixelOffsetToClipSpace(offsetPixels, canvasDimension) {
  return (offsetPixels * 2) / canvasDimension;
}

function drawPass(pass, baseScale, texelSize, viewport) {
  const { canvasWidth, canvasHeight, dpr } = viewport;

  const offsetXClip = pixelOffsetToClipSpace(pass.offset.x * dpr, canvasWidth);
  const offsetYClip = -pixelOffsetToClipSpace(pass.offset.y * dpr, canvasHeight);

  gl.uniform2f(uniformLocations.translation, offsetXClip, offsetYClip);
  gl.uniform2f(uniformLocations.scale, baseScale.x, baseScale.y);
  gl.uniform3fv(uniformLocations.color, pass.color);
  gl.uniform2fv(uniformLocations.gradientStart, pass.gradientStart);
  gl.uniform2fv(uniformLocations.gradientEnd, pass.gradientEnd);
  gl.uniform1f(uniformLocations.maxBlur, pass.maxBlur);
  gl.uniform2fv(uniformLocations.blurDirection, pass.blurDirection);
  gl.uniform2fv(uniformLocations.texelSize, texelSize);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function updateFrame() {
  // Placeholder for future blur animation logic.
}

window.addEventListener("resize", () => {
  resizeCanvas();
});
