import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function createOccurrenceStorage(){
 const dir=mkdtempSync(join(tmpdir(),'source-occurrence-'));
 const db=new DatabaseSync(join(dir,'ledger.sqlite'));
 db.exec('PRAGMA cache_size=-4096; PRAGMA journal_mode=OFF; CREATE TABLE texts(id INTEGER PRIMARY KEY,digest BLOB NOT NULL,value TEXT NOT NULL); CREATE INDEX text_digest ON texts(digest); CREATE TABLE kv(c INTEGER,k INTEGER,v INTEGER,PRIMARY KEY(c,k)) WITHOUT ROWID; CREATE TABLE items(c INTEGER,n INTEGER PRIMARY KEY AUTOINCREMENT,k INTEGER,v INTEGER); CREATE INDEX item_key ON items(c,k,n); BEGIN');
 let serial=0;
 const findText=db.prepare('SELECT id FROM texts WHERE digest=? AND value=?');
 const addText=db.prepare('INSERT INTO texts(digest,value) VALUES(?,?)');
 // Reuse exact serialized text across collections. The digest only narrows the
 // lookup; full text equality decides reuse, including distinct unknown values.
 const digest=value=>createHash('sha256').update(value).digest();
 function lookup(value){return findText.get(digest(value),value)?.id;}
 function intern(value){const hash=digest(value),existing=findText.get(hash,value);return existing?.id??addText.run(hash,value).lastInsertRowid;}
 const key=JSON.stringify;
 const put=db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?,?)');
 const get=db.prepare('SELECT texts.value FROM kv JOIN texts ON texts.id=kv.v WHERE c=? AND k=?');
 const has=db.prepare('SELECT 1 FROM kv WHERE c=? AND k=?');
 const count=db.prepare('SELECT count(*) n FROM kv WHERE c=?');
 const add=db.prepare('INSERT INTO items(c,k,v) VALUES(?,?,?)');
 const groupCount=db.prepare('SELECT count(*) n FROM items WHERE c=? AND k=?');
 const groupHas=db.prepare('SELECT 1 FROM items WHERE c=? AND k=? LIMIT 1');
 const groupSize=db.prepare('SELECT count(DISTINCT k) n FROM items WHERE c=?');
 const api={
  map(){const c=++serial;return{
   set(k,v){put.run(c,intern(key(k)),intern(JSON.stringify(v)));},
   get(k){const id=lookup(key(k));if(id===undefined)return undefined;const x=get.get(c,id);return x?JSON.parse(x.value):undefined;},
   has(k){const id=lookup(key(k));return id!==undefined&&!!has.get(c,id);},
   get size(){return count.get(c).n;}
  };},
  set(){const m=api.map();return{add(k){m.set(k,true);},has:k=>m.has(k),get size(){return m.size;}};},
  list(){const c=++serial;let n=0;return{
   push(v){add.run(c,null,intern(JSON.stringify(v)));n++;},
   get length(){return n;},
   *[Symbol.iterator](){for(const x of db.prepare('SELECT texts.value FROM items JOIN texts ON texts.id=items.v WHERE c=? ORDER BY n').iterate(c))yield JSON.parse(x.value);},
   filter(fn){let length=0;for(const v of this)if(fn(v))length++;return{length};}
  };},
  groups(){const c=++serial;return{
   add(k,v){add.run(c,intern(key(k)),intern(JSON.stringify(v)));},
   get(k){const id=lookup(key(k));if(id===undefined)return undefined;const n=groupCount.get(c,id).n;if(!n)return undefined;return{length:n,*[Symbol.iterator](){for(const x of db.prepare('SELECT texts.value FROM items JOIN texts ON texts.id=items.v WHERE c=? AND k=? ORDER BY n').iterate(c,id))yield JSON.parse(x.value);}};},
   has(k){const id=lookup(key(k));return id!==undefined&&!!groupHas.get(c,id);},
   get size(){return groupSize.get(c).n;}
  };},
  close(){db.close();rmSync(dir,{recursive:true,force:true});}
 };
 return api;
}
