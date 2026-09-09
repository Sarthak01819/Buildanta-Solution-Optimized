
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    
    float wave = sin(uv.x * uWaveFreq + uTime * 2.0 + uSeed * 6.283) * uWaveAmp;
    wave += sin(uv.y * uWaveFreq * 0.7 + uTime * 1.5 + uSeed * 3.7) * uWaveAmp * 0.5;
    pos.z += wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
