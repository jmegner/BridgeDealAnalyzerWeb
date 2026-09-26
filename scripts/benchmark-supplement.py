"""Reviewed full-deal diagrams supplement the native PBN and LIN collections.

Only card distributions and factual metadata are exported, not article prose.
"""
import importlib.util, json, re, html, hashlib
from pathlib import Path
from urllib.parse import urlparse, parse_qs
spec=importlib.util.spec_from_file_location('ingest',Path(__file__).with_name('benchmark-ingest.py'))
i=importlib.util.module_from_spec(spec); spec.loader.exec_module(i)
sources={}
for p in (i.CACHE/'raw').glob('*/source.json'):
 m=json.loads(p.read_text(encoding='utf8')); sources[m['url']]=m
out=[]
def add(url,index,hands,level,trump,decl=2,dealer=0,vul=0,lead=None,assumptions=None):
 m=sources[url]; rid=hashlib.sha256((url+'|reviewed|'+str(index)).encode()).hexdigest()[:12]
 out.append(dict(id=rid,key=i.key(hands),format='html',url=url,sha256=m['sha256'],path=m['download'],index=index,offset=0,board=str(index),title=url.rstrip('/').split('/')[-1],hands=hands,dealer=dealer,vulnerable=vul,contract=dict(level=level,trump=trump,declarer=decl,doubled=0),play=[] if lead is None else ['SHDC'.index(lead[0])*13+i.RANKS.index(lead[1])],assumptions=assumptions or [],evidence={'Dummy reversal':['Reviewed positive demonstration in article.']},topic=[]))
def frames(url):
 t=i.decode(i.ROOT/sources[url]['download'])
 return [parse_qs(urlparse(html.unescape(u)).query) for u in re.findall(r'<iframe[^>]+src=[\"\x27]([^\"\x27]+)',t)]
def hand(q):
 return i.parse_lin_deal('3'+','.join(q[s][0] for s in 's w n e'.split()))[1]
url='https://csbnews.org/en/dummy-reversal-2/'
qs=frames(url)
# The sixth full diagram is a squeeze contrasting with the first five reversals;
# the seventh diagram is an incomplete ending. Neither is a reversal test.
for n,level,trump,dealer,vul,lead,notes in [
 (1,6,3,2,0,'H8',[]),(2,4,0,2,3,None,[]),
 (3,6,0,0,0,None,['Dealer and vulnerability unspecified; N/None used']),
 (4,7,0,0,0,None,['Dealer and vulnerability unspecified; N/None used']),
 (5,7,2,0,0,None,['Dealer and vulnerability unspecified; N/None used'])]:
 add(url,n,hand(qs[n-1]),level,trump,dealer=dealer,vul=vul,lead=lead,assumptions=notes)
for slug,level,trump,dealer,vul,lead in [
 ('recognizing-a-dummy-reversal-by-steve-becker',7,1,0,1,'DQ'),
 ('dummy-reversal-does-it-by-o-jacoby',6,0,2,1,'H2'),
 ('another-case-of-dummy-reversal-by-charles-goren',6,1,0,2,'ST')]:
 url='https://csbnews.org/en/'+slug+'/'
 # Prose overrides handviewer placeholder vulnerability.
 add(url,1,hand(frames(url)[0]),level,trump,dealer=dealer,vul=vul,lead=lead)
url='https://csbnews.org/en/lessons-on-dummy-reversal-play/'
for n,deal,level,trump,lead in [
 (1,'N:J98.Q43.AJ76.Q85 43.KJ102.432.9764 AKQT5.A6.9.AKJ102 762.9875.KQT85.3',7,0,'DK')]:
 add(url,n,i.parse_pbn_deal(deal.replace('10','T')),level,trump,lead=lead,assumptions=['Dealer and vulnerability unspecified; N/None used'])
# Timm's second HTML diagram omits the spade four; excluded, not repaired.
url='https://michaelslawrence.com/play/bidding-more-to-show-less/'
add(url,1,i.parse_pbn_deal('N:J984.7542.732.Q6 3.983.65.9875432 AKQT.Q6.AKJT.AKJ 7652.AKJT.Q984.T'),4,0,dealer=2,vul=1,lead='HK')
url='https://www.compassmate.bridge-centre.org/node/737'
add(url,14,i.parse_pbn_deal('N:AKJT7.KQJT3.J3.9 8632.975.KQT9.QT Q954.A6.A642.A87 .842.875.KJ65432'),6,0,decl=0,dealer=1,vul=0,lead='DK')
(i.CACHE/'candidates-supplement.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print('Reviewed supplemental diagrams',len(out),'unique',len({x['key'] for x in out}))
