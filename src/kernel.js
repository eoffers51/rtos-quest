// FreeRTOS-like kernel simulator: 1 ms ticks, fixed-priority preemptive scheduling with round-robin,
// queues, semaphores, mutexes with priority inheritance, software timers, ISRs, 1 or 2 cores.
const BASE=768,WDT=600;
const g=(pin,v='T')=>({op:'gpio',pin,v}),d=ms=>({op:'delay',ms}),un=ms=>({op:'until',ms}),bz=ms=>({op:'busy',ms}),c=fn=>({op:'call',fn}),
 tk=(s,to=-1)=>({op:'take',s,to}),gv=s=>({op:'give',s}),gi=s=>({op:'giveISR',s}),sn=(q,to=-1)=>({op:'send',q,to}),rc=(q,to=-1)=>({op:'recv',q,to}),
 si=q=>({op:'sendISR',q}),trs=tm=>({op:'tReset',tm}),tst=tm=>({op:'tStop',tm});
// power model (mA): CPU running, CPU idle but clocked, extra while Wi-Fi is started, extra while transmitting, automatic light sleep, deep sleep; BOOT = ms from wake-up to app_main
const PWR={run:40,idle:25,wifi:80,tx:50,light:0.8,deep:0.01},BOOT=30;
const wt=ms=>({op:'wakeTimer',ms}),ds=()=>({op:'deepSleep'});
// direct-to-task notifications, event groups, task watchdog
const ng=t=>({op:'notifyGive',task:t}),ngi=t=>({op:'notifyGiveISR',task:t}),nt=(to=-1,clear=1)=>({op:'notifyTake',to,clear}),es=(gr,bit)=>({op:'evSet',g:gr,bit}),ew=(gr,mode,to=-1)=>({op:'evWait',g:gr,mode,to}),wa=()=>({op:'wdtAdd'}),wr=()=>({op:'wdtReset'});
// state machine: one instruction that looks up (state, event) in a table of rows {s: state, e: event, a: action or '', n: next state}
const fs=rows=>({op:'fsm',rows}),row=(s,e,a,n)=>({s,e,a:a||'',n});
// the rover body that the state machine's actions drive (side mission 102): wheels, drill, a latched hazard, samples waiting for a report
const DRILL=400,rv=K=>K.w.rv||(K.w.rv={motors:false,drill:false,haz:false,done:Infinity,raw:0,mot:[],dr:[],rep:[],smp:[]});
const drillDown=(K,fn)=>{const v=rv(K);if(v.motors)K.bad(`${fn}() while the wheels are turning: the drill bit snapped`);if(v.haz)K.bad(`${fn}() while the hazard is not cleared`);if(v.drill){K.bad(`${fn}() while the drill is already in the ground`);return false;}v.drill=true;v.dr.push({t:K.t,on:1});return true;};
const task=(name,prio,code,o={})=>Object.assign({kind:'task',name,prio,stack:4096,core:1,code},o);
const SAMPLE_T=[];for(let a=0;a<5;a++)for(let i=0;i<5;i++)SAMPLE_T.push(a*500+i*20);
const busOn=K=>{if(K.w.bus>0){K.w.coll=(K.w.coll||0)+1;K.bad('I2C collision: two transactions on the bus at the same time');}K.w.bus=(K.w.bus||0)+1;},busOff=K=>{K.w.bus--;};
/* the rover's driver library: CPU cost (ms), blocked wait inside the driver (ms), stack depth (bytes) */
// the hazard record is guarded by hz_lock: note every call made by a unit that does not hold it (it may not collide in this run, but nothing stops it)
const hzOpen=(K,r,fn)=>{const o=K.objs.hz_lock;if(!o||(r&&r.held&&r.held.includes(o)))return;const h=K.w.hz;(h.open=h.open||[]).push({t:K.t,unit:r?r.name:'?',fn});if(h.open.length<=3)K.log(`${fn}() ran without holding hz_lock`,'e');};
const F={
 motorStep:{cost:2,stack:300,fx:'wheel'},compressFrame:{cost:60,stack:1800,fx:'cam'},sendTelemetry:{cost:12,stack:900,fx:'radio'},
 sampleSpectrometer:{cost:K=>[3,5,7,4,6][(K.w.nS=(K.w.nS||0)+1)%5],costTxt:'3 to 7 ms CPU',stack:500,fx:'mast'},checkThermals:{cost:8,stack:400,fx:'chip'},
 planPath:{cost:20,stack:2400,fx:'chip'},readIMU:{cost:1,stack:250,fx:'mast'},logStatus:{cost:3,stack:1100,fx:'chip'},
 allocFrame:{cost:1,stack:200,sig:'frame = pvPortMalloc(2048)',end:K=>{K.alloc(2048);if(!K.crash)K.w.frames=(K.w.frames||0)+1;}},processFrame:{cost:10,stack:600,fx:'cam',sig:'processFrame(frame)',start:K=>{if(!K.w.frames)K.die('processFrame(frame) used a frame buffer that is not allocated: it was never taken from the heap, or vPortFree(frame) already gave it back (use after free). On real hardware this silently corrupts whatever owns that memory now. The simulator stops here.');}},
 freeFrame:{cost:1,stack:100,sig:'vPortFree(frame)',end:K=>{if(!K.w.frames){K.die('vPortFree(frame) was called on a buffer that is not allocated (double free). The heap is corrupted: CORRUPT HEAP, abort() was called.');return;}K.w.frames--;K.heap+=2048;}},
 readSample:{cost:1,stack:400,fx:'mast',sig:'x = readSample()',waitTxt:'blocks until the instrument has a sample',
  wait:K=>{const w=K.w;w.si=w.si||0;let lost=0;while(w.si+1<SAMPLE_T.length&&SAMPLE_T[w.si+1]<=K.t){w.si++;lost++;}
   if(lost){w.lost=(w.lost||0)+lost;K.bad(`${lost} sample${lost>1?'s':''} overwritten inside the instrument before being read`);}
   return w.si<SAMPLE_T.length?Math.max(0,SAMPLE_T[w.si]-K.t):99999;},end:(K,r)=>{r.x={id:K.w.si++};}},
 transmit:{wait:45,cost:3,stack:1200,fx:'radio',sig:'transmit(x)',start:(K,r)=>{r.tx=r.x;r.x=null;},
  end:(K,r)=>{if(!r.tx)K.bad('transmit(x) sent an empty packet: x holds no sample');else(K.w.sent=K.w.sent||[]).push(r.tx.id);}},
 i2cReadIMU:{wait:4,cost:1,stack:400,fx:'mast',start:busOn,end:busOff},i2cReadThermo:{wait:7,cost:1,stack:400,fx:'chip',start:busOn,end:busOff},
 stopMotors:{cost:0,stack:100,fx:'stop',end:K=>{if(K.w.rv){K.w.rv.motors=false;K.w.rv.mot.push({t:K.t,on:0});}}},
 startMotors:{cost:1,stack:300,fx:'wheel',end:K=>{const v=rv(K);if(v.drill)K.bad('startMotors() while the drill is in the ground: the drill bit snapped');if(v.haz)K.bad('startMotors() while the hazard is not cleared: the rover drove on into it');v.motors=true;v.mot.push({t:K.t,on:1});}},
 startDrill:{cost:1,stack:400,fx:'arm',waitTxt:'returns at once, DRILL_DONE arrives '+DRILL+' ms later',end:K=>{if(drillDown(K,'startDrill'))rv(K).done=K.t+DRILL;}},
 retractDrill:{cost:1,stack:200,fx:'arm',end:K=>{const v=rv(K);if(v.drill){v.drill=false;v.dr.push({t:K.t,on:0,abort:1});}v.done=Infinity;}},
 drillSample:{wait:DRILL,cost:1,stack:400,fx:'arm',waitTxt:'blocks '+DRILL+' ms until the drill is back up',start:K=>{rv(K).blk=drillDown(K,'drillSample');},
  end:K=>{const v=rv(K);if(v.blk&&v.drill){v.drill=false;v.dr.push({t:K.t,on:0});v.raw++;v.smp.push(K.t);K.post('DRILL_DONE');}}},
 sendReport:{cost:3,stack:1100,fx:'radio',end:K=>{const v=rv(K);if(v.raw>0){v.raw--;v.rep.push(K.t);}else K.bad('sendReport() with no new sample: an empty report was sent');}},
 logToFlash:{wait:20,cost:4,stack:1400,fx:'chip',noIsr:"Guru Meditation Error: Core 0 panic'ed (Cache disabled but cached memory region accessed). A flash write was started inside an ISR."},
 deployAntenna:{cost:0,stack:100,end:K=>K.push('ant',{v:1})},handlePacket:{cost:3,stack:900,fx:'radio'},stowAntenna:{cost:0,stack:100,end:K=>K.push('ant',{v:0})},
 positionArm:{wait:12,cost:1,stack:500,needs:['arm_mtx'],fx:'arm'},photograph:{wait:30,cost:2,stack:900,needs:['arm_mtx','cam_mtx'],fx:'cam'},
 calibrateCamera:{wait:20,cost:1,stack:500,needs:['cam_mtx'],fx:'cam'},checkFocus:{wait:15,cost:1,stack:600,needs:['arm_mtx','cam_mtx'],fx:'arm'},
 exchangeData:{cost:2,stack:500,needs:['bus_lock'],fx:'chip'},publishWeather:{cost:9,stack:700,needs:['bus_lock'],fx:'mast'},
 formatWeather:{cost:7,stack:700,fx:'mast'},copyToBus:{cost:2,stack:300,needs:['bus_lock'],fx:'chip'},relayImages:{cost:30,stack:1500,fx:'radio'},
 wifiStack:{cost:4,stack:1000,fx:'radio'},
 publishHazard:{cost:4,stack:400,fx:'cam',sig:'publish_hazard()',start:(K,r)=>{const h=K.w.hz=K.w.hz||{w:0,r:0,torn:0};hzOpen(K,r,'publish_hazard');if(h.r>0){h.torn++;K.bad('publish_hazard() wrote the hazard record while read_hazard() was reading it: distance and bearing come from different frames');}h.w++;},end:K=>{K.w.hz.w--;}},
 readHazard:{cost:3,stack:300,fx:'mast',sig:'read_hazard()',start:(K,r)=>{const h=K.w.hz=K.w.hz||{w:0,r:0,torn:0};hzOpen(K,r,'read_hazard');if(h.w>0){h.torn++;K.bad('read_hazard() read the hazard record while it was being written: distance from frame N, bearing from frame N-1');}h.r++;},end:K=>{K.w.hz.r--;}},
 readTemperature:{cost:2,stack:400,fx:'mast',sig:'x = readTemperature()',end:(K,r)=>{r.x={t:K.t};}},
 wifiConnect:{wait:120,cost:5,stack:2600,fx:'radio',radio:true,waitTxt:'blocks 120 ms while associating',start:K=>{K.w.wifi=true;}},
 wifiSend:{wait:25,cost:2,stack:1800,fx:'radio',radio:true,sig:'wifiSend(x)',start:(K,r)=>{r.tx=r.x;r.x=null;},
  end:(K,r)=>{if(!K.w.wifi)K.bad('wifiSend(): ESP_ERR_WIFI_NOT_CONNECT, the reading was not sent');else if(!r.tx)K.bad('wifiSend(x) sent an empty packet: x holds no reading');else(K.w.reports=K.w.reports||[]).push(K.t);}},
 wifiStop:{cost:1,stack:600,fx:'radio',end:K=>{K.w.wifi=false;}},visionStep:{cost:10,stack:2000,fx:'cam'},fusionStep:{cost:5,stack:800,fx:'mast'},
 // bring-up for the uplink (stage 10): each call blocks while the hardware settles (1st and 2nd call differ), then marks its condition ready
 acquireLink:{wait:K=>nth(K,'nLink',[430,60]),waitTxt:'blocks 60 to 430 ms while the radio associates',cost:1,stack:700,fx:'radio',sig:'acquire_link()',end:K=>ready(K,'link')},
 syncTime:{wait:K=>nth(K,'nTime',[510,290]),waitTxt:'blocks 290 to 510 ms for the time server',cost:1,stack:900,fx:'chip',sig:'sync_time()',end:K=>ready(K,'time')},
 acquireFix:{wait:K=>nth(K,'nFix',[640,60]),waitTxt:'blocks 60 to 640 ms for a position fix',cost:1,stack:800,fx:'mast',sig:'acquire_fix()',end:K=>ready(K,'fix')},
 sendUplink:{wait:20,cost:1,stack:1200,fx:'radio',sig:'send_uplink()',end:K=>{const r=K.w.rdy||{},miss=['link','time','fix'].filter(k=>!r[k]),u=K.w.up=K.w.up||[];
  if(miss.length){u.push({t:K.t,ok:false});K.bad('send_uplink(): packet rejected by the ground station, missing: '+miss.map(k=>({link:'radio link',time:'time sync',fix:'position fix'}[k])).join(', '));}
  else{u.push({t:K.t,ok:true});K.w.rdy={};}}}
};
const nth=(K,k,a)=>a[Math.min(K.w[k]=(K.w[k]||0)+1,a.length)-1];
const ready=(K,k)=>{(K.w.rdy=K.w.rdy||{})[k]=true;(K.w.done=K.w.done||{});(K.w.done[k]=K.w.done[k]||[]).push(K.t);};
const fnInfo=f=>[f.waitTxt||(f.wait?`blocks ${f.wait} ms`:''),f.costTxt||(f.cost?`${f.cost} ms CPU`:'instant'),`${f.stack} B stack`].filter(Boolean).join(' · ');
const API={delay:'vTaskDelay',until:'vTaskDelayUntil',take:'xSemaphoreTake',give:'xSemaphoreGive',send:'xQueueSend',recv:'xQueueReceive',tReset:'xTimerReset',tStop:'xTimerStop',notifyGive:'xTaskNotifyGive',notifyTake:'ulTaskNotifyTake',evSet:'xEventGroupSetBits',evWait:'xEventGroupWaitBits'};

function runSim(L,prog){
  const T=L.T,cores=L.cores||1;
  const K={wdt:new Map(),cur:new Float32Array(L.T),deep:null,bootEnd:0,wakeMs:0,t:0,T,end:T,ev:[],w:{s:{},e:{},irq:{}},pins:{},crash:null,stats:{timeouts:0,sendFail:0,isrMax:0,viol:0},objs:{},units:[],heap:L.heap||0,diag:[],L,cores};
  K.push=(k,o)=>K.ev.push(Object.assign({t:K.t,k},o));
  K.log=(text,cl)=>K.push('log',{text,c:cl});K.mark=(row,cl)=>K.push('mark',{row,c:cl});
  K.pin=(p,v)=>{const n=v==='T'?!K.pins[p]:v==='HIGH';K.pins[p]=n;K.push('pin',{pin:p,v:n});};
  K.die=m=>{if(K.crash)return;K.crash={t:K.t,msg:m,unit:K.stepping||null};K.log(m,'e');K.log('Rebooting...','e');K.mark('!','bad');K.push('crash',{});};
  K.bad=m=>{K.stats.viol++;if(K.stats.viol<=12)K.log(m,'e');K.mark('!','bad');};
  K.alloc=n=>{if(K.heap<n)K.die("pvPortMalloc returned NULL, then the code wrote to it. Guru Meditation Error: Core 1 panic'ed (StoreProhibited).");else K.heap-=n;};
  for(const n in prog.objs){const o=prog.objs[n];K.objs[n]={name:n,type:o.type,len:o.len,items:[],max:o.type==='counting'?o.max:1,count:(o.type==='counting'||o.type==='binary')?(o.init||0):0,owner:null,holder:null,period:o.period,auto:o.auto,active:false,expiry:Infinity,cb:o.cb,bits:0,names:o.bits||[]};}
  prog.units.forEach((u,i)=>{const tr=u.kind!=='task',p=u.kind==='isr'?99:u.kind==='timer'?1:u.prio;
    K.units.push({i,u,name:u.name,kind:u.kind,ctx:u.kind,code:u.code,pc:0,state:tr?'idle':'ready',wake:0,obj:null,dl:null,x:null,busy:0,cur:null,phase:0,prio:p,base:p,held:[],last:-1,lastWake:0,
      hw:u.kind==='task'?BASE:0,pend:0,note:0,noteObj:{type:'note',name:'a task notification'},stack:u.stack,core:u.kind==='isr'?0:(cores>1&&u.kind==='task'?u.core:-1),act:0,prog:true,tr:new Uint8Array(T)});});
  const byName=n=>K.units.find(r=>r.name===n);
  const trigger=n=>{const r=byName(n);if(!r)return;r.pend++;if(r.state==='idle'){r.state='ready';r.pc=0;r.act=0;}};
  K.irq=n=>{(K.w.irq[n]=K.w.irq[n]||[]).push(K.t);K.mark('irq:'+n);K.push('fx',{id:n==='onBump'?'bump':'radio'});trigger(n);};
  const wake=o=>{let b=null;for(const r of K.units)if(r.state==='wait'&&r.obj===o&&(!b||r.prio>b.prio))b=r;if(b){b.state='ready';b.obj=null;}return !!b;};
  // an event for the state machine: put into its queue as an ISR or another task would do it
  K.post=ev=>{const q=K.objs[L.fsm&&L.fsm.queue];(K.w.evs=K.w.evs||[]).push({t:K.t,ev});K.mark('ev');K.log(`event ${ev}`,'d');if(!q)return;
    if(q.items.length<q.len){q.items.push({ev,t:K.t});wake(q);}else{(K.w.evLost=K.w.evLost||[]).push({t:K.t,ev});K.bad(`event queue full: ${ev} was dropped`);}};
  const fsmDone=r=>{if(r.fsmNext!=null){K.w.fsm.state=r.fsmNext;K.push('fsm',{s:r.fsmNext});r.fsmNext=null;}};
  const block=(r,o,to)=>{if(to===0){r.dl=null;r.pc=0;K.stats.timeouts++;return r.prog?(r.prog=false,'cont'):'tick';}
    if(r.dl==null)r.dl=to<0?Infinity:K.t+to;r.state='wait';r.obj=o;r.prog=true;
    if(o.type==='mutex'&&o.owner&&o.owner.prio<r.prio)o.owner.prio=r.prio;return 'resched';};
  const fnEnd=(name,f,r,t)=>{(K.w.e[name]=K.w.e[name]||[]).push(t);K.push('fn',{name,fx:f.fx});f.end&&f.end(K,r);};
  function step(r){
    K.stepping=r.name;   // the unit whose instruction is executing: a crash in here is its doing
    try{return step1(r);}finally{K.stepping=null;}
  }
  function step1(r){
    for(let n=0;n<80;n++){
      if(K.crash)return 'tick';
      if(r.busy>0){r.busy--;r.act++;if(r.busy===0){if(r.cur){fnEnd(r.curName,r.cur,r,K.t+1);fsmDone(r);}r.cur=null;r.pc++;}return 'tick';}
      if(r.pc>=r.code.length){
        if(r.kind!=='task'){if(r.kind==='isr')K.stats.isrMax=Math.max(K.stats.isrMax,r.act);r.act=0;r.pend--;r.pc=0;if(r.pend>0)continue;r.pend=0;r.state='idle';return 'resched';}
        r.pc=0;if(!r.prog||!r.code.length)return 'tick';r.prog=false;continue;}
      let ins=r.code[r.pc],op=ins.op;
      if(op==='fsm'){ // dispatch: find the row for (current state, received event); its action then runs as an ordinary call and the state changes when it returns
        const M=L.fsm||{init:'?'},fw=K.w.fsm=K.w.fsm||{state:M.init,tr:[]};
        if(r.phase===0){const x=r.x;r.x=null;if(!x||!x.ev){r.pc++;continue;}
          const w=(ins.rows||[]).find(q=>q.s===fw.state&&q.e===x.ev);fw.tr.push({t:K.t,tq:x.t,from:fw.state,ev:x.ev,to:w?w.n:fw.state,act:w?w.a||'':'',hit:!!w,unit:r.name});
          if(!w){K.log(`state ${fw.state}: no transition for ${x.ev}, event ignored`,'d');r.pc++;continue;}
          r.fsmNext=w.n;r.fsmFn=w.a;if(!w.a||!F[w.a]){fsmDone(r);r.pc++;continue;}}
        ins={op:'call',fn:r.fsmFn};op='call';}
      if(r.ctx==='isr'&&API[op]){K.die(`${API[op]}() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there.`);return 'tick';}
      if(r.ctx==='timer'&&(op==='delay'||op==='until'||((op==='take'||op==='send'||op==='recv'||op==='notifyTake'||op==='evWait')&&ins.to!==0))){K.die(`${API[op]}() tried to block inside a timer callback. Callbacks run in the timer service task, which must never wait.`);return 'tick';}
      const o=K.objs[ins.s||ins.q||ins.tm||ins.g];
      if((ins.s||ins.q||ins.tm||ins.g)!==undefined&&!o){r.pc++;continue;}
      switch(op){
        case 'gpio':K.pin(ins.pin,ins.v);r.pc++;break;
        case 'busy':if(ins.ms>0){r.busy=ins.ms;r.cur=null;r.prog=true;}else r.pc++;break;
        case 'delay':r.state='sleep';r.wake=K.t+Math.max(1,ins.ms);r.pc++;r.prog=true;return 'resched';
        case 'until':r.lastWake+=Math.max(1,ins.ms);r.pc++;if(r.lastWake>K.t){r.state='sleep';r.wake=r.lastWake;r.prog=true;return 'resched';}break;
        case 'call':{const f=F[ins.fn];
          if(r.phase===0){
            if(r.ctx==='isr'&&f.noIsr){K.die(f.noIsr);return 'tick';}
            if(r.kind==='task'){const need=BASE+f.stack;if(need>r.hw)r.hw=need;if(need>r.stack){K.die(`***ERROR*** A stack overflow in task ${r.name} has been detected.`);return 'tick';}}
            if(f.needs)for(const nm of f.needs){const q=K.objs[nm];if(q&&(q.owner||q.holder)!==r)K.bad(`${ins.fn}() ran without holding ${nm}`);}
            (K.w.s[ins.fn]=K.w.s[ins.fn]||[]).push(K.t);f.start&&f.start(K,r);
            const w=f.wait?(typeof f.wait==='function'?f.wait(K,r):f.wait):0;
            if(w>0){if(r.ctx!=='task'){K.die(`${ins.fn}() blocks, and it was called from ${r.ctx==='isr'?'an ISR':'a timer callback'}.`);return 'tick';}
              r.phase=1;r.state='sleep';r.wake=K.t+w;r.prog=true;return 'resched';}}
          r.phase=0;const cst=typeof f.cost==='function'?f.cost(K,r):f.cost;
          if(cst>0){r.busy=cst;r.cur=f;r.curName=ins.fn;r.prog=true;}else{fnEnd(ins.fn,f,r,K.t);fsmDone(r);r.pc++;}break;}
        case 'take':
          if(o.type==='mutex'){if(o.owner===null){for(const h of r.held)(K.w.lockOrder=K.w.lockOrder||[]).push({t:K.t,unit:r.name,first:h.name,then:o.name});o.owner=r;r.held.push(o);r.dl=null;r.pc++;}else{const b=block(r,o,ins.to);if(b!=='cont')return b;}}
          else if(o.count>0){o.count--;o.holder=r;r.dl=null;r.pc++;}else{const b=block(r,o,ins.to);if(b!=='cont')return b;}break;
        case 'give':case 'giveISR':
          if(o.type==='mutex'){if(r.ctx==='isr'){K.die('A mutex cannot be given from an ISR: mutexes have an owner task. Use a binary or counting semaphore.');return 'tick';}
            if(o.owner!==r){K.die(`assert failed: ${r.name} gave ${o.name} but does not hold it.`);return 'tick';}
            o.owner=null;r.held=r.held.filter(h=>h!==o);if(!r.held.length)r.prio=r.base;}
          else{if(o.count<o.max)o.count++;else if(r.ctx==='isr')K.w.merged=(K.w.merged||0)+1;o.holder=null;}
          r.pc++;if(wake(o)&&r.ctx!=='isr')return 'resched';break;
        case 'send':if(o.items.length<o.len){o.items.push(r.x);r.dl=null;r.pc++;if(wake(o))return 'resched';}
          else{if(ins.to===0){K.stats.sendFail++;(K.w.drops=K.w.drops||[]).push(K.t);if(K.stats.sendFail<=6)K.log(`xQueueSend(${o.name}) returned errQUEUE_FULL: timeout 0, the item was dropped`,'e');}const b=block(r,o,ins.to);if(b!=='cont')return b;}break;
        case 'sendISR':if(o.items.length<o.len){o.items.push(r.x);wake(o);}else{K.stats.sendFail++;K.bad('xQueueSendFromISR: queue full, item dropped');}r.pc++;break;
        case 'recv':if(o.items.length){r.x=o.items.shift();r.dl=null;r.pc++;if(wake(o))return 'resched';}else{const b=block(r,o,ins.to);if(b!=='cont')return b;}break;
        case 'tReset':o.active=true;o.expiry=K.t+Math.max(1,o.period);r.pc++;break;
        case 'tStop':o.active=false;r.pc++;break;
        case 'notifyGive':case 'notifyGiveISR':{ // direct-to-task notification: a counter inside the receiving task, no kernel object
          const tg=byName(ins.task);r.pc++;if(!tg)break;tg.note++;(K.w.notes=K.w.notes||[]).push(K.t);
          if(tg.state==='wait'&&tg.obj===tg.noteObj){tg.state='ready';tg.obj=null;if(r.ctx!=='isr')return 'resched';}break;}
        case 'notifyTake':if(r.note>0){r.note=String(ins.clear)==='0'?r.note-1:0;r.dl=null;r.pc++;}else{const b=block(r,r.noteObj,ins.to);if(b!=='cont')return b;}break; // pdTRUE clears the count on exit (a burst is one wake-up); pdFALSE decrements it (every give is handled)
        case 'evSet':{const i=o.names.indexOf(ins.bit);r.pc++;if(i<0)break;(K.w.sets=K.w.sets||[]).push({t:K.t,bit:ins.bit,unit:r.name,rdy:Object.assign({},K.w.rdy||{})});o.bits|=1<<i;let woke=false;
          for(const u of K.units)if(u.state==='wait'&&u.obj===o){u.state='ready';u.obj=null;woke=true;} // every waiter re-checks its own condition
          if(woke&&r.ctx!=='isr')return 'resched';break;}
        case 'evWait':{const all=(1<<o.names.length)-1,i=o.names.indexOf(String(ins.mode).slice(4)),m=(ins.mode==='all'||ins.mode==='any')?all:i<0?0:1<<i;
          if(!m){r.pc++;break;}
          if(ins.mode==='all'?(o.bits&m)===m:(o.bits&m)!==0){o.bits&=~m;r.dl=null;r.pc++;}else{const b=block(r,o,ins.to);if(b!=='cont')return b;}break;} // bits are cleared on exit
        case 'wdtAdd':K.wdt.set(r,K.t);r.pc++;break;
        case 'wdtReset':if(K.wdt.has(r))K.wdt.set(r,K.t);r.pc++;break;
        case 'wakeTimer':K.wakeMs=Math.max(1,ins.ms);r.pc++;break;
        case 'deepSleep':
          if(r.ctx!=='task'){K.die('esp_deep_sleep_start() was called from an ISR or timer callback.');return 'tick';}
          K.deep=K.wakeMs>0?K.t+1+K.wakeMs:Infinity;K.w.sleeps=(K.w.sleeps||0)+1;K.mark('pwr');
          K.log(K.wakeMs>0?`Entering deep sleep for ${K.wakeMs} ms`:'Entering deep sleep with no wake-up source enabled: only a reset will wake the chip',K.wakeMs>0?'d':'e');
          r.pc++;return 'tick';
        default:r.pc++;
      }
    }
    return 'tick';
  }
  const idle=Array(cores).fill(0),streak=Array(cores).fill(0);K.coreTr=Array.from({length:cores},()=>new Int8Array(T).fill(-1));
  // a stack smaller than the task's own context overflows on the first context switch
  for(const r of K.units)if(r.kind==='task'&&r.stack<BASE)K.die(`***ERROR*** A stack overflow in task ${r.name} has been detected.`);
  // deep sleep ends in a full reset: RAM, task state, kernel objects and GPIO levels are lost
  const reboot=()=>{K.w.boots=(K.w.boots||0)+1;K.w.wifi=false;K.wakeMs=0;
    for(const p in K.pins)if(K.pins[p])K.pin(p,'LOW');
    K.wdt.clear();
    for(const n in K.objs){const o=K.objs[n],po=prog.objs[n];o.bits=0;o.items=[];o.owner=o.holder=null;o.active=false;o.expiry=Infinity;o.count=(o.type==='counting'||o.type==='binary')?(po.init||0):0;}
    for(const r of K.units){const tr=r.kind!=='task';Object.assign(r,{pc:0,state:tr?'idle':'sleep',wake:K.bootEnd,obj:null,dl:null,x:null,busy:0,cur:null,phase:0,prio:r.base,held:[],lastWake:K.bootEnd,pend:0,act:0,prog:true,note:0});}
    K.log('rst:0x5 (DEEPSLEEP_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)','d');};
  const pm=prog.objs&&prog.objs.pm;K.lightSleepOn=!!(pm&&pm.lightSleep);   // esp_pm_configure(.light_sleep_enable)
  let t=0;
  for(;t<T&&!K.crash;t++){K.t=t;
    if(K.deep!==null){ // powered down, then booting: nothing is scheduled
      if(t>=K.deep&&K.bootEnd<=K.deep){K.bootEnd=t+BOOT;reboot();}
      if(t<K.deep){K.cur[t]=PWR.deep;for(const r of K.units)r.tr[t]=6;for(let co=0;co<cores;co++){idle[co]++;streak[co]=0;}continue;}
      if(t<K.bootEnd){K.cur[t]=PWR.run;for(let co=0;co<cores;co++)streak[co]=0;continue;}
      K.deep=null;
    }
    for(const n in L.irqs||{})if(L.irqs[n].includes(t))K.irq(n);
    if(L.fsm){const v=rv(K); // scripted commands and sensor events, and the drill reporting that it has finished
      for(const e of L.fsm.script)if(e.t===t){if(e.ev==='HAZARD'){v.haz=true;(v.hz=v.hz||[]).push(t);}if(e.ev==='CMD_RESUME')v.haz=false;K.post(e.ev);}
      if(v.done<=t){v.done=Infinity;v.drill=false;v.dr.push({t,on:0});v.raw++;v.smp.push(t);K.post('DRILL_DONE');}}
    for(const n in K.objs){const o=K.objs[n];if(o.type==='timer'&&o.active&&o.expiry<=t){trigger(o.cb);K.mark('tmr:'+n);if(o.auto)o.expiry+=Math.max(1,o.period);else o.active=false;}}
    for(const r of K.units){if(r.state==='sleep'&&r.wake<=t)r.state='ready';else if(r.state==='wait'&&r.dl!==Infinity&&r.dl<=t){r.state='ready';r.obj=null;r.dl=null;r.pc=0;K.stats.timeouts++;}}
    const ran=new Set();
    for(let co=0;co<cores;co++){let got=null;
      for(let n=0;n<40&&!got;n++){let b=null;
        for(const r of K.units){if(r.state!=='ready'||ran.has(r)||(r.core>=0&&r.core!==co))continue;if(!b||r.prio>b.prio||(r.prio===b.prio&&r.last<b.last))b=r;}
        if(!b)break;if(step(b)==='tick')got=b;else b.brief=t;}
      if(got){ran.add(got);got.last=t;K.coreTr[co][t]=got.i;
        if(++streak[co]>=WDT&&!K.crash)K.die(`E (${t}) task_wdt: Task watchdog got triggered. The following tasks did not reset the watchdog in time:\n - IDLE${co} (CPU ${co})\nThe idle task on this core has not run for ${WDT} ms: a task there never blocks, or the tasks together need more than 100% of the CPU.`);}
      else{idle[co]++;streak[co]=0;}}
    for(const r of K.units)r.tr[t]=ran.has(r)?1:r.brief===t?4:r.state==='ready'?2:r.state==='wait'?3:r.state==='sleep'?5:0;
    // task watchdog: a subscribed task that stops calling esp_task_wdt_reset() is reported by name
    for(const [r,seen] of K.wdt)if(t-seen>=(L.wdtTimeout||1000)&&!K.crash)K.die(`E (${t}) task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:\n - ${r.name} (CPU 0)\nThat task subscribed with esp_task_wdt_add() and then went ${L.wdtTimeout||1000} ms without esp_task_wdt_reset().`);
    // current drawn in this millisecond
    let base=PWR.run,tx=false;
    if(!ran.size){base=PWR.idle;
      if(pm&&pm.lightSleep&&!K.w.wifi){ // tickless idle: sleep only if nothing is due within 3 ticks
        let next=Infinity;for(const r of K.units){if(r.state==='sleep')next=Math.min(next,r.wake);else if(r.state==='wait'&&r.dl!==null)next=Math.min(next,r.dl);else if(r.state==='ready')next=t;}
        for(const n in K.objs)if(K.objs[n].active)next=Math.min(next,K.objs[n].expiry);
        if(next-t>=3){base=PWR.light;K.w.lightMs=(K.w.lightMs||0)+1;}}}
    for(const r of K.units)if((r.cur&&r.cur.radio)||(r.phase===1&&F[r.code[r.pc]&&r.code[r.pc].fn]&&F[r.code[r.pc].fn].radio))tx=true;
    K.cur[t]=base+(K.w.wifi?PWR.wifi:0)+(tx?PWR.tx:0);
  }
  K.end=t;
  if(!K.crash){K.t=t-1;K.log(`Test finished: ${t} ms simulated, ${K.stats.viol} fault(s).`,K.stats.viol?'e':'o');}
  for(const r of K.units)if(r.state==='wait'&&r.dl===Infinity&&r.obj.type==='mutex'&&r.obj.owner&&(r.obj.owner===r||r.obj.owner.state==='wait'))
    K.diag.push(r.obj.owner===r?`${r.name} waits for ${r.obj.name}, which it already holds itself`:`${r.name} waits for ${r.obj.name}, held by ${r.obj.owner.name}`);
  if(K.diag.length){K.t=t-1;K.log('Deadlock: '+K.diag.join('; ')+'.','e');}
  let ram=0;prog.units.forEach(u=>{if(u.kind==='task'&&!u.locked)ram+=+u.stack||0;});
  for(const n in prog.objs){const o=prog.objs[n];if(o.type!=='pm')ram+=96+(o.type==='queue'?o.len*o.item:0);}
  let sum=0;for(let i=0;i<t;i++)sum+=K.cur[i];
  K.m={avgmA:Math.round(sum/Math.max(1,t)*100)/100,cpu:Math.round(100*(1-idle.reduce((a,b)=>a+b,0)/Math.max(1,t*cores))),ram,core:idle.map(x=>Math.round(100*(1-x/Math.max(1,t))))};
  return K;
}
/* check helpers */
const S_=(K,f)=>K.w.s[f]||[],E_=(K,f)=>K.w.e[f]||[];
const maxGap=a=>{let m=0;for(let i=1;i<a.length;i++)m=Math.max(m,a[i]-a[i-1]);return a.length>1?m:Infinity;};
const late=(K,f,p)=>{const e=E_(K,f),want=Math.floor(K.T/p);let n=Math.max(0,want-e.length);e.forEach((x,k)=>{if(x>(k+1)*p)n++;});return n;};
const pinT=(K,p)=>K.ev.filter(e=>e.k==='pin'&&e.pin===p).map(e=>e.t);
const gapsOf=a=>a.slice(1).map((x,i)=>x-a[i]);
// The Lean star counts RAM without a sensible stack margin: up to SPARE bytes of unused stack per task are free, so keeping headroom never costs the star.
const SPARE=256,leanRam=K=>K.m.ram-K.units.filter(u=>u.kind==='task').reduce((a,u)=>a+Math.max(0,Math.min(u.stack-u.hw,SPARE)),0);
const B=(cpu,ram)=>[{label:`Efficient: CPU load at most ${cpu}%`,ok:K=>K.m.cpu<=cpu},{label:`Lean: at most ${ram} bytes of RAM, not counting up to ${SPARE} B of spare stack per task`,ok:K=>leanRam(K)<=ram}];
const BUMPS=[150,420,425,900,1300,1304,1308,1700],PKTS=[100,180,260,340,1200,1290,1380,2100,2150],PKT_LAST=[340,1380,2150];
export {fs,row,DRILL,ng,ngi,nt,es,ew,wa,wr,PWR,BOOT,wt,ds,BASE,WDT,g,d,un,bz,c,tk,gv,gi,sn,rc,si,trs,tst,task,F,fnInfo,runSim,S_,E_,maxGap,late,pinT,gapsOf,B,leanRam,SPARE};
