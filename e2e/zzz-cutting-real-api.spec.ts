import { expect,request,test,type Browser } from "@playwright/test";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
type Fixture={root:{username:string;password:string};exceptions:{password:string;cutter:string;managers:{username:string;name:string}[]}};
const fixture=JSON.parse(readFileSync(path.join(import.meta.dirname,".real-api-fixture.json"),"utf8")) as Fixture;
const API="http://127.0.0.1:8788",ORIGIN="http://127.0.0.1:4175";
async function user(username:string){const api=await request.newContext({baseURL:API,extraHTTPHeaders:{Origin:ORIGIN}});const r=await api.post("/auth/login",{data:{username,password:fixture.exceptions.password}});expect(r.status()).toBe(200);const data=await r.json();const post=async(url:string,body:unknown)=>{const r=await api.post(url,{data:body,headers:{"X-CSRF-Token":data.csrfToken,"Idempotency-Key":`cut-dash-${Date.now()}-${Math.random().toString(16).slice(2)}`}});expect(r.status()).toBeLessThan(300);return r.json();};return {api,post,id:data.employee.employeeUuid};}
async function login(browser:Browser,username:string,password:string,width=1440){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});const page=await context.newPage();await page.goto("/");await page.getByLabel("Nume utilizator").fill(username);await page.getByLabel("Parolă").fill(password);await page.getByRole("button",{name:"Intră în cont"}).click();await expect(page.getByRole("button",{name:"Ieși din cont"})).toBeVisible();return {context,page};}

test("same narrow approval center handles a cutting transfer; Root-only device pairing, thresholds and revocation work",async({browser})=>{
  test.setTimeout(120000);
  const number="95001",id=`trendhome:${number}`;
  const body=JSON.stringify({schemaVersion:1,eventId:"dashboard-cutting-e2e",changedAt:new Date(Date.now()-60000).toISOString().replace(/\.\d{3}Z$/,"Z"),order:{id:number,number,status:{code:"processing",label:"Se procesează"},availability:"active",items:[{id:950011,line:1,name:"Voal",sku:"TV-CUT",quantity:2,meters:20}]},production:{workflowKey:"curtain-production",workflowVersion:1,stageId:"material-preparation"}});
  const timestamp=String(Math.floor(Date.now()/1000)),signature="v1="+createHmac("sha256","trendhome-integration-secret-0123456789abcdef").update(`${timestamp}.${body}`).digest("hex");
  const r=await fetch(`${API}/integrations/sources/trendhome/orders`,{method:"POST",headers:{"Content-Type":"application/json","X-Arasya-Timestamp":timestamp,"X-Arasya-Signature":signature},body});const qr=(await r.json()).qr;
  const owner=await user(fixture.exceptions.cutter),target=await user("andrea.cut.e2e");const pool=await(await owner.api.get("/cutting/pool")).json();
  await owner.post(`/orders/${encodeURIComponent(id)}/claim`,{expectedVersion:1,qrToken:qr,ownedCount:pool.ownedCount,confirmedMultiple:pool.ownedCount>0});
  const transfer=await owner.post(`/cutting/orders/${encodeURIComponent(id)}/transfers`,{expectedVersion:2,targetId:target.id,reasonKey:"illness"});
  const manager=await login(browser,fixture.exceptions.managers[0].username,fixture.exceptions.password);
  await expect(manager.page.locator(".exception-item").filter({hasText:"#95001"})).toContainText("Transfer");
  await manager.page.locator(".exception-item").filter({hasText:"#95001"}).click();await expect(manager.page.getByText("Aprobarea NU schimbă proprietarul.",{exact:false})).toBeVisible();
  await manager.page.getByRole("button",{name:"Aprobă transferul",exact:true}).click();await manager.page.getByRole("dialog").getByRole("button",{name:"Confirmă decizia"}).click();
  await expect(manager.page.getByRole("heading",{level:1})).toContainText("Transfer");await expect(manager.page.getByRole("button",{name:"Aprobă transferul",exact:true})).toHaveCount(0);
  const current=await(await target.api.get(`/cutting/transfers/${transfer.id}`)).json();expect(current.actions.canAccept).toBe(true);
  await target.post(`/cutting/transfers/${transfer.id}/accept`,{expectedVersion:2,confirmed:true});await target.post(`/cutting/transfers/${transfer.id}/verify`,{expectedVersion:3,qrToken:qr,ownedCount:0});
  await expect(manager.page.getByText("QR verificat · proprietar schimbat",{exact:true})).toBeVisible({timeout:15000});
  await manager.page.goto("/dispozitive-afisare");await expect(manager.page.getByRole("button",{name:"Creează și generează codul"})).toHaveCount(0);
  await manager.context.close();await owner.api.dispose();await target.api.dispose();
  const root=await login(browser,fixture.root.username,"root e2e permanent passphrase 2026");
  await root.page.goto("/dispozitive-afisare");await root.page.getByLabel("Nume dispozitiv").fill("TV E2E · tăiere");await root.page.getByRole("button",{name:"Creează și generează codul"}).click();
  const pairing=root.page.getByLabel("Cod unic");await expect(pairing).toBeVisible();const code=(await pairing.textContent())!.trim();expect(code).toMatch(/^[A-F0-9]{16}$/);
  const display=await request.newContext({baseURL:API,extraHTTPHeaders:{Origin:ORIGIN}});const pair=await display.post("/display/cutting/pair",{data:{code}});expect(pair.status()).toBe(200);
  await expect(pairing).toHaveCount(0,{timeout:15000});const row=root.page.getByRole("row").filter({hasText:"TV E2E · tăiere"});await expect(row).toContainText("Asociat");
  await root.page.getByLabel("Prag 1 (minute)").fill("16");await root.page.getByRole("button",{name:"Salvează pragurile"}).click();await expect(root.page.getByLabel("Prag 1 (minute)")).toHaveValue("16");
  for(const width of [360,390,768,1024,1440]){await root.page.setViewportSize({width,height:900});expect(await root.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);}
  root.page.once("dialog",d=>d.accept());await row.getByRole("button",{name:"Revocă",exact:true}).click();await expect(row).toContainText("Revocat");expect((await display.get("/display/cutting/snapshot")).status()).toBe(401);
  expect(await root.page.evaluate(()=>Object.keys(sessionStorage).filter(k=>/token|csrf|pair/i.test(k)))).toEqual([]);await display.dispose();await root.context.close();
});
