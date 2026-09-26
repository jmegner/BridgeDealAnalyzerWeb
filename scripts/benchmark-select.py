"""Freeze reviewed source labels, independent of detector output.

The input candidates contain keyword evidence for review, not ground truth.
Only the approved subsets below enter the benchmark. Canonical duplicates and
the application's pre-existing examples are removed before scoring.
"""
import importlib.util,json,re,copy
from pathlib import Path
from urllib.parse import unquote
from collections import Counter
spec=importlib.util.spec_from_file_location('ingest',Path(__file__).with_name('benchmark-ingest.py'))
i=importlib.util.module_from_spec(spec); spec.loader.exec_module(i)
names=['candidates.json','candidates-aces.json','candidates-rp.json','candidates-supplement.json']
groups=[json.loads((i.CACHE/n).read_text(encoding='utf8')) for n in names]
allboards={x['id']:x for g in groups for x in g}
accepted={}; decisions=[]
def accept(x,label,tier='individual',note='Source describes a successful line or a playable technique on this deal.'):
 b=accepted.setdefault(x['id'],copy.deepcopy(x)); b.setdefault('labels',{})[label]={'tier':tier,'note':note}
 decisions.append(dict(id=x['id'],label=label,decision='include',tier=tier,note=note))
def reject(x,label,note):
 decisions.append(dict(id=x['id'],label=label,decision='exclude',note=note))

dummy_exclude={
 '83d84b3c12ba':'The reversal is impossible on the actual layout.',
 'a595d0554e42':'Trump-coup preparation described as reversal style.',
 '454bce6af69d':'Loose master-hand meaning; commentary disputes the terminology.',
 '1cce0509a36c':'Duplicate disputed master-hand example.',
 '0d49e2e91d2d':'Setting up the initially longer dummy, not the classic reversal.',
 '330590edfcde':'Setting up the initially longer dummy.',
 'bba7e8a3d789':'General master-hand change.',
 'd3c0972bf14a':'Bidding makes a different hand declarer; not a play technique.',
 '1295ecccc15b':'Ordinary-play contrast at the start of a reversal lesson.',
 'de49e9eccf06':'Story about swapping declarer and dummy.',
 'a332ed2f1bc8':'Source explicitly says this is not exactly a reversal.',
 'c49088f53e10':'Source says the proposed intrafinesse does not work.',
 'e69af8fd70e4':'Master-hand viewpoint and establishment of a long side suit.',
 '328dd731e2e6':'Master-hand viewpoint and establishment of a long side suit.',
 '1baa408ff5de':'Master-hand viewpoint, not long-trump ruffing reversal.',
 '2ad0943d1ac8':'Source ultimately chooses a crossruff.',
 '61e6e068e14b':'Partial reversal retained in the broader-variants appendix.',
 'fd72acea1bf3':'Source qualifies this as a reversal of sorts.',
 '124991c73cae':'Comment discusses 3S but stored contract is 3NT; excluded from core.',
}
coup_exclude={k:v for k,v in [
 ('a76e7e354c44','Generic list of techniques.'),('48e38ecba391','Generic list of techniques.'),
 ('383b30a3d4f0','One entry short: unsuccessful coup.'),('13d2647237ff','Needs a card swap to work.'),
 ('5e69337d53f7','Defense preventing a coup.'),('b799a445d1d9','Coup en blanc is a different maneuver.'),
 ('8f6415342da1','Metaphorical grand coup in a news story.'),('2dc49ab4a4f2','General quotation, not a label for this deal.'),
 ('36c9dfede63e','Opportunity mentioned but not demonstrated clearly enough.') ]}
cross_ids='''44931a5cc941 9ccb6059289e dac2dcaaaf2e 9481e709d617 21965514f590 960f2795144d a176ff2d1847 5365f7650e2a f390f82cc3d0 7faebb941194 0bfaeaa4fa22 b893ae66b140 7d00610aeb60 4a6846e70c2f 8b6dc410bb01 9a96c99320cd e4adb2fa5099 1b470b4bc830 127356e37541 640c1ab7ce95 cc4a65500532 d34aa0adf3c7 28d0cafb3727 dbe11bc34db9 1311afe0b916 19635feb8234 55afdd550a93 38b996afa9a0 5aecb287da32 6bcc2dee0057 427749b2b6a7 bd9c9755493b ec34b6e149d7 22e912bb01f5 cc4b9aa64c0b a4057141f54a faed3c993de5 6cc20d4915a1 7ebf91e39901 6c0d9af66937 3d77d75e5a8b b8b104198baa 15f5b92e13e8 5c5d61e8ddce 195aaf3f3869 9e3e4b071b17 94eb0269bdef d4b9de8aaafa 21d2dca573f0 2f6356d20794 6ff91c58ca8f 6b168c39b22b 2ad0943d1ac8 4030992fcbdf 9eae66da213e f385d017761b 571296e9ac84 c30d2ec5930c cb7e9b2d8244 afdb5c4be5d4 3645a20497bf 246d5df637d8'''.split()
for x in groups[0]:
 if 'Squeeze' in x['topic']:
  accept(x,'Squeeze','book-topic','Complete deal from a named squeeze book/chapter; per-deal solution not independently transcribed.')
 filename=unquote(x['url']).split('/')[-1]
 if 'Squeeze' in x['evidence'] and (filename=='Squeeze.pbn' or re.search(r'(?:108_Q_a|110_Q_b|111_Q_c|112_Q_d|114__Squeezes|115__Squeezes|116__Squeezes)',filename)):
  accept(x,'Squeeze',note='Worked squeeze lesson/quiz; includes simple, double, and successive squeezes.')
 if 'Dummy reversal' in x['evidence'] and not x['topic']:
  if x['id'] in dummy_exclude: reject(x,'Dummy reversal',dummy_exclude[x['id']])
  else: accept(x,'Dummy reversal')
 if 'Trump coup' in x['evidence']:
  if x['id'] in coup_exclude:reject(x,'Trump coup',coup_exclude[x['id']])
  else:accept(x,'Trump coup')
 url=unquote(x['url'])
 if 'Elimination / endplay' in x['evidence'] and (re.search(r'/\d+\s+Endplays [1-5] -',url) or '038  Watson 2 - 3.lin' in url):
  if x['id']=='839c5ddce8d9':reject(x,'Elimination / endplay','Chapter summary may bleed into the final record.')
  else:accept(x,'Elimination / endplay',note='Worked elimination/endplay lesson or quiz; includes entry and trump endplays.')
 if x['id'] in cross_ids:accept(x,'Crossruff')
aces_coup_exclude={'0999a3bb97a3','4d1502252c6c','9e697a99fd4d','e258da3d8e00','e774fdad7b50','ea74cbeb2e0f','eb7507c21e5c','f27139917913'}
for x in groups[1]:
 if 'Dummy reversal' in x['evidence']:
  if x['id']=='10378840bc36':reject(x,'Dummy reversal','Source explicitly says not strictly a reversal.')
  else:accept(x,'Dummy reversal')
 if 'Trump coup' in x['evidence']:
  if x['id'] in aces_coup_exclude:reject(x,'Trump coup','Conditional, prevented, or nonstandard coup: omitted conservatively from core.')
  else:accept(x,'Trump coup')
for x in groups[2]:
 if x['id'] in ['392b7b478c40','14eed72e2f7f','bdd731550c8e','af2d7b088903']:accept(x,'Trump coup')
 if x['id'] in ['9b1b75563508','922630c86599','bbefc71ff957']:accept(x,'Dummy reversal')
for x in groups[3]:accept(x,'Dummy reversal')

known=set()
for p in (i.ROOT/'samples').glob('*.pbn'):
 for tags,raw,offset in i.pbn_records(i.decode(p)):
  if 'deal' in tags:known.add(i.key(i.parse_pbn_deal(tags['deal'])))
selected={}; removed=[]
for x in accepted.values():
 if x['key'] in known:
  removed.append(dict(id=x['id'],key=x['key'],reason='Present in pre-existing app samples'));continue
 if x['key'] in selected:
  original=selected[x['key']]
  original['aliases'].append({'id':x['id'],'url':x['url'],'index':x['index'],'labels':x['labels']})
  original['labels'].update(x['labels'])
  removed.append(dict(id=x['id'],key=x['key'],reason='Canonical duplicate',kept=original['id']))
 else:
  x['aliases']=[];selected[x['key']]=x
result=list(selected.values())
for n,x in enumerate(result,1):x['benchmarkBoard']=n
(i.CACHE/'selected.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
(i.CACHE/'review-decisions.json').write_text(json.dumps(dict(decisions=decisions,removed=removed),indent=2),encoding='utf8')
# Broader variants remain available for separate analysis, never padding the core counts.
broad=[]
for x in groups[0]:
 if 'Dummy reversal' in x['topic'] or x['id'] in ['61e6e068e14b','fd72acea1bf3']:
  x=copy.deepcopy(x);x['labels']={'Dummy reversal':{'tier':'broader-variant','note':'Non-material, partial, or qualified reversal.'}};broad.append(x)
(i.CACHE/'broader-variants.json').write_text(json.dumps(broad,indent=2),encoding='utf8')
print('Selected',len(result),'removed',len(removed),'broader',len(broad))
for label in i.PATTERNS:
 items=[x for x in result if label in x['labels']]
 print(label,len(items),dict(Counter(x['format'] for x in items)))
