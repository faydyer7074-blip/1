/* Local, dependency-free numerical core. No network, model fitting service or imputed properties. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SlurryCore=api;})(globalThis,function(){
'use strict';
const VERSION='1.1.0-research';
const close=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
function number(v,name,positive=false){
 if(v===null||typeof v==='boolean'||typeof v==='object'||(typeof v==='string'&&!v.trim()))throw Error(name+'：请填写数值。');
 const x=Number(v);if(!Number.isFinite(x)||(positive&&x<=0))throw Error(name+'：需要有限'+(positive?'正':'')+'数。');return x;
}
function nonempty(v,name){if(typeof v!=='string'||!v.trim())throw Error(name+'：请填写。');return v.trim();}
function pa(v,unit){const x=number(v,'黏度',true);let y;if(unit==='Pa.s')y=x;else if(unit==='mPa.s')y=x/1000;else throw Error('请选择 Pa·s 或 mPa·s。');if(!Number.isFinite(y)||y<=0)throw Error('换算后的黏度超出数值范围。');return y;}
function anchors(c){
 const a={r:number(c.r0,'首点水干比',true),eta:pa(c.eta0,c.unit)},b={r:number(c.r1,'末点水干比',true),eta:pa(c.eta1,c.unit)};
 if(b.r<=a.r||close(a.r,b.r))throw Error('末点水干比必须大于首点，且两个端点不能过近。');return {a,b};
}
function targets(c,rs){
 const {a,b}=anchors(c);if(!Array.isArray(rs)||!rs.length)throw Error('请填写待预测的水干比。');
 const result=rs.map(v=>number(v,'预测水干比',true)).sort((x,y)=>x-y);
 for(let i=0;i<result.length;i++){if(result[i]<a.r&&!close(result[i],a.r)||result[i]>b.r&&!close(result[i],b.r))throw Error('两端模型只计算首末点之间的水干比，不能外推。');if(i&&close(result[i],result[i-1]))throw Error('预测水干比重复。');}
 return result;
}
function role(r,c){const {a,b}=anchors(c);return close(r,a.r)?'首点已知':close(r,b.r)?'末点已知':'待预测';}
function power(c,rs){
 const {a,b}=anchors(c),ratios=targets(c,rs),beta=(Math.log(a.eta)-Math.log(b.eta))/(Math.log(b.r)-Math.log(a.r));
 const rows=ratios.map(r=>{const t=(Math.log(r)-Math.log(a.r))/(Math.log(b.r)-Math.log(a.r));const eta=Math.exp((1-t)*Math.log(a.eta)+t*Math.log(b.eta));if(!Number.isFinite(eta*1000)||eta<=0)throw Error('预测黏度超出数值范围。');return {r,etaPa:eta,etaMPa:eta*1000,role:role(r,c)};});
 return {method:'two_endpoint_power',beta,rows,warnings:beta<0?['末点黏度高于首点：按实测端点计算得到上升趋势，请核对配方、制浆和测量条件。']:[],scope:'两端实测后的区间估算；配方比例在此方法中用于记录，不进入幂律系数。'};
}
function phiDensity(row){
 const bulk=number(row.rhoBulk,'浆料密度',true),solid=number(row.rhoSolid,'固相颗粒密度',true),liquid=number(row.rhoLiquid,'液相密度',true),gas=number(row.gas,'气体体积分数');
 if(gas<0||gas>=1)throw Error('气体体积分数应在 [0,1) 内；填 0 也应说明忽略气体的依据。');
 if(Math.abs(solid-liquid)<=1e-12*Math.max(solid,liquid))throw Error('固液密度相同或过近，不能用三密度法识别体积分数。');
 const corrected=bulk/(1-gas),phi=(corrected-liquid)/(solid-liquid);
 if(!Number.isFinite(phi)||phi<0||phi>1)throw Error('浆料密度超出两相密度范围，不能强行截断体积分数。');
 return {phi,gas,correctedDensity:corrected,definition:'不计气体的材料相体积分数'};
}
function nominalPhi(ingredients,r,rhoLiquid,declaration){
 if(!declaration||declaration.allInsoluble!==true||declaration.additiveVolumes!==true)throw Error('需明确全部干料保持不溶固相及体积可加条件；否则不能由干配方直接换算 φ。');
 nonempty(declaration.source,'相态与体积假设依据');r=number(r,'水干比',true);rhoLiquid=number(rhoLiquid,'液相密度',true);
 if(!Array.isArray(ingredients)||!ingredients.length)throw Error('配方为空。');let mass=0,volume=0;
 for(const item of ingredients){nonempty(item.name,'原料名称');const w=number(item.fraction,'配方质量分数');if(w<0)throw Error('配方比例不能为负。');const rho=number(item.density,'颗粒密度',true);nonempty(item.source,'颗粒密度来源');mass+=w;volume+=w/rho;}
 if(Math.abs(mass-1)>1e-6)throw Error('此计算需要质量分数之和为 1，不会自动改配方。');
 return {phi:volume/(volume+r/rhoLiquid),mixtureParticleDensity:mass/volume,kind:'conditional_nominal_volume',assumptions:declaration,notHydrodynamicEffectivePhi:true};
}
function physical(c,rs,props,evidence){
 const {a,b}=anchors(c),ratios=targets(c,rs);
 if(!evidence||!['measured','literature','assumed'].includes(evidence.kind))throw Error('请填写物性来源类型。');
 for(const key of ['source','phaseDefinition','solidVolumeDefinition','phiMaxSource'])nonempty(evidence[key],'物性 '+key);
 if(!['skeletal_excludes_accessible_pores','true_material_excludes_all_pores','envelope_includes_intraparticle_pores','operational_defined_other'].includes(evidence.solidVolumeDefinition))throw Error('需填写已明确的颗粒体积定义，不能使用松装或振实密度。');
 if(evidence.conditionsMatched!==true)throw Error('请确认密度、液相黏度与浆料读数的温度和材料状态相匹配。');
 if(evidence.phaseVolumesNonoverlapping!==true||evidence.gasMassNegligible!==true)throw Error('需确认固液体积互不重复计数，且气体质量可忽略。');
 if(!['specified_fraction','negligible_assumption'].includes(evidence.gasTreatment))throw Error('需明确气体处理方式。');
 const phiMax=number(evidence.phiMax,'最大堆积体积分数',true);if(phiMax>=1)throw Error('最大堆积体积分数应小于 1。');
 if(!Array.isArray(props)||!props.length)throw Error('请填写首末点及待预测点物性。');
 const map=new Map();
 function find(r){for(const p of map.values())if(close(p.r,r))return p;throw Error('缺少水干比 '+r+' 的物性，不能计算物理模型。');}
 for(const p of props){const r=number(p.r,'物性对应水干比',true);if([...map.values()].some(x=>close(x.r,r)))throw Error('物性水干比重复。');const v=phiDensity(p),etaLiquid=number(p.etaLiquid,'液相黏度（Pa·s）',true);if(v.phi>=phiMax)throw Error('固相体积分数达到/超过最大堆积参数，K–D 形式在此点无有限解。');if(evidence.gasTreatment==='negligible_assumption'&&v.gas!==0)throw Error('忽略气体模式下应填 0；非零气体请选指定气体含量。');map.set(String(r),{...p,r,...v,etaLiquid,x:-Math.log1p(-v.phi/phiMax)});}
 const aa=find(a.r),bb=find(b.r),ya=Math.log(a.eta)-Math.log(aa.etaLiquid),yb=Math.log(b.eta)-Math.log(bb.etaLiquid);
 if(ya<0||yb<0)throw Error('端点浆料黏度低于液相黏度，当前固相增黏 K–D 形式不适用。');
 const den=aa.x*aa.x+bb.x*bb.x;if(den<=1e-20)throw Error('两个端点的固相作用过小，无法识别 K–D 指数。');
 const exponent=(aa.x*ya+bb.x*yb)/den;if(!Number.isFinite(exponent)||exponent<0)throw Error('K–D 指数无有效非负解。');
 const rows=ratios.map(r=>{const p=find(r),eta=Math.exp(Math.log(p.etaLiquid)+exponent*p.x);if(!Number.isFinite(eta*1000)||eta<=0)throw Error('物理预测超出数值范围。');return {r,etaPa:eta,etaMPa:eta*1000,phi:p.phi,role:role(r,c)};});
 const residual=[{r:a.r,measured:a.eta,predicted:Math.exp(Math.log(aa.etaLiquid)+exponent*aa.x)},{r:b.r,measured:b.eta,predicted:Math.exp(Math.log(bb.etaLiquid)+exponent*bb.x)}];
 return {method:'kd_physical_candidate',exponent,intrinsicEffective:exponent/phiMax,phiMax,rows,anchorResiduals:residual,physicalEvidence:evidence,
 warnings:['K–D 为待验证物理候选；只拟合一个指数，不强制穿过两个端点。',...(evidence.kind!=='measured'?['物性含文献值或假设值：仅作情景计算。']:[]),...(evidence.gasTreatment==='negligible_assumption'?['体积分数采用忽略气体假设。']:[])],scope:'实际固/液密度、液相黏度和独立堆积参数进入公式；拟合的有效特性黏数不是直接测得的粒子形状。'};
}
function metrics(actual,pred){
 if(actual.length!==pred.length||!actual.length)throw Error('没有可评分的中间点。');
 const n=actual.length,mean=actual.reduce((s,x)=>s+x,0)/n,sse=actual.reduce((s,x,i)=>s+(x-pred[i])**2,0),sst=actual.reduce((s,x)=>s+(x-mean)**2,0);
 return {n,maePa:actual.reduce((s,x,i)=>s+Math.abs(x-pred[i]),0)/n,rmsePa:Math.sqrt(sse/n),r2:n<2||sst<=Number.EPSILON*Math.max(1,mean*mean*n)?null:1-sse/sst};
}
function score(snapshot,observations,unit){
 if(!Array.isArray(observations)||!observations.length)throw Error('请录入中间点实测值。');
 const groups=new Map(),excluded=[];
 for(const o of observations){const r=number(o.r,'实测水干比',true),eta=pa(o.eta,unit),row=snapshot.result.rows.find(x=>close(x.r,r));if(!row)throw Error('实测水干比 '+r+' 未包含在保存的预测记录中。');if(row.role!=='待预测'){excluded.push({r,etaPa:eta,reason:'已知标定位置，不计入中间点评分'});continue;}const k=String(row.r);if(!groups.has(k))groups.set(k,{r:row.r,values:[],prediction:row.etaPa});groups.get(k).values.push(eta);}
 const rows=[...groups.values()].sort((a,b)=>a.r-b.r).map(g=>({r:g.r,readings:g.values.length,measuredMeanPa:g.values.reduce((s,x)=>s+x,0)/g.values.length,predictedPa:g.prediction}));
 for(const r of rows)r.absoluteErrorPa=Math.abs(r.measuredMeanPa-r.predictedPa);
 const expected=snapshot.result.rows.filter(r=>r.role==='待预测'),missing=expected.filter(x=>!rows.some(r=>close(r.r,x.r))).map(x=>x.r);
 return {status:missing.length?'PARTIAL':'ALL_PLANNED_INTERIOR_POINTS_SCORED',...metrics(rows.map(r=>r.measuredMeanPa),rows.map(r=>r.predictedPa)),rows,missingRatios:missing,excludedAnchors:excluded,readingCount:rows.reduce((s,r)=>s+r.readings,0),validationGroupCount:1,independentBatchCount:null,nMeaning:'本记录不同中间配水位置的数量；重复读数先取均值，不推断独立制浆重复数。'};
}
function canonical(obj){if(obj===null||typeof obj!=='object')return JSON.stringify(obj);if(Array.isArray(obj))return '['+obj.map(canonical).join(',')+']';return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';}
function replayEqual(a,b){
 if(typeof a!==typeof b)return false;
 if(typeof a==='number')return Number.isFinite(a)&&Number.isFinite(b)&&(a===b||Math.abs(a-b)<=64*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b),1e-300));
 if(a===null||b===null||typeof a!=='object')return a===b;
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&replayEqual(a[k],b[k]));
}
async function digest(obj){if(!globalThis.crypto?.subtle)throw Error('浏览器不支持本地 SHA-256，请用较新的 Edge 或 Chrome 打开。');const bytes=new TextEncoder().encode(canonical(obj)),sum=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(sum)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function freeze(input,rs,meta,physics){
 nonempty(meta.formulaID,'配方编号');nonempty(meta.batchID,'本轮验证组编号');
 nonempty(meta.recipeText,'配方记录');nonempty(meta.conditions,'制浆和测量条件');
 const result=physics?physical(input,rs,physics.properties,physics.evidence):power(input,rs);
 const body={schema:'slurry-offline-freeze-v1',appVersion:VERSION,createdAt:new Date().toISOString(),clock:'设备时间，非第三方时间证明',input:JSON.parse(JSON.stringify(input)),ratios:targets(input,rs),meta:JSON.parse(JSON.stringify(meta)),physics:physics?JSON.parse(JSON.stringify(physics)):null,result};
 return {...body,integrity:{algorithm:'SHA-256',sha256:await digest(body)}};
}
async function verify(snapshot){
 if(snapshot?.schema!=='slurry-offline-freeze-v1'||!['1.0.0-research',VERSION].includes(snapshot?.appVersion))throw Error('预测记录版本不支持。');
 const {integrity,...body}=snapshot;if(integrity?.algorithm!=='SHA-256'||await digest(body)!==integrity.sha256)throw Error('预测记录校验失败，文件可能被修改或损坏。');
 const expected=body.physics?physical(body.input,body.ratios,body.physics.properties,body.physics.evidence):power(body.input,body.ratios);
 if(!replayEqual(expected,body.result))throw Error('保存的预测与输入不一致。');
 nonempty(body.meta.formulaID,'配方编号');nonempty(body.meta.batchID,'批次编号');nonempty(body.meta.recipeText,'配方记录');nonempty(body.meta.conditions,'制浆和测量条件');return true;
}
function csvValue(v){let s=v===null||v===undefined?'':String(v);if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function toCSV(headers,rows){return '\uFEFF'+[headers,...rows].map(row=>row.map(csvValue).join(',')).join('\r\n');}
return {VERSION,number,pa,anchors,targets,role,power,phiDensity,nominalPhi,physical,metrics,score,canonical,digest,freeze,verify,toCSV,close,replayEqual};
});
