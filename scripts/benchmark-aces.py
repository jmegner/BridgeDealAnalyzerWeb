"""Convert complete Aces on Bridge HTML diagrams into factual benchmark records."""
import importlib.util, html, re, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('ingest',Path(__file__).with_name('benchmark-ingest.py'))
i=importlib.util.module_from_spec(spec); spec.loader.exec_module(i)
def plain(s): return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]*>',' ',s))).strip()
def cards(s):
 s=plain(s).replace('10','T');out=[]
 for suit,ranks in re.findall(r'([♠♥♦♣])\s*([AKQJT2-9\s—–-]*)',s):
  out.append(['♠♥♦♣'.index(suit)*13+i.RANKS.index(r) for r in ranks if r in i.RANKS])
 return out
out=[]; errors=[]
for mp in (i.CACHE/'raw').glob('*/source.json'):
 meta=json.loads(mp.read_text(encoding='utf8'))
 if not re.search(r'https://aces.bridgeblogging.com/\d{4}/\d{2}/\d{2}/the-aces-on-',meta['url']):continue
 text=i.decode(i.ROOT/meta['download']); start=text.find('class="post"');text=text[start:] if start>=0 else text
 try:
  modern=re.findall(r'<table class="acesfulldeal(N|WE|S)"[^>]*>(.*?)</table>',text,re.S)
  if len(modern)==3:
   table=dict(modern); n=sum(cards(table['N']),[]);we=cards(table['WE']);s=sum(cards(table['S']),[])
   hands=i.validate([n,sum(we[4:],[]),s,sum(we[:4],[])])
   dm=re.search(r'class="acesDealer"[^>]*>(.*?)</th>',text,re.S);dealer='NESW'.index(plain(dm[1])[0].upper())
   vm=re.search(r'class="acesVul"[^>]*>(.*?)</th>',text,re.S);vultext=plain(vm[1])
   auction=re.search(r'<table class="acesauction"[^>]*>(.*?)</table>',text,re.S)
   cm=re.search(r'<div class="acesweekdaycommentary"[^>]*>(.*?)</div>',text,re.S)
   narration=plain(cm[1]) if cm else ''
   leadm=re.search(r'class="acesopeninglead"[^>]*>(.*?)</p>',text,re.S)
  else:
   tables=list(re.finditer(r'<table\b[^>]*>.*?</table>',text,re.S))
   handtable=next(t for t in tables if len(cards(t[0]))==16)
   h=cards(handtable[0]);hands=i.validate([sum(h[:4],[]),sum(h[5:12:2],[]),sum(h[12:],[]),sum(h[4:12:2],[])])
   d=re.search(r'Dealer:\s*(North|East|South|West)',plain(handtable[0]));dealer=['North','East','South','West'].index(d[1])
   v=re.search(r'Vul:\s*(All|Both|None|Neither|N-S|E-W|NS|EW)',plain(handtable[0]));vultext=v[1]
   at=next(t for t in tables if t.start()>handtable.end());auction=re.match(r'<table\b[^>]*>(.*?)</table>',at[0],re.S)
   narrative=text[at.end():];narrative=re.split(r'<h4|<div[^>]*class="aceswith',narrative)[0]
   narration=plain(narrative)
   leadm=re.search(r'Opening Lead:</strong>(.*?)</(?:div|p)>',text,re.S)
  vuln={'Both':1,'All':1,'None':0,'Neither':0,'N-S':2,'E-W':3,'NS':2,'EW':3,'North-South':2,'East-West':3}.get(vultext)
  if vuln is None:raise ValueError('unknown vulnerability '+vultext)
  if not auction:raise ValueError('no auction')
  rows=re.findall(r'<tr\b[^>]*>(.*?)</tr>',auction[1],re.S)
  heads=[plain(v) for v in re.findall(r'<t[hd]\b[^>]*>(.*?)</t[hd]>',rows[0],re.S)]
  if heads!=['South','West','North','East']:raise ValueError('nonstandard auction headers')
  calls=[];first=None
  for row in rows[1:]:
   values=re.findall(r'<td\b[^>]*>(.*?)</td>',row,re.S)
   for col,v in enumerate(values):
    c=plain(re.sub(r'<sup.*?</sup>','',v,flags=re.S)).replace(' ','').upper().replace('*','').replace('.','').translate(str.maketrans('♠♥♦♣','SHDC'))
    if not c:continue
    if first is None:first=(col+2)%4
    if c in ('ALLPASS','ALLPASSED'):calls.append('AP');break
    if c=='PASS':c='P'
    if c in ('DBL','DBLE','DOUBLE'):c='X'
    if c in ('RDBL','REDOUBLE'):c='XX'
    if not re.fullmatch(r'[1-7](?:NT|[SHDCN])|P|X|XX',c):raise ValueError('unrecognized bid '+c)
    calls.append(c)
   if calls and calls[-1]=='AP':break
  contract=i.contract_from_bids(calls,first)
  if contract is None:raise ValueError('no contract')
  evidence={}
  for label,pattern in i.PATTERNS.items():
   hits=list(re.finditer(pattern,narration,re.I))
   if hits:evidence[label]=[narration[max(0,m.start()-90):m.end()+170] for m in hits[:10]]
  if not evidence:continue
  lead=cards(leadm[1]) if leadm else []
  rid=hashlib.sha256(meta['url'].encode()).hexdigest()[:12]
  out.append(dict(id=rid,key=i.key(hands),format='html',url=meta['url'],sha256=meta['sha256'],path=meta['download'],index=1,offset=0,board='1',title=meta['url'].split('/')[-2],hands=hands,dealer=dealer,vulnerable=vuln,contract=contract,play=sum(lead,[])[:1],assumptions=[],evidence=evidence,topic=[]))
 except (ValueError,IndexError,TypeError,KeyError,StopIteration) as e:errors.append(dict(url=meta['url'],error=str(e)))
(i.CACHE/'candidates-aces.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
(i.CACHE/'rejected-aces.json').write_text(json.dumps(errors,indent=2),encoding='utf8')
print('Aces candidates',len(out),'rejected',len(errors))
for label in i.PATTERNS:print(label,len({x['key'] for x in out if label in x['evidence']}))
