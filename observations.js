/* Parse pasted observations without converting units or discarding invalid rows. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SlurryObservations=api;
})(globalThis,function(){
  'use strict';
  const ratioHeaders=new Set(['水干比','r','water_ratio']);
  const viscosityHeaders=new Set(['实测黏度','eta','viscosity']);
  const numericToken=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

  function fail(line,message){
    throw new Error('第 '+line+' 行：'+message);
  }

  function positiveNumber(token,name,line){
    if(!numericToken.test(token)){
      fail(line,name+'必须是有限正数，不能使用布尔值或其他文本。');
    }
    const value=Number(token);
    if(!Number.isFinite(value)||value<=0){
      fail(line,name+'必须是大于 0 的有限数。');
    }
    return value;
  }

  function parse(text){
    if(typeof text!=='string'){
      fail(1,'请提供两列观测数据的文本。');
    }
    const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
    const rows=[];
    let firstContentLine=true;
    let headerLine=0;
    for(let index=0;index<lines.length;index++){
      const line=lines[index];
      if(!line.trim())continue;
      // Preserve empty explicit columns, including a leading or trailing Tab.
      const fields=/[,，;；\t]/.test(line)
        ?line.split(/[,，;；\t]/).map(function(value){return value.trim();})
        :line.trim().split(/\s+/);
      const lineNumber=index+1;
      if(fields.length!==2){
        fail(lineNumber,'需要恰好两列（水干比、实测黏度），实际为 '+fields.length+' 列。');
      }
      if(firstContentLine
        &&ratioHeaders.has(fields[0].toLowerCase())
        &&viscosityHeaders.has(fields[1].toLowerCase())){
        firstContentLine=false;
        headerLine=lineNumber;
        continue;
      }
      firstContentLine=false;
      rows.push({
        r:positiveNumber(fields[0],'水干比',lineNumber),
        eta:positiveNumber(fields[1],'实测黏度',lineNumber)
      });
    }
    if(!rows.length){
      fail(headerLine||1,headerLine
        ?'标题后没有观测数据，请至少填写一行水干比和实测黏度。'
        :'观测数据为空，请至少填写一行水干比和实测黏度。');
    }
    return rows;
  }

  return {parse:parse};
});
