# Planificador d'Equip — Robòtica i STEAM

Webapp lleugera per gestionar tasques d'un equip de 4 persones, sense servidor propi ni base de dades externa.

---

## 1. Descripció del projecte

Aplicació web per a la gestió de tasques d'un equip docent. Permet crear tasques i subtasques, assignar responsables, canviar estats, visualitzar un tauler Kanban, un calendari tipus Gantt i agrupacions per persona. Les dades s'emmagatzemen exclusivament al Google Sheets privat de l'equip. Tota la lògica sensible resideix a Google Apps Script.

---

## 2. Arquitectura

```
GitHub Pages (frontend estàtic)
       │
       │  fetch() amb JSON
       ▼
Google Apps Script (Web App — API)
       │
       │  SpreadsheetApp / DocumentApp / Docs REST API
       ▼
Google Sheets (base de dades) + Google Docs (actes de reunió)
```

- **Frontend** (`webapp/`): HTML + CSS + JS pur. Només conté la URL pública de la Web App. Cap dada sensible.
- **Backend** (`apps-script/`): Valida usuaris, gestiona el Sheets i llegeix els Docs. Mai s'exposa al repositori public (vegeu §10).
- **Google Sheets**: Full `Tasques`, full `Avisos` i full `Configuracio` (opcional).
- **Google Docs**: Quatre documents d'actes amb taules de tasques que es sincronitzen al Sheets.

---

## 3. Estructura de fitxers

```
planificador-equip/
├── apps-script/
│   ├── Code.gs          ← API principal, auth, CRUD de tasques
│   └── DocsImport.gs    ← Importació de tasques des de Google Docs
├── webapp/
│   ├── index.html       ← Estructura HTML de la webapp
│   ├── styles.css       ← Estils
│   └── app.js           ← Lògica del frontend
└── README.md
```

---

## 4. Com preparar el Google Sheets

1. Obre el Google Sheets amb ID `1Krmw1KRRiTcUIZtS5ZoTtHzBz5Q1EDNWb1z04RkC3mg`.
2. El propi script crearà automàticament els fulls `Tasques` i `Avisos` amb les capçaleres correctes la primera vegada que s'executi.
3. Si vols crear-los manualment, el full `Tasques` ha de tenir aquestes columnes en aquest ordre exacte:

   ```
   codi | empremta | tasca | creador | responsable | estat | data_inici | data_fi |
   parent_id | tipus | prioritat | creada_el | actualitzada_el | tancada_el |
   origen_tipus | origen_doc_id | origen_doc_titol | origen_fila_clau | origen_ultima_revisio
   ```

4. El full `Avisos` ha de tenir: `data | tipus | document | fila | missatge`

---

## 5. Com crear o enganxar el codi d'Apps Script

1. Ves a [script.google.com](https://script.google.com) i crea un nou projecte (o obre-ne un existent vinculat al Sheets).
2. Elimina el contingut del fitxer `Code.gs` per defecte.
3. Copia el contingut de `apps-script/Code.gs` d'aquest repositori i enganxa'l.
4. Afegeix un segon fitxer al projecte (botó `+` → `Script`), anomena'l `DocsImport` i enganxa el contingut de `apps-script/DocsImport.gs`.
5. Desa el projecte (Ctrl+S).
6. Activa els serveis necessaris: `Serveis` → afegir **Google Docs API** (`Docs v1`).

---

## 6. Com desplegar Apps Script com a Web App restringida

1. Al editor d'Apps Script: `Desplegar` → `Nou desplegament`.
2. Selecciona el tipus `Aplicació web`.
3. Configuració recomanada:
   - **Executar com**: `Usuari que accedeix a l'aplicació web`
     *(Imprescindible perquè `Session.getActiveUser().getEmail()` retorni el correu del visitant)*
   - **Qui té accés**: `Qualsevol persona que tingui compte de Google` (o restringit al domini `xtec.cat` si és disponible)
4. Fes clic a `Desplegar`.
5. Copia la **URL de la Web App** resultant. Té aquest format:
   ```
   https://script.google.com/macros/s/[ID_LLARG]/exec
   ```
6. Enganxa aquesta URL a `webapp/app.js` a la constant `API_URL`.

> **Nota sobre CORS**: quan el frontend (GitHub Pages) fa peticions `fetch()` a la Web App, el navegador enviarà les cookies de sessió de Google si l'usuari ja ha autoritzat l'script. Si reps errors CORS, comprova que el desplegament és públic (no privat) i que l'usuari ha visitat almenys una vegada la URL de la Web App per autoritzar-la.

---

## 7. Com verificar si `Session.getActiveUser().getEmail()` retorna el correu

Executa la funció de diagnòstic des de l'editor d'Apps Script (no des del desplegament):

1. Al menú desplegable de funcions, selecciona `diagnosticUsuari`.
2. Fes clic a `Executar`.
3. Obre el `Registre d'execució` (Ctrl+Enter o icona de registre).
4. Hauries de veure el teu correu a la línia `Email usuari actiu`.

Si el camp apareix **buit**:
- Comprova que el desplegament estigui configurat com `Executar com: Usuari que accedeix a l'aplicació web`.
- Comprova que l'usuari hagi autoritzat l'script visitant la URL de la Web App.
- Si `diagnosticUsuari` tampoc retorna el correu en execució directa, assegura't que el compte té els permisos per llegir la sessió activa.

---

## 8. Com configurar la llista blanca d'usuaris

Edita la constant `USUARIS_AUTORITZATS` a `Code.gs`:

```javascript
const USUARIS_AUTORITZATS = {
  "ahiguer2@xtec.cat":              "Albert",
  "correu.alexandra@xtec.cat":      "Alexandra",
  "correu.marta@xtec.cat":          "Marta",
  "correu.merce@xtec.cat":          "Mercè"
};
```

Substitueix els correus pels reals de cada membre. Després de modificar-la, cal fer un **nou desplegament** perquè els canvis tinguin efecte.

---

## 9. Com publicar el frontend a GitHub Pages

1. Puja els fitxers `webapp/index.html`, `webapp/styles.css` i `webapp/app.js` a un repositori GitHub (pot ser la carpeta `webapp/` o l'arrel).
2. A la configuració del repositori: `Settings` → `Pages` → selecciona la branca i la carpeta adequada.
3. GitHub Pages publicarà el frontend a una URL del tipus `https://[usuari].github.io/[repositori]/`.

> **IMPORTANT**: Assegura't que `app.js` conté la URL correcta de la Web App a `API_URL`. No hi ha cap altra dada sensible al frontend.

---

## 10. Què no s'ha de posar mai al repositori

| Element sensible | On ha d'estar |
|---|---|
| ID del Google Sheets | `Code.gs` (constant `PLANIFICADOR_SHEET_ID`) |
| IDs dels Google Docs | `DocsImport.gs` (constant `DOCS_ORIGEN`) |
| Llista d'usuaris autoritzats | `Code.gs` (constant `USUARIS_AUTORITZATS`) |
| Correus electrònics reals | `Code.gs` |
| Claus privades o tokens | Mai en cap fitxer del repositori |

Els fitxers `apps-script/*.gs` **no s'han de publicar a GitHub** si el repositori és públic. Afegeix-los al `.gitignore`:

```
apps-script/
```

O bé utilitza un repositori privat per al projecte complet.

---

## 11. Com executar manualment la sincronització de Docs

Opció A — Des del frontend:
- Inicia sessió a la webapp i fes clic al botó **"Sincronitzar des de Docs"**.

Opció B — Des de l'editor d'Apps Script:
1. Selecciona la funció `executarSincronitzacioManual` al menú de funcions.
2. Fes clic a `Executar`.
3. Consulta el `Registre d'execució` per veure el resultat detallat.

---

## 12. Com afegir un trigger temporal per a la sincronització automàtica

Per automatitzar la sincronització periòdica des de Docs, afegeix un trigger basat en temps:

1. Al projecte d'Apps Script: `Disparadors` (icona rellotge a l'esquerra) → `Afegir disparador`.
2. Configuració:
   - **Funció a executar**: `executarSincronitzacioManual`
   - **Origen de l'event**: `Basat en el temps`
   - **Tipus de trigger de temps**: `Temporitzador d'hores` (o diari)
   - **Interval**: cada 1 hora (o el que necessitis)
3. Desa el trigger.

> Recorda que els triggers automàtics executen el codi com el **propietari** de l'script, no com l'usuari que accedeix. La funció `executarSincronitzacioManual` no fa comprovació d'usuari autoritzat perquè és per a ús intern.

---

## Membres de l'equip

| Nom | Rol |
|---|---|
| Albert | Membre de l'equip |
| Alexandra | Membre de l'equip |
| Marta | Membre de l'equip |
| Mercè | Membre de l'equip |

---

## Llicència

Ús intern de l'equip. No redistribuir sense autorització.
