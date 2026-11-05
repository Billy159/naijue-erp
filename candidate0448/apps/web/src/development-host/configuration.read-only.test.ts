import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDevelopmentHostAssets, parseDevelopmentHostConfiguration } from './configuration.ts';
const configuration=()=>({kind:'naijue-erp-development-host',http:{origin:'https://synthetic.test',basePath:'/api'},assets:{basePath:'/development/erp/'},routes:{inventory:true,sales:true,transfers:true},session:{verifyOnMount:false}});
const styles={application:'application.css',inventory:'inventory.css',sales:'sales.css','sales-detail':'sales-detail.css',parties:'parties.css',transfers:'transfers.css','transfer-detail':'transfer-detail.css','transfer-product':'transfer-product.css'};
test('management public switches default absent/disabled and remain compatible with the old three-route configuration',()=>{
  const old=parseDevelopmentHostConfiguration(configuration());assert.deepEqual(old.routes,{inventory:true,sales:true,transfers:true});
  const parsed=parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,products:false,productSettings:false,barcodeSchemes:false}});
  assert.equal(parsed.routes.products,false);assert.equal(parsed.routes.productSettings,false);assert.equal(parsed.routes.barcodeSchemes,false);
});
test('management tabs are explicitly available and initial tab must belong to the enabled read-only set',()=>{
  const source={...configuration(),routes:{...configuration().routes,products:true,productSettings:{groups:false,seasons:true,initialTab:'seasons'},barcodeSchemes:true}};
  const parsed=parseDevelopmentHostConfiguration(source);source.routes.productSettings.seasons=false;
  assert.deepEqual(parsed.routes.productSettings,{groups:false,seasons:true,initialTab:'seasons'});assert.ok(Object.isFrozen(parsed.routes.productSettings));
  for(const value of [true,{},null,{groups:true,seasons:false,initialTab:'seasons'},{groups:true,seasons:false,initialTab:'colors'},{groups:true,seasons:false,initialTab:'groups',authorization:{}}])assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,productSettings:value}}));
  for(const key of ['products','barcodeSchemes'])for(const value of [undefined,'true',1,null,{}])assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,[key]:value}}));
});
test('manifest accepts bounded optional management CSS, never remote asset URLs or unknown policy inputs',()=>{
  const base={entry:'application.js',styles,productDrawerStyles:'chunks/product-drawer.css'};
  assert.deepEqual(parseDevelopmentHostAssets(base).styles,styles);
  const parsed=parseDevelopmentHostAssets({...base,styles:{...styles,products:'products.css','product-settings':'product-settings.css','barcode-schemes':'barcode-schemes.css'}});
  assert.equal(parsed.styles.products,'products.css');
  for(const file of ['https://external.invalid/products.css','../products.css','products.js','products.css?grant=all'])assert.throws(()=>parseDevelopmentHostAssets({...base,styles:{...styles,products:file}}));
});
test('categories stay independently default-off and new color/fit settings require explicit enabled flags',()=>{
  const enabled={...configuration(),routes:{...configuration().routes,productCategories:true,productSettings:{groups:false,seasons:false,colors:true,fits:false,initialTab:'colors'}}};
  const parsed=parseDevelopmentHostConfiguration(enabled);assert.equal(parsed.routes.productCategories,true);assert.deepEqual(parsed.routes.productSettings,{groups:false,seasons:false,colors:true,fits:false,initialTab:'colors'});
  const legacy=parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,productSettings:{groups:true,seasons:false,initialTab:'groups'}}});
  assert.equal(legacy.routes.productCategories,undefined);assert.deepEqual(legacy.routes.productSettings,{groups:true,seasons:false,initialTab:'groups'});
  for(const flag of ['colors','fits'])for(const value of [undefined,1,'true',null])assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,productSettings:{groups:true,seasons:false,initialTab:'groups',[flag]:value}}}));
  assert.throws(()=>parseDevelopmentHostConfiguration({...enabled,routes:{...enabled.routes,productSettings:{...enabled.routes.productSettings,initialTab:'fits'}}}));
  for(const productCategories of [undefined,1,'true',null])assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,productCategories}}));
  const base={entry:'application.js',styles,productDrawerStyles:'chunks/product-drawer.css'};
  assert.equal(parseDevelopmentHostAssets({...base,styles:{...styles,'product-categories':'product-categories.css'}}).styles['product-categories'],'product-categories.css');
});
test('store settings is optional, captures a finite read-only tab set and requires explicit directory intent',()=>{
  assert.equal(parseDevelopmentHostConfiguration(configuration()).routes.storeSettings,undefined);
  assert.equal(parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,storeSettings:false}}).routes.storeSettings,false);
  const source={allowedTabs:['stores','warehouses'],initialTab:'warehouses',allowHallDirectoryRead:false};
  const parsed=parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,storeSettings:source}});
  source.allowedTabs.length=0;
  assert.ok(parsed.routes.storeSettings);
  assert.deepEqual(parsed.routes.storeSettings,{allowedTabs:['stores','warehouses'],initialTab:'warehouses',allowHallDirectoryRead:false});
  assert.ok(Object.isFrozen(parsed.routes.storeSettings));assert.ok(Object.isFrozen(parsed.routes.storeSettings.allowedTabs));
  for(const value of [true,null,{}, {allowedTabs:[],initialTab:'stores',allowHallDirectoryRead:false},
    {allowedTabs:['stores','stores'],initialTab:'stores',allowHallDirectoryRead:false},
    {allowedTabs:['stores'],initialTab:'warehouses',allowHallDirectoryRead:false},
    {allowedTabs:['stores','write'],initialTab:'stores',allowHallDirectoryRead:true},
    {allowedTabs:['stores'],initialTab:'stores'},
    {allowedTabs:['stores'],initialTab:'stores',allowHallDirectoryRead:1},
    {allowedTabs:['stores'],initialTab:'stores',allowHallDirectoryRead:true,authorization:{}}])
    assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,storeSettings:value}}));
  const base={entry:'application.js',styles,productDrawerStyles:'chunks/product-drawer.css'};
  assert.equal(parseDevelopmentHostAssets({...base,styles:{...styles,'store-settings':'store-settings.css'}}).styles['store-settings'],'store-settings.css');
  assert.throws(()=>parseDevelopmentHostAssets({...base,styles:{...styles,'store-settings':'../store-settings.css'}}));
});
test('manual transactions, readonly parties and product viewer require strict independent opt-ins; old defaults stay unchanged',()=>{
  const source={...configuration(),assets:{basePath:'/assets/'},routes:{...configuration().routes,products:true,salesManualCreate:true,transferManualCreate:true,productViewer:true,parties:{readOnly:true}}};
  const parsed=parseDevelopmentHostConfiguration(source);source.routes.parties.readOnly=false;
  assert.deepEqual(parsed.routes.parties,{readOnly:true});assert.ok(Object.isFrozen(parsed.routes.parties));
  assert.equal(parsed.routes.salesManualCreate,true);assert.equal(parsed.routes.transferManualCreate,true);assert.equal(parsed.routes.productViewer,true);
  for(const basePath of ['','/other/api','/api/'])assert.throws(()=>parseDevelopmentHostConfiguration({...source,routes:{...source.routes,parties:{readOnly:true}},http:{...source.http,basePath}}));
  assert.throws(()=>parseDevelopmentHostConfiguration({...source,routes:{...source.routes,parties:{readOnly:true}},assets:{basePath:'/development/erp/'}}));
  for(const key of ['salesManualCreate','transferManualCreate','productViewer']){
    assert.equal(parseDevelopmentHostConfiguration(configuration()).routes[key as 'salesManualCreate'],undefined);
    for(const value of [undefined,1,'true',null,{}, {manualCreate:true}])assert.throws(()=>parseDevelopmentHostConfiguration({...source,routes:{...source.routes,[key]:value}}));
    const route=key==='salesManualCreate'?'sales':key==='transferManualCreate'?'transfers':'products';
    assert.throws(()=>parseDevelopmentHostConfiguration({...source,routes:{...source.routes,[route]:false,[key]:true}}));
    assert.equal(parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,[key]:false}}).routes[key as 'salesManualCreate'],false);
  }
  for(const parties of [true,undefined,null,{}, {readOnly:false},{readOnly:true,commands:true},{readOnly:true,authorization:{}}])assert.throws(()=>parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,parties}}));
  assert.equal(parseDevelopmentHostConfiguration({...configuration(),routes:{...configuration().routes,parties:false}}).routes.parties,false);
});
