// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/octo/shop/blob/main/src/cart.js"}
import { afterEach, expect, it } from 'vitest';
import { Store, MemoryStorageArea, SelectorsRegistry, DEFAULT_SELECTORS } from '../src/core';
import { NotesRepository } from '../src/modules/g/notes/repository';
import { AnchorStore } from '../src/modules/g/anchor/store';
import { AnchorController } from '../src/modules/g/anchor/controller';
import { ANCHOR_SELECTORS } from '../src/modules/g/anchor/page-view';
import { pageInfoFromUrl, enrichFromDocument } from '../src/shared/page/page-info';
import { BLOB_URL, LINE, PATH, V1, codeViewHtml } from './modules/g/anchor/drift';
import { insertBlock, undoInsertion } from '../src/modules/f/composer/insert';
import { mergeApi, readPrApi, collapsedInfo } from '../src/modules/d/blockers';
import { readPrSummary, PR_STATUS_SELECTORS } from '../src/modules/d/pr-status';
import { readFixture, loadHtml } from './modules/d/helpers';
import { PublicApiClient } from '../src/core/api/client';
import { MutationRecorder } from '../src/core/lifecycle/mutation-registry';
import { IsolationProcessor } from '../src/modules/a/isolation/processor';
import { DIRECTION_SELECTORS } from '../src/modules/a/direction/selectors';
const opened:Store[]=[];
afterEach(()=>{for(const s of opened.splice(0))s.dispose();});
async function repositories(){
 const area=new MemoryStorageArea();
 const a=await Store.open({area,changes:area,locks:null});
 const b=await Store.open({area,changes:area,locks:null});opened.push(a,b);
 const ra=await NotesRepository.open(a); const rb=await NotesRepository.open(b);
 const note=await ra.create({target:{level:'line',view:'blob',owner:'octo',repo:'shop',ref:'main',refKind:'ref',path:PATH,start:LINE,end:LINE},text:'original',url:BLOB_URL});
 return {area,a,b,ra,rb,note};
}
it('R1 preserves independent note text and anchor status updates from two contexts',async()=>{
 const {a,ra,rb,note}=await repositories();
 await Promise.all([ra.update(note.id,{text:'user edit'}),rb.update(note.id,{anchorStatus:'changed'})]);
 const persisted=await a.read<any>('notes.'+note.id,null);console.log('R1',JSON.stringify(persisted));
 expect(persisted.text).toBe('user edit');expect(persisted.anchorStatus).toBe('changed');
});
it('R2 does not resurrect a note deleted during an anchor status update',async()=>{
 const {a,ra,rb,note}=await repositories();
 await Promise.all([ra.update(note.id,{anchorStatus:'changed'}),rb.remove(note.id)]);
 const persisted=await a.read<any>('notes.'+note.id,null);console.log('R2',JSON.stringify(persisted));
 expect(persisted).toBeNull();
});
it('R3 undo never deletes a pre-existing identical block after the inserted block was edited',()=>{
 const field=document.createElement('textarea');document.body.replaceChildren(field);
 const block='## Expected behavior\n\nIt works.';
 const original='Intro\n\n'+block+'\nTail';field.value=original;
 const insertion=insertBlock(field,block,'append')!;
 const at=field.value.lastIndexOf('It works.');field.setRangeText('It changed.',at,at+'It works.'.length);
 const before=field.value;const result=undoInsertion(insertion);
 console.log('R3',JSON.stringify({original,before,after:field.value,result}));
 expect(field.value).toBe(before);expect(result.status).toBe('modified');
});
it('R4 invalidates the anchor cache when an interior line changes without changing its length',async()=>{
 const {a,ra,note}=await repositories();
 const doc=new DOMParser().parseFromString(codeViewHtml(V1),'text/html');
 const anchors=await AnchorStore.open(a);
 const page=()=>enrichFromDocument(pageInfoFromUrl(BLOB_URL),doc);
 const deps={doc,selectors:new SelectorsRegistry([...DEFAULT_SELECTORS,...ANCHOR_SELECTORS]),notes:ra,anchors,page,onChange:()=>{}};
 const controller=new AnchorController(deps);await controller.capture(note);
 expect(controller.view(note.id)?.kind).toBe('matched');
 doc.getElementById('LC'+LINE)!.textContent=V1[LINE-1]!.replace('Total','Totul');
 await controller.refresh();const cached=controller.view(note.id)?.kind;
 const fresh=new AnchorController(deps);await fresh.refresh();
 console.log('R4',JSON.stringify({cached,fresh:fresh.view(note.id)?.kind,actualLine:doc.getElementById('LC'+LINE)!.textContent}));
 controller.dispose();fresh.dispose();anchors.dispose();
 expect(cached).toBe('changed');
});
const ok=(data:any)=>({ok:true,status:200,data,fromCache:false,readAt:1000,rate:null});
function apiPort(partial=false){return {
 status:async()=>({granted:true,rate:null}),
 get:async(path:string)=>ok(path.includes('/pulls/')?{number:4242,state:'open',draft:false,merged:false,mergeable:true,mergeable_state:'clean',head:{sha:'a'.repeat(40)},base:{ref:'main'}}:{protected:true,protection:{required_status_checks:{contexts:['ci / lint (pull_request)']}}}),
 getAll:async(_path:string,key:string)=>ok({items:key==='check_runs'?[{id:1,name:'ci / lint (pull_request)',status:'completed',conclusion:'success'}]:(partial?Array.from({length:100},(_,i)=>({context:'status-'+i,state:'success'})):[]),total:partial&&key==='statuses'?101:key==='check_runs'?1:0,partial:partial&&key==='statuses',pages:1})
} as any;}
it('R5 rejects API checks from another head commit when merging with the visible PR',async()=>{
 loadHtml('fixture-pr-complex.html');
 const summary=readPrSummary(document,new SelectorsRegistry([...DEFAULT_SELECTORS,...PR_STATUS_SELECTORS]),{pageNumber:4242});
 const api=await readPrApi(apiPort(), 'octo','demo',4242,()=>1000);
 const current={...summary,headSha:'b'.repeat(40)};
 const merged=mergeApi(current,api);
 const before=current.checks.items.find(c=>c.name==='ci / lint (pull_request)')!.classification.category;
 const after=merged.checks.items.find(c=>c.name==='ci / lint (pull_request)')!.classification.category;
 console.log('R5',JSON.stringify({visibleHead:current.headSha,apiHead:api.pull.available?api.pull.value.headSha:null,before,after}));
 expect(after).toBe(before);
});
it('R6 does not label incomplete commit-status pagination as complete',async()=>{
 const api=await readPrApi(apiPort(true),'octo','demo',4242,()=>1000);
 console.log('R6',JSON.stringify(api.checks.available?{items:api.checks.value.items.length,total:api.checks.value.statusesTotal,partial:api.checks.value.partial}:api.checks));
 expect(api.checks.available&&api.checks.value.partial).toBe(true);
});
it('R7 deleting a note also removes its persisted anchor with no content tab mounted',async()=>{
 const {a,ra,note}=await repositories();
 const doc=new DOMParser().parseFromString(codeViewHtml(V1),'text/html');const anchors=await AnchorStore.open(a);
 const controller=new AnchorController({doc,selectors:new SelectorsRegistry([...DEFAULT_SELECTORS,...ANCHOR_SELECTORS]),notes:ra,anchors,page:()=>enrichFromDocument(pageInfoFromUrl(BLOB_URL),doc),onChange:()=>{}});
 await controller.capture(note);controller.dispose();await ra.remove(note.id);
 const remaining=await a.readPrefix('anchors.');console.log('R7',JSON.stringify(remaining));anchors.dispose();
 expect(Object.keys(remaining)).toHaveLength(0);
});
it('R8 isolation restore preserves text subsequently written by the page',()=>{
 document.body.innerHTML='<article class="markdown-body"><p dir="rtl">هذا المسار src/app.ts مهم</p></article>';
 const mutations=new MutationRecorder('a.isolation');
 const selectors=new SelectorsRegistry([...DEFAULT_SELECTORS,...DIRECTION_SELECTORS]);
 const processor=new IsolationProcessor({document,selectors,mutations});processor.scan();
 const group=document.querySelector('.mijhar-bidi-group')!;expect(group).not.toBeNull();
 group.textContent='تحديث الصفحة src/new.ts';const before=document.querySelector('p')!.textContent;
 mutations.restore();console.log('R8',JSON.stringify({before,after:document.querySelector('p')!.textContent}));
 expect(document.querySelector('p')!.textContent).toBe(before);
});

it('R9 honors Retry-After after a secondary rate limit',async()=>{
 let calls=0;const client=new PublicApiClient({permissions:{contains:async()=>true} as any,now:()=>1000,fetch:(async()=>{calls++;return new Response(JSON.stringify({message:'secondary rate limit'}),{status:429,headers:{'retry-after':'60','x-ratelimit-limit':'60','x-ratelimit-remaining':'50','x-ratelimit-reset':'9999'}});}) as any});
 const first=await client.get('/repos/octo/shop');const second=await client.get('/repos/octo/shop');console.log('R9',JSON.stringify({calls,first,second}));expect(calls).toBe(1);
});
