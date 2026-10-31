const fs=require('node:fs');
const schema=require('../fixtures/storage-budget-schema.json');
module.exports=async function setup(db,tables){
 await db.exec('create schema private;create role anon;create role authenticated;create role service_role;');
 for(const table of tables){const cols=schema.columns.filter(c=>c.schema+'.'+c.table===table);
  for(const c of cols){const m=c.default?.match(/nextval\('([^']+)'::regclass\)/);if(m)await db.exec('create sequence if not exists '+m[1]);}
  await db.exec('create table '+table+'('+cols.map(c=>'"'+c.name+'" '+c.type+(c.generated?' generated always as ('+c.default+') stored':c.default?' default '+c.default:'')+(c.notnull?' not null':'')).join(',')+')');
 }
};
