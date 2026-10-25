import { describe, expect, it, vi } from 'vitest';
import { tokenSystem, fakeToken } from '../../modules/d/token/helpers';
import { execSystem, BASE_SHA, FILE_SHA, OWNER, REPO } from '../../modules/f/execution/helpers';
import { PublicApiClient } from '../../../src/core/api/client';
import { fakePermissions } from '../../core/ui-host/helpers';
import type { WritePlan } from '../../../src/core/guardrails';

function deferred<T>() { let resolve!: (v:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve}; }
const response = (status:number, body:unknown={}, headers:Record<string,string>={}) => new Response(status===304 ? null : JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
// تصحيح عُدّة (لا توقع): خطة Codex كانت لمستودع audit/synthetic الذي لا يخدمه GitHub الوهمي في execSystem فيرد 404؛ فالعدّ 4 يحتاج octo/demo.
const plan:WritePlan={owner:OWNER,repo:REPO,base:'main',baseSha:BASE_SHA,branch:'audit-change',path:'README.md',fileSha:FILE_SHA,content:'# Synthetic\n',title:'Synthetic change',body:'No live service',draft:true};

describe('Independent audit: expected credential-generation isolation',()=>{
  it('read-token: late rejection of A must not mark already-verified replacement B expired',async()=>{
    const s=await tokenSystem(()=>({status:200,body:{}}));
    await s.store.save(fakeToken('A'),'session');
    const pending=deferred<Response>();
    s.net.mockImplementationOnce(async()=>pending.promise);
    const old=s.port.get('/rate_limit');
    await vi.waitFor(()=>expect(s.net).toHaveBeenCalledTimes(1));
    await s.store.save(fakeToken('B'),'session');
    expect((await s.port.get('/rate_limit')).ok).toBe(true);
    const before=await s.runtime.sendMessage({type:'mijhar/connections',op:'status'}) as Array<{id:string;health:string}>;
    expect(before.find(v=>v.id==='github-token')?.health).toBe('healthy');
    pending.resolve(response(401,{message:'Bad credentials'}));
    await old;
    const after=await s.runtime.sendMessage({type:'mijhar/connections',op:'status'}) as Array<{id:string;health:string}>;
    expect(after.find(v=>v.id==='github-token')?.health).toBe('healthy');
  });

  it('write-token: late rejection of A must not block a never-tried replacement B',async()=>{
    const s=await execSystem();
    const pending=deferred<Response>();
    s.net.mockImplementationOnce(async()=>pending.promise);
    const old=s.panel.exec.run(plan);
    await vi.waitFor(()=>expect(s.net).toHaveBeenCalledTimes(1));
    await s.writes.save(fakeToken('N'),'session');
    expect((await s.panel.exec.status()).health).toBe('unverified');
    pending.resolve(response(401,{message:'Bad credentials'}));
    await old;
    const status=await s.panel.exec.status();
    const next=await s.panel.exec.run(plan);
    expect({health:status.health,executed:next.ok,requests:s.net.mock.calls.length}).toEqual({health:'unverified',executed:true,requests:4});
  });

  it('ETag cache: a body from A arriving after B must not replace B cache',async()=>{
    let token=fakeToken('A');
    const slowBody=deferred<unknown>();
    const bodyStarted=deferred<void>();
    const first=response(200,{}, {etag:'"a"'});
    vi.spyOn(first,'json').mockImplementation(async()=>{bodyStarted.resolve();return slowBody.promise;});
    const net=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(response(200,{owner:'generation-B'},{etag:'"b"'})).mockResolvedValueOnce(response(200,{owner:'generation-B'},{etag:'"b"'}));
    const client=new PublicApiClient({permissions:fakePermissions(['https://api.github.com/*']),token:async()=>token,fetch:net});
    const old=client.get('/repos/audit/synthetic');
    await bodyStarted.promise;
    token=fakeToken('B');
    expect(await client.get('/repos/audit/synthetic')).toMatchObject({ok:true,data:{owner:'generation-B'}});
    slowBody.resolve({owner:'generation-A'}); await old;
    await client.get('/repos/audit/synthetic');
    const sent=new Headers(net.mock.calls[2]?.[1]?.headers).get('If-None-Match');
    expect(sent).toBe('"b"');
  });
});

describe('Independent audit: expected GitHub Retry-After enforcement',()=>{
  it.each([
    ['403 secondary limit with remaining quota',403,'60'],
    ['429 with HTTP-date',429,new Date(1800000000000+60000).toUTCString()],
  ])('%s blocks a second request before the declared retry time',async(_name,status,after)=>{
    const net=vi.fn().mockResolvedValueOnce(response(status,{message:'Synthetic secondary rate limit'},{'retry-after':after,'x-ratelimit-limit':'5000','x-ratelimit-remaining':'4999'})).mockResolvedValueOnce(response(200,{}));
    const client=new PublicApiClient({permissions:fakePermissions(['https://api.github.com/*']),fetch:net,now:()=>1800000000000});
    const first=await client.get('/repos/audit/synthetic');
    const second=await client.get('/repos/audit/synthetic');
    expect({firstFailure:first.ok?null:first.failure,secondFailure:second.ok?null:second.failure,requests:net.mock.calls.length}).toEqual({firstFailure:'rate-limit',secondFailure:'rate-limit',requests:1});
  });
});
