"""Export factual PBN packs, provenance and board-level benchmark measurements."""
import json,csv,hashlib,re,shutil,subprocess,platform
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]; CACHE=ROOT/'.build/technique-benchmark'
OUT=ROOT/'reports/technique-benchmark-2026-09-25';OUT.mkdir(parents=True,exist_ok=True)
boards=json.loads((CACHE/'selected.json').read_text(encoding='utf8'))
results={x['id']:x for x in map(json.loads,(CACHE/'final-results.ndjson').read_text(encoding='utf8').splitlines())}
labels={'Squeeze':'squeeze','Elimination / endplay':'elimination-endplay','Trump coup':'trump-coup','Dummy reversal':'dummy-reversal','Crossruff':'crossruff'}
def ct(c):
 return '' if not c else str(c['level'])+['S','H','D','C','NT'][c['trump']]+'X'*c.get('doubled',0)+' '+'NESW'[c['declarer']]
def hit(b,mode,label):return any(f['technique']==label for f in results[b['id']].get(mode,{}).get('findings',[]))
def deal(hands):return 'N:'+' '.join('.'.join(''.join('23456789TJQKA'[c%13] for c in sorted(h,reverse=True) if c//13==s) for s in range(4)) for h in hands)
def pbn(bs):
 text='% PBN 2.1\n% Internet source labels are expectations, not detector results.\n'
 for b in bs:
  tags={'Event':'Internet technique benchmark','Site':b['url'],'Date':'????.??.??','Board':str(b['benchmarkBoard']),
        'West':'West','North':'North','East':'East','South':'South','Dealer':'NESW'[b['dealer']],
        'Vulnerable':['None','All','NS','EW'][b['vulnerable']],'Deal':deal(b['hands']),
        'Scoring':'IMP','Declarer':'NESW'[b['contract']['declarer']] if b['contract'] else '?',
        'Contract':ct(b['contract']).split(' ')[0] or '?','Result':'?',
        'BenchmarkID':b['id'],'ExpectedTechnique':'; '.join(b['labels']),'SourceFormat':b['format'],
        'SourceRecord':str(b['index']),'MetadataAssumptions':'; '.join(b['assumptions'])}
  text+='\n'+'\n'.join('['+k+' "'+str(v).replace('\\','\\\\').replace('"','\\"')+'"]' for k,v in tags.items())+'\n'
 return text
slim=[]
for b in boards:
 x={k:v for k,v in b.items() if k not in ['evidence','topic','offset']};slim.append(x)
(OUT/'corpus.json').write_text(json.dumps(slim,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'all.pbn').write_text(pbn(boards),encoding='utf8')
for label,name in labels.items():(OUT/(name+'.pbn')).write_text(pbn([b for b in boards if label in b['labels']]),encoding='utf8')
(OUT/'results.ndjson').write_text(''.join(json.dumps(results[b['id']],ensure_ascii=False)+'\n' for b in boards),encoding='utf8')
shutil.copyfile(CACHE/'final-results.ndjson.manifest.json',OUT/'runner-manifest.json')
shutil.copyfile(CACHE/'review-decisions.json',OUT/'review-decisions.json')
broad=json.loads((CACHE/'broader-variants.json').read_text(encoding='utf8'))
existing={x['id']:x for x in map(json.loads,(CACHE/'results-broader.ndjson').read_text(encoding='utf8').splitlines())}
(OUT/'broader-variants.json').write_text(json.dumps([dict(board={k:v for k,v in b.items() if k not in ['evidence','topic','offset']},result=existing.get(b['id'])) for b in broad],ensure_ascii=False,indent=2),encoding='utf8')
rows=[]
for b in boards:
 r=results[b['id']]
 for label,info in b['labels'].items():
  source=r.get('source'); normal=r.get('normal',{}); pub=r.get('published')
  rows.append(dict(board=b['benchmarkBoard'],id=b['id'],key=b['key'],expected=label,label_tier=info['tier'],
    normal_hit=hit(b,'normal',label),published_contract_hit=hit(b,'published',label),
    source_prefix_hit=hit(b,'source',label) if source else '',source_prefix_cards=source['prefixLength'] if source else '',
    source_prefix_dd_concessions=len(source['concessions']) if source else '',
    par_contract=ct(normal.get('contract')),source_contract=ct(b['contract']),
    same_strain_declarer=bool(b['contract'] and all(b['contract'][k]==normal['contract'][k] for k in ['trump','declarer'])),
    par_score_ns=normal.get('par',{}).get('score'),tricks=normal.get('tricks'),
    normal_findings='; '.join(f['technique'] for f in normal.get('findings',[])),
    error=r.get('error',''),source_prefix_error=r.get('sourceError',''),source_format=b['format'],
    source_url=b['url'],source_record=b['index'],archive_member=b.get('archive_member',''),metadata_assumptions='; '.join(b['assumptions'])))
with (OUT/'board-results.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
stats=[]
for label in labels:
 bs=[b for b in boards if label in b['labels']]; ss=[b for b in bs if 'source' in results[b['id']]]
 optimal=[b for b in ss if not results[b['id']]['source']['concessions']]
 same=[b for b in bs if b['contract'] and all(b['contract'][k]==results[b['id']]['normal']['contract'][k] for k in ['trump','declarer'])]
 s=dict(technique=label,n=len(bs),normal=sum(hit(b,'normal',label) for b in bs),published=sum(hit(b,'published',label) for b in bs),
  same_strain_declarer=len(same),same_strain_declarer_hit=sum(hit(b,'normal',label) for b in same),
  source_prefix_available=len(ss),source_prefix_hit=sum(hit(b,'source',label) for b in ss),
  source_prefix_dd_optimal=len(optimal),source_prefix_dd_optimal_hit=sum(hit(b,'source',label) for b in optimal),
  source_prefix_dd_optimal_rescues=sum(hit(b,'source',label) and not hit(b,'normal',label) for b in optimal),
  source_formats=dict(Counter(b['format'] for b in bs)),tiers={})
 for tier in sorted({b['labels'][label]['tier'] for b in bs}):
  sub=[b for b in bs if b['labels'][label]['tier']==tier];s['tiers'][tier]=dict(n=len(sub),normal=sum(hit(b,'normal',label) for b in sub),published=sum(hit(b,'published',label) for b in sub))
 known=[b for b in bs if not b['assumptions']];s['explicit_metadata']=dict(n=len(known),normal=sum(hit(b,'normal',label) for b in known))
 stats.append(s)
(OUT/'summary.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
urls={b['url'] for b in boards}
for b in boards:urls.update(a['url'] for a in b['aliases'])
source_meta=[]
for p in (CACHE/'raw').glob('*/source.json'):
 m=json.loads(p.read_text(encoding='utf8'))
 if m['url'] in urls:source_meta.append({k:v for k,v in m.items() if k!='links'})
(OUT/'sources.json').write_text(json.dumps(source_meta,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'source-urls.json').write_text(json.dumps(sorted(urls),indent=2),encoding='utf8')
inventory=json.loads((CACHE/'inventory.json').read_text())
run=dict(baseline_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),analysis_version=1,
 date='2026-09-25',python=platform.python_version(),node=subprocess.check_output(['node','--version'],text=True).strip(),
 selected_deals=len(boards),label_assignments=len(rows),source_formats=dict(Counter(b['format'] for b in boards)),
 selected_source_downloads=len(source_meta),metadata_assumptions=sum(bool(b['assumptions']) for b in boards),
 gathered_pbn_lin_files=len(inventory),gathered_complete_records=sum(x['complete'] for x in inventory),
 gathered_file_formats=dict(Counter(x['format'] for x in inventory)),
 source_prefix_errors=sum('sourceError'in results[b['id']] for b in boards),
 files={})
for p in [ROOT/'src/analyze.js',ROOT/'src/techniques.js',ROOT/'src/solver.js',ROOT/'src/bridge.js',ROOT/'src/pbn.js',*sorted((ROOT/'vendor').rglob('*.wasm')),*sorted((ROOT/'scripts').glob('benchmark*'))]:
 if p.is_file():run['files'][str(p.relative_to(ROOT)).replace('\\','/')]=hashlib.sha256(p.read_bytes()).hexdigest()
(OUT/'run.json').write_text(json.dumps(run,indent=2),encoding='utf8')
print(json.dumps(run,indent=2));print(json.dumps(stats,indent=2))
