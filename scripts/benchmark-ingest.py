"""Inventory downloaded bridge data and prepare independently labelled candidates.

This does not run the app's technique detector. Labels require a separate review.
LIN conversion accepts complete deals only; an omitted fourth hand is the exact
complement of three complete hands, as specified by the LIN format.
"""
import hashlib, itertools, json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.build/technique-benchmark'
RANKS = '23456789TJQKA'
PATTERNS = {
 'Squeeze': r'\bsqueez\w*',
 'Elimination / endplay': r'\bend[- ]?play\w*|\beliminat\w*|\bthrow[- ]?in\b|\bstrip(?:ping|ped)? and',
 'Trump coup': r'\btrump[- ]?coups?\b|\bgrand[- ]coups?\b',
 'Dummy reversal': r'\bdummy[- ]?reversal\w*|\brevers(?:e|ing|ed) (?:the )?dummy\b',
 'Crossruff': r'\bcross[- ]?ruff\w*',
}

def decode(path):
 data = path.read_bytes()
 try: return data.decode('utf-8-sig')
 except UnicodeDecodeError: return data.decode('cp1252', 'replace')

def validate(hands):
 if len(hands) != 4 or any(len(h) != 13 for h in hands): raise ValueError('incomplete hands')
 if sorted(c for h in hands for c in h) != list(range(52)): raise ValueError('duplicate/invalid cards')
 return [sorted(h) for h in hands]

def parse_pbn_deal(value):
 start, data = value.split(':', 1)
 first = 'NESW'.index(start.upper()); hands = [None]*4
 for i, h in enumerate(data.split()):
  suits = h.upper().split('.')
  if len(suits) != 4: raise ValueError('suit count')
  hands[(first+i)%4] = [s*13+RANKS.index(c) for s,cards in enumerate(suits) for c in cards if c != '-']
 return validate(hands)

def parse_lin_deal(value):
 dealer = {1:2,2:3,3:0,4:1}[int(value[0])]
 parts = value[1:].upper().split(','); hands = [None]*4
 for i, h in enumerate(parts[:4]):
  if not h.strip(): continue
  hand = []
  for s, cards in re.findall(r'([SHDC])([^SHDC]*)', h):
   hand.extend('SHDC'.index(s)*13+RANKS.index(c) for c in re.sub(r'[\s-]','',cards))
  hands[(i+2)%4] = hand
 if sum(h is None for h in hands) == 1 and sum(len(h or []) for h in hands) == 39:
  known = set(c for h in hands if h for c in h)
  hands[hands.index(None)] = sorted(set(range(52))-known)
 return dealer, validate(hands)

def key(hands):
 # Rotating the table or renaming suits must not inflate the unique-deal count.
 variants = []
 for perm in itertools.permutations(range(4)):
  rows = ['.'.join(''.join(RANKS[c%13] for c in h if c//13 == s) for s in perm) for h in hands]
  variants.extend('|'.join(rows[r:]+rows[:r]) for r in range(4))
 return hashlib.sha256(min(variants).encode()).hexdigest()[:16]

def contract_from_bids(bids, dealer):
 calls = []
 for b in bids:
  b = b.upper().replace('!', '').replace('NT','N').strip()
  if b == 'AP': calls.extend(['P']*3)
  else: calls.extend(re.findall(r'[1-7][SHDCN]|XX|[PDRX]', b))
 last = None; first = {}; doubled = 0
 for i,b in enumerate(calls):
  seat = (dealer+i)%4
  if re.fullmatch('[1-7][SHDCN]',b):
   trump = 'SHDCN'.index(b[1]); first.setdefault((seat%2,trump),seat)
   last = dict(level=int(b[0]),trump=trump,declarer=first[(seat%2,trump)],doubled=0)
  elif last and b in ('D','X'): last['doubled'] = 1
  elif last and b in ('R','XX'): last['doubled'] = 2
 return last

def clean_pbn(text):
 out=[]; depth=0; quoted=False; line=False; escaped=False
 for c in text:
  if line:
   if c == '\n': line=False
   out.append('\n' if c=='\n' else ' '); continue
  if depth:
   if c == '{': depth+=1
   if c == '}': depth-=1
   out.append('\n' if c=='\n' else ' '); continue
  if not quoted and c == '{': depth=1; out.append(' '); continue
  if not quoted and c in ';%': line=True; out.append(' '); continue
  out.append(c)
  if c == '"' and not escaped: quoted=not quoted
  escaped=(c=='\\' and not escaped)
 return ''.join(out)

def pbn_records(text):
 clean=clean_pbn(text); tags=list(re.finditer(r'\[\s*(\w+)\s+"((?:\\.|[^"\\])*)"\s*\]',clean))
 groups=[]; current=[]; names=set()
 for t in tags:
  name=t[1].lower()
  if name in ('event','board','deal') and name in names:
   groups.append(current); current=[]; names=set()
  current.append(t); names.add(name)
 if current: groups.append(current)
 previous={}
 for i,group in enumerate(groups):
  values={t[1].lower():(previous.get(t[1].lower(),'') if t[2]=='#' else t[2]) for t in group}
  previous.update(values)
  start=group[0].start(); end=groups[i+1][0].start() if i+1<len(groups) else len(text)
  yield values,text[start:end],start

def lin_records(text):
 tokens=list(re.finditer(r'(?<![A-Za-z])([A-Za-z]{2})\|([^|]*)\|',text))
 deals=[i for i,t in enumerate(tokens) if t[1].lower()=='md' and re.match('[1-4]',t[2].strip())]
 starts=[]
 for j,i in enumerate(deals):
  lower=deals[j-1]+1 if j else 0
  qx=[k for k in range(lower,i) if tokens[k][1].lower()=='qx']
  starts.append(qx[-1] if qx else i)
 for j,i in enumerate(starts):
  end=starts[j+1] if j+1<len(starts) else len(tokens)
  chunk=[(t[1].lower(),t[2]) for t in tokens[i:end]]
  # aaBridge can reveal the hidden hands later with md|0,...,0,...|.
  # Preserve only explicitly supplied complete cards, never fill two missing hands.
  parts=None; dealer=None; full=None
  for k,v in chunk:
   if k!='md': continue
   v=re.sub(r'\s+','',v)
   if re.match('[1-4]',v): dealer=v[0]; parts=(v[1:].split(',')+['']*4)[:4]
   elif v.startswith('0') and parts is not None:
    updates=(v[1:].split(',')+['0']*4)[:4]
    for n,p in enumerate(updates):
     if p and p!='0':
      # md|0| adds cards to an existing diagram (progressive reveal).
      # The earlier visible opening lead remains part of that hand.
      suits={s:set() for s in 'SHDC'}
      for s,cards in re.findall(r'([SHDC])([^SHDC]*)',(parts[n]+p).upper()):
       suits[s].update(c for c in cards if c in RANKS)
      parts[n]=''.join(s+''.join(c for c in reversed(RANKS) if c in suits[s]) for s in 'SHDC')
   if parts is not None:
    try:
     candidate=dealer+','.join(parts); parse_lin_deal(candidate); full=candidate
    except (ValueError,TypeError,IndexError,KeyError): pass
  if full: chunk=[(k,v) for k,v in chunk if k!='md']+[('md',full)]
  yield chunk,text[tokens[i].start():tokens[end].start() if end<len(tokens) else len(text)],tokens[i].start()

def run():
 records=[]; rejected=[]; inventory=[]
 for meta_path in sorted((CACHE/'raw').glob('*/source.json')):
  meta=json.loads(meta_path.read_text(encoding='utf-8'))
  for f in meta['files']:
   path=ROOT/f['path']; fmt=path.suffix.lower()[1:]
   if fmt not in ('pbn','lin'): continue
   text=decode(path); n=0; good=0
   for index,(data,raw,offset) in enumerate(pbn_records(text) if fmt=='pbn' else lin_records(text),1):
    n+=1; assumptions=[]
    try:
     if fmt=='pbn':
      if 'deal' not in data: raise ValueError('no deal')
      hands=parse_pbn_deal(data['deal']); board=data.get('board',str(index)); title=data.get('event','')
      dealer='NESW'.find(data.get('dealer','?').upper()); vul={'NONE':0,'LOVE':0,'-':0,'NEITHER':0,'ALL':1,'BOTH':1,'NS':2,'EW':3}.get(data.get('vulnerable','?').upper())
      if dealer<0: dealer=(int(board)-1)%4 if board.isdigit() else 0; assumptions.append('dealer inferred/defaulted')
      if vul is None: vul=[0,2,3,1,2,3,1,0,3,1,0,2,1,0,2,3][(int(board)-1)%16] if board.isdigit() else 0; assumptions.append('vulnerability inferred/defaulted')
      c=re.fullmatch(r'([1-7])(NT|[SHDCN])(X{0,2})',data.get('contract','').upper())
      decl='NESW'.find(data.get('declarer','?').upper())
      contract=dict(level=int(c[1]),trump='SHDCN'.index(c[2][0]),declarer=decl,doubled=len(c[3])) if c and decl>=0 else None
      play=[] # PBN play is a fixed compass-column table, not a sequential list.
      narration=re.sub(r'\[[^\n]*?\]',' ',raw)
     else:
      values=dict(data); dealer,hands=parse_lin_deal(values['md']); board=str(index)
      title=' / '.join(v for k,v in data if k in ('ah','qx'))
      sv=values.get('sv','').lower(); vul={'o':0,'0':0,'n':2,'e':3,'b':1,'-':0}.get(sv,0)
      if sv not in ('o','0','n','e','b','-'): assumptions.append('LIN unspecified vulnerability treated as None')
      contract=contract_from_bids([v for k,v in data if k=='mb'],dealer)
      if contract is None:
       dt=re.fullmatch(r'([SWNE])([1-7])([SHDCN])',values.get('dt','').upper())
       if dt: contract=dict(declarer='NESW'.index(dt[1]),level=int(dt[2]),trump='SHDCN'.index(dt[3]),doubled=0)
      play=[]
      for k,v in data:
       if k in ('up','undo'): break
       if k=='pc':
        v=v.strip().upper()
        if re.fullmatch(r'[SHDC][2-9TJQKA]',v): play.append('SHDC'.index(v[0])*13+RANKS.index(v[1]))
      narration=' '.join(v for k,v in data if k in ('nt','at','ah','sb','an'))
     good+=1
     searchable=title+' '+narration
     evidence={}
     for label,pattern in PATTERNS.items():
      hits=list(re.finditer(pattern,searchable,re.I))
      if hits: evidence[label]=[re.sub(r'\s+',' ',searchable[max(0,m.start()-110):m.end()+180]) for m in hits[:12]]
     # Whole-book topic labels retained separately from explicit per-board mentions.
     topic=[]
     url=meta['url'].lower(); member=f.get('archive_member','').lower()
     if 'jmmollimard.fr' in url and url.endswith(('/squeeze.zip','/romanet.zip')): topic=['Squeeze']
     if 'geza_ottlik_pbn.zip' in url and any(x in member for x in ('ch03','ch08','ch10','ch16')): topic=['Squeeze']
     if 'geza_ottlik_pbn.zip' in url and 'ch14' in member: topic=['Dummy reversal']
     if evidence or topic:
      rid=hashlib.sha256((meta['url']+'|'+f.get('archive_member','')+'|'+str(index)).encode()).hexdigest()[:12]
      records.append(dict(id=rid,key=key(hands),format=fmt,url=meta['url'],sha256=meta['sha256'],path=f['path'],archive_member=f.get('archive_member'),index=index,offset=offset,board=board,title=title,hands=hands,dealer=dealer,vulnerable=vul,contract=contract,play=play,assumptions=assumptions,evidence=evidence,topic=topic))
    except (ValueError,IndexError,TypeError,KeyError) as e:
     if any(re.search(p,raw,re.I) for p in PATTERNS.values()): rejected.append(dict(path=f['path'],index=index,error=str(e)))
   inventory.append(dict(path=f['path'],url=meta['url'],format=fmt,records=n,complete=good))
 (CACHE/'candidates.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
 (CACHE/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
 (CACHE/'rejected.json').write_text(json.dumps(rejected,indent=2),encoding='utf-8')
 print('Files',len(inventory),'complete records',sum(x['complete'] for x in inventory),'candidate records',len(records),'unique',len({x['key'] for x in records}))
 for label in PATTERNS:
  items=[x for x in records if label in x['evidence'] or label in x['topic']]
  print(label,len(items),'unique',len({x['key'] for x in items}),Counter(x['format'] for x in items))

if __name__=='__main__': run()
