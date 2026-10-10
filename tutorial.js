const steps = [
    {title:'Sag deine Stiche voraus', text:'Bei Bappo spielen 2 bis 10 Personen mit 80 Karten: vier Farben mit Zahlen von 1 bis 20. Dein Ziel ist, genau so viele Stiche zu gewinnen, wie du vorher getippt hast.',visual:'<span class="tutorial-symbol">🎯</span>'},
    {title:'An einen Tisch setzen', text:'Gib deinen Namen ein und eröffne einen Tisch oder tritt einem Raum bei. Der Spielleiter startet das Spiel und wählt die Kartenanzahl für jede Runde. Wer später beitritt, spielt ab der nächsten Runde mit.',visual:'<span class="tutorial-symbol">👥</span>'},
    {title:'Erst tippen, dann spielen', text:'Alle tippen nacheinander, wie viele Stiche sie gewinnen werden. Der letzte Tipp darf die Summe aller Tipps nicht genau auf die Kartenanzahl pro Spieler bringen. Erst wenn alle Tipps gespeichert sind, beginnt das Ausspielen.',visual:'<div class="tutorial-example">5 Karten · bisherige Tipps: 3<br><strong>Letzter Tipp: 2 ist nicht erlaubt</strong></div>'},
    {title:'So gewinnst du einen Stich', text:'Jeder legt eine Karte. Du musst die zuerst ausgespielte Farbe bedienen, wenn du sie hast. Sonst darfst du eine beliebige Farbe spielen. Rot ist immer Trumpf: die höchste rote Karte gewinnt. Ohne Rot gewinnt die höchste Karte der zuerst ausgespielten Farbe. Der Gewinner eröffnet den nächsten Stich.',visual:'<div class="tutorial-cards"><span class="tutorial-card blue">20</span><span class="tutorial-card red">1</span><strong>Rot gewinnt!</strong></div>'},
    {title:'Eine Karte? Blind spielen!', text:'Bei einer Karte pro Person siehst du die Karten der Mitspieler, aber deine eigene bleibt verdeckt. Schätze deinen Tipp anhand der fremden Karten. Deine Karte deckst du erst beim Ausspielen auf.',visual:'<div class="tutorial-cards"><span class="tutorial-card back">?</span><span class="tutorial-card blue">12</span></div>'},
    {title:'Jeder genaue Tipp zählt', text:'Tipp getroffen: 10 Punkte plus 5 Punkte pro gewonnenem Stich. Danebengetippt: minus 5 Punkte pro Stich Abweichung. Beispiel: Tipp 2 und 2 Stiche ergeben 20 Punkte; Tipp 2 und 3 Stiche ergeben −5 Punkte. Am Ende gewinnt die höchste Gesamtpunktzahl.',visual:'<span class="tutorial-symbol">🏆</span>'}
];
const dialog=document.getElementById('tutorialDialog');
const previous=document.getElementById('tutorialPrevious');
const next=document.getElementById('tutorialNext');
let index=0;
function render(){
 const step=steps[index];
 document.getElementById('tutorialTitle').textContent=step.title;
 document.getElementById('tutorialText').textContent=step.text;
 document.getElementById('tutorialVisual').innerHTML=step.visual;
 document.getElementById('tutorialProgress').textContent=`${index+1} / ${steps.length}`;
 previous.disabled=index===0;
 next.textContent=index===steps.length-1?'Los geht’s':'Weiter';
}
document.getElementById('openTutorial').onclick=()=>{index=0;render();dialog.showModal();};
document.getElementById('closeTutorial').onclick=()=>dialog.close();
previous.onclick=()=>{if(index>0){index--;render();}};
next.onclick=()=>{if(index<steps.length-1){index++;render();}else dialog.close();};
dialog.addEventListener('close',()=>document.getElementById('openTutorial').focus());
