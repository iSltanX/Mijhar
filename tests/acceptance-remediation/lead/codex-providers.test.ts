import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../src/core';
import { SecretStore } from '../../../src/core/connections/secrets';
import type { SecretArea, StoredSecret } from '../../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../../src/core/connections/service';
import { ProviderService, memoryModelsCache } from '../../../src/modules/e/provider/service';
import { defineProviderSettings, modelSettingKey } from '../../../src/modules/e/provider/settings';
import { fakePermissions } from '../../core/ui-host/helpers';
import { memoryArea } from '../../modules/d/token/helpers';
import { fakeKey, providerMock } from '../../modules/e/provider/fixture-provider-mock';

const NOW = 1_800_000_000_000;
const input = (id: string, section = 'checks') => ({ requestId: id, section, provider: 'anthropic', model: 'mock-sonnet-2', system: 'Synthetic only', prompt: 'error SYNTHETIC_AUDIT_ONLY' });
async function harness(fetch: typeof globalThis.fetch) {
 const store = new SecretStore({ session: memoryArea(), disk: null });
 await store.save(fakeKey('SYNTHETIC'), 'session');
 const area = new MemoryStorageArea();
 const settings = await SettingsStore.open(await Store.open({area,changes:area,locks:null}), createSettingsRegistry(r=>defineProviderSettings(r)));
 await settings.set(modelSettingKey('anthropic'), 'mock-sonnet-2');
 const log=memoryHealthLog(), cache=memoryModelsCache();
 const boot=()=>{
  const connections=new ConnectionsService({stores:{},providerKeys:{selected:async()=>'anthropic',store:()=>store},log,fixable:[],now:()=>NOW});
  const service=new ProviderService({keys:()=>store,permissions:fakePermissions(['https://api.anthropic.com/*']),fetch,connections,settings:async()=>settings,cache,now:()=>NOW});
  return {service,connections};
 };
 return {boot,log,...boot()};
}

describe('independent audit / persistent provider cooldown',()=>{
 it('preserves Retry-After for 503 across background service reconstruction',async()=>{
  let sent=0;
  const fetch=(async()=>{sent++;return new Response(JSON.stringify({error:{type:'overloaded_error',message:'synthetic overload'}}),{status:503,headers:{'retry-after':'120'}});}) as typeof globalThis.fetch;
  const h=await harness(fetch);
  expect(await h.service.analyze(input('before'),'tab-1')).toMatchObject({ok:false,failure:'overloaded',retryAt:NOW+120_000});
  expect(await h.service.verify('anthropic')).toMatchObject({failure:'cooldown'});
  expect(sent).toBe(1);
  const restarted=h.boot();
  const after=await restarted.service.verify('anthropic');
  console.info(JSON.stringify({case:'503-restart',expectedRequests:1,actualRequests:sent,actualFailure:after.ok?'success':after.failure,healthRecords:h.log.records.map(r=>({health:r.health,detail:r.detail}))}));
  expect(after).toMatchObject({ok:false,failure:'cooldown',retryAt:NOW+120_000});
  expect(sent).toBe(1);
 });
 it('preserves a 429 deadline if an already running request succeeds later',async()=>{
  let release!:()=>void,entered!:()=>void;
  const started=new Promise<void>(r=>entered=r), held=new Promise<void>(r=>release=r);
  let sent=0;
  const success=providerMock();
  const fetch=(async(url,init)=>{
   sent++;
   if(sent===1){entered();await held;return success.fetch(url,init);}
   return new Response(JSON.stringify({error:{type:'rate_limit_error',message:'synthetic limit'}}),{status:429,headers:{'retry-after':'120'}});
  }) as typeof globalThis.fetch;
  const h=await harness(fetch);
  const first=h.service.analyze(input('old','checks'),'tab-1');
  await started;
  expect(await h.service.analyze(input('rate','issue'),'tab-2')).toMatchObject({failure:'rate-limit',retryAt:NOW+120_000});
  release();expect((await first).ok).toBe(true);
  expect(await h.service.verify('anthropic')).toMatchObject({failure:'cooldown'});
  const restarted=h.boot();
  const after=await restarted.service.verify('anthropic');
  console.info(JSON.stringify({case:'429-late-success-restart',expectedRequests:2,actualRequests:sent,actualFailure:after.ok?'success':after.failure}));
  expect(after).toMatchObject({failure:'cooldown',retryAt:NOW+120_000});
  expect(sent).toBe(2);
 });
});

// حالة Codex الثالثة (حفظان متزامنان بحاجز ينتظر اكتمال الكتابتين قبل أي مسح) تنتظر إلى الأبد تحت أي تسلسل صحيح للحفظ، فلا تصلح اختبارًا
// للإصلاح؛ ومكافئها الزمني (يفشل على b63f9c4 وينجح بعده) في credential-saves.test.ts.
