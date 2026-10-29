"""Generate editable screen data and SVG paths from a decoded user-owned Figma file.
Usage: python3 scripts/extract-design.py /path/to/decoded-design.json
Decoding is separate: the source .fig is not shipped to visitors.
"""
import json, sys, struct, collections, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
m = json.loads(Path(sys.argv[1]).read_text())
nodes = m['nodeChanges']; children = collections.defaultdict(list)
def gid(g): return f"{g.get('sessionID')}:{g.get('localID')}"
for n in nodes: children[gid(n.get('parentIndex',{}).get('guid',{}))].append(n)
for c in children.values(): c.sort(key=lambda n:n.get('parentIndex',{}).get('position',''))
def color(c,opacity=1):
 return 'rgba(%s,%s,%s,%.4f)' % (round(c.get('r',0)*255),round(c.get('g',0)*255),round(c.get('b',0)*255),c.get('a',1)*opacity)
def paint(ps):
 for p in reversed(ps or []):
  if p.get('visible',True):
   if p.get('type')=='SOLID':return color(p.get('color',{}),p.get('opacity',1))
   # No gradients, per the implementation brief. Use the source's first stop.
   if p.get('stops'):return color(p['stops'][0].get('color',{}),p.get('opacity',1))
 return None
def path(index):
 raw=m['blobs'][index]['bytes']; b=bytes(raw.values()) if isinstance(raw,dict) else bytes(raw);i=0;parts=[]
 while i<len(b):
  op=b[i];i+=1
  counts={0:0,1:2,2:2,3:4,4:6}
  if op not in counts:break
  count=counts[op]
  if i+count*4>len(b):break
  vals=struct.unpack_from('<'+'f'*count,b,i) if count else [];i+=count*4
  parts.append('ZMLQC'[op]+' '.join(str(round(v,4)) for v in vals))
 return ' '.join(parts)
assets={x['figmaHash']:x['path'] for x in json.loads((ROOT/'design/asset-manifest.json').read_text())}
def convert(n,root=False):
 if n.get('visible') is False or n.get('isSoftDeleted'):return None
 s=n.get('size',{});t=n.get('transform',{});w=s.get('x',0);h=s.get('y',0)
 style={'width':round(w,3),'height':round(h,3),'left':round(t.get('m02',0),3),'top':round(t.get('m12',0),3)}
 fill=paint(n.get('fillPaints'));stroke=paint(n.get('strokePaints'))
 if fill:style['color' if n['type']=='TEXT' else 'backgroundColor']=fill
 if n.get('opacity',1)!=1:style['opacity']=n['opacity']
 if n.get('cornerRadius'):style['borderRadius']=n['cornerRadius']
 if n.get('rectangleCornerRadiiIndependent'):
  style['borderRadius']=' '.join(str(n.get(k,0))+'px' for k in ['rectangleTopLeftCornerRadius','rectangleTopRightCornerRadius','rectangleBottomRightCornerRadius','rectangleBottomLeftCornerRadius'])
 if stroke:
  if n.get('borderStrokeWeightsIndependent'):
   for side in ['Top','Right','Bottom','Left']:
    if n.get('border'+side+'Weight'):style['border'+side]=f"{n['border'+side+'Weight']}px solid {stroke}"
  else:style['boxShadow']=f"inset 0 0 0 {n.get('strokeWeight',1)}px {stroke}"
 shadows=[]
 for e in n.get('effects',[]):
  if e.get('visible',True) and e['type'] in ['DROP_SHADOW','INNER_SHADOW']:
   shadows.append(('inset ' if e['type']=='INNER_SHADOW' else '')+f"{e.get('offset',{}).get('x',0)}px {e.get('offset',{}).get('y',0)}px {e.get('radius',0)}px {e.get('spread',0)}px {color(e.get('color',{}))}")
 if shadows:style['boxShadow']=', '.join(([style['boxShadow']] if 'boxShadow'in style else [])+shadows)
 out={'id':gid(n['guid']),'name':n.get('name',''),'type':n['type'],'style':style}
 if n['type']=='TEXT':
  td=n.get('textData',{});out['text']=td.get('characters','')
  style.update(fontFamily=n.get('fontName',{}).get('family','Inter'),fontSize=n.get('fontSize',14),fontWeight=next((v['value'] for v in n.get('fontVariations',[]) if v.get('axisName')=='Weight'),n.get('derivedTextData',{}).get('fontMetaData',[{}])[0].get('fontWeight',400)))
  lh=n.get('lineHeight',{});style['lineHeight']=str(lh.get('value',1.2))+('px' if lh.get('units')=='PIXELS' else '%' if lh.get('units')=='PERCENT' else '')
  if lh.get('units') not in ['PIXELS','PERCENT']:style['lineHeight']=1.2
  if n.get('letterSpacing',{}).get('units')=='PIXELS':style['letterSpacing']=n['letterSpacing']['value']
  style['textAlign']=n.get('textAlignHorizontal','LEFT').lower()
  if n.get('textDecoration')=='UNDERLINE':style['textDecoration']='underline'
  overrides={v['styleID']:v for v in td.get('styleOverrideTable',[])}; ids=td.get('characterStyleIDs',[])
  if overrides and ids:
   runs=[]
   for ch,sid in zip(out['text'],ids):
    if runs and runs[-1]['sid']==sid:runs[-1]['text']+=ch
    else:runs.append({'sid':sid,'text':ch})
   if len(ids)<len(out['text']):runs.append({'sid':0,'text':out['text'][len(ids):]})
   out['runs']=[{'text':r['text'],'color':paint(overrides.get(r['sid'],{}).get('fillPaints'))} for r in runs]
 if n['type']=='VECTOR':
  out['paths']=[{'d':path(g['commandsBlob']),'fill':fill or 'none','rule':'evenodd' if g.get('windingRule')=='ODD' else 'nonzero'} for g in n.get('fillGeometry',[]) if 'commandsBlob'in g]
  out['paths'] += [{'d':path(g['commandsBlob']),'fill':stroke or fill or 'none'} for g in n.get('strokeGeometry',[]) if 'commandsBlob'in g]
  style.pop('backgroundColor',None)
 for p in n.get('fillPaints',[]):
  if p.get('type')=='IMAGE' and p.get('visible',True):
   hh=p.get('image',{}).get('hash',{});hh=bytes(hh.values()).hex() if isinstance(hh,dict) else bytes(hh).hex()
   if hh in assets:out['image']=assets[hh];out['imageFit']='cover';out['imageTransform']=p.get('transform')
 c=[x for x in (convert(c) for c in children[gid(n['guid'])]) if x]
 for child in c:
  if child.get('overlay') and child['style']['left'] > w/2:
   child['anchorRight']=max(0,round(w-child['style']['left']-child['style']['width'],3))
 if c:out['children']=c
 if c or out.get('image'):out['flow']='art'
 if n.get('stackPositioning')=='ABSOLUTE' or ':shadow' in n.get('name',''):out['overlay']=True
 if n.get('frameMaskDisabled') is False:out['clip']=True
 # Infer mobile flow from actual geometry. Desktop retains every source coordinate.
 flow=[x for x in c if not x.get('overlay') and x['type'] not in ['ROUNDED_RECTANGLE','VECTOR']]
 if flow:
  def disjoint(axis,dim):
   seq=sorted(flow,key=lambda x:x['style'][axis]);return all(a['style'][axis]+a['style'][dim]<=b['style'][axis]+2 for a,b in zip(seq,seq[1:]))
  mode='column' if disjoint('top','height') else 'row' if disjoint('left','width') else 'art'
  out['flow']=mode
  if mode!='art':
   seq=sorted(flow,key=lambda x:x['style']['top' if mode=='column' else 'left'])
   out['order']=[x['id'] for x in seq]
   axis,dim=('top','height') if mode=='column' else ('left','width')
   gaps=[b['style'][axis]-a['style'][axis]-a['style'][dim] for a,b in zip(seq,seq[1:])]
   out['gap']=round(max(0,min(gaps)),2) if gaps else 0
   out['padding']=[max(0,min(x['style']['top'] for x in flow)),max(0,w-max(x['style']['left']+x['style']['width'] for x in flow)),max(0,h-max(x['style']['top']+x['style']['height'] for x in flow)),max(0,min(x['style']['left'] for x in flow))]
 return out
frames=[n for n in children['0:1'] if n['type']=='FRAME' and n.get('name')!='Aside']
outdir=ROOT/'public/screens';outdir.mkdir(parents=True,exist_ok=True);catalog=[]
custom={'162:1246':'/','162:1547':'/solutions','162:1894':'/resources','162:2157':'/contact','162:2407':'/register','162:2533':'/login','162:2642':'/forgot-password','162:2686':'/reset-password','182:285':'/pricing','183:910':'/resources/guides','237:2':'/developers','241:2':'/merchant','241:354':'/merchant/payment-links','241:619':'/merchant/payment-links/create','241:827':'/merchant/transactions','241:1167':'/merchant/wallets','280:2468':'/merchant/developers','282:3181':'/merchant/settings','328:714':'/admin'}
for i,n in enumerate(frames):
 id=gid(n['guid']);name=n['name']; slug=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-');category='admin' if n['guid']['sessionID']>=328 else 'merchant' if n['guid']['sessionID']>=241 else 'website'
 route=custom.get(id,('/admin/' if category=='admin' else '/merchant/' if category=='merchant' else '/products/')+slug)
 if any(x['route']==route for x in catalog):route+='-'+id.replace(':','-')
 tree=convert(n,True);tree['style']['left']=0;tree['style']['top']=0
 filename=id.replace(':','-')+'.json';(outdir/filename).write_text(json.dumps(tree,separators=(',',':')))
 catalog.append({'id':id,'name':name,'route':route,'category':category,'width':n['size']['x'],'height':n['size']['y'],'file':'/screens/'+filename})
(ROOT/'src/screens.json').write_text(json.dumps(catalog,indent=2))
print('Generated',len(catalog),'screens,',sum(p.stat().st_size for p in outdir.glob('*.json')),'bytes')
