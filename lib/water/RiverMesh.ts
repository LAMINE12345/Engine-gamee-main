import * as THREE from 'three';

export interface RiverConfig {
  width: number;
  length: number;
  meanderFactor: number;
  meanderAmplitude: number;
  flowSpeed: number;
  waterColor: string;
  deepWaterColor: string;
  foamColor: string;
  foamIntensity: number;
  autoCarveTerrain?: boolean;
}

export const DEFAULT_RIVER_CONFIG: RiverConfig = {
  width: 6.5,
  length: 75.0,
  meanderFactor: 1.2,
  meanderAmplitude: 8.0,
  flowSpeed: 1.2,
  waterColor: '#0284c7',
  deepWaterColor: '#042f2e',
  foamColor: '#e0f2fe',
  foamIntensity: 0.75,
  autoCarveTerrain: true,
};

const RiverShader = {
  uniforms: {
    time: { value: 0 },
    flowSpeed: { value: 1.2 },
    waterColor: { value: new THREE.Color('#0284c7') },
    deepWaterColor: { value: new THREE.Color('#042f2e') },
    foamColor: { value: new THREE.Color('#e0f2fe') },
    foamIntensity: { value: 0.75 },
    sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    sunColor: { value: new THREE.Color('#fff8eb') },
  },
  vertexShader: `
    uniform float time;
    uniform float flowSpeed;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vEdgeFactor;

    void main() {
      vUv = uv;
      // Distance from center line (0 at center, 1 at shore edges)
      vEdgeFactor = abs(uv.x - 0.5) * 2.0;

      vec3 p = position;
      // Gentle surface wave ripples flowing downstream
      float flowTime = time * flowSpeed;
      float wave = sin(uv.y * 12.0 - flowTime * 3.0) * cos(uv.x * 6.0) * 0.08;
      p.y += wave * (1.0 - pow(vEdgeFactor, 2.0)); // Dampen wave height near bank edges

      vec4 worldPos = modelMatrix * vec4(p, 1.0);
      vWorldPosition = worldPos.xyz;
      
      // Calculate normal with subtle wave perturbation
      vec3 norm = vec3(-wave * 0.5, 1.0, -wave * 0.5);
      vNormal = normalize(mat3(modelMatrix) * norm);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform float flowSpeed;
    uniform vec3 waterColor;
    uniform vec3 deepWaterColor;
    uniform vec3 foamColor;
    uniform float foamIntensity;
    uniform vec3 sunDirection;
    uniform vec3 sunColor;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vEdgeFactor;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 norm = normalize(vNormal);

      // Micro-ripple texture coordinates animated along flow axis (V coordinate)
      vec2 flowUv = vec2(vUv.x * 3.0, vUv.y * 10.0 - time * flowSpeed * 0.8);
      float microNoise = sin(flowUv.x * 10.0 + sin(flowUv.y * 15.0)) * 0.06;
      norm = normalize(norm + vec3(microNoise, 0.0, microNoise));

      // Fresnel reflection
      float NdotV = max(0.0, dot(norm, viewDir));
      float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 3.5);

      // Sun specular shine
      vec3 halfDir = normalize(sunDirection + viewDir);
      float spec = pow(max(0.0, dot(norm, halfDir)), 48.0) * 1.5;

      // Color gradient: Center is deep, shores are shallow
      float depthFactor = 1.0 - vEdgeFactor;
      vec3 baseWater = mix(waterColor, deepWaterColor, clamp(depthFactor * 0.8, 0.0, 1.0));

      // Shoreline & Bank Foam
      float shoreFoam = smoothstep(0.65, 0.98, vEdgeFactor);
      // Crest / turbulence noise along river flow
      float turbulence = sin(vUv.y * 30.0 - time * flowSpeed * 2.0) * 0.5 + 0.5;
      float totalFoam = clamp(shoreFoam * foamIntensity * (0.6 + turbulence * 0.4), 0.0, 1.0);

      vec3 colorWithFoam = mix(baseWater, foamColor, totalFoam);
      vec3 finalColor = mix(colorWithFoam, sunColor * 0.9 + waterColor * 0.1, fresnel * 0.5) + sunColor * spec;

      // Caustics shimmer effect
      float caustics = pow(max(0.0, sin(vWorldPosition.x * 1.8 + time * 2.5) * cos(vWorldPosition.z * 1.8 + time * 2.5)), 2.0) * 0.12;
      finalColor += vec3(caustics);

      // Smooth alpha fade on extreme shore edges for natural blending
      float alpha = clamp(0.92 - pow(vEdgeFactor, 6.0) * 0.4, 0.0, 1.0);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `,
};

export class RiverMesh {
  public mesh: THREE.Mesh;
  public geometry: THREE.BufferGeometry;
  public material: THREE.ShaderMaterial;
  public config: RiverConfig;
  public curve: THREE.CatmullRomCurve3;

  constructor(config?: Partial<RiverConfig>) {
    this.config = { ...DEFAULT_RIVER_CONFIG, ...config };
    this.curve = this.buildCurve();

    this.geometry = this.buildRibbonGeometry();
    this.material = new THREE.ShaderMaterial({
      vertexShader: RiverShader.vertexShader,
      fragmentShader: RiverShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(RiverShader.uniforms),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "Rivière (Fleuve Animé)";
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData = {
      subType: 'river',
      isRiver: true,
      riverConfig: this.config,
    };

    this.updateUniforms();
  }

  public updateConfig(config: Partial<RiverConfig>): void {
    this.config = { ...this.config, ...config };
    this.mesh.userData.riverConfig = this.config;

    // Rebuild curve and geometry if path parameters changed
    this.curve = this.buildCurve();
    const newGeo = this.buildRibbonGeometry();
    this.geometry.dispose();
    this.geometry = newGeo;
    this.mesh.geometry = newGeo;

    this.updateUniforms();
  }

  private buildCurve(): THREE.CatmullRomCurve3 {
    const { length, meanderFactor, meanderAmplitude } = this.config;
    const numPoints = 12;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const z = (t - 0.5) * length;
      // Winding meander offset along X axis using composite sine waves
      const x =
        Math.sin(t * Math.PI * 2 * meanderFactor) * meanderAmplitude +
        Math.sin(t * Math.PI * 5 * meanderFactor) * (meanderAmplitude * 0.3);
      // Gentle slope downwards along flow
      const y = -t * 0.4;

      points.push(new THREE.Vector3(x, y, z));
    }

    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  }

  private buildRibbonGeometry(): THREE.BufferGeometry {
    const { width, length } = this.config;
    const tubularSegments = 120; // Resolution along length
    const points = this.curve.getSpacedPoints(tubularSegments);

    const vertexCount = (tubularSegments + 1) * 2;
    const indexCount = tubularSegments * 6;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);

    const halfWidth = width / 2;
    const up = new THREE.Vector3(0, 1, 0);

    let vIdx = 0;
    let uvIdx = 0;

    for (let i = 0; i <= tubularSegments; i++) {
      const u = i / tubularSegments;
      const point = points[i];

      // Compute tangent along curve
      const tangent = this.curve.getTangentAt(u).normalize();
      // Binormal vector perpendicular to tangent and up vector
      const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (binormal.lengthSq() < 0.001) {
        binormal.set(1, 0, 0);
      }

      // Left vertex
      const leftP = point.clone().addScaledVector(binormal, -halfWidth);
      positions[vIdx * 3] = leftP.x;
      positions[vIdx * 3 + 1] = leftP.y;
      positions[vIdx * 3 + 2] = leftP.z;
      normals[vIdx * 3] = 0;
      normals[vIdx * 3 + 1] = 1;
      normals[vIdx * 3 + 2] = 0;
      uvs[uvIdx * 2] = 0;
      uvs[uvIdx * 2 + 1] = u * (length / Math.max(width, 1.0));
      vIdx++;
      uvIdx++;

      // Right vertex
      const rightP = point.clone().addScaledVector(binormal, halfWidth);
      positions[vIdx * 3] = rightP.x;
      positions[vIdx * 3 + 1] = rightP.y;
      positions[vIdx * 3 + 2] = rightP.z;
      normals[vIdx * 3] = 0;
      normals[vIdx * 3 + 1] = 1;
      normals[vIdx * 3 + 2] = 0;
      uvs[uvIdx * 2] = 1;
      uvs[uvIdx * 2 + 1] = u * (length / Math.max(width, 1.0));
      vIdx++;
      uvIdx++;
    }

    let iIdx = 0;
    for (let i = 0; i < tubularSegments; i++) {
      const row1 = i * 2;
      const row2 = (i + 1) * 2;

      // Triangle 1
      indices[iIdx++] = row1;
      indices[iIdx++] = row1 + 1;
      indices[iIdx++] = row2;

      // Triangle 2
      indices[iIdx++] = row1 + 1;
      indices[iIdx++] = row2 + 1;
      indices[iIdx++] = row2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    return geo;
  }

  public updateUniforms(): void {
    if (!this.material) return;
    const u = this.material.uniforms;
    u.flowSpeed.value = this.config.flowSpeed;
    u.waterColor.value.set(this.config.waterColor);
    u.deepWaterColor.value.set(this.config.deepWaterColor);
    u.foamColor.value.set(this.config.foamColor);
    u.foamIntensity.value = this.config.foamIntensity;
  }

  public setSunDirection(sunDir: THREE.Vector3, sunColor: THREE.Color): void {
    if (!this.material) return;
    this.material.uniforms.sunDirection.value.copy(sunDir).normalize();
    this.material.uniforms.sunColor.value.copy(sunColor);
  }

  public update(dt: number): void {
    if (!this.material) return;
    this.material.uniforms.time.value += dt;
  }

  /**
   * Get river height and flow direction at any world position (x, z)
   */
  public getRiverHeightAndFlowAt(worldX: number, worldZ: number): { height: number; flow: THREE.Vector3; inRiver: boolean } {
    const localPos = this.mesh.worldToLocal(new THREE.Vector3(worldX, 0, worldZ));
    const { width } = this.config;

    // Find closest point on curve
    let closestU = 0;
    let minDistSq = Infinity;
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const p = this.curve.getPointAt(u);
      const distSq = (p.x - localPos.x) * (p.x - localPos.x) + (p.z - localPos.z) * (p.z - localPos.z);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestU = u;
      }
    }

    const closestDist = Math.sqrt(minDistSq);
    const halfWidth = width / 2;

    if (closestDist <= halfWidth * 1.2) {
      const curvePoint = this.curve.getPointAt(closestU);
      const tangent = this.curve.getTangentAt(closestU).normalize();
      
      // Transform local curve point to world space
      const worldCurvePoint = this.mesh.localToWorld(curvePoint.clone());
      const worldTangent = tangent.clone().transformDirection(this.mesh.matrixWorld).normalize();

      return {
        height: worldCurvePoint.y,
        flow: worldTangent.multiplyScalar(this.config.flowSpeed),
        inRiver: true,
      };
    }

    return {
      height: -999,
      flow: new THREE.Vector3(0, 0, 0),
      inRiver: false,
    };
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
