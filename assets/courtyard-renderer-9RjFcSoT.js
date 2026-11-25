import{m as y,j as w,a4 as g,b as S,a3 as b,a2 as u,G as C,u as M,aO as x,g as k,a1 as R}from"./courtyard-camera-C6A34HXx.js";import{c as P}from"./case-stage-renderer-C944iOcc.js";import"./index-DND8d4x2.js";function A(n,r){const t=new y(19,13,32,18);t.rotateX(-Math.PI/2);const e=t.getAttribute("position");for(let i=0;i<e.count;i++){const l=e.getX(i),p=e.getZ(i),v=w.smoothstep(Math.hypot(l*.76,p),2.22,5.5),f=.1*Math.sin(.95*l+.73*p)+.065*Math.cos(1.45*p-.64*l);e.setY(i,v*(f-.17))}t.computeVertexNormals();const o=new g({color:2698294,opacity:.46,depthWrite:!0,fog:!1}),a=new S(t,o);a.name="Скальная полка — поверхность опоры",a.receiveShadow=!0,a.renderOrder=-1;const c=new b(15131117,8877932,1.22),s=new u(16763286,1.84);s.position.set(-4.6,8.8,1.5),s.castShadow=!0,s.shadow.mapSize.setScalar(r?512:768),Object.assign(s.shadow.camera,{left:-5.6,right:5.6,top:4.8,bottom:-4.8,near:.5,far:24}),s.shadow.camera.updateProjectionMatrix(),s.shadow.bias=-17e-5,s.shadow.normalBias=.004,s.shadow.radius=r?5:7;const m=new u(16766123,.56);m.position.set(-4.8,3.7,-3.8);const h=new u(13491967,.54);h.position.set(2.2,1.75,4.3);const d=new C;return d.name="Гранитный гребень",d.add(a,c,s,m,h),n.add(d),{ready:Promise.resolve(),update(){},dispose(){d.removeFromParent(),s.shadow.dispose(),t.dispose(),o.dispose()}}}const G=`
  varying vec4 vClip;
  void main() {
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }`,U=`
  varying vec4 vClip;
  uniform float uAspect, uTime, uSkyReady;
  uniform sampler2D uSkyMap;
  void main() {
    vec2 screenUV = .5 + .5 * vClip.xy / vClip.w;
    // A narrower screen crops the sides of the photograph, preserving the
    // vertical registration of the sun, shelf and contact plane at every width.
    vec2 crop = vec2(min(uAspect * .25, 1.), .75 * min(4. / uAspect, 1.));
    vec2 uv = vec2(.5, .49) + (screenUV - .5) * crop;
    float cloud = smoothstep(.43, .54, uv.y) * (1. - smoothstep(.60, .68, uv.y));
    uv.x += .0018 * sin(uTime * .14) * cloud;
    vec3 sky = mix(vec3(.46,.53,.62), vec3(.22,.38,.58), screenUV.y);
    gl_FragColor = vec4(mix(sky, texture2D(uSkyMap, uv).rgb, uSkyReady), 1.);
    #include <colorspace_fragment>
  }`;function V(n,r){const t=document.createElement("canvas");t.width=512,t.height=256;const e=t.getContext("2d"),o=e.createLinearGradient(0,0,0,256);o.addColorStop(0,"#a7accb"),o.addColorStop(.45,"#ead6c6"),o.addColorStop(.54,"#9b9394"),o.addColorStop(1,"#665f5b"),e.fillStyle=o,e.fillRect(0,0,512,256),e.drawImage(r,0,85,256,85),e.translate(512,0),e.scale(-1,1),e.drawImage(r,0,85,256,85);const a=new M(t);a.mapping=x,a.colorSpace=k;const c=new R(n);try{return c.fromEquirectangular(a)}finally{a.dispose(),c.dispose()}}function L(n,r,t=!1){const e=P(n,r,{buildLayout:A,sky:{vertexShader:G,fragmentShader:U,uniforms:{uAspect:{value:1},uTime:{value:1.6}}},panorama:"./assets/cases/features/summit-shelf.webp",reflections:{fromPanorama:V},reflectionIntensity:.89,alignWithRecording:!0,snow:{wide:210,compact:95,opacity:.18,variation:.29}},t);return{...e.surface,snapshotCase(o){const a=e.layout;if(!t||!a||!e.visibleCase)throw new Error("A visible case and alpha capture are required");try{return e.sky.visible=e.snow.visible=!1,e.renderer.shadowMap.needsUpdate=!0,e.surface.snapshot(1.6,0,o)}finally{e.sky.visible=e.snow.visible=!0,e.renderer.shadowMap.needsUpdate=!0}}}}export{L as createCourtyardRenderer};
