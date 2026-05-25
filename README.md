# Importer Survey Piégeage

Widget personnalisé pour **ArcGIS Experience Builder** permettant d'importer des données de survey piégeage depuis un fichier Excel vers la couche `sde.survey_piegeage`. La couche cible est préconfigurée dans le widget — aucune saisie d'URL requise par l'utilisateur.

---

## Compatibilité

| ArcGIS Experience Builder | Compatible |
|---------------------------|------------|
| 1.13                      | oui        |

| ArcGIS Enterprise | Compatible |
|-------------------|------------|
| 11.3              | oui        |

---

## Déployer dans ArcGIS Enterprise

Dans Experience Builder, aller dans **Widgets personnalisés → Ajouter un widget personnalisé** et coller cette URL :

```
https://raw.githubusercontent.com/GDG-Env/import_survey_piegeage/main/manifest.json
```

---

## Fonctionnalités

---

## Fonctionnalités

- Lecture de fichiers `.xlsx` / `.xls` (SheetJS)
- Mappage automatique des colonnes Excel vers les champs de la BD
- Conversion des coordonnées WGS84 (longitude/latitude) → Web Mercator (WKID 3857)
- Import par lots de 200 entités (appel `applyEdits`)
- Aperçu avant import : nombre de lignes, colonnes reconnues
- Interface entièrement en français

---

## Mapping des colonnes

| Colonne Excel         | Champ `sde.survey_piegeage`       | Type       |
|-----------------------|-----------------------------------|------------|
| date_piegeage         | date_piegeage                     | datetime2  |
| numero_contrat        | numero_contrat                    | nvarchar   |
| num_employe           | num_employe                       | nvarchar   |
| division              | division                          | nvarchar   |
| municipalite          | municipalite                      | nvarchar   |
| code_station          | code_station                      | nvarchar   |
| type_piege            | type_piege                        | nvarchar   |
| num_piege             | num_piege                         | nvarchar   |
| temperature           | temperature                       | numeric    |
| type_envoi            | type_envoi                        | nvarchar   |
| date_installation     | date_installation                 | datetime2  |
| date_collecte         | date_collecte                     | datetime2  |
| echantillon           | echantillon                       | nvarchar   |
| action                | action                            | nvarchar   |
| nombre_barcode        | nombre_barecode *(typo dans BD)*  | smallint   |
| nombre_insecte        | nombre_insecte                    | int        |
| num_barcode1          | num_barcode1                      | nvarchar   |
| ward                  | ward                              | nvarchar   |
| lieu                  | lieu                              | nvarchar   |
| officiel              | officiel                          | nvarchar   |
| requete_citoyenne     | requete_citoyenne                 | nvarchar   |
| date_envoi            | date_envoi                        | datetime2  |
| longitude             | longitude                         | numeric    |
| latitude              | latitude                          | numeric    |
| notes                 | notes                             | nvarchar   |

> **Notes :**
> - La colonne `nom_station` du fichier Excel n'a pas d'équivalent dans la table — elle est ignorée.
> - La reconnaissance des colonnes est insensible à la casse et aux espaces (ex. "Nombre Barcode" = "nombre_barcode").
> - Les lignes sans `longitude`/`latitude` valides sont ignorées et comptées comme erreurs.

---

## Prérequis

### 1. Installer la dépendance xlsx (SheetJS)

Dans le dossier **client** de l'installation Experience Builder :

```bash
cd C:\ArcGIS\ExperienceBuilder\client
npm install xlsx
```

Ou ajouter manuellement dans `client/package.json` :

```json
"dependencies": {
  "xlsx": "^0.18.5"
}
```

Puis relancer `npm install`.

### 2. Déployer le widget

Copier le dossier `import-survey-piegeage` dans :

```
[ExB-Install]\client\your-extensions\widgets\
```

Structure attendue :

```
your-extensions/widgets/import-survey-piegeage/
├── manifest.json
└── src/
    ├── config.ts
    ├── runtime/
    │   └── widget.tsx
    └── setting/
        └── setting.tsx
```

### 3. Redémarrer le serveur de développement

```bash
cd C:\ArcGIS\ExperienceBuilder
npm start
```

---

## Configuration dans Experience Builder

1. Créer ou ouvrir une application dans Experience Builder
2. Dans le panneau **Insérer**, ajouter le widget **Importer Survey Piégeage**
3. Ouvrir les **Paramètres** du widget (icône engrenage)
4. Saisir l'URL complète du feature layer :
   ```
   https://<votre-serveur>/arcgis/rest/services/<service>/FeatureServer/<index>
   ```
5. Sauvegarder et publier l'application

---

## Utilisation

1. Dans l'application publiée, cliquer sur **Choisir un fichier…**
2. Sélectionner le fichier Excel (.xlsx ou .xls)
3. Vérifier le résumé : nombre de lignes et colonnes reconnues
4. Cliquer sur **Importer N entité(s)**
5. Un message de succès (vert) ou d'avertissement (orange) confirme le résultat

---

## Points importants

- L'utilisateur doit être authentifié avec les droits **Create** sur le feature service.
- La géométrie est créée à partir des colonnes `longitude`/`latitude` (WGS84) et reprojetée en WKID 3857 (Web Mercator) pour correspondre au SRID de la couche.
- Les dates Excel sont automatiquement converties en timestamps ESRI (millisecondes).
- L'import se fait avec les crédentials de la session Experience Builder active (Identity Manager ArcGIS JS API).
