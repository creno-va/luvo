import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chat } from './chat.ts';
const context = { pet:{name:'검증견',breed:'',sex:'',age:'',weight:'',profileAsOf:''},asOf:'2026-11-07',sample:false,recordCount:0,records:[],currentMedications:[],recentDoses:[] };
const messages = [{role:'user',content:'현재 상태는?'},{role:'assistant',content:'기침을 언제부터 했나요?'},{role:'user',content:'오늘 아침부터 해. 다음에는?'}];
test('second turn retains context and latest question, retries invalid model output once', async () => {
 let calls=0;
 const response=await chat.request('https://luvo.baro.site/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context,messages})},{CHAT_LIMITER:{limit:async()=>({success:true})},AI_GATEWAY_ID:'test',AI:{run:async(_model:unknown,input:{messages:{content:string}[]})=>{
  calls++; assert.equal(input.messages.length,2); const payload=JSON.parse(input.messages[1].content); assert.equal(payload.question,messages[2].content); assert.deepEqual(payload.conversation,messages.slice(0,2)); assert.equal(payload.context.pet.name,'검증견');
  return {response:calls===1?'형식이 잘못된 응답':JSON.stringify({answer:'오늘 아침부터 기침했다는 말씀을 바탕으로, 기침 횟수와 호흡 변화를 함께 살펴보세요.'})};
 }}});
 assert.equal(response.status,200); assert.equal(calls,2); const data=await response.json();assert.match(data.answer,/오늘 아침/);assert.deepEqual(data.recordIds,[]);assert.equal(data.urgent,false);
});
test('unsupported references trigger regeneration and never reach the client',async()=>{
 let calls=0;const response=await chat.request('https://luvo.baro.site/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context,messages})},{CHAT_LIMITER:{limit:async()=>({success:true})},AI_GATEWAY_ID:'test',AI:{run:async()=>({response:JSON.stringify({answer:'보호자가 말씀한 기침은 원인을 단정할 수 없어요.',recordIds:++calls===1?['invented']:[]})})}});
 assert.equal(response.status,200);assert.equal(calls,2);assert.deepEqual((await response.json()).recordIds,[]);
});
