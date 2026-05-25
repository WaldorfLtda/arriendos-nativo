import { useState, useEffect } from "react";

// ── Supabase config ──────────────────────────────────────────
const SUPA_URL = "https://dsczjxscglezsdmcbuho.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzY3pqeHNjZ2xlenNkbWNidWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDgwMjIsImV4cCI6MjA5NTIyNDAyMn0.hFSF8L73jWdmUmPT1BVopQ_6ZJD6xwYXKIT95HPZ4LM";
const HEADERS = { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` };
const API = `${SUPA_URL}/rest/v1/reservas`;
const SYNC_FN = `${SUPA_URL}/functions/v1/sync-ical`;

const ICAL_STORAGE_KEY = "nativo_ical_urls";
function loadIcalUrls() {
  try { return JSON.parse(localStorage.getItem(ICAL_STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveIcalUrls(urls) {
  localStorage.setItem(ICAL_STORAGE_KEY, JSON.stringify(urls));
}

async function dbGetAll() {
  const r = await fetch(`${API}?order=check_in.asc`, { headers: HEADERS });
  return r.json();
}
async function dbInsert(data) {
  const r = await fetch(API, { method:"POST", headers:{...HEADERS,"Prefer":"return=representation"}, body: JSON.stringify(data) });
  return r.json();
}
async function dbUpdate(id, data) {
  const r = await fetch(`${API}?id=eq.${id}`, { method:"PATCH", headers:{...HEADERS,"Prefer":"return=representation"}, body: JSON.stringify(data) });
  return r.json();
}
async function dbDelete(id) {
  await fetch(`${API}?id=eq.${id}`, { method:"DELETE", headers: HEADERS });
}

const PROPERTIES = [
  { id: "refugio", name: "Refugio Nativo", maxGuests: 7 },
  { id: "domo",    name: "Domo Nativo",    maxGuests: 4 },
];
const DAYS_FULL  = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
const DAYS_SHORT = ["L","M","X","J","V","S","D"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const STATUS_CONFIG = {
  airbnb:    { label: "Airbnb",       color: "#E8553E" },
  pendiente: { label: "Pendiente",    color: "#F0A500" },
  abono:     { label: "Abono pagado", color: "#2E86AB" },
  total:     { label: "Pago total",   color: "#2A9D5C" },
};

function getMonday(d) {
  const r=new Date(d); r.setHours(0,0,0,0);
  const day=r.getDay(); r.setDate(r.getDate()-day+(day===0?-6:1)); return r;
}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function isSameDay(a,b){return a.toDateString()===b.toDateString();}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function parseDate(s){const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);}
function fmtShort(d){return d.toLocaleDateString("es-CL",{day:"numeric",month:"short"});}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function firstDayOfMonth(y,m){const d=new Date(y,m,1).getDay();return d===0?6:d-1;}
function statusKey(r){return r.type==="airbnb"?"airbnb":(r.status||"pendiente");}
function resColor(r){return STATUS_CONFIG[statusKey(r)]?.color||"#888";}
function occupies(res,day){
  const s=parseDate(res.checkIn),e=parseDate(res.checkOut);
  const d=new Date(day);d.setHours(12,0,0,0);
  return s<=d&&d<e;
}

// DB row → local format
function fromDB(r){
  return { id:r.id, propertyId:r.propiedad, guest:r.huesped, checkIn:r.check_in, checkOut:r.check_out, type:r.tipo, status:r.estado, guests:r.huespedes, pets:r.mascotas, notes:r.notas||"" };
}
// local format → DB row
function toDB(f, propId){
  return { propiedad:propId, huesped:f.guest, check_in:f.checkIn, check_out:f.checkOut, tipo:f.type, estado:f.status, huespedes:f.guests, mascotas:f.pets, notas:f.notes };
}

const emptyForm=()=>({guest:"",checkIn:"",checkOut:"",type:"airbnb",status:"pendiente",guests:2,pets:false,notes:""});

function buildSegments(reservations,visibleDays,CW,CH,GAP){
  const y1=3,y2=CH-3;
  const colX=i=>i*(CW+GAP);
  const result=[];
  reservations.forEach(res=>{
    const start=parseDate(res.checkIn),end=parseDate(res.checkOut);
    const color=resColor(res);
    let fi=-1,li=-1;
    visibleDays.forEach((day,i)=>{
      if(!day) return;
      const involved=occupies(res,day)||isSameDay(end,day);
      if(involved){if(fi===-1)fi=i;li=i;}
    });
    if(fi===-1)return;
    const isCI=isSameDay(start,visibleDays[fi]);
    const isCO=isSameDay(end,visibleDays[li]);
    const lx=colX(fi),rx=colX(li);
    const topLeft=isCI?[lx+CW,y1]:[lx,y1];
    const topRight=[rx+CW,y1];
    const bottomRight=isCO?[rx,y2]:[rx+CW,y2];
    const bottomLeft=[lx,y2];
    const pts=[topLeft,topRight,bottomRight,bottomLeft];
    const ptsStr=pts.map(([x,y])=>`${x},${y}`).join(" ");
    const middleLeft=isCI?lx+CW:lx;
    const middleRight=isCO?rx:rx+CW;
    const nameX=(middleLeft+middleRight)/2;
    const nameY=(y1+y2)/2;
    result.push({res,ptsStr,nameX,nameY,color});
  });
  return result;
}

// ─────────────────────────────────────────────────────────────
export default function App() {
  const CW=36,CH=52,GAP=2,LABEL_W=82;
  const totalSvgW=CW*7+GAP*6;

  const [view,setView]           = useState("week");
  const [monthProp,setMonthProp] = useState("refugio");
  const [weekStart,setWeekStart] = useState(new Date());
  const [monthRef,setMonthRef]   = useState({y:new Date().getFullYear(),m:new Date().getMonth()});
  const [reservations,setReservations] = useState([]);
  const [loading,setLoading]     = useState(true);
  const [saving,setSaving]       = useState(false);
  const [modal,setModal]         = useState(null);
  const [form,setForm]           = useState(emptyForm());
  const [editId,setEditId]       = useState(null);
  const [detail,setDetail]       = useState(null);
  const [syncModal,setSyncModal] = useState(false);
  const [icalUrls,setIcalUrls]   = useState(loadIcalUrls);
  const [syncing,setSyncing]     = useState(false);
  const [syncResult,setSyncResult] = useState(null);

  // Load from Supabase on mount
  useEffect(()=>{
    dbGetAll().then(rows=>{
      if(Array.isArray(rows)) setReservations(rows.map(fromDB));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const today=new Date();today.setHours(0,0,0,0);
  const weekDays=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const colX=i=>i*(CW+GAP);

  function openAdd(propId,date){
    const p=PROPERTIES.find(x=>x.id===propId);
    setForm({...emptyForm(),checkIn:dateKey(date),checkOut:dateKey(addDays(date,1)),guests:p?Math.min(2,p.maxGuests):2});
    setEditId(null);setModal({propertyId:propId});
  }
  function openEdit(res){
    setForm({guest:res.guest,checkIn:res.checkIn,checkOut:res.checkOut,type:res.type,status:res.status||"pendiente",guests:res.guests||2,pets:res.pets||false,notes:res.notes||""});
    setEditId(res.id);setModal({propertyId:res.propertyId});setDetail(null);
  }

  async function save(){
    if(!form.guest||!form.checkIn||!form.checkOut)return;
    setSaving(true);
    try{
      if(editId){
        const rows=await dbUpdate(editId,toDB(form,modal.propertyId));
        if(Array.isArray(rows)&&rows[0]) setReservations(r=>r.map(x=>x.id===editId?fromDB(rows[0]):x));
      } else {
        const rows=await dbInsert(toDB(form,modal.propertyId));
        if(Array.isArray(rows)&&rows[0]) setReservations(r=>[...r,fromDB(rows[0])]);
      }
      setModal(null);
    } finally { setSaving(false); }
  }

  async function del(id){
    await dbDelete(id);
    setReservations(r=>r.filter(x=>x.id!==id));
    setDetail(null);
  }

  async function syncAirbnb(){
    const configs = PROPERTIES
      .map(p=>({ propertyId: p.id, url: icalUrls[p.id]||"" }))
      .filter(c=>c.url.trim());
    if(!configs.length){ setSyncResult({error:"Ingresa al menos un link iCal"}); return; }
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch(SYNC_FN, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "apikey": SUPA_KEY, "Authorization":`Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ configs })
      });
      const data = await res.json();
      if(data.error) { setSyncResult({error: data.error}); return; }
      setSyncResult({ synced: data.synced, errors: data.errors||[] });
      // Reload reservations
      const rows = await dbGetAll();
      if(Array.isArray(rows)) setReservations(rows.map(fromDB));
    } catch(e) {
      setSyncResult({ error: e.message });
    } finally { setSyncing(false); }
  }

  const prop=PROPERTIES.find(p=>p.id===modal?.propertyId);
  const weekLabel=`${weekDays[0].toLocaleDateString("es-CL",{day:"numeric",month:"short"})} – ${weekDays[6].toLocaleDateString("es-CL",{day:"numeric",month:"short",year:"numeric"})}`;

  function WeekView(){
    return(
      <div style={{padding:"0 8px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={()=>setWeekStart(d=>addDays(d,-7))} style={navBtn}>‹</button>
          <span style={{fontSize:12,fontWeight:600,color:"#555"}}>{weekLabel}</span>
          <button onClick={()=>setWeekStart(d=>addDays(d,7))} style={navBtn}>›</button>
        </div>
        <div style={{display:"flex",paddingLeft:LABEL_W,marginBottom:6,gap:GAP}}>
          {weekDays.map((d,i)=>{
            const isToday=isSameDay(d,today);
            return(
              <div key={i} style={{width:CW,flexShrink:0,textAlign:"center"}}>
                <div style={{fontSize:8,color:"#999",textTransform:"uppercase",fontFamily:"monospace"}}>{d.toLocaleDateString("es-CL",{weekday:"short"}).toUpperCase().slice(0,3)}</div>
                <div style={{width:20,height:20,borderRadius:"50%",margin:"2px auto 0",background:isToday?"#E8553E":"transparent",color:isToday?"#fff":"#999",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:isToday?700:400}}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        {PROPERTIES.map(pr=>{
          const propRes=reservations.filter(r=>r.propertyId===pr.id);
          const segments=buildSegments(propRes,weekDays,CW,CH,GAP);
          return(
            <div key={pr.id} style={{display:"flex",alignItems:"center",marginBottom:4}}>
              <div style={{width:LABEL_W,flexShrink:0,paddingLeft:4,fontSize:10,fontWeight:700,color:"#333"}}>{pr.name}</div>
              <svg width={totalSvgW} height={CH} style={{flexShrink:0,display:"block"}}>
                {weekDays.map((day,i)=>{
                  const isPast=day<today;
                  const occ=propRes.some(r=>occupies(r,day));
                  return(
                    <g key={i} onClick={()=>!occ&&openAdd(pr.id,day)} style={{cursor:occ?"default":"pointer"}}>
                      <rect x={colX(i)} y={0} width={CW} height={CH} rx={4}
                        fill={isPast&&!occ?"#EDEBE8":"#fff"}
                        stroke={isPast?"#E2DFD9":"#E8E5DF"} strokeWidth={1.5}/>
                      {!occ&&!isPast&&(
                        <text x={colX(i)+CW/2} y={CH/2+1} textAnchor="middle" dominantBaseline="middle"
                          fill="#D5D2CC" fontSize={14} style={{pointerEvents:"none"}}>+</text>
                      )}
                    </g>
                  );
                })}
                {segments.map(({res,ptsStr,nameX,nameY,color})=>(
                  <g key={res.id} onClick={e=>{e.stopPropagation();setDetail(res);}} style={{cursor:"pointer"}}>
                    <polygon points={ptsStr} fill={color}/>
                    <text x={nameX} y={nameY} textAnchor="middle" dominantBaseline="middle"
                      fill="#fff" fontSize={8} fontWeight="700" style={{pointerEvents:"none",userSelect:"none"}}>
                      {res.guest.length>9?res.guest.slice(0,8)+"…":res.guest}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    );
  }

  function MonthView(){
    const {y,m}=monthRef;
    const total=daysInMonth(y,m);
    const first=firstDayOfMonth(y,m);
    const propRes=reservations.filter(r=>r.propertyId===monthProp);
    const MCW=42,MCH=46,MGAP=2;
    const mColX=i=>i*(MCW+MGAP);
    const mTotalW=MCW*7+MGAP*6;
    const cells=[];
    for(let i=0;i<first;i++)cells.push(null);
    for(let d=1;d<=total;d++)cells.push(new Date(y,m,d));
    while(cells.length%7!==0)cells.push(null);
    const weeks=[];
    for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
    return(
      <div style={{padding:"0 8px"}}>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {PROPERTIES.map(p=>(
            <button key={p.id} onClick={()=>setMonthProp(p.id)}
              style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${monthProp===p.id?"#E8553E":"#E5E2DE"}`,background:monthProp===p.id?"#FDF0ED":"#fff",color:monthProp===p.id?"#E8553E":"#AAA",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              {p.name}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={()=>setMonthRef(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})} style={navBtn}>‹</button>
          <span style={{fontSize:14,fontWeight:700,color:"#333",textTransform:"capitalize"}}>{MONTHS[m]} {y}</span>
          <button onClick={()=>setMonthRef(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})} style={navBtn}>›</button>
        </div>
        <div style={{display:"flex",gap:MGAP,marginBottom:4}}>
          {DAYS_SHORT.map(d=>(
            <div key={d} style={{width:MCW,textAlign:"center",fontSize:9,color:"#AAA",fontWeight:700,fontFamily:"monospace"}}>{d}</div>
          ))}
        </div>
        {weeks.map((week,wi)=>{
          const segs=buildSegments(propRes,week,MCW,MCH,MGAP);
          return(
            <svg key={wi} width={mTotalW} height={MCH} style={{display:"block",marginBottom:MGAP}}>
              {week.map((day,i)=>{
                if(!day)return null;
                const isPast=day<today;
                const occ=propRes.some(r=>occupies(r,day));
                return(
                  <g key={i} onClick={()=>!occ&&openAdd(monthProp,day)} style={{cursor:occ?"default":"pointer"}}>
                    <rect x={mColX(i)} y={0} width={MCW} height={MCH} rx={3}
                      fill={isPast&&!occ?"#EDEBE8":"#fff"} stroke={isPast?"#E2DFD9":"#E8E5DF"} strokeWidth={1}/>
                  </g>
                );
              })}
              {segs.map(({res,ptsStr,nameX,nameY})=>{
                const resPast=res.checkOut<=dateKey(today);
                const segColor=resPast?"#CCCCCC":resColor(res);
                return(
                  <g key={res.id} onClick={e=>{e.stopPropagation();setDetail(res);}} style={{cursor:"pointer"}}>
                    <polygon points={ptsStr} fill={segColor}/>
                    <text x={nameX} y={nameY} textAnchor="middle" dominantBaseline="middle"
                      fill="#fff" fontSize={8} fontWeight="700" style={{pointerEvents:"none",userSelect:"none"}}>
                      {res.guest.length>9?res.guest.slice(0,8)+"…":res.guest}
                    </text>
                  </g>
                );
              })}
              {week.map((day,i)=>{
                if(!day)return null;
                const isToday=isSameDay(day,today);
                const isPast=day<today;
                const dk=dateKey(day);
                const occFull=propRes.some(r=>r.checkIn<dk&&dk<r.checkOut);
                return(
                  <g key={`lbl-${i}`} style={{pointerEvents:"none"}}>
                    <rect x={mColX(i)+MCW/2-9} y={1} width={18} height={18} rx={9} fill={isToday?"#E8553E":"transparent"}/>
                    <text x={mColX(i)+MCW/2} y={11} textAnchor="middle" dominantBaseline="middle"
                      fill={isToday?"#fff":occFull?"#fff":isPast?"#CCC":"#444"} fontSize={10} fontWeight={isToday||occFull?"700":"400"}
                      style={{pointerEvents:"none"}}>{day.getDate()}</text>
                  </g>
                );
              })}
            </svg>
          );
        })}
        <div style={{marginTop:8,background:"#fff",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#BBB",letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>{PROPERTIES.find(p=>p.id===monthProp)?.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(STATUS_CONFIG).map(([k,c])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:14,height:14,borderRadius:3,background:c.color,flexShrink:0}}/>
                <span style={{fontSize:11,color:"#555",fontWeight:500}}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#F2F0ED",minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:50}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      <div style={{background:"#1A1A1A",padding:"18px 16px 14px",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src="/logo.jpg" alt="Nativo" style={{width:40,height:40,borderRadius:8,objectFit:"cover"}}/>
            <div>
              <div style={{color:"#606060",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Arriendos</div>
              <div style={{color:"#FFF",fontSize:18,fontWeight:700,marginTop:1}}>Nativo</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setSyncModal(true)}
              style={{background:"#2A2A2A",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>⟳ Airbnb</button>
            <button onClick={()=>{setWeekStart(getMonday(new Date()));setView("week");}}
              style={{background:"#E8553E",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Hoy</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {["week","month"].map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:"8px 0",borderRadius:8,border:"none",background:view===v?"#E8553E":"#2A2A2A",color:view===v?"#fff":"#606060",fontWeight:700,fontSize:12,cursor:"pointer"}}>
              {v==="week"?"📅 Semana":"🗓 Mes"}
            </button>
          ))}
        </div>
      </div>

      {loading?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:"#AAA",fontSize:13}}>
          Cargando reservas…
        </div>
      ):(
        <div style={{padding:"12px 0"}}>{view==="week"?<WeekView/>:<MonthView/>}</div>
      )}

      {view==="week"&&!loading&&(
        <div style={{padding:"10px 14px",background:"#fff",borderRadius:12,margin:"0 8px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#BBB",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>Referencias</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(STATUS_CONFIG).map(([k,c])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:14,height:14,borderRadius:3,background:c.color,flexShrink:0}}/>
                <span style={{fontSize:11,color:"#555",fontWeight:500}}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:100,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",padding:24,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:0}}>{editId?"Editar reserva":"Nueva reserva"}</h2>
              <button onClick={()=>setModal(null)} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:"#AAA"}}>×</button>
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Propiedad</label>
              <div style={{padding:"10px 14px",background:"#F7F5F2",borderRadius:10,fontSize:14,fontWeight:600,color:"#E8553E"}}>{prop?.name}</div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Huésped</label>
              <input style={inp} placeholder="Nombre del huésped" value={form.guest} onChange={e=>setForm(f=>({...f,guest:e.target.value}))}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div><label style={lbl}>Check-in</label><input type="date" style={inp} value={form.checkIn} onChange={e=>setForm(f=>({...f,checkIn:e.target.value}))}/></div>
              <div><label style={lbl}>Check-out</label><input type="date" style={inp} value={form.checkOut} onChange={e=>setForm(f=>({...f,checkOut:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Pasajeros</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Array.from({length:prop?.maxGuests||4},(_,i)=>i+1).map(n=>(
                  <button key={n} onClick={()=>setForm(f=>({...f,guests:n}))}
                    style={{width:38,height:38,borderRadius:8,border:`2px solid ${form.guests===n?"#E8553E":"#E5E2DE"}`,background:form.guests===n?"#FDF0ED":"#fff",color:form.guests===n?"#E8553E":"#AAA",fontWeight:700,fontSize:14,cursor:"pointer"}}>{n}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Mascotas</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[{v:false,l:"Sin mascotas 🚫"},{v:true,l:"Con mascotas 🐾"}].map(({v,l})=>(
                  <button key={String(v)} onClick={()=>setForm(f=>({...f,pets:v}))}
                    style={{padding:"11px 8px",borderRadius:10,border:`2px solid ${form.pets===v?"#E8553E":"#E5E2DE"}`,background:form.pets===v?"#FDF0ED":"#fff",color:form.pets===v?"#E8553E":"#AAA",fontWeight:600,fontSize:12,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Canal</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[{k:"airbnb",l:"Airbnb"},{k:"directa",l:"Directa"}].map(({k,l})=>{
                  const active=form.type===k;
                  const c=STATUS_CONFIG[k==="airbnb"?"airbnb":"pendiente"];
                  return(<button key={k} onClick={()=>setForm(f=>({...f,type:k}))}
                    style={{padding:"11px 0",borderRadius:10,border:`2px solid ${active?c.color:"#E5E2DE"}`,background:active?`${c.color}18`:"#fff",color:active?c.color:"#AAA",fontWeight:700,fontSize:14,cursor:"pointer"}}>{l}</button>);
                })}
              </div>
            </div>
            {form.type==="directa"&&(
              <div style={{marginBottom:14}}>
                <label style={lbl}>Estado de pago</label>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {["pendiente","abono","total"].map(s=>{
                    const c=STATUS_CONFIG[s];const active=form.status===s;
                    return(<button key={s} onClick={()=>setForm(f=>({...f,status:s}))}
                      style={{padding:"12px 16px",borderRadius:10,border:`2px solid ${active?c.color:"#E5E2DE"}`,background:active?`${c.color}18`:"#fff",color:active?c.color:"#888",fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:12,height:12,borderRadius:3,background:active?c.color:"#DDD",flexShrink:0}}/>{c.label}
                    </button>);
                  })}
                </div>
              </div>
            )}
            <div style={{marginBottom:22}}>
              <label style={lbl}>Notas / Peticiones especiales</label>
              <textarea style={{...inp,minHeight:72,resize:"vertical",lineHeight:1.5}} placeholder="Ej: llegada tardía, cuna para bebé…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
            </div>
            <button onClick={save} disabled={saving||!form.guest||!form.checkIn||!form.checkOut}
              style={{width:"100%",padding:"14px 0",borderRadius:12,background:form.guest&&form.checkIn&&form.checkOut?STATUS_CONFIG[form.type==="airbnb"?"airbnb":form.status]?.color:"#CCC",color:"#fff",border:"none",fontSize:15,fontWeight:700,cursor:"pointer",opacity:saving?0.7:1}}>
              {saving?"Guardando…":editId?"Guardar cambios":"Agregar reserva"}
            </button>
          </div>
        </div>
      )}

      {syncModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:100,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",padding:24,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Sincronizar Airbnb</h2>
              <button onClick={()=>{setSyncModal(false);setSyncResult(null);}} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:"#AAA"}}>×</button>
            </div>
            <p style={{fontSize:12,color:"#888",marginBottom:18,lineHeight:1.6}}>
              Pega los links iCal de cada propiedad desde Airbnb → Gestionar anuncio → Calendario → Disponibilidad → Exportar calendario.
            </p>
            {PROPERTIES.map(p=>(
              <div key={p.id} style={{marginBottom:16}}>
                <label style={lbl}>{p.name}</label>
                <input style={inp} placeholder="https://www.airbnb.com/calendar/ical/…"
                  value={icalUrls[p.id]||""}
                  onChange={e=>{
                    const v=e.target.value;
                    setIcalUrls(prev=>{const n={...prev,[p.id]:v};saveIcalUrls(n);return n;});
                  }}/>
              </div>
            ))}
            {syncResult&&(
              <div style={{borderRadius:10,padding:"12px 14px",marginBottom:14,background:syncResult.error?"#FFEDED":"#F0FFF5",border:`1.5px solid ${syncResult.error?"#E8553E":"#2A9D5C"}`}}>
                {syncResult.error?(
                  <span style={{fontSize:13,color:"#E8553E",fontWeight:600}}>{syncResult.error}</span>
                ):(
                  <>
                    <div style={{fontSize:13,fontWeight:700,color:"#2A9D5C"}}>{syncResult.synced} reserva{syncResult.synced!==1?"s":""} sincronizada{syncResult.synced!==1?"s":""}</div>
                    {syncResult.errors.length>0&&(
                      <div style={{fontSize:11,color:"#E8553E",marginTop:6}}>{syncResult.errors.join(" · ")}</div>
                    )}
                  </>
                )}
              </div>
            )}
            <button onClick={syncAirbnb} disabled={syncing}
              style={{width:"100%",padding:"14px 0",borderRadius:12,background:syncing?"#CCC":"#E8553E",color:"#fff",border:"none",fontSize:15,fontWeight:700,cursor:syncing?"default":"pointer",opacity:syncing?0.7:1}}>
              {syncing?"Sincronizando…":"⟳ Sincronizar ahora"}
            </button>
            <p style={{fontSize:10,color:"#CCC",textAlign:"center",marginTop:10,marginBottom:0}}>Los links se guardan en este dispositivo.</p>
          </div>
        </div>
      )}

      {detail&&(()=>{
        const sk=statusKey(detail);const c=STATUS_CONFIG[sk];
        const pName=PROPERTIES.find(p=>p.id===detail.propertyId)?.name;
        const nights=Math.round((parseDate(detail.checkOut)-parseDate(detail.checkIn))/(1000*60*60*24));
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:100,display:"flex",alignItems:"flex-end"}}>
            <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",padding:24,maxHeight:"78vh",overflowY:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Detalle reserva</h2>
                <button onClick={()=>setDetail(null)} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:"#AAA"}}>×</button>
              </div>
              <div style={{background:`${c.color}14`,borderRadius:14,padding:16,marginBottom:14,borderLeft:`5px solid ${c.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <span style={{fontSize:11,color:"#999",textTransform:"uppercase",letterSpacing:1}}>{pName}</span>
                  <span style={{background:c.color,color:"#fff",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>{c.label}</span>
                </div>
                <div style={{fontSize:22,fontWeight:700,color:"#1A1A1A",marginBottom:12}}>{detail.guest}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><div style={{fontSize:10,color:"#AAA",textTransform:"uppercase",letterSpacing:1}}>Check-in</div><div style={{fontSize:14,fontWeight:600,marginTop:2}}>{fmtShort(parseDate(detail.checkIn))}</div></div>
                  <div><div style={{fontSize:10,color:"#AAA",textTransform:"uppercase",letterSpacing:1}}>Check-out</div><div style={{fontSize:14,fontWeight:600,marginTop:2}}>{fmtShort(parseDate(detail.checkOut))}</div></div>
                  <div><div style={{fontSize:10,color:"#AAA",textTransform:"uppercase",letterSpacing:1}}>Noches</div><div style={{fontSize:14,fontWeight:600,marginTop:2}}>{nights}</div></div>
                  <div><div style={{fontSize:10,color:"#AAA",textTransform:"uppercase",letterSpacing:1}}>Pasajeros</div><div style={{fontSize:14,fontWeight:600,marginTop:2}}>{detail.guests||"-"} {detail.pets?"🐾":""}</div></div>
                </div>
                {detail.notes&&(<div style={{background:"rgba(0,0,0,0.04)",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:"#AAA",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Notas</div><div style={{fontSize:13,color:"#444",lineHeight:1.5}}>{detail.notes}</div></div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <button onClick={()=>openEdit(detail)} style={{padding:"13px 0",borderRadius:10,border:"2px solid #1A1A1A",background:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Editar</button>
                <button onClick={()=>del(detail.id)} style={{padding:"13px 0",borderRadius:10,border:"none",background:"#FFEDED",color:"#E8553E",fontWeight:700,fontSize:14,cursor:"pointer"}}>Eliminar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const navBtn={background:"#ECEAE6",border:"none",color:"#444",borderRadius:8,width:34,height:34,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};
const lbl={display:"block",fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:1,marginBottom:6};
const inp={width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #E5E2DE",fontSize:14,background:"#F7F5F2",boxSizing:"border-box",fontFamily:"inherit",outline:"none"};
