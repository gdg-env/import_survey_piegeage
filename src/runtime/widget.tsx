/** @jsx jsx */
import { React, jsx, css, AllWidgetProps } from 'jimu-core'
import { Button, Alert, Label } from 'jimu-ui'
import FeatureLayer from 'esri/layers/FeatureLayer'
import Graphic from 'esri/Graphic'
import Point from 'esri/geometry/Point'
import * as webMercatorUtils from 'esri/geometry/support/webMercatorUtils'
import * as XLSX from 'xlsx'
import { IMConfig } from '../config'

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = 'idle' | 'parsing' | 'ready' | 'importing' | 'done' | 'error'

interface ParsedData {
  rows: Record<string, any>[]
  matchedFields: string[]   // description lisible "colExcel → champBD"
  validCount: number        // lignes avec lon/lat valides
}

// ─── Mapping : colonne Excel normalisée → champ sde.survey_piegeage ──────────
//
// Normalisation : trim + lowercase + espaces→underscores
//
// NB : la colonne "nom_station" du fichier Excel n'a pas de correspondance
//      dans la table et est volontairement ignorée.
// NB : la BD a un typo "nombre_barecode" (vs "nombre_barcode" dans Excel).
//
const EXCEL_TO_DB: Record<string, string> = {
  date_piegeage:        'date_piegeage',
  numero_contrat:       'numero_contrat',
  num_employe:          'num_employe',
  division:             'division',
  municipalite:         'municipalite',
  code_station:         'code_station',
  type_piege:           'type_piege',
  num_piege:            'num_piege',
  temperature:          'temperature',
  type_envoi:           'type_envoi',
  date_installation:    'date_installation',
  date_collecte:        'date_collecte',
  echantillon:          'echantillon',
  action:               'action',
  // Variantes orthographiques → champ BD (typo "barecode")
  nombre_barcode:       'nombre_barecode',
  'nombre barcode':     'nombre_barecode',
  nombre_barecode:      'nombre_barecode',
  nombre_insecte:       'nombre_insecte',
  'nombre insecte':     'nombre_insecte',
  num_barcode1:         'num_barcode1',
  ward:                 'ward',
  lieu:                 'lieu',
  officiel:             'officiel',
  requete_citoyenne:    'requete_citoyenne',
  date_envoi:           'date_envoi',
  longitude:            'longitude',
  latitude:             'latitude',
  notes:                'notes'
}

const DATE_FIELDS  = new Set(['date_piegeage', 'date_installation', 'date_collecte', 'date_envoi'])
const FLOAT_FIELDS = new Set(['temperature', 'longitude', 'latitude'])
const INT_FIELDS   = new Set(['nombre_barecode', 'nombre_insecte'])

// URL du feature layer sde.survey_piegeage (peut être surchargée via les Paramètres du widget)
const LAYER_URL = 'https://esri.kersia-group.com/server/rest/services/Survey_pi%C3%A9geage/FeatureServer/0'

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const normalize = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, '_')

function toTimestamp (val: any): number | null {
  if (val == null || val === '') return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime()
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.getTime()
  }
  return null
}

function toFloat (val: any): number | null {
  const n = parseFloat(String(val).replace(',', '.'))
  return isNaN(n) ? null : n
}

function toInt (val: any): number | null {
  const n = parseInt(String(val), 10)
  return isNaN(n) ? null : n
}

// ─── Composant principal ──────────────────────────────────────────────────────

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { config } = props
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [parsed,       setParsed]       = React.useState<ParsedData | null>(null)
  const [status,       setStatus]       = React.useState<Status>('idle')
  const [message,      setMessage]      = React.useState('')
  const [successCount, setSuccessCount] = React.useState(0)
  const [errorCount,   setErrorCount]   = React.useState(0)
  const [lastMatchedFields, setLastMatchedFields] = React.useState<string[]>([])

  // ── Étape 1 : Lecture et analyse du fichier Excel ─────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('parsing')
    setMessage('Lecture du fichier Excel…')
    setParsed(null)

    try {
      const buf  = await file.arrayBuffer()
      const data = new Uint8Array(buf)
      const wb   = XLSX.read(data, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]

      // raw: true (défaut) + cellDates conserve les Date JS pour les cellules dates
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null })

      if (!rows.length) {
        setStatus('error')
        setMessage('Le fichier ne contient aucune donnée.')
        return
      }

      // Détecter les colonnes Excel présentes et mappées
      const excelCols = Object.keys(rows[0]).map(normalize)
      const seen = new Set<string>()
      const matchedFields: string[] = []
      excelCols.forEach(c => {
        const dbField = EXCEL_TO_DB[c]
        if (dbField && !seen.has(dbField)) {
          seen.add(dbField)
          matchedFields.push(`${c}  →  ${dbField}`)
        }
      })

      // Compter les lignes avec coordonnées valides
      const validCount = rows.filter(r => {
        const lonKey = Object.keys(r).find(k => normalize(k) === 'longitude')
        const latKey = Object.keys(r).find(k => normalize(k) === 'latitude')
        return toFloat(lonKey ? r[lonKey] : null) !== null &&
               toFloat(latKey ? r[latKey] : null) !== null
      }).length

      setParsed({ rows, matchedFields, validCount })
      setStatus('ready')
      setMessage(
        `${rows.length} ligne(s) prête(s) à importer — ${validCount} avec coordonnées valides.`
      )
    } catch (err: any) {
      setStatus('error')
      setMessage(`Erreur de lecture : ${err?.message ?? String(err)}`)
    }
  }

  // ── Étape 2 : Import vers le Feature Service ──────────────────────────────

  const handleImport = async () => {
    if (!parsed?.rows?.length) return

    // Utilise l'URL du panneau Paramètres si configurée, sinon l'URL intégrée
    const url = config?.layerUrl?.trim() || LAYER_URL

    setStatus('importing')
    setMessage('Conversion des coordonnées et import en cours…')

    try {
      const layer = new FeatureLayer({ url })
      await layer.load()

      const graphics: Graphic[] = []
      let skipCount = 0

      for (const row of parsed.rows) {
        const attrs: Record<string, any> = {}

        // Construire les attributs depuis le mapping
        for (const [rawKey, val] of Object.entries(row)) {
          const normKey = normalize(rawKey)
          const dbField = EXCEL_TO_DB[normKey]
          if (!dbField || val == null || val === '') continue

          if (DATE_FIELDS.has(dbField)) {
            attrs[dbField] = toTimestamp(val)
          } else if (FLOAT_FIELDS.has(dbField)) {
            attrs[dbField] = toFloat(val)
          } else if (INT_FIELDS.has(dbField)) {
            attrs[dbField] = toInt(val)
          } else {
            attrs[dbField] = String(val)
          }
        }

        const lon = typeof attrs['longitude'] === 'number' ? attrs['longitude'] : toFloat(attrs['longitude'])
        const lat = typeof attrs['latitude']  === 'number' ? attrs['latitude']  : toFloat(attrs['latitude'])

        if (lon === null || lat === null) {
          skipCount++
          continue
        }

        // Conversion WGS84 (EPSG:4326) → Web Mercator (EPSG:3857)
        const ptWGS84 = new Point({ x: lon, y: lat, spatialReference: { wkid: 4326 } })
        const ptWM    = webMercatorUtils.geographicToWebMercator(ptWGS84) as Point

        graphics.push(new Graphic({ geometry: ptWM, attributes: attrs }))
      }

      if (!graphics.length) {
        setStatus('error')
        setMessage(
          `Aucune entité à importer — ${skipCount} ligne(s) ignorée(s) (coordonnées manquantes ou invalides).`
        )
        return
      }

      // Import par lots de 200
      const BATCH_SIZE = 200
      let ok = 0
      let ko = skipCount

      for (let i = 0; i < graphics.length; i += BATCH_SIZE) {
        const res = await layer.applyEdits({
          addFeatures: graphics.slice(i, i + BATCH_SIZE)
        })
        ok += res.addFeatureResults.filter((r: any) => !r.error).length
        ko += res.addFeatureResults.filter((r: any) =>  r.error).length
      }

      setSuccessCount(ok)
      setErrorCount(ko)
      setStatus('done')
      setMessage(
        `Import terminé : ${ok} entité(s) ajoutée(s)` +
        (ko > 0 ? `, ${ko} erreur(s) / ignorée(s)` : '') + '.'
      )

      // Réinitialiser le sélecteur de fichier
      setLastMatchedFields(parsed.matchedFields)
      if (fileRef.current) fileRef.current.value = ''
      setParsed(null)
    } catch (err: any) {
      setStatus('error')
      setMessage(`Erreur lors de l'import : ${err?.message ?? JSON.stringify(err)}`)
    }
  }

  // ── Réinitialisation ──────────────────────────────────────────────────────

  const handleReset = () => {
    setParsed(null)
    setStatus('idle')
    setMessage('')
    setSuccessCount(0)
    setErrorCount(0)
    setLastMatchedFields([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const isLoading = status === 'parsing' || status === 'importing'

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div css={css`
      padding: 16px;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
      font-size: 14px;

      h2 {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 14px;
        color: var(--dark-800, #222);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .section { margin-bottom: 14px; }

      .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

      .summary {
        background: var(--light-200, #f5f5f5);
        border: 1px solid var(--light-500, #ddd);
        border-radius: 4px;
        padding: 10px 12px;
        margin-top: 10px;
        font-size: 13px;
      }

      .col-list {
        max-height: 140px;
        overflow-y: auto;
        margin-top: 6px;
        font-family: monospace;
        font-size: 12px;
        color: var(--dark-600, #555);
        line-height: 1.6;
      }

      .actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        flex-wrap: wrap;
      }

      .loading-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        font-size: 13px;
        color: var(--dark-600, #555);
      }

      .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        min-width: 16px;
        border: 2px solid var(--light-600, #ccc);
        border-top-color: var(--primary, #0070ff);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }
    `}>

      <h2>Importer Survey Piégeage</h2>

      {/* Sélection du fichier */}
      <div className="section">
        <Label style={{ display: 'block', marginBottom: 6 }}>
          Fichier Excel (.xlsx ou .xls)
        </Label>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={isLoading}
          />
          <Button
            type="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => fileRef.current?.click()}
          >
            Choisir un fichier…
          </Button>
          {status === 'ready' && parsed && (
            <span style={{ fontSize: 13, color: 'var(--dark-500, #666)' }}>
              {parsed.rows.length} ligne(s) chargée(s)
            </span>
          )}
        </div>
      </div>

      {/* Indicateur de chargement */}
      {isLoading && (
        <div className="loading-row">
          <span className="spinner" />
          <span>{message}</span>
        </div>
      )}

      {/* Résumé après lecture du fichier — minimal, sans détail des colonnes */}
      {status === 'ready' && parsed && (
        <div className="summary">
          <span>{message}</span>
          {parsed.matchedFields.length === 0 && (
            <div style={{ color: 'var(--danger, #d83b01)', marginTop: 6 }}>
              Aucune colonne reconnue. Vérifiez les en-têtes du fichier Excel.
            </div>
          )}
        </div>
      )}

      {/* Résultat de l'import */}
      {(status === 'done' || status === 'error') && (
        <>
          <Alert
            withIcon
            type={status === 'done' ? (errorCount > 0 ? 'warning' : 'success') : 'error'}
            style={{ marginTop: 10 }}
          >
            {message}
          </Alert>
          {status === 'done' && lastMatchedFields.length > 0 && (
            <div className="summary" style={{ marginTop: 8 }}>
              <strong>{lastMatchedFields.length} colonne(s) importée(s) :</strong>
              <div className="col-list">
                {lastMatchedFields.map((f, i) => (
                  <div key={i}>{f}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Boutons d'action */}
      <div className="actions">
        {status === 'ready' && (
          <Button
            type="primary"
            size="sm"
            disabled={(parsed?.validCount ?? 0) === 0}
            onClick={handleImport}
          >
            Importer {parsed?.validCount ?? 0} entité(s)
          </Button>
        )}

        {(status === 'ready' || status === 'done' || status === 'error') && (
          <Button type="default" size="sm" onClick={handleReset}>
            Réinitialiser
          </Button>
        )}
      </div>

    </div>
  )
}

export default Widget
