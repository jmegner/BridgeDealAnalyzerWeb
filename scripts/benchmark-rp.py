"""Convert factual full-deal diagrams from Richard Pavlicek's public pages.
No article prose is included in the exported PBN; source links retain attribution.
"""
import importlib.util, html, re, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('ingest',Path(__file__).with_name('benchmark-ingest.py'))
i=importlib.util.module_from_spec(spec); spec.loader.exec_module(i)

def plain(s):
 s=re.sub(r'<img[^>]*alt=[\"\']?([SHDC])(?=[\"\' >])[^>]*>',r'\1',s,flags=re.I)
 return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s))).strip()

out=[]
for mp in (i.CACHE/'raw').glob('*/source.json'):
 meta=json.loads(mp.read_text(encoding='utf8'))
 if not re.search(r'https://rpbridge.net/[0-9][a-z0-9]{3}\.htm$',meta['url']): continue
 text=i.decode(i.ROOT/meta['download']); tables=list(re.finditer(r'<table\b[^>]*class=l\b[^>]*>.*?</table>',text,re.S|re.I))
 title=re.search('<title>(.*?)</title>',text,re.S|re.I)
 for n,t in enumerate(tables,1):
  cells=[]; occupied={}
  # Ignore the adjacent auction/play table. Only the first three diagram columns
  # contain holdings; row/column spans must be accounted for in old HTML tables.
  for row_index,row in enumerate(re.split(r'<tr\b[^>]*>',t[0],flags=re.I)[1:]):
   col=0
   for cm in re.finditer(r'<td\b([^>]*)>(.*?)(?=<td\b|$)',row,re.S|re.I):
    while occupied.get(col,-1)>=row_index: col+=1
    cs=re.search(r'colspan=[\"\']?(\d+)',cm[1],re.I); rs=re.search(r'rowspan=[\"\']?(\d+)',cm[1],re.I)
    span=int(cs[1]) if cs else 1; rows=int(rs[1]) if rs else 1
    if col<3: cells.append(cm[2])
    for c in range(col,col+span): occupied[c]=row_index+rows-1
    col+=span
  holdings=[]; lead=[]
  for cell in cells:
   m=re.match(r'\s*<img[^>]*alt=[\"\']?([SHDC])(?=[\"\' >])[^>]*>(.*?)(?:<tr|</table|$)',cell,re.S|re.I)
   if not m: continue
   ranks=plain(m[2]).replace('10','T').replace('—','-').replace('–','-').replace(' ','')
   if not re.fullmatch('[AKQJT2-9-]*',ranks): continue
   cards=['SHDC'.index(m[1].upper())*13+i.RANKS.index(c) for c in ranks if c!='-']
   holdings.append(cards)
   u=re.search(r'<u>(.*?)</u>',m[2],re.I)
   if u:
    r=plain(u[1]).replace('10','T')
    if r in i.RANKS: lead.append('SHDC'.index(m[1].upper())*13+i.RANKS.index(r))
  if len(holdings)!=16: continue
  try:
   hands=i.validate([sum(holdings[:4],[]),sum(holdings[5:12:2],[]),sum(holdings[12:],[]),sum(holdings[4:12:2],[])])
  except ValueError: continue
  rest=text[t.end():tables[n].start() if n<len(tables) else len(text)]
  rest=re.split(r'<h[12]\b',rest,flags=re.I)[0]
  headers=list(re.finditer(r'<h2\b[^>]*>(.*?)</h2>',text[:t.start()],re.S|re.I))
  header=headers[-1][1] if headers else ''
  narration=plain(header+' '+rest); evidence={}
  for label,pattern in i.PATTERNS.items():
   hits=list(re.finditer(pattern,narration,re.I))
   if hits:evidence[label]=[narration[max(0,m.start()-100):m.end()+180] for m in hits[:8]]
  if not evidence:continue
  diagram=plain(t[0]); dealer=re.search(r'(North|East|South|West) deals',diagram)
  vul=re.search(r'(None|Both|All|N-S|E-W) vul',diagram)
  contracts=list(re.finditer(r'([1-7])\s*(NT|[SHDC])\s*([×x]{0,2})\s*(North|East|South|West)\b',diagram))
  c=contracts[-1] if contracts else None
  contract=dict(level=int(c[1]),trump='SHDCN'.index(c[2][0]),doubled=len(c[3]),declarer=['North','East','South','West'].index(c[4])) if c else None
  assumptions=[]
  if not dealer:assumptions.append('unspecified dealer defaulted to North')
  if not vul:assumptions.append('unspecified vulnerability defaulted to None')
  rid=hashlib.sha256((meta['url']+'|'+str(n)).encode()).hexdigest()[:12]
  out.append(dict(id=rid,key=i.key(hands),format='html',url=meta['url'],sha256=meta['sha256'],path=meta['download'],index=n,offset=t.start(),board=str(n),title=plain(title[1]) if title else '',hands=hands,dealer=['North','East','South','West'].index(dealer[1]) if dealer else 0,vulnerable={'None':0,'Both':1,'All':1,'N-S':2,'E-W':3}.get(vul[1],0) if vul else 0,contract=contract,play=lead[:1],assumptions=assumptions,evidence=evidence,topic=[]))
(i.CACHE/'candidates-rp.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('RP candidate diagrams',len(out))
for label in i.PATTERNS:print(label,len({x['key'] for x in out if label in x['evidence']}))
