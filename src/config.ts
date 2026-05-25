import { ImmutableObject } from 'jimu-core'

export interface Config {
  /** URL complète du endpoint REST du feature layer sde.survey_piegeage
   *  ex: https://gis.ville.ca/server/rest/services/Piegeage/FeatureServer/0
   */
  layerUrl: string
}

export type IMConfig = ImmutableObject<Config>
