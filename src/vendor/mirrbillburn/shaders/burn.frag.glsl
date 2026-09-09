
  precision highp float;

  uniform sampler2D uTexture;
  uniform float uBurnProgress;
  uniform float uBurnScale;
  uniform float uEmberWidth;
  uniform float uCharWidth;
  uniform float uBurnDirection; 
  uniform float uAspect;
  uniform vec3 uEmberColor;
  uniform vec3 uEmberTip;
  uniform vec3 uCharColor;
  uniform float uSeed;
  uniform float uBurnDelay;  
  uniform float uBurnSpeed;  
  uniform float uTime;
  uniform vec2  uTexOffset;   
  uniform vec2  uTexScale;    
  uniform float uTexRotate;   

  varying vec2 vUv;

  
  
  
  
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  
  
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      value += amplitude * vnoise(p);
      p = rot * p * 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    centeredUv.x *= uAspect;
    float edgeDist = 1.0 - clamp(length(centeredUv) * 2.0 / uAspect, 0.0, 1.0);
    float distField = mix(1.0 - edgeDist, edgeDist, uBurnDirection);

    
    float localProgress = clamp((uBurnProgress - uBurnDelay) / (1.0 - uBurnDelay) * uBurnSpeed, 0.0, 1.0);
    float threshold = localProgress * 1.5;

    
    
    
    
    if (distField * 0.5 + 0.5 < threshold) discard;

    
    vec2 mUv = (uTexRotate > 0.5) ? vec2(vUv.y, 1.0 - vUv.x) : vUv;
    mUv = mUv * uTexScale + uTexOffset;
    vec4 texColor = texture2D(uTexture, mUv);
    vec3 baseRGB = texColor.rgb;
    float baseAlpha = texColor.a;

    vec2 noiseUv = vec2(vUv.x * uAspect, vUv.y) * uBurnScale;
    float noise = fbm(noiseUv + uSeed * 73.156);
    float noiseDetail = fbm(noiseUv * 0.8 + uSeed * 73.156 + 50.0);
    float combinedNoise = noise * 0.65 + noiseDetail * 0.35;
    float burnMap = distField * 0.5 + combinedNoise * 0.5;
    float edge = burnMap - threshold;

    if (edge < 0.0) discard;

    float charFactor = 1.0 - smoothstep(0.0, uCharWidth, edge);
    float emberFactor = 1.0 - smoothstep(0.0, uEmberWidth, edge);
    vec3 emberColor = mix(uEmberColor, uEmberTip, emberFactor);
    
    float flicker = vnoise(noiseUv * 0.8 + uTime * 2.5) * 10.0 + 0.5;
    emberColor *= flicker;
    float edgeFade = smoothstep(0.0, uEmberWidth, edge);

    vec3 finalRGB = mix(baseRGB, uCharColor, charFactor);
    finalRGB += emberColor * emberFactor;

    gl_FragColor = vec4(finalRGB, baseAlpha * edgeFade);
    #include <colorspace_fragment>
  }
