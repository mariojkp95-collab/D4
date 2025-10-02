// build split-2 — core minimale ma completo
(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ======= Stato base =======
  const state = {
    tile: 32,
    cols: 25, rows: 14, // 800x448 approx
    player: { x: 5, y: 5, hp: 100, maxHp: 100, speed: 6, exp:0, lv:1, pots:3 },
    mobs: [],
    coins: [],
    target: null,
    clickPath: null, // percorso semplice (manhattan) verso click
    lastTime: performance.now()
  };

  // HUD refs
  const hpTxt = document.getElementById('hpTxt');
  const expTxt = document.getElementById('expTxt');
  const lvTxt = document.getElementById('lvTxt');
  const potCnt = document.getElementById('cntPot');
  const statusEl = document.getElementById('status');

  // ======= Utility =======
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function rand(a,b){ return (Math.random()*(b-a)+a)|0; }
  function dist(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
  function log(msg){ if(statusEl) statusEl.textContent = msg; }

  // ======= Mappa dummy =======
  const map = [];
  for(let y=0;y<state.rows;y++){
    const row=[];
    for(let x=0;x<state.cols;x++){
      row.push( ((x+y)&1)?'#0e2a1e':'#123022' );
    }
    map.push(row);
  }

  // ======= Mobs =======
  function spawnMob(){
    const x = rand(10, state.cols-2);
    const y = rand(3, state.rows-2);
    state.mobs.push({x,y,hp:30,maxHp:30,atk:5,ai:'slime',cool:0, alive:true});
  }
  for(let i=0;i<6;i++) spawnMob();

  // ======= Coins =======
  function dropCoins(x,y){
    const n = 1+rand(0,2);
    for(let i=0;i<n;i++) state.coins.push({x,y,ttl:8000});
  }

  // ======= Render =======
  function draw(){
    const t=state.tile;
    // bg
    ctx.fillStyle='#0a1630'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // tiles
    for(let y=0;y<state.rows;y++){
      for(let x=0;x<state.cols;x++){
        ctx.fillStyle = map[y][x];
        ctx.fillRect(x*t, y*t, t, t);
      }
    }
    // coins
    for(const c of state.coins){
      ctx.fillStyle='#facc15';
      ctx.beginPath(); ctx.arc(c.x*t+t/2, c.y*t+t/2, t*0.25, 0, Math.PI*2); ctx.fill();
    }
    // mobs
    for(const m of state.mobs){
      if(!m.alive) continue;
      ctx.fillStyle='#ef4444'; ctx.fillRect(m.x*t+6, m.y*t+6, t-12, t-12);
      // hp bar
      ctx.fillStyle='#1f2937'; ctx.fillRect(m.x*t+4, m.y*t+2, t-8, 4);
      ctx.fillStyle='#22c55e'; ctx.fillRect(m.x*t+4, m.y*t+2, (t-8)*(m.hp/m.maxHp), 4);
    }
    // player
    const p=state.player;
    ctx.fillStyle='#3b82f6'; ctx.fillRect(p.x*t+6, p.y*t+6, t-12, t-12);

    // target highlight
    if(state.target){
      ctx.strokeStyle='#eab308'; ctx.lineWidth=2;
      ctx.strokeRect(state.target.x*t+3, state.target.y*t+3, t-6, t-6);
    }
  }

  // ======= Input =======
  canvas.addEventListener('click', (e)=>{
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / state.tile);
    const y = Math.floor((e.clientY - r.top ) / state.tile);
    if(x<0||y<0||x>=state.cols||y>=state.rows) return;

    // se clicchi su un mob: target e attacco
    const mob = state.mobs.find(m=>m.alive && m.x===x && m.y===y);
    if(mob){
      state.target = mob;
      tryAttack();
      return;
    }
    // altrimenti muovi player
    state.clickPath = pathTo({x:state.player.x,y:state.player.y}, {x,y});
  });

  // ======= Path semplice (Manhattan senza ostacoli) =======
  function pathTo(from, to){
    const path=[];
    let cx=from.x, cy=from.y;
    for(let i=0;i<200 && (cx!==to.x || cy!==to.y); i++){
      if(cx<to.x) cx++; else if(cx>to.x) cx--;
      else if(cy<to.y) cy++; else if(cy>to.y) cy--;
      path.push({x:cx,y:cy});
    }
    return path;
  }

  // ======= Combat =======
  let atkCool=0;
  function tryAttack(){
    const p=state.player; const t=state.target;
    if(!t||!t.alive) return;
    if(dist(p,t)>1) return; // adiacente
    const now=performance.now();
    if(now<atkCool) return;
    t.hp -= 10;
    atkCool = now + 400;
    log('Colpito: -10 HP');
    if(t.hp<=0){ t.alive=false; dropCoins(t.x,t.y); log('Mob sconfitto!'); gainExp(12); }
  }

  function mobAI(dt){
    const p=state.player;
    for(const m of state.mobs){
      if(!m.alive) continue;
      const d=dist(p,m);
      // aggro semplice
      if(d<=5){
        // muovi verso il player ogni tot
        m.cool -= dt;
        if(m.cool<=0){
          const dx = Math.sign(p.x - m.x);
          const dy = Math.sign(p.y - m.y);
          if(Math.abs(p.x-m.x) > Math.abs(p.y-m.y)) m.x += dx; else m.y += dy;
          m.cool = 250+rand(0,250);
        }
        // attacca se adiacente
        if(d<=1){
          p.hp = Math.max(0, p.hp - m.atk);
          if(p.hp<=0){ onDeath(); }
        }
      }
    }
  }

  // ======= EXP & Livello =======
  function expNeeded(lv){ return 50 + (lv-1)*25; }
  function gainExp(amount){
    state.player.exp += amount;
    while(state.player.exp >= expNeeded(state.player.lv)){
      state.player.exp -= expNeeded(state.player.lv);
      state.player.lv++;
      state.player.maxHp += 10;
      state.player.hp = state.player.maxHp;
      log('Level up! Lv '+state.player.lv);
    }
  }

  // ======= Loot pickup =======
  function pickupCoins(){
    const p=state.player;
    for(let i=state.coins.length-1;i>=0;i--){
      const c=state.coins[i];
      if(c.x===p.x && c.y===p.y){
        state.coins.splice(i,1);
        log('Moneta raccolta (+exp 2)');
        gainExp(2);
      }
    }
  }

  // ======= Update loop =======
  function update(){
    const now=performance.now();
    const dt=now-state.lastTime; state.lastTime=now;

    // movimento lungo il path
    if(state.clickPath && state.clickPath.length){
      const next = state.clickPath[0];
      // evita sovrapposizione mob
      const blocked = state.mobs.some(m=>m.alive && m.x===next.x && m.y===next.y);
      if(!blocked){
        state.player.x = next.x; state.player.y = next.y;
        state.clickPath.shift();
        pickupCoins();
        if(state.target && !state.target.alive) state.target=null;
        if(state.target && dist(state.player, state.target)<=1) tryAttack();
      }else{
        state.clickPath = null; // fermati se bloccato
      }
    }

    // countdown monete
    for(let i=state.coins.length-1;i>=0;i--){
      state.coins[i].ttl -= dt;
      if(state.coins[i].ttl<=0) state.coins.splice(i,1);
    }

    mobAI(dt);
    draw();
    updateHUD();

    requestAnimationFrame(update);
  }

  function updateHUD(){
    const p=state.player;
    hpTxt.textContent = `${p.hp}/${p.maxHp}`;
    const need=expNeeded(p.lv);
    expTxt.textContent = Math.floor((p.exp/need)*100)+'%';
    lvTxt.textContent = p.lv;
    potCnt.textContent = p.pots;
  }

  function onDeath(){
    log('Sei morto. Respawn tra poco…');
    // respawn semplice: non perdere livello/exp come richiesto in passato
    setTimeout(()=>{
      state.player.hp = state.player.maxHp;
      state.player.x = 5; state.player.y=5;
      log('Respawn.');
    }, 800);
  }

  // ======= Inventario & Abilità (lista base per demo patch) =======
  function openInventory(){
    const win=document.getElementById('invWin'); win.classList.remove('hidden');
    const g=document.getElementById('invGrid'); g.innerHTML='';
    // Mostra una pozione come item inventario (consumabile demo)
    const card=document.createElement('div');
    card.className='invItem';
    card.innerHTML=`<div class="cap">🍵 Pozione ×<span class="qv">${state.player.pots}</span></div>
                    <div class="row">
                      <button class="btn use">Usa</button>
                      <button class="btn tobar">→ Barra</button>
                    </div>`;
    card.querySelector('.use').addEventListener('click', ()=>{
      usePotion();
      card.querySelector('.qv').textContent = state.player.pots;
    });
    card.querySelector('.tobar').addEventListener('click', ()=>{
      const s = +(prompt('Slot (1-5):','1')||'1');
      assignPotionToSlot(Math.min(5,Math.max(1,s)));
    });
    g.appendChild(card);
  }
  function closeInventory(){ document.getElementById('invWin').classList.add('hidden'); }

  function openAbilities(){
    const win=document.getElementById('abilWin'); win.classList.remove('hidden');
    const g=document.getElementById('abilGrid'); g.innerHTML='';
    // Una abilità demo: “✨ Colpo Arcano”
    const card=document.createElement('div');
    card.className='abilItem';
    card.innerHTML=`<div class="cap">✨ Colpo Arcano</div>
                    <div class="row">
                      <button class="btn btnCast">Lancia</button>
                    </div>`;
    card.querySelector('.btnCast').addEventListener('click', ()=>{
      castArcane();
    });
    g.appendChild(card);
  }
  function closeAbilities(){ document.getElementById('abilWin').classList.add('hidden'); }

  // ======= Hotbar helpers =======
  function assignPotionToSlot(slot){
    const cap = document.getElementById(['','slotCap1','slotCap2','slotCap3','slotCap4','slotCap5'][slot]);
    const el  = document.getElementById(['','slot1','slot2','slot3','slot4','slot5'][slot]);
    if(!cap||!el) return;
    cap.textContent='🍵';
    el.dataset.kind='potion';
  }

  function castArcane(){
    const p=state.player;
    // danno ad area 1-tile intorno al player
    let hits=0;
    for(const m of state.mobs){
      if(!m.alive) continue;
      if(Math.abs(m.x-p.x)<=1 && Math.abs(m.y-p.y)<=1){
        m.hp -= 12; hits++;
        if(m.hp<=0){ m.alive=false; dropCoins(m.x,m.y); gainExp(10); }
      }
    }
    log(`Arcano: colpiti ${hits}`);
  }

  function usePotion(){
    const p=state.player;
    if(p.pots<=0) { log('Niente pozioni'); return; }
    if(p.hp>=p.maxHp){ log('HP già pieni'); return; }
    p.pots--; p.hp = clamp(p.hp+30, 0, p.maxHp);
    updateHUD();
    // PATCH-01 intercetta il cambio di contatore e mostra cooldown su slot1 se clicchi slot1 o FAB
  }

  // ======= Eventi UI =======
  document.getElementById('btnInventory').addEventListener('click', openInventory);
  document.getElementById('invClose').addEventListener('click', closeInventory);
  document.getElementById('btnAbilities').addEventListener('click', openAbilities);
  document.getElementById('abilClose').addEventListener('click', closeAbilities);
  document.getElementById('btnHeal').addEventListener('click', ()=>{ state.player.hp = clamp(state.player.hp+10,0,state.player.maxHp); updateHUD(); });
  document.getElementById('btnUsePotion').addEventListener('click', usePotion);

  // click hotbar slot1 default è già gestito dalla PATCH-01 per il cooldown;
  // qui aggiungiamo uso pozione dagli slot marcati come 'potion'
  for(let s=1;s<=5;s++){
    const el=document.getElementById(['','slot1','slot2','slot3','slot4','slot5'][s]);
    el.addEventListener('click', ()=>{
      if(el.dataset.kind==='potion') usePotion();
    });
  }

  // ======= Start =======
  updateHUD();
  draw();
  requestAnimationFrame(update);
})();
