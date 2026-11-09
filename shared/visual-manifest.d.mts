export type ModelKind = 'field' | 'battle' | 'world';
export interface ModelReference {
  /** Importer-owned resource identity, independent of a card's display name. */
  readonly resourceId:string;
  readonly path:string|null;
}
export interface VisualOverride {
  readonly cardId:number;
  readonly ff7OriginalEntityId?:string|null;
  readonly modelSources?:Partial<Readonly<Record<ModelKind,ModelReference|null>>>;
  readonly portraitPath?:string|null;
  readonly preview3dPath?:string|null;
}
export interface VisualManifest {readonly version:1;readonly cards:readonly VisualOverride[];}
export const modelKinds:readonly ModelKind[];
export function checkVisualId(id:number):void;
export function assetPath(path:string|null|undefined):string|null;
export function validateVisualManifest(manifest:unknown):asserts manifest is VisualManifest;
