# Kozijnen — uitgaven

Kleine offline app om de uitgaven van het kozijnenproject bij te houden. Werkt in de browser van je telefoon, geen account nodig.

## Wat kan het

- **Snel toevoegen** — bedrag, omschrijving, datum, bedrijf, categorie en wie betaald heeft.
- **Betaald door** — Jacky of Coen (namen aanpasbaar). Altijd achteraf te wijzigen: tik de uitgave aan en kies de andere naam.
- **Kozijnen buiten het totaal** — elke uitgave heeft een schakelaar *meetellen in totaal*. Bij de categorie Kozijnen staat die standaard uit: de uitgave blijft in de lijst, maar telt niet mee in je totaal en budget.
- **Overzicht** — totaal uitgegeven met voortgangsbalk tegenover je budget, plus uitsplitsing per categorie, per bedrijf en per persoon.
- **Filteren en zoeken** — op categorie, persoon, bedrijf of "buiten totaal", met een gefilterd subtotaal bovenaan.
- **Kopiëren** — één tik zet het overzicht of de gefilterde lijst als tekst op je klembord.
- **Backup** — download je gegevens als JSON en laad ze op een nieuw toestel weer in. Ook exporteren naar CSV voor Excel.

Categorieën zijn standaard Kozijnen, Gereedschap, Materialen en Huur; je kunt ze hernoemen, verwijderen of aanvullen bij Instellingen.

## Waar staat mijn data

Alles staat in de `localStorage` van de browser waarin je de app opent — dus alleen op dat toestel. Er gaat niets naar een server.

Dat betekent ook: als je de browsergegevens wist of van telefoon wisselt, ben je het kwijt tenzij je een backup hebt. Ga af en toe naar **Instellingen → Backup downloaden**.

## Gebruiken

Open `index.html` in een browser. Online gehost (bijvoorbeeld via GitHub Pages) kun je hem op je telefoon toevoegen aan je beginscherm — hij opent dan als een gewone app en werkt ook zonder internet.

## Bestanden

| Bestand | Wat het doet |
| --- | --- |
| `index.html` | De schermen en de onderste navigatiebalk |
| `app.js` | Alle logica: opslaan, rekenen, weergeven |
| `styles.css` | Vormgeving |
| `sw.js` | Service worker, zodat de app offline werkt |
| `manifest.json`, `icon.svg` | Zodat de app op je beginscherm past |
