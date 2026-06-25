/**
 * game-templates.ts — 内置可玩 HTML5 游戏模板(World Creation & Feed · 方案 A 兜底)。
 *
 * 定位:LLM 生成 HTML 游戏为主路径;当生成失败/未通过校验时,用这里**经手写验证的、
 * 自包含、可玩**的模板兜底,保证「创作 game → 发布 → 进入 → 真能玩」闭环不空转。
 *
 * 约束(对齐方案 A 边界):
 *   - 纯前端、单文件 HTML;无外部脚本/素材/网络;touch 优先;低端 WebView 友好。
 *   - 无内联事件处理器(CSP 友好);所有逻辑在底部 <script>。
 *
 * 每个模板是一个**完整 <html> 文档字符串**,WebView 直接 srcdoc 渲染即可玩。
 */

export type GameTemplateKey = '2048' | 'snake' | 'breakout';

/** 模板元信息(用于关键词匹配与展示)。 */
export interface GameTemplateMeta {
  key: GameTemplateKey;
  title: { zh: string; en: string };
  /** 命中这些关键词(prompt 含任一)即倾向选该模板。 */
  keywords: string[];
}

export const GAME_TEMPLATE_METAS: GameTemplateMeta[] = [
  { key: '2048', title: { zh: '2048', en: '2048' }, keywords: ['2048', '数字', '合并', 'merge', 'number'] },
  { key: 'snake', title: { zh: '贪吃蛇', en: 'Snake' }, keywords: ['贪吃蛇', '蛇', 'snake'] },
  { key: 'breakout', title: { zh: '打砖块', en: 'Breakout' }, keywords: ['打砖块', '砖块', '弹球', 'breakout', 'brick', 'arkanoid', 'pong'] },
];

/** 共享样式 + 容器骨架(深色,适配 app 主题)。 */
function shell(title: string, bodyHtml: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}
  html,body{margin:0;height:100%;background:#0e1016;color:#e8eaf0;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;}
  #wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:16px;}
  h1{font-size:20px;margin:0;font-weight:800;}
  #hud{font-size:15px;color:#9aa0b4;}
  canvas{background:#161a26;border-radius:12px;touch-action:none;max-width:100%;}
  .btn{background:#6c5ce7;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:15px;font-weight:700;}
  #msg{position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(8,10,16,.82);}
  #msg.show{display:flex;}
  #msgText{font-size:22px;font-weight:800;}
</style>
</head>
<body>
<div id="wrap">
  <h1>${title}</h1>
  <div id="hud">分数 <span id="score">0</span></div>
  ${bodyHtml}
  <div id="msg"><div id="msgText"></div><button class="btn" id="restart">再来一局</button></div>
</div>
<script>
(function(){
${script}
})();
</script>
</body>
</html>`;
}

/** 2048 —— DOM 网格 + 滑动/按钮;确定性、无定时循环,最稳。 */
function tmpl2048(): string {
  const body = `<canvas id="c" width="320" height="320"></canvas>
  <div style="font-size:13px;color:#9aa0b4">滑动合并相同数字,凑出 2048</div>`;
  const script = `
  var SZ=4, cell=76, gap=8, pad=8;
  var cv=document.getElementById('c'), ctx=cv.getContext('2d');
  var scoreEl=document.getElementById('score'), msg=document.getElementById('msg'), msgText=document.getElementById('msgText');
  var grid, score, over;
  var COLORS={0:'#1d2233',2:'#3a3f55',4:'#4a4170',8:'#7b5cff',16:'#8a6bff',32:'#a07bff',64:'#b78bff',128:'#d4af37',256:'#e0b84a',512:'#ecc35e',1024:'#f5cf72',2048:'#ffd700'};
  function reset(){grid=[];for(var i=0;i<SZ*SZ;i++)grid.push(0);score=0;over=false;add();add();draw();msg.classList.remove('show');}
  function add(){var e=[];for(var i=0;i<grid.length;i++)if(grid[i]===0)e.push(i);if(!e.length)return;grid[e[Math.floor(Math.random()*e.length)]]=Math.random()<0.9?2:4;}
  function draw(){ctx.clearRect(0,0,320,320);for(var r=0;r<SZ;r++)for(var c=0;c<SZ;c++){var v=grid[r*SZ+c];var x=pad+c*(cell+gap),y=pad+r*(cell+gap);ctx.fillStyle=COLORS[v]||'#ffd700';rr(x,y,cell,cell,10);ctx.fill();if(v){ctx.fillStyle=v<=4?'#cfd3e0':'#fff';ctx.font='bold '+(v<100?34:v<1000?28:22)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(v,x+cell/2,y+cell/2);}}scoreEl.textContent=score;}
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function slide(row){var a=row.filter(function(v){return v;});for(var i=0;i<a.length-1;i++){if(a[i]===a[i+1]){a[i]*=2;score+=a[i];a.splice(i+1,1);}}while(a.length<SZ)a.push(0);return a;}
  function move(dir){if(over)return;var moved=false,before=grid.join(',');for(var i=0;i<SZ;i++){var line=[];for(var j=0;j<SZ;j++){var idx=dir==='L'||dir==='R'?i*SZ+j:j*SZ+i;line.push(grid[idx]);}if(dir==='R'||dir==='D')line.reverse();line=slide(line);if(dir==='R'||dir==='D')line.reverse();for(var j2=0;j2<SZ;j2++){var idx2=dir==='L'||dir==='R'?i*SZ+j2:j2*SZ+i;grid[idx2]=line[j2];}}if(grid.join(',')!==before)moved=true;if(moved){add();draw();check();}}
  function check(){if(grid.indexOf(2048)>=0){end('🎉 你赢了!');return;}for(var i=0;i<grid.length;i++){if(grid[i]===0)return;var r=Math.floor(i/SZ),c=i%SZ;if(c<SZ-1&&grid[i]===grid[i+1])return;if(r<SZ-1&&grid[i]===grid[i+SZ])return;}end('游戏结束');}
  function end(t){over=true;msgText.textContent=t+'  分数 '+score;msg.classList.add('show');}
  var sx,sy;
  cv.addEventListener('touchstart',function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY;},{passive:true});
  cv.addEventListener('touchend',function(e){var t=e.changedTouches[0];var dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)<20&&Math.abs(dy)<20)return;if(Math.abs(dx)>Math.abs(dy))move(dx>0?'R':'L');else move(dy>0?'D':'U');},{passive:true});
  document.addEventListener('keydown',function(e){var m={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D'}[e.key];if(m){e.preventDefault();move(m);}});
  document.getElementById('restart').addEventListener('click',reset);
  reset();
  `;
  return shell('2048', body, script);
}

/** 贪吃蛇 —— canvas + 定时循环 + 滑动转向。 */
function tmplSnake(): string {
  const body = `<canvas id="c" width="300" height="300"></canvas>
  <div style="font-size:13px;color:#9aa0b4">滑动改变方向,吃到食物得分</div>`;
  const script = `
  var N=15, px=20;
  var cv=document.getElementById('c'), ctx=cv.getContext('2d');
  var scoreEl=document.getElementById('score'), msg=document.getElementById('msg'), msgText=document.getElementById('msgText');
  var snake,dir,food,score,loop,alive;
  function reset(){snake=[{x:7,y:7}];dir={x:1,y:0};score=0;alive=true;placeFood();msg.classList.remove('show');if(loop)clearInterval(loop);loop=setInterval(tick,140);draw();}
  function placeFood(){do{food={x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};}while(snake.some(function(s){return s.x===food.x&&s.y===food.y;}));}
  function tick(){if(!alive)return;var h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.y<0||h.x>=N||h.y>=N||snake.some(function(s){return s.x===h.x&&s.y===h.y;})){end();return;}snake.unshift(h);if(h.x===food.x&&h.y===food.y){score+=10;scoreEl.textContent=score;placeFood();}else{snake.pop();}draw();}
  function draw(){ctx.clearRect(0,0,300,300);ctx.fillStyle='#ff5c7a';ctx.fillRect(food.x*px+2,food.y*px+2,px-4,px-4);for(var i=0;i<snake.length;i++){ctx.fillStyle=i===0?'#6c5ce7':'#9b8cff';ctx.fillRect(snake[i].x*px+1,snake[i].y*px+1,px-2,px-2);}}
  function end(){alive=false;clearInterval(loop);msgText.textContent='游戏结束  分数 '+score;msg.classList.add('show');}
  var sx,sy;
  cv.addEventListener('touchstart',function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY;},{passive:true});
  cv.addEventListener('touchend',function(e){var t=e.changedTouches[0];var dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)<16&&Math.abs(dy)<16)return;if(Math.abs(dx)>Math.abs(dy)){if(dir.x===0)dir={x:dx>0?1:-1,y:0};}else{if(dir.y===0)dir={x:0,y:dy>0?1:-1};}},{passive:true});
  document.addEventListener('keydown',function(e){var m={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}}[e.key];if(m){e.preventDefault();if(m.x!==-dir.x&&m.y!==-dir.y)dir=m;}});
  document.getElementById('restart').addEventListener('click',reset);
  reset();
  `;
  return shell('贪吃蛇', body, script);
}

/** 打砖块 —— canvas + 触摸拖动挡板。 */
function tmplBreakout(): string {
  const body = `<canvas id="c" width="320" height="400"></canvas>
  <div style="font-size:13px;color:#9aa0b4">左右拖动挡板接球,打掉所有砖块</div>`;
  const script = `
  var W=320,H=400;
  var cv=document.getElementById('c'), ctx=cv.getContext('2d');
  var scoreEl=document.getElementById('score'), msg=document.getElementById('msg'), msgText=document.getElementById('msgText');
  var paddle,ball,bricks,score,loop,alive;
  var PW=64,PH=12,BR=7,COLS=6,ROWS=4,BW=46,BH=18,BGAP=4;
  function reset(){paddle={x:W/2-PW/2};ball={x:W/2,y:H-40,vx:2.6,vy:-2.6};score=0;alive=true;bricks=[];for(var r=0;r<ROWS;r++)for(var c=0;c<COLS;c++)bricks.push({x:8+c*(BW+BGAP),y:40+r*(BH+BGAP),on:true});msg.classList.remove('show');if(loop)cancelAnimationFrame(loop);step();}
  function step(){if(!alive)return;ball.x+=ball.vx;ball.y+=ball.vy;if(ball.x<BR||ball.x>W-BR)ball.vx*=-1;if(ball.y<BR)ball.vy*=-1;if(ball.y>H-24-BR&&ball.x>paddle.x&&ball.x<paddle.x+PW&&ball.vy>0){ball.vy*=-1;ball.vx+=((ball.x-(paddle.x+PW/2))/(PW/2))*1.2;}if(ball.y>H){end('游戏结束');return;}for(var i=0;i<bricks.length;i++){var b=bricks[i];if(b.on&&ball.x>b.x&&ball.x<b.x+BW&&ball.y>b.y&&ball.y<b.y+BH){b.on=false;ball.vy*=-1;score+=10;scoreEl.textContent=score;}}if(bricks.every(function(b){return !b.on;})){end('🎉 通关!');return;}draw();loop=requestAnimationFrame(step);}
  function draw(){ctx.clearRect(0,0,W,H);for(var i=0;i<bricks.length;i++){var b=bricks[i];if(!b.on)continue;ctx.fillStyle=['#6c5ce7','#7b5cff','#9b8cff','#b78bff'][Math.floor(b.y/(BH+BGAP))%4];ctx.fillRect(b.x,b.y,BW,BH);}ctx.fillStyle='#e8eaf0';ctx.fillRect(paddle.x,H-24,PW,PH);ctx.beginPath();ctx.arc(ball.x,ball.y,BR,0,7);ctx.fillStyle='#ff5c7a';ctx.fill();}
  function end(t){alive=false;cancelAnimationFrame(loop);msgText.textContent=t+'  分数 '+score;msg.classList.add('show');}
  function movePaddle(cx){var rect=cv.getBoundingClientRect();var x=(cx-rect.left)*(W/rect.width)-PW/2;paddle.x=Math.max(0,Math.min(W-PW,x));}
  cv.addEventListener('touchmove',function(e){movePaddle(e.touches[0].clientX);e.preventDefault();},{passive:false});
  cv.addEventListener('touchstart',function(e){movePaddle(e.touches[0].clientX);},{passive:true});
  document.getElementById('restart').addEventListener('click',reset);
  reset();
  `;
  return shell('打砖块', body, script);
}

const BUILDERS: Record<GameTemplateKey, () => string> = {
  '2048': tmpl2048,
  snake: tmplSnake,
  breakout: tmplBreakout,
};

/** 取模板 HTML。 */
export function renderTemplate(key: GameTemplateKey): string {
  return (BUILDERS[key] ?? BUILDERS['2048'])();
}

/**
 * 关键词匹配:从 prompt 选最贴近的模板;无命中默认 2048(最稳)。
 * 用于 LLM 失败兜底,也用于"模板模式"快速出可玩游戏。
 */
export function pickTemplateByPrompt(prompt: string): GameTemplateKey {
  const p = (prompt ?? '').toLowerCase();
  for (const m of GAME_TEMPLATE_METAS) {
    if (m.keywords.some((k) => p.includes(k.toLowerCase()))) return m.key;
  }
  return '2048';
}
