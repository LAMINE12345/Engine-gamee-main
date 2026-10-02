// =========================================================================
// Aether post-process shaders (GLSL ES 1.0 style, matches project convention)
// Shared vertex shader for every full-screen pass + all fragment programs.
// Depth-based passes receive uProj (camera projection) and uProjInv so they
// can move between view space and screen space in both directions.
// =========================================================================

import { Matrix4, Vector2 } from 'three';

export const PassthroughVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Depth reconstruction helpers injected into passes that read tDepth. */
const DepthCommon = `
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform mat4 uProj;
  uniform mat4 uProjInv;

  float readWindowDepth(vec2 uv) {
    return texture2D(tDepth, uv).x;
  }

  float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) /
      (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }

  vec3 viewPosFromDepth(vec2 uv, float windowDepth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, windowDepth * 2.0 - 1.0, 1.0);
    vec4 view = uProjInv * clip;
    return view.xyz / view.w;
  }

  vec2 projectViewToUv(vec3 viewPos) {
    vec4 clip = uProj * vec4(viewPos, 1.0);
    return (clip.xy / clip.w) * 0.5 + 0.5;
  }

  float interleavedGradientNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
`;

// =========================================================================
// DEPTH-BASED SSAO (replaces the old luminance-only contact fake)
// Normal buffer comes from GBufferPass (view-space MeshNormalMaterial).
// =========================================================================

export const SSAOShader = {
  name: 'AetherSSAOShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uProj: { value: new Matrix4() },
    uProjInv: { value: new Matrix4() },
    resolution: { value: new Vector2(1, 1) },
    radius: { value: 0.8 },
    intensity: { value: 1.2 },
    bias: { value: 0.02 },
    enableSSAO: { value: 0.0 },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform float radius;
    uniform float intensity;
    uniform float bias;
    uniform float enableSSAO;
    uniform vec2 resolution;
    varying vec2 vUv;

    ${DepthCommon}

    void main() {
      vec4 centerColor = texture2D(tDiffuse, vUv);
      if (enableSSAO < 0.5) {
        gl_FragColor = centerColor;
        return;
      }

      float windowDepth = readWindowDepth(vUv);
      if (windowDepth >= 0.9999) {
        gl_FragColor = centerColor;
        return;
      }

      vec3 viewPos = viewPosFromDepth(vUv, windowDepth);
      vec3 normal = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);

      float noiseAngle = interleavedGradientNoise(gl_FragCoord.xy + 0.5) * 6.2831853;
      vec3 up = abs(normal.z) < 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(up, normal));
      vec3 bitangent = cross(normal, tangent);

      float occlusion = 0.0;
      const int KERNEL = 12;

      for (int i = 0; i < KERNEL; i++) {
        float fi = float(i);
        float a = fi * 2.3999632 + noiseAngle;
        float z = (fi + 0.5) / float(KERNEL);
        float rr = sqrt(max(0.0, 1.0 - z * z));
        vec3 dir = vec3(cos(a) * rr, sin(a) * rr, z);
        vec3 sampleDir = tangent * dir.x + bitangent * dir.y + normal * dir.z;

        float sampleRadius = radius * (0.3 + 0.7 * fract(fi * 0.6180339887));
        vec3 samplePos = viewPos + sampleDir * sampleRadius;

        vec2 sampleUv = projectViewToUv(samplePos);
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
          continue;
        }

        float sceneDepth = readWindowDepth(sampleUv);
        if (sceneDepth >= 0.9999) continue;
        float sceneViewZ = viewPosFromDepth(sampleUv, sceneDepth).z;

        // viewZ is negative in front of camera: closer surfaces have larger (less negative) z
        float delta = sceneViewZ - samplePos.z;
        if (delta > bias && delta < radius * 2.0) {
          float rangeCheck = smoothstep(0.0, 1.0, radius / max(abs(delta), 0.0001));
          occlusion += rangeCheck;
        }
      }

      occlusion = clamp(occlusion / float(KERNEL), 0.0, 1.0) * intensity;
      occlusion = clamp(occlusion, 0.0, 0.85);
      vec3 finalColor = centerColor.rgb * (1.0 - occlusion);
      gl_FragColor = vec4(finalColor, centerColor.a);
    }
  `,
};

// =========================================================================
// SCREEN-SPACE REFLECTIONS (depth + view-normal ray march, no G-buffer needed
// beyond what GBufferPass already provides)
// =========================================================================

export const SSRShader = {
  name: 'AetherSSRShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uProj: { value: new Matrix4() },
    uProjInv: { value: new Matrix4() },
    enableSSR: { value: 0.0 },
    intensity: { value: 0.7 },
    thickness: { value: 0.25 },
    maxDistance: { value: 0.35 },
    steps: { value: 16 },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform float enableSSR;
    uniform float intensity;
    uniform float thickness;
    uniform float maxDistance;
    uniform float steps;
    varying vec2 vUv;

    ${DepthCommon}

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (enableSSR < 0.5) {
        gl_FragColor = color;
        return;
      }

      float windowDepth = readWindowDepth(vUv);
      if (windowDepth >= 0.9999) {
        gl_FragColor = color;
        return;
      }

      vec3 viewPos = viewPosFromDepth(vUv, windowDepth);
      vec3 viewDir = normalize(viewPos);
      vec3 normal = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
      vec3 rayDir = reflect(viewDir, normal);

      // Don't march rays pointing back into geometry behind the camera
      float facing = dot(normal, -viewDir);
      if (facing <= 0.0) {
        gl_FragColor = color;
        return;
      }

      float stepLen = maxDistance * 10.0 / max(steps, 1.0);
      vec3 rayPos = viewPos + normal * 0.02;
      vec2 hitUv = vec2(-1.0);
      float hitDepth = 0.0;

      const int MAX_STEPS = 32;
      int nSteps = int(clamp(steps, 4.0, 32.0));

      for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= nSteps) break;
        rayPos += rayDir * stepLen;

        vec2 uv = projectViewToUv(rayPos);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

        float sceneDepth = readWindowDepth(uv);
        if (sceneDepth >= 0.9999) continue;
        float sceneZ = viewPosFromDepth(uv, sceneDepth).z;

        // rayZ is more negative when farther; hit when ray is behind surface within thickness
        float dz = sceneZ - rayPos.z;
        if (dz > 0.0 && dz < thickness) {
          hitUv = uv;
          hitDepth = sceneDepth;
          break;
        }
      }

      if (hitUv.x < 0.0) {
        gl_FragColor = color;
        return;
      }

      vec3 reflection = texture2D(tDiffuse, hitUv).rgb;

      // Fade at screen edges
      vec2 edge = smoothstep(vec2(0.0), vec2(0.12), hitUv) *
                  (1.0 - smoothstep(vec2(0.88), vec2(1.0), hitUv));
      float edgeFade = edge.x * edge.y;

      // Fresnel-ish weighting (stronger at grazing angles)
      float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 3.0);
      float weight = clamp(intensity * edgeFade * (0.35 + 0.65 * fresnel), 0.0, 1.0);

      gl_FragColor = vec4(mix(color.rgb, reflection, weight), color.a);
    }
  `,
};

// =========================================================================
// MOTION BLUR — camera-velocity reprojection from the depth buffer.
// velocity = currentUV - prevUV(prevViewProj * worldPos)
// =========================================================================

export const MotionBlurShader = {
  name: 'AetherMotionBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uProj: { value: new Matrix4() },
    uProjInv: { value: new Matrix4() },
    uInvViewProj: { value: new Matrix4() },
    uPrevViewProj: { value: new Matrix4() },
    enableMotionBlur: { value: 0.0 },
    strength: { value: 0.5 },
    samples: { value: 8 },
    maxRadius: { value: 0.03 },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform mat4 uInvViewProj;
    uniform mat4 uPrevViewProj;
    uniform float enableMotionBlur;
    uniform float strength;
    uniform float samples;
    uniform float maxRadius;
    varying vec2 vUv;

    ${DepthCommon}

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (enableMotionBlur < 0.5) {
        gl_FragColor = color;
        return;
      }

      float windowDepth = readWindowDepth(vUv);
      if (windowDepth >= 0.9999) {
        gl_FragColor = color;
        return;
      }

      vec4 clip = vec4(vUv * 2.0 - 1.0, windowDepth * 2.0 - 1.0, 1.0);
      vec4 world = uInvViewProj * clip;
      world /= world.w;

      vec4 prevClip = uPrevViewProj * world;
      if (abs(prevClip.w) < 0.0001) {
        gl_FragColor = color;
        return;
      }
      vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
      vec2 velocity = (vUv - prevUv) * strength;

      float speed = length(velocity);
      if (speed < 0.0004) {
        gl_FragColor = color;
        return;
      }
      if (speed > maxRadius) {
        velocity *= maxRadius / speed;
        speed = maxRadius;
      }

      const int MAX_SAMPLES = 16;
      int n = int(clamp(samples, 4.0, 16.0));
      vec3 accum = color.rgb;
      float wsum = 1.0;

      // Dither the start offset to hide banding
      float jitter = interleavedGradientNoise(gl_FragCoord.xy) - 0.5;

      for (int i = 1; i < MAX_SAMPLES; i++) {
        if (i >= n) break;
        float t = (float(i) + jitter) / float(n);
        vec2 uv = vUv - velocity * t;
        uv = clamp(uv, vec2(0.001), vec2(0.999));
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float w = 1.0;
        accum += s * w;
        wsum += w;
      }

      gl_FragColor = vec4(accum / wsum, color.a);
    }
  `,
};

// =========================================================================
// DEPTH OF FIELD — circle of confusion from linear depth + poisson bokeh
// =========================================================================

export const DepthOfFieldShader = {
  name: 'AetherDepthOfFieldShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uProj: { value: new Matrix4() },
    uProjInv: { value: new Matrix4() },
    resolution: { value: new Vector2(1, 1) },
    enableDoF: { value: 0.0 },
    focusDistance: { value: 12 },
    focalRange: { value: 8 },
    aperture: { value: 0.6 },
    maxBlur: { value: 0.015 },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float enableDoF;
    uniform float focusDistance;
    uniform float focalRange;
    uniform float aperture;
    uniform float maxBlur;
    varying vec2 vUv;

    ${DepthCommon}

    float cocAt(vec2 uv) {
      float d = linearizeDepth(readWindowDepth(uv));
      float signed = (d - focusDistance) / max(focalRange * 0.5, 0.001);
      // -1 (near) .. 0 (sharp) .. +1 (far)
      float c = clamp(signed, -1.0, 1.0);
      return abs(c) * aperture;
    }

    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      if (enableDoF < 0.5) {
        gl_FragColor = center;
        return;
      }

      float coc = cocAt(vUv);
      float radius = coc * maxBlur;
      if (radius < 0.0005) {
        gl_FragColor = center;
        return;
      }

      vec2 texel = 1.0 / resolution;
      vec3 accum = center.rgb;
      float wsum = 1.0;

      // 16-tap golden-angle spiral bokeh
      float rot = interleavedGradientNoise(gl_FragCoord.xy) * 6.2831853;
      const int TAPS = 16;
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i) + 0.5;
        float a = fi * 2.3999632 + rot;
        float r = sqrt(fi / float(TAPS));
        vec2 offset = vec2(cos(a), sin(a)) * r * radius;
        vec2 uv = vUv + offset;

        // Weight by the tap's own CoC so in-focus pixels don't bleed outward
        float tapCoc = cocAt(clamp(uv, vec2(0.0), vec2(1.0)));
        float tapRadius = tapCoc * maxBlur;
        float w = (tapRadius >= length(offset) * 0.6) ? 1.0 : 0.25;

        accum += texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb * w;
        wsum += w;
      }

      gl_FragColor = vec4(accum / wsum, center.a);
    }
  `,
};

// =========================================================================
// TEMPORAL AA RESOLVE — camera reprojection + neighbourhood AABB clipping
// =========================================================================

export const TAAResolveShader = {
  name: 'AetherTAAResolveShader',
  uniforms: {
    tCurrent: { value: null },
    tHistory: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uProj: { value: new Matrix4() },
    uProjInv: { value: new Matrix4() },
    uInvViewProj: { value: new Matrix4() },
    uPrevViewProj: { value: new Matrix4() },
    feedback: { value: 0.9 },
    reset: { value: 0.0 },
    resolution: { value: new Vector2(1, 1) },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tCurrent;
    uniform sampler2D tHistory;
    uniform mat4 uInvViewProj;
    uniform mat4 uPrevViewProj;
    uniform float feedback;
    uniform float reset;
    uniform vec2 resolution;
    varying vec2 vUv;

    ${DepthCommon}

    void main() {
      vec3 current = texture2D(tCurrent, vUv).rgb;
      if (reset > 0.5) {
        gl_FragColor = vec4(current, 1.0);
        return;
      }

      float windowDepth = readWindowDepth(vUv);
      vec2 historyUv = vUv;

      if (windowDepth < 0.9999) {
        vec4 clip = vec4(vUv * 2.0 - 1.0, windowDepth * 2.0 - 1.0, 1.0);
        vec4 world = uInvViewProj * clip;
        world /= world.w;
        vec4 prevClip = uPrevViewProj * world;
        if (abs(prevClip.w) > 0.0001) {
          historyUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
        }
      }

      if (historyUv.x < 0.0 || historyUv.x > 1.0 || historyUv.y < 0.0 || historyUv.y > 1.0) {
        gl_FragColor = vec4(current, 1.0);
        return;
      }

      // Neighbourhood clamp in 3x3 of the current frame
      vec2 texel = 1.0 / resolution;
      vec3 mn = current;
      vec3 mx = current;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 s = texture2D(tCurrent, vUv + vec2(float(x), float(y)) * texel).rgb;
          mn = min(mn, s);
          mx = max(mx, s);
        }
      }

      vec3 history = texture2D(tHistory, historyUv).rgb;
      history = clamp(history, mn, mx);

      // Reduce feedback when reprojection velocity is high (less ghosting)
      float vel = length((historyUv - vUv) / texel); // pixels
      float velocityFade = clamp(1.0 - vel / 40.0, 0.0, 1.0);
      float fb = feedback * mix(0.5, 1.0, velocityFade);

      vec3 result = mix(current, history, fb);
      gl_FragColor = vec4(result, 1.0);
    }
  `,
};

// =========================================================================
// COLOR GRADING — exposure, temperature/tint, contrast, saturation,
// shadows/midtones/highlights curves, LUT strip, chromatic aberration, vignette
// =========================================================================

export const ColorGradingShader = {
  name: 'AetherColorGradingShader',
  uniforms: {
    tDiffuse: { value: null },
    lut: { value: null },
    lutSize: { value: 0 },
    lutIntensity: { value: 1.0 },
    exposure: { value: 1.1 },
    contrast: { value: 1.05 },
    saturation: { value: 1.1 },
    temperature: { value: 0.0 },
    tint: { value: 0.0 },
    shadows: { value: 0.0 },
    midtones: { value: 0.0 },
    highlights: { value: 0.0 },
    enableColorGrading: { value: 1.0 },
    vignetteDarkness: { value: 0.9 },
    vignetteOffset: { value: 1.1 },
    enableVignette: { value: 1.0 },
    chromaticAberration: { value: 0.0 },
  },
  vertexShader: PassthroughVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D lut;
    uniform float lutSize;
    uniform float lutIntensity;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float temperature;
    uniform float tint;
    uniform float shadows;
    uniform float midtones;
    uniform float highlights;
    uniform float enableColorGrading;
    uniform float vignetteDarkness;
    uniform float vignetteOffset;
    uniform float enableVignette;
    uniform float chromaticAberration;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    // Horizontal strip LUT: width = size*size, height = size, blue slices left→right
    vec3 applyLut(vec3 rgb) {
      if (lutSize < 2.0) return rgb;
      float size = lutSize;
      rgb = clamp(rgb, 0.0, 1.0);
      float z = rgb.b * (size - 1.0);
      float slice = floor(z);
      float f = fract(z);
      float x0 = slice * size + rgb.r * (size - 1.0);
      float x1 = (slice + 1.0) * size + rgb.r * (size - 1.0);
      float y = rgb.g * (size - 1.0);
      vec2 uv0 = vec2((x0 + 0.5) / (size * size), (y + 0.5) / size);
      vec2 uv1 = vec2((x1 + 0.5) / (size * size), (y + 0.5) / size);
      vec3 c0 = texture2D(lut, uv0).rgb;
      vec3 c1 = texture2D(lut, uv1).rgb;
      return mix(c0, c1, f);
    }

    void main() {
      vec2 uv = vUv;
      vec4 color;

      // --- Chromatic aberration (radial RGB split) ---
      if (chromaticAberration > 0.0001) {
        vec2 dir = (uv - 0.5) * chromaticAberration;
        float r = texture2D(tDiffuse, uv + dir).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - dir).b;
        color = vec4(r, g, b, 1.0);
      } else {
        color = texture2D(tDiffuse, uv);
      }

      vec3 rgb = color.rgb;

      if (enableColorGrading > 0.5) {
        // Exposure
        rgb *= exposure;

        // White balance (approx): temperature warm/cool, tint green/magenta
        rgb.r *= 1.0 + temperature * 0.20;
        rgb.g *= 1.0 + tint * 0.15;
        rgb.b *= 1.0 - temperature * 0.20;

        // Contrast around 0.5 pivot
        rgb = (rgb - 0.5) * contrast + 0.5;

        // Shadows / highlights lift & gain
        float luma = dot(rgb, LUMA);
        rgb += shadows * (1.0 - smoothstep(0.0, 0.6, luma)) * (rgb * 0.5 + 0.15);
        rgb += highlights * smoothstep(0.35, 1.0, luma) * rgb * 0.75;

        // Midtones gamma-style
        rgb = pow(max(rgb, vec3(0.0)), vec3(1.0 + midtones * 0.6));

        // Saturation
        float g2 = dot(rgb, LUMA);
        rgb = mix(vec3(g2), rgb, saturation);

        // LUT
        if (lutSize >= 2.0) {
          rgb = mix(rgb, applyLut(rgb), lutIntensity);
        }
      }

      rgb = max(rgb, vec3(0.0));

      // --- Vignette ---
      if (enableVignette > 0.5) {
        vec2 center = uv - vec2(0.5);
        float d = length(center);
        float vig = smoothstep(0.8, vignetteOffset * 0.799, d * (vignetteDarkness + 0.5));
        rgb *= clamp(vig, 0.0, 1.0);
      }

      gl_FragColor = vec4(rgb, color.a);
    }
  `,
};
