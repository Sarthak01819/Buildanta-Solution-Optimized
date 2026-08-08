import * as THREE from 'three';
import { shellVert, shellFrag } from './shaders/shell.glsl.js';
import { linear } from './tokens.js';

/** Layer 3 — the glass shell. 32×32 segments = 1,984 triangles, the measured
 *  count, and the radius sits just UNDER the particle radius so the cloud
 *  physically exits the mesh. That overlap IS the dissolving edge. */
export class GlassShell {
  constructor(params) {
    this.geometry = new THREE.SphereGeometry(params.radius, params.segments, params.segments);

    this.material = new THREE.ShaderMaterial({
      vertexShader: shellVert,
      fragmentShader: shellFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: params.opacity },
        uShininess: { value: params.shininess },
        uColorFresnelAmount: { value: params.colorFresnelAmount },
        uColorFresnelOffset: { value: params.colorFresnelOffset },
        uColorFresnelFalloff: { value: params.colorFresnelFalloff },
        uOpacityFresnelAmount: { value: params.opacityFresnelAmount },
        uOpacityFresnelOffset: { value: params.opacityFresnelOffset },
        uOpacityFresnelFalloff: { value: params.opacityFresnelFalloff },
        uCloudsSmoothstep: { value: new THREE.Vector2(...params.cloudsSmoothstep) },
        uCloudNoiseScale: { value: new THREE.Vector3(...params.cloudNoiseScale) },
        uCloudNoiseSpeed: { value: params.cloudNoiseSpeed },
        uAmbientColor: { value: linear(params.ambientColor) },
        uFresnelColor: { value: linear(params.fresnelColor) },
        uCloudsColor: { value: linear(params.cloudsColor) },
        uLight1Color: { value: linear(params.light1.color) },
        uLight1Position: { value: new THREE.Vector3(...params.light1.position) },
        uLight1Intensity: { value: params.light1.intensity },
        uLight1Specular: { value: params.light1.specular },
        uLight2Color: { value: linear(params.light2.color) },
        uLight2Position: { value: new THREE.Vector3(...params.light2.position) },
        uLight2Intensity: { value: params.light2.intensity },
        uLight2Specular: { value: params.light2.specular },
      },
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 1; // after the dust, before the flares
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
