// Print artwork for the eight Workshop containers. Coordinates are in the plate's print space.
function inkTexture(ctx, width, height) {
  // Repeatable enamel grain and fine, occasional chips in the screen print.
  let seed = 7251;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 4300; i++) {
    ctx.fillStyle = random() < .52 ? 'rgba(255,251,224,.10)' : 'rgba(19,22,24,.14)';
    ctx.fillRect(random() * width, random() * height, random() * 2.6 + .5, random() * 1.3 + .4);
  }
}

export function workshopPrint(id, style, front = false) {
  const canvas = document.createElement('canvas');
  const width = 880, height = front ? 240 : 520;
  canvas.width = width * 2; canvas.height = height * 2;
  const c = canvas.getContext('2d');
  c.scale(2,2);
  const [base, ink, paper] = style.print;
  function rect(x,y,w,h,color) { c.fillStyle=color; c.fillRect(x,y,w,h); }
  function line(points,color,stroke=3,close=false) {
    c.beginPath(); points.forEach(([x,y],i)=>i ? c.lineTo(x,y) : c.moveTo(x,y));
    if (close) c.closePath();
    c.strokeStyle=color; c.lineWidth=stroke; c.stroke();
  }
  function polygon(points, color) {
    c.beginPath(); points.forEach(([x,y],i)=>i ? c.lineTo(x,y) : c.moveTo(x,y));
    c.closePath(); c.fillStyle=color; c.fill();
  }
  function ring(x,y,r,color,stroke=4) {
    c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=stroke;c.stroke();
  }
  function label(value,x,y,size,color,weight='bold') {
    c.font=weight+' '+size+'px '+(size>47?'"Arial Narrow",Arial':'Consolas,monospace');
    c.fillStyle=color; c.fillText(value,x,y);
  }
  rect(0,0,width,height,base);
  if(front) {
    if (id==='foundry') {
      rect(0,0,276,height,ink);
      for(let x=-180;x<235;x+=92) polygon([[x,0],[x+36,0],[x+174,height],[x+137,height]],base);
    } else if(id==='signal-flag') {
      for(let x=10;x<245;x+=85){rect(x,36,68,68,ink);polygon([[x,36],[x+68,36],[x,104]],paper);}
    } else if(id==='blackbird') {
      for(let i=0;i<4;i++) polygon([[25+i*39,86],[53+i*39,86],[92+i*39,151],[62+i*39,151]],paper);
    } else if(id==='salt-flat'||id==='polar-night') {
      for(let i=0;i<4;i++) line([[8,175-i*19],[86,95-i*13],[137,139-i*14],[211,76-i*13],[268,114-i*19]],ink,6);
    } else {
      ring(126,118,73,ink,6); ring(126,118,56,ink,2);
      line([[60,125],[82,125],[94,97],[111,144],[132,75],[149,151],[166,112],[190,112]],ink,7);
    }
    rect(290,27,3,185,ink);
    label(style.word,312,131,64,paper,'900');
    label(style.code+'   /   '+style.short,318,181,21,ink);
    for(let i=0;i<17;i++) rect(724+i*7,62, i%3===1?4:2,44,paper);
    rect(26,height-18,width-52,3,ink);
    inkTexture(c,width,height);
    return canvas;
  }
  // The broad central mark carries the identity even when the serial is small.
  switch(id) {
    case 'foundry': {
      polygon([[0,0],[384,0],[180,520],[0,520]],ink);
      for(let i=0;i<4;i++){const x=25+i*63;polygon([[x,40],[x+26,40],[x-104,340],[x-129,340]],base);}
      polygon([[292,178],[430,178],[409,260],[369,278],[325,246]],paper);
      polygon([[320,104],[346,129],[359,70],[386,134],[407,112],[421,157],[312,157]],ink);
      polygon([[404,247],[440,217],[444,229],[420,263],[420,306],[404,306]],ink);
      label('F 08',491,286,125,paper,'900'); break;
    }
    case 'relay': {
      for(let i=1;i<=4;i++){c.beginPath();c.arc(250,206,i*42,-.84,.84);c.strokeStyle=ink;c.lineWidth=8;c.stroke();c.beginPath();c.arc(250,206,i*42,Math.PI-.84,Math.PI+.84);c.stroke();}
      polygon([[203,350],[249,173],[298,350],[276,350],[253,262],[226,350]],paper);
      ring(249,176,15,paper,9); line([[220,310],[280,310]],paper,8);
      for(let i=0;i<7;i++)rect(538+i*27,288-i*19,13,21+i*19,ink);
      label('RX / 04',504,159,61,paper); break;
    }
    case 'pelagic': {
      for(let i=1;i<=5;i++)ring(282,226,37*i,i===5?paper:ink,i===5?8:4);
      line([[282,52],[282,401]],ink,3);line([[105,226],[465,226]],ink,3);
      polygon([[282,226],[435,143],[455,206]],ink);
      ring(345,282,11,paper,6); label('D 12',505,279,109,paper,'900'); break;
    }
    case 'aperture': {
      const cx=289,cy=225;ring(cx,cy,151,ink,9);ring(cx,cy,166,paper,2);
      for(let i=0;i<6;i++) {c.save();c.translate(cx,cy);c.rotate(i*Math.PI/3);polygon([[-7,-129],[73,-111],[79,-37],[37,-58],[-41,-58]],i%2?paper:ink);c.restore();}
      label('ƒ / 1.4',510,264,81,paper,'900');line([[505,299],[776,299]],ink,5);break;
    }
    case 'salt-flat': {
      const centers=[[118,191],[336,326],[572,135],[800,259]];
      centers.forEach(([cx,cy],j)=>{for(let n=1;n<13;n++){const pts=[];
        for(let a=0;a<=110;a++){const t=2*Math.PI*a/110,r=n*12*(1+.12*Math.cos(t*3+j)+.10*Math.sin(5*t+1));pts.push([cx+1.25*r*Math.cos(t),cy+r*Math.sin(t)]);}line(pts,n%4?ink:paper,n%4?2:4);}});
      rect(319,160,243,125,base);label('S / 06',350,243,66,paper,'900');
      break;
    }
    case 'signal-flag': {
      const colors=[paper,ink,'#212e40','#ddad43'];
      for(let i=0;i<5;i++){const x=64+i*151,y=133;
        rect(x,y,128,147,colors[i%4]);if(i===0){rect(x+54,y,22,147,colors[2]);rect(x,y+61,128,24,colors[2]);}
        if(i===1){polygon([[x+64,y+6],[x+122,y+74],[x+64,y+140],[x+6,y+74]],paper);}
        if(i===2){polygon([[x,y],[x+128,y],[x,y+147]],ink);}
        if(i===3){rect(x+64,y,64,73,colors[2]);rect(x,y+73,64,74,colors[2]);}
        if(i===4){for(let j=0;j<3;j++)rect(x,y+j*50,128,22,ink);}
        }
      line([[60,104],[804,104]],paper,3); label('N A V A L   /   S I G N A L S',80,342,27,paper);
      break;
    }
    case 'polar-night': {
      for(let i=0;i<40;i++){let x=(91*i+103)%795+30,y=(31*i*i+17)%225+44;rect(x,y,i%7?3:7,i%7?3:7,ink);}
      polygon([[46,356],[216,185],[274,245],[399,96],[617,336],[699,252],[809,357]],ink);
      polygon([[216,185],[160,265],[206,244],[229,254],[243,233]],paper);
      polygon([[399,96],[302,246],[381,184],[403,201],[417,170],[467,189]],paper);
      ring(682,114,46,paper,4);line([[682,45],[682,183]],paper,3);line([[613,114],[752,114]],paper,3);break;
    }
    case 'blackbird': {
      const wing=[[55,280],[204,247],[330,150],[443,73],[378,177],[566,204],[711,165],[644,229],[814,242],[628,260],[480,294],[333,301],[273,325],[291,294]];
      polygon(wing,paper);line([[87,285],[330,249],[431,191],[363,254],[524,248]],base,6);
      for(let i=0;i<4;i++) line([[551+i*33,340],[566+i*33,316]],ink,7);
      break;
    }
  }
  line([[32,37],[32,18],[130,18]],paper,3);line([[850,350],[850,376],[780,376]],paper,3);
  rect(0,403,width,117,base);rect(28,405,width-56,3,ink);
  label(style.word,38,473,49,paper,'900');label(style.code,688,470,32,ink);
  label(style.short,40,497,18,ink);
  inkTexture(c,width,height);
  return canvas;
}

