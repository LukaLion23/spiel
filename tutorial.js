// Guided practice only: no room, no Firebase writes, no score changes.
const dialog=document.getElementById('tutorialDialog');
const game=document.getElementById('tutorialGame');
let phase='tip',tip=2;
const card=(color,value,id)=>`<button type="button" class="practice-card ${color}" data-choice="${id}" aria-label="${color==='red'?'Rot':color==='blue'?'Blau':'Grün'} ${value}"><span>${value}</span><strong>${value}</strong></button>`;
function feedback(text){document.getElementById('practiceFeedback').textContent=text;}
function render(){
 const intro='<p class="practice-step">PROBESPIEL · 2 KARTEN</p>';
 if(phase==='tip')game.innerHTML=`${intro}<h2>Wie viele Stiche holst du?</h2><p>Du hast Blau 12 und Rot 4. Rot ist Trumpf. In diesem Übungsspiel kannst du beide Stiche gewinnen. Gib deinen Tipp ab.</p><div class="practice-hand">${card('blue',12,'preview')}${card('red',4,'preview')}</div><div class="practice-tip"><button type="button" id="practiceMinus" aria-label="Tipp verringern">−</button><strong id="practiceTip">${tip}</strong><button type="button" id="practicePlus" aria-label="Tipp erhöhen">+</button></div><button type="button" id="practiceStart">Tipp speichern</button><p id="practiceFeedback" role="status"></p>`;
 if(phase==='follow')game.innerHTML=`${intro}<h2>Stich 1 · Farbe bedienen</h2><p>Dein Mitspieler spielt Blau 8 aus. Du hast eine blaue Karte und musst Blau bedienen. Wähle deine Karte!</p><div class="practice-table"><span>Mitspieler</span><div class="practice-face blue">8</div></div><div class="practice-hand">${card('blue',12,'blue12')}${card('red',4,'red4')}</div><p id="practiceFeedback" role="status">Du bist am Zug.</p>`;
 if(phase==='firstWin')game.innerHTML=`<div class="practice-banner">✓ Dein erster Stich!</div><h2>Blau 12 schlägt Blau 8</h2><p>Du hast die Farbe bedient und die höhere Zahl gelegt. Deine rote Karte bleibt auf der Hand.</p><div class="practice-score">1 / 2 Stiche</div><button type="button" id="practiceContinue">Nächsten Stich üben</button>`;
 if(phase==='trump')game.innerHTML=`${intro}<h2>Stich 2 · Trumpf sticht</h2><p>Du hast den letzten Stich gewonnen und eröffnest jetzt mit Rot 4. Dein Mitspieler hat nur Grün 20 und kein Rot mehr. Spiele deine letzte Karte!</p><div class="practice-table"><span>Mitspieler</span><div class="practice-face green">20</div></div><div class="practice-hand">${card('red',4,'red4')}</div><p id="practiceFeedback" role="status">Rot ist immer Trumpf, auch mit einer kleineren Zahl.</p>`;
 if(phase==='result')game.innerHTML=`<div class="practice-banner">🏆 Zwei Stiche gewonnen!</div><h2>${tip===2?'Tipp getroffen!':'Das wäre deine Wertung'}</h2><p>Rot 4 schlägt Grün 20, weil Rot Trumpf ist.</p><div class="practice-results"><span>Dein Tipp <strong>${tip}</strong></span><span>Deine Stiche <strong>2</strong></span><span>Punkte <strong>${tip===2?20:-5*Math.abs(tip-2)}</strong></span></div><p>Genau getroffen: 10 + 5 pro Stich. Sonst −5 pro Stich Abweichung.</p><button type="button" id="practiceBlind">Ein-Karten-Runde ausprobieren</button>`;
 if(phase==='blind')game.innerHTML=`<p class="practice-step">BONUS · BLIND SPIELEN</p><h2>Deine Karte ist verdeckt</h2><p>Du siehst nur die Karten der Mitspieler. Einer hat Rot 3, einer Blau 20. Tippe: Kannst du den Stich gewinnen?</p><div class="practice-table"><div><span>Anna</span><div class="practice-face red">3</div></div><div><span>Ben</span><div class="practice-face blue">20</div></div></div><div class="practice-hidden">? <small>DEINE KARTE</small></div><div class="practice-actions"><button type="button" data-blind-tip="0">0 Stiche</button><button type="button" data-blind-tip="1">1 Stich</button></div><p id="practiceFeedback" role="status">Du kennst deine Karte noch nicht. Entscheide nach den fremden Karten.</p>`;
 if(phase==='done')game.innerHTML=`<div class="practice-banner">✓ Probespiel abgeschlossen</div><h2>Deine Karte war Grün 17</h2><p>Anna gewinnt mit Rot 3: Trumpf schlägt Grün und Blau. Dein Tipp war <strong>${tip}</strong>; richtig wäre hier 0 gewesen. Beim echten Spiel weißt du deine eigene Karte vorher nicht.</p><p>Jetzt kennst du Tipps, Farbpflicht, Trumpf und die Blindrunde.</p><button type="button" id="practiceFinish">Zurück zum Start</button>`;
 if(phase==='tip'){
  document.getElementById('practiceMinus').onclick=()=>{tip=Math.max(0,tip-1);document.getElementById('practiceTip').textContent=tip;};
  document.getElementById('practicePlus').onclick=()=>{tip=Math.min(2,tip+1);document.getElementById('practiceTip').textContent=tip;};
  document.getElementById('practiceStart').onclick=()=>{phase='follow';render();};
 }
 game.querySelectorAll('[data-choice]').forEach(button=>{
  button.disabled=phase==='tip';
  button.onclick=()=>{
   if(phase==='follow'&&button.dataset.choice!=='blue12'){feedback('Du hast Blau auf der Hand. Deshalb musst du Blau bedienen. Wähle Blau 12.');return;}
   phase=phase==='follow'?'firstWin':'result';render();
  };
 });
 const bind=(id,next)=>{const button=document.getElementById(id);if(button)button.onclick=()=>{phase=next;render();};};
 bind('practiceContinue','trump');bind('practiceBlind','blind');
 game.querySelectorAll('[data-blind-tip]').forEach(button=>button.onclick=()=>{tip=Number(button.dataset.blindTip);phase='done';render();});
 const finish=document.getElementById('practiceFinish');if(finish)finish.onclick=()=>dialog.close();
}
function restart(){phase='tip';tip=2;render();}
document.getElementById('openTutorial').onclick=()=>{restart();dialog.showModal();};
document.getElementById('restartTutorial').onclick=restart;
document.getElementById('closeTutorial').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>document.getElementById('openTutorial').focus());
