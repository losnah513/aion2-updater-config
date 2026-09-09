const vm=require('node:vm');
function createBridgeMock(source,{rows,move=false,remove=false,unavailable=false}={}){
 const cells=Array.from({length:8},()=>Array(8).fill(''));
 (rows||[['before','궁성',100,200,'','','main',''],['unrelated','궁성',900,999,'','','other','']]).forEach((r,i)=>cells[5+i]=[...r]);
 const metadata=[],writes=[],calls=[];let nextId=1,moved=false;
 const sheet={getLastRow:()=>cells.length,getSheetId:()=>0,getLastColumn:()=>8,getName:()=>'list',getRange(r,c,n,w){return {
  getValues:()=>cells.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+w)),
  setValues(){throw Error('POSITIONAL_WRITE_FORBIDDEN');}
 };}};
 const properties={};
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null,setProperty:(k,v)=>{properties[k]=v;},deleteProperty:k=>{delete properties[k];}})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},SpreadsheetApp:{flush(){}}});
 vm.runInContext(source,ctx);ctx.kinojoGetListSheet_=()=>({sheet,ss:{getId:()=>'SYNTHETIC-LOCAL'}});
 function dimension(m){return {dimension:'ROWS',sheetId:0,startIndex:cells.indexOf(m.row),endIndex:cells.indexOf(m.row)+1};}
 function encoded(m){return {metadataId:m.id,metadataKey:m.key,metadataValue:m.value,location:{dimensionRange:dimension(m)}};}
 ctx.kinojoSheetsApi_=(_id,suffix,body)=>{
  calls.push({suffix,body});if(unavailable)throw Error('SHEETS_API_UNAVAILABLE');
  if(suffix==='/developerMetadata:search')return {matchedDeveloperMetadata:metadata.filter(m=>cells.includes(m.row)).map(m=>({developerMetadata:encoded(m)}))};
  if(suffix===':batchUpdate'){
   const replies=[];
   for(const request of body.requests){
    if(request.insertDimension){const d=request.insertDimension.range;cells.splice(d.startIndex,0,Array(8).fill(''));replies.push({});}
    else if(request.createDeveloperMetadata){const d=request.createDeveloperMetadata.developerMetadata,m={id:nextId++,key:d.metadataKey,value:d.metadataValue,row:cells[d.location.dimensionRange.startIndex]};metadata.push(m);replies.push({createDeveloperMetadata:{developerMetadata:encoded(m)}});}
    else if(request.updateCells){const r=request.updateCells; r.rows[0].values.forEach((c,i)=>cells[r.range.startRowIndex][i]=c.userEnteredValue.numberValue??c.userEnteredValue.stringValue);writes.push({append:true});replies.push({});}
    else if(request.deleteDeveloperMetadata){const id=request.deleteDeveloperMetadata.dataFilter.developerMetadataLookup.metadataId,index=metadata.findIndex(m=>m.id===id);if(index>=0)metadata.splice(index,1);replies.push({});}
    else throw Error('Unhandled batch operation');
   }return {replies};
  }
  if(suffix==='/values:batchGetByDataFilter')return {valueRanges:body.dataFilters.flatMap(f=>{
   const m=metadata.find(m=>m.id===f.developerMetadataLookup.metadataId&&cells.includes(m.row));
   return m?[{dataFilters:[f],valueRange:{range:"'list'!A"+(cells.indexOf(m.row)+1)+':H'+(cells.indexOf(m.row)+1),values:[[...m.row]]}}]:[];
  })};
  if(suffix==='/values:batchUpdateByDataFilter'){
   if(!moved&&(move||remove)){if(move)[cells[5],cells[6]]=[cells[6],cells[5]];else cells.splice(5,1);moved=true;}
   let count=0;for(const d of body.data){const m=metadata.find(m=>m.id===d.dataFilter.developerMetadataLookup.metadataId&&cells.includes(m.row));if(!m)continue;
    d.values[0].forEach((v,i)=>{if(v!==null)m.row[i]=v;});writes.push({metadataId:m.id});count++;}
   return {totalUpdatedRows:count};
  }
  throw Error('Unhandled Sheets endpoint '+suffix);
 };
 return {cells,metadata,writes,calls,ctx,properties,write:updates=>ctx.kinojoHandleServerListSheetSync_({updates},'POST'),read:()=>ctx.kinojoHandleServerListSheetRead_({},'GET')};
}
module.exports={createBridgeMock};
