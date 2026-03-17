/** Plugin type categories */
export type PluginType = 'connector' | 'visualization' | 'transformation' | 'api';

/** Plugin manifest describing a plugin */
export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author?: string;
  entryPoint: string;
}
