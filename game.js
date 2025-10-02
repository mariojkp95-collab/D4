// build split-2a (diagnostic core) — disegna mappa/player/mob e mostra errori a schermo
(function(){
  // === banner errore a schermo ===
  function showError(msg){
    let div = document.getElementById('errBanner');
    if(!div){
      div = document.createElement('div');
      div.id = 'errBanner';
      div.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#7f1d1d;color:#fff;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;z-index:9999;max-width:90vw;white-space:pre-wrap;font-weight:600';
      document.body.appendChild(div);
    }
    div.textContent = '[GAME ERROR] ' + msg;
  }

  try{
    const canvas = document.getElementById('game');
    if(!canvas){ showError('canvas #game non trovato'); return; }
    const ctx = canvas.getContext('2d');
    if(!ctx){ showError('contesto 2D non disponibile'); return; }

    // flag per capire se il core è partito
    window.GAME_BOOT_OK = true;

    // === Stato ===
    const state = {
      tile: 32,
      cols: Math.floor(canvas.width/32),
      rows: Math.floor(canvas.height/32),
      player: { x: 5, y: 5, hp: 100, maxHp: 100, speed: 6, exp:0, lv:1, pots:3 },
      mobs: [],
      coins: [],
      target: null,
      clickPath: null,
      lastTime: performance.now()
    };

    // HUD refs (se mancano non crashiamo)
    const hpTxt  = document.getElementById('hpTxt');
    const expTxt = document.getElementById('expTxt');
    const lvTxt  = document.getElementById('lvTxt');
    const potCnt = document.getElementById('cntPot');
    const statusEl = document.getElementById('status');

    function log(msg){ if(statusEl) statusEl.textContent = msg; }

    function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
    function rand(a,b){ return (Math.random()*(b-a)+a)|0; }
    function dist(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }

    // === Mappa a scacchiera ===
    const map = [];
    for(let y=0;y<state.rows;y++){
      map[y]=[];
      for(let x=0;x<state.cols;x++){
        map[y][x] = ((x+y)&1) ? '#0e2a1e' : '#123022';
      }
    }

    // === Mobs iniziali ===
    function spawnMob(){
      const x = rand(8, state.cols-2);
      const y = rand(3, state.rows-2);
      state.mobs.push({x,y,hp:30,maxHp:30,atk:5,ai:'slime',cool:0, alive:true});
    }
    for(let i=0;i<6;i++) spawnMob();

    function dropCoins(x,y){
      const n = 1+rand(0,2);
      for(let i=0;i<n;i++) state.coins.push({x,y,ttl:8000});
    }

    // === Render ===
    function draw(){
      const t=state.tile;
      // sfondo
      ctx.fillStyle='#0a1630'; ctx.fillRect(0,0,canvas.width,canvas.height);
      // tiles
      for(let y=0;y<state.rows;y++){
        for(let x=0;x<state.cols;x++){
          ctx.fillStyle = map[y][x];
          ctx.fillRect(x*t, y*t, t, t);
        }
      }
      // monete
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

    // === Input click-to-move & attacco ===
    canvas.addEventListener('click', (e)=>{
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / state.tile);
      const y = Math.floor((e.clientY - r.top ) / state.tile);
      if(x<0||y<0||x>=state.cols||y>=state.rows) return;

      // target mob se cliccato
      const mob = state.mobs.find(m=>m.alive && m.x===x && m.y===y);
      if(mob){
        state.target = mob;
        tryAttack();
        return;
      }
      // altrimenti path verso click
      state.clickPath = pathTo({x:state.player.x,y:state.player.y}, {x,y});
    });

    function pathTo(from,to){
      const path=[];
      let cx=from.x, cy=from.y;
      for(let i=0;i<300 && (cx!==to.x || cy!==to.y); i++){
        if(cx<to.x) cx++; else if(cx>to.x) cx--;
        else if(cy<to.y) cy++; else if(cy>to.y) cy--;
        path.push({x:cx,y:cy});
      }
      return path;
    }

    let atkCool=0;
    function tryAttack(){
      const p=state.player; const t=state.target;
      if(!t||!t.alive) return;
      if(dist(p,t)>1) return;
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
        if(d<=5){
          m.cool -= dt;
          if(m.cool<=0){
            const dx = Math.sign(p.x - m.x);
            const dy = Math.sign(p.y - m.y);
            if(Math.abs(p.x-m.x) > Math.abs(p.y-m.y)) m.x += dx; else m.y += dy;
            m.cool = 250+rand(0,250);
          }
          if(d<=1){
            p.hp = Math.max(0, p.hp - m.atk);
            if(p.hp<=0){ onDeath(); }
          }
        }
      }
    }

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

    // === HUD & azioni base ===
    function updateHUD(){
      const p=state.player;
      if(hpTxt)  hpTxt.textContent  = `${p.hp}/${p.maxHp}`;
      if(expTxt){
        const need=expNeeded(p.lv);
        expTxt.textContent = Math.floor((p.exp/need)*100)+'%';
      }
      if(lvTxt)  lvTxt.textContent  = p.lv;
      if(potCnt) potCnt.textContent = p.pots;
    }

    function onDeath(){
      log('Sei morto. Respawn…');
      setTimeout(()=>{
        state.player.hp = state.player.maxHp;
        state.player.x = 5; state.player.y=5;
        log('Respawn.');
      }, 800);
    }

    function usePotion(){
      const p=state.player;
      if(p.pots<=0){ log('Niente pozioni'); return; }
      if(p.hp>=p.maxHp){ log('HP già pieni'); return; }
      p.pots--; p.hp = clamp(p.hp+30, 0, p.maxHp);
      updateHUD();
    }

    // abilità demo
    function castArcane(){
      const p=state.player; let hits=0;
      for(const m of state.mobs){
        if(!m.alive) continue;
        if(Math.abs(m.x-p.x)<=1 && Math.abs(m.y-p.y)<=1){
          m.hp -= 12; hits++;
          if(m.hp<=0){ m.alive=false; dropCoins(m.x,m.y); gainExp(10); }
        }
      }
      log('Arcano: colpiti '+hits);
    }

    // === Eventi UI minimi ===
    document.getElementById('btnUsePotion')?.addEventListener('click', usePotion);
    document.getElementById('btnHeal')?.addEventListener('click', ()=>{ 
      state.player.hp = clamp(state.player.hp+10,0,state.player.maxHp); updateHUD();
    });
    document.getElementById('btnInventory')?.addEventListener('click', ()=>{
      const w=document.getElementById('invWin'); if(!w) return;
      w.classList.remove('hidden');
      const g=document.getElementById('invGrid'); if(!g) return;
      g.innerHTML='';
      const card=document.createElement('div');
      card.className='invItem';
      card.innerHTML=`<div class="cap">🍵 Pozione ×<span class="qv">${state.player.pots}</span></div>
                      <div class="row">
                        <button class="btn use">Usa</button>
                        <button class="btn tobar">→ Barra</button>
                      </div>`;
      card.querySelector('.use').addEventListener('click', ()=>{ usePotion(); card.querySelector('.qv').textContent = state.player.pots; });
      card.querySelector('.tobar').addEventListener('click', ()=>{
        const s = +(prompt('Slot (1-5):','1')||'1');
        const slot = Math.min(5,Math.max(1,s));
        const cap = document.getElementById(['','slotCap1','slotCap2','slotCap3','slotCap4','slotCap5'][slot]);
        const el  = document.getElementById(['','slot1','slot2','slot3','slot4','slot5'][slot]);
        if(cap&&el){ cap.textContent='🍵'; el.dataset.kind='potion'; }
      });
      g.appendChild(card);
    });
    document.getElementById('invClose')?.addEventListener('click', ()=> document.getElementById('invWin')?.classList.add('hidden') );
    document.getElementById('btnAbilities')?.addEventListener('click', ()=>{
      const w=document.getElementById('abilWin'); if(!w) return;
      w.classList.remove('hidden');
      const g=document.getElementById('abilGrid'); if(!g) return;
      g.innerHTML='';
      const card=document.createElement('div');
      card.className='abilItem';
      card.innerHTML=`<div class="cap">✨ Colpo Arcano</div>
                      <div class="row"><button class="btn btnCast">Lancia</button></div>`;
      card.querySelector('.btnCast').addEventListener('click', castArcane);
      g.appendChild(card);
    });
    document.getElementById('abilClose')?.addEventListener('click', ()=> document.getElementById('abilWin')?.classList.add('hidden') );

    // click sugli slot -> usa pozione se marcato
    for(let s=1;s<=5;s++){
      const el=document.getElementById(['','slot1','slot2','slot3','slot4','slot5'][s]);
      el?.addEventListener('click', ()=>{
        if(el.dataset.kind==='potion') usePotion();
      });
    }

    // === Loop ===
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

    function update(){
      const now=performance.now();
      const dt=now-state.lastTime; state.lastTime=now;

      // movimento lungo path (evita mob)
      if(state.clickPath && state.clickPath.length){
        const next = state.clickPath[0];
        const blocked = state.mobs.some(m=>m.alive && m.x===next.x && m.y===next.y);
        if(!blocked){
          state.player.x = next.x; state.player.y = next.y;
          state.clickPath.shift();
          pickupCoins();
          if(state.target && !state.target.alive) state.target=null;
          if(state.target && dist(state.player, state.target)<=1) tryAttack();
        } else {
          state.clickPath = null;
        }
      }

      // monete TTL
      for(let i=state.coins.length-1;i>=0;i--){
        state.coins[i].ttl -= dt;
        if(state.coins[i].ttl<=0) state.coins.splice(i,1);
      }

      // IA mob
      mobAI(dt);

      draw();
      updateHUD();
      requestAnimationFrame(update);
    }

    // avvio
    updateHUD();
    draw();
    requestAnimationFrame(update);

  }catch(err){
    try{ showError(err.message || String(err)); }catch(e){}
  }
})();
