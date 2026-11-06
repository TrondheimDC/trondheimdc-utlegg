# Utleggsrapport: PDF-formatet

trondheimdc-regnskap leser rapporten fra den synlige teksten i PDF-en (pdf.js-tekst, gruppert i
rader og celler). Derfor er tekstene og plasseringen under en kontrakt mellom de to repoene.
Endrer du noe under «Fast», må du øke formatversjonen og si fra til regnskap.

Eksempler på ekte rapporter lages med `pnpm samples` (skrives til `samples/`). Bruk dem som
testdata i regnskap i stedet for håndtegnede PDF-er.

## Format 2 (fra november 2026)

### Kjennetegn

- Side 1 har feltet `Rapport-ID`, som format 1 ikke har. Det skiller formatene i den synlige
  teksten.
- PDF-metadata: tittel `Utleggsrapport <Rapport-ID> – <navn>`, emne
  `TrondheimDC utleggsrapport, format 2`, nøkkelord `utleggsrapport`, `format-2` og
  rapport-ID-en. Forfatter er personens navn (med alle tegn, se «Tegn» under). Formatversjonen
  står bare her, ikke på siden.
- Hver side har en footer med `Utleggsrapport <Rapport-ID>` til venstre og `Side n av N` til
  høyre.
- Alle sider er A4 (595,28 × 841,89 pt).
- Filnavn: `<Rapport-ID>-<navn i ASCII>-expense-report.pdf`, f.eks.
  `UT-20261106-7KQ2-oystein-asmund-aerlig-expense-report.pdf`. `expense-report` er alltid med.
- E-postemne (når rapporten er laget før «Send e-post»): `Utleggsrapport <Rapport-ID> - <navn>`
  (engelsk: `Expense report <Rapport-ID> - <navn>`).

### Rapport-ID

`UT-ÅÅÅÅMMDD-XXXX`: dagen rapporten ble laget og fire tegn fra Crockford base32 (uten I, L, O, U).
Unik per rapport, så to krav fra samme person samme dag kan skilles. Står på side 1, i footeren
på hver side, i filnavnet og i e-postemnet.

### Side 1: felter

Felter er en **etikett** (7,5 pt) med **verdien** på linjen(e) rett under, med samme venstre x.
En lang verdi brytes over flere linjer, alle med samme x. Etikettene har ikke kolon.

| Etikett | Verdi |
|---|---|
| `Rapport-ID` | `UT-20261106-7KQ2` (øverst til høyre) |
| `Dato` | dagen rapporten ble laget, `dd.mm.åååå` |
| `Navn`, `Adresse`, `E-post` | under overskriften `Utlegg fra` (venstre kolonne) |
| `Kontonummer` | norsk konto, `1234 56 78903` (11 siffer med mellomrom) |
| `Land` | bankens land, utenlandsk konto |
| `IBAN`, `BIC` | SEPA-konto (BIC med store bokstaver) |
| `Routingnummer`, `Kontotype` | amerikansk konto |
| `Kontonummer (utland)` | utenlandsk kontonummer (aldri tolket som norsk) |
| `Bank`, `Bankadresse`, `Kontoinnehaver` | utenlandsk konto utenfor SEPA |
| `Valuta` | utbetalingsvalutaen, f.eks. `NOK`, `EUR` |
| `Antall kvitteringer` | antall rader i tabellen |
| `Periode` | første og siste kvitteringsdato, `dd.mm.åååå – dd.mm.åååå` (én dato hvis like) |
| `Sum` | `4 332,93 NOK`: summen av radene i utbetalingsvalutaen |

Bankfeltene står under overskriften `Utbetales til` (høyre kolonne), og `Valuta` er alltid sist.

Når kontonummeret ikke ble validert, står det en boks med teksten
`Kontonummeret er ikke validert`.

### Tabellen

Overskriften `Kvitteringer`, så et tabellhode med disse cellene, fra venstre:

| Kolonne | Hode | Justering | Innhold på radens første linje |
|---|---|---|---|
| nummer | `#` | venstre | `1`, `2`, … |
| dato | `Dato` | venstre | `dd.mm.åååå` |
| beskrivelse | `Beskrivelse` | venstre | personens tekst, kan brytes over flere linjer |
| kategori | `Kategori` | venstre | én av kategoriene under |
| beløp | `Beløp` | høyre | `2 450,50 NOK`: beløpet på kvitteringen med valuta |
| utbetales | `Utbetales (NOK)` | høyre | `2 450,50`: i utbetalingsvalutaen fra hodet, eller `—` uten kurs |

- Høyrejusterte celler slutter på samme x som hodet sitt (`x1`).
- En ny rad starter alltid med et tall i `#`-kolonnen. Personens tekst står bare i
  beskrivelseskolonnen og kan derfor ikke starte eller avslutte en rad.
- Linjene etter den første i en rad inneholder bare fortsettelsen av beskrivelsen og, i
  beløpskolonnen, en liten linje `kurs 10,9120` (annen valuta) eller `kurs mangler`.
- Celler i ulike kolonner står minst ca. 10 pt fra hverandre, så de aldri slås sammen.
- Tabellen avsluttes med en rad som har `Sum` i `#`-kolonnen og summen i utbetales-kolonnen.
  Summen er nøyaktig summen av radene (hver rad avrundes til øre før summering).
- Får ikke tabellen plass, fortsetter den på nye sider med overskriften `Kvitteringer (forts.)`
  og samme tabellhode. Kvitteringssidene kommer først etter den siste tabellsiden.

Beløp skrives `1 234,50`: vanlige mellomrom som tusenskille, komma som desimaltegn, alltid to
desimaler.

### Kategorier

Personen velger én per kvittering, eller lenken har låst den (`?category=<id>`, `?for=meetup`).
Teksten i `Kategori`-kolonnen og på kvitteringssiden er én av disse, og hver tilsvarer nøyaktig
én kategori-id i regnskap (`regnskap.config.json`, `utlegg`):

| Tekst i PDF | Id i regnskap | Valg i skjemaet |
|---|---|---|
| `Reise` | `reise` | Reise og transport (fly, tog, taxi, buss, parkering) |
| `Overnatting` | `overnatting` | Overnatting |
| `Servering` | `servering` | Mat og servering (mat og drikke på møter) |
| `Materiell` | `materiell` | Materiell og utstyr (teip, batterier, kabler, skjermer, t-skjorter, trykksaker) |
| `Programvare` | `programvare` | Programvare og abonnement (Sessionize, Figma, domener) |
| `Meetup-støtte` | `meetup-stotte` | Støtte til en meetup-gruppe (lokale, mat, Meetup.com-abonnement) |
| `Annet` | `annet` | Annet |

Skjemaet holder det enkelt med vilje. `utstyr` og `profilering` (fra `materiell`), og `crew` og
`representasjon` (fra `servering`), velges i gjennomgangen i regnskap. Gaver og premier venter
til regnskapsfører har sagt hvilken konto de skal på.

Hvilken meetup-gruppe som fikk støtte, står i beskrivelsen; skjemaet spør ikke eget om det.

Det er ikke et mva-felt i skjemaet. Satsen må komme fra teksten på kvitteringen eller fra
kategorien.

### Kvitteringssidene

Hver side av hver kvittering (hver side av et PDF-bilag, eller bildet) får en egen A4-side:

1. `Kvittering n av N` øverst til venstre, og kategorien øverst til høyre. Har kvitteringen flere
   sider, står `side i av k` rett etter, som egen celle.
2. Beskrivelsen (kan brytes).
3. `dd.mm.åååå · 245,00 EUR`, og ved annen valuta også
   `· 2 875,08 NOK · kurs 11,7350 (Norges Bank dd.mm.åååå)`.
4. Selve kvitteringen, skalert inn under. PDF-bilag legges inn som sider med teksten intakt, så
   mva-tekst på kvitteringen kan leses. Sider med `/Rotate` vises riktig vei, men teksten fra
   dem kommer ut rotert (pdf.js gir da én «rad» med alle linjene).

### Tegn

Rapporten bruker TDC-fontene fra trondheimdc.no-tokens: IBM Plex Sans for tekst og Space Grotesk
for overskrifter (`public/fonts/`). Tegn som Plex ikke har (f.eks. kinesisk), skrives som `?` i
den synlige teksten. Hele navnet står alltid i PDF-metadataene (`Author` og tittelen). Personen bør derfor
matches på e-post.

## Format 1 (før november 2026)

Ingen `Rapport-ID` og ingen formatversjon i metadataene. Side 1 har `Rapportinfo` med etiketter med kolon på samme linje som
verdien (`Navn:`, `Adresse:`, `E-post:`, `Kontonummer:` eller `IBAN:`, `Utbetalingsvaluta:`),
en tabell `# | Beskrivelse | Dato | Valutakurs | Beløp (XXX)` på én US Letter-side uten sideskift,
`Total:` under tabellen og `Generert: dd.mm.åååå` i footeren. Bilagssidene er de originale
sidene med `Bilag for utlegg #n: <beskrivelse> (<lang dato>)` tegnet øverst. Filnavn:
`ÅÅÅÅ-MM-DD-<navn>-expense-report.pdf`.

Kjente feil i format 1, som regnskap bør passe på i rapporter som fortsatt ligger i innboksen:

- Flere enn rundt 14 rader (færre med lange beskrivelser eller utenlandsk konto) går ut over
  siden. Radene under kanten og `Total:` forsvinner fra teksten.
- En beskrivelse som begynner med `Total:` avslutter tabellen.
- Navn med tegn utenfor Latin-1 (Ł, Ș, kinesisk) ga ingen PDF i det hele tatt.
