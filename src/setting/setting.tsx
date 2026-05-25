/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { AllWidgetSettingProps } from 'jimu-for-builder'
import { TextInput, Label } from 'jimu-ui'
import { IMConfig } from '../config'

// URL intégrée par défaut (définie dans le code du widget)
const DEFAULT_LAYER_URL = 'https://esri.kersia-group.com/server/rest/services/Survey_pi%C3%A9geage/FeatureServer/0'

export default function Setting (props: AllWidgetSettingProps<IMConfig>) {
  const { config, id, onSettingChange } = props

  const handleLayerUrlChange = (value: string) => {
    onSettingChange({
      id,
      config: config.set('layerUrl', value)
    })
  }

  return (
    <div css={css`
      padding: 12px;

      .setting-label {
        font-weight: 500;
        margin-bottom: 6px;
        display: block;
      }

      .hint {
        font-size: 11px;
        color: var(--dark-500, #666);
        margin-top: 6px;
        line-height: 1.5;
      }

      .url-default {
        font-family: monospace;
        font-size: 11px;
        background: var(--light-200, #f5f5f5);
        border: 1px solid var(--light-500, #ddd);
        padding: 6px 8px;
        border-radius: 3px;
        margin-top: 6px;
        word-break: break-all;
        color: var(--dark-700, #333);
      }

      .section-override {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--light-400, #e0e0e0);
      }
    `}>

      <Label className="setting-label">URL du Feature Layer (intégrée)</Label>
      <p className="hint">
        L'URL suivante est directement intégrée dans le widget et utilisée par défaut :
      </p>
      <div className="url-default">{DEFAULT_LAYER_URL}</div>

      <div className="section-override">
        <Label className="setting-label">Substituer l'URL (optionnel)</Label>
        <TextInput
          size="sm"
          placeholder="Laisser vide pour utiliser l'URL intégrée"
          value={config?.layerUrl ?? ''}
          onChange={e => handleLayerUrlChange(e.target.value)}
        />
        <p className="hint">
          Si renseigné, cette URL remplace l'URL intégrée ci-dessus.
          Laisser vide pour utiliser la valeur par défaut.
        </p>
      </div>

    </div>
  )
}
