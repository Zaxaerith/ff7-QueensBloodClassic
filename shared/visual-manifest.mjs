// Shared v1 boundary. No DOM, game rules, renderer or dependency is required.
export const modelKinds=Object.freeze(['field','battle','world']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function checkVisualId(id){
  if(!Number.isSafeInteger(id)||id<1||(id>145&&id<1000))throw Error('Invalid visual Card ID');
}
export function assetPath(path){
  if(path==null)return null;
  if(typeof path!=='string'||!path.trim()||/^[a-z][a-z\d+.-]*:|^[\\/]|[\\?#%\x00-\x1f]/i.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..'))
    throw Error('Visual asset path must be a relative project path');
  return path;
}
export function validateVisualManifest(manifest){
  if(!object(manifest)||manifest.version!==1||!Array.isArray(manifest.cards))throw Error('Unsupported visual manifest');
  const ids=new Set();
  for(const card of manifest.cards){
    if(!object(card))throw Error('Invalid visual card');
    checkVisualId(card.cardId);
    if(ids.has(card.cardId))throw Error('Duplicate visual Card ID');
    ids.add(card.cardId);
    if(card.ff7OriginalEntityId!=null&&(typeof card.ff7OriginalEntityId!=='string'||!card.ff7OriginalEntityId.trim()))throw Error('Invalid FF7 Original entity identifier');
    assetPath(card.portraitPath);assetPath(card.preview3dPath);
    if(card.modelSources!=null){
      if(!object(card.modelSources))throw Error('Invalid model sources');
      for(const [kind,source] of Object.entries(card.modelSources)){
        if(!modelKinds.includes(kind))throw Error('Unsupported model kind: '+kind);
        if(source===null)continue;
        if(!object(source)||typeof source.resourceId!=='string'||!source.resourceId.trim())throw Error('Model resourceId is required');
        assetPath(source.path);
      }
    }
  }
}
