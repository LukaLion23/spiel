KARTENSPIEL – FIREBASE-LOBBY

Enthaltene Dateien:
- index.html
- firebase.js
- script.js
- database.rules.json

Deine vorhandene style.css bleibt weiterhin im Projektordner.

SO GEHST DU VOR:

1. Erstelle zuerst eine Sicherung deines GitHub-Repositories.

2. Kopiere diese Dateien in dein Repository:
   - index.html
   - firebase.js
   - script.js

3. Deine vorhandene style.css nicht löschen.

4. Prüfe in Firebase:
   Authentication > Anmeldemethode > Anonym = aktiviert

5. Prüfe in Realtime Database unter "Regeln":

{
  "rules": {
    "games": {
      "$roomCode": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}

6. Lade die Änderungen zu GitHub hoch und warte kurz,
   bis GitHub Pages aktualisiert wurde.

7. Test:
   - Gerät 1 öffnet die GitHub-Pages-Adresse.
   - Namen eingeben.
   - "Spiel erstellen" anklicken.
   - Den angezeigten Code auf Gerät 2 eingeben.
   - Auf beiden Geräten muss dieselbe Spielerliste erscheinen.

WICHTIG:
Diese Version synchronisiert zunächst nur die Lobby.
Die Karten, Tipps, Stiche und Punkte laufen noch lokal in script.js.
Im nächsten Schritt wird die Spiellogik nach Firebase verschoben.
