import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Diagram, DiagramArrow, SquareMark } from './DiagramEditor';
import BlockedSquaresOverlay from './BlockedSquaresOverlay';
import { ArrowLeft, ArrowRight, ChevronUp, ChevronDown, Copy, Download, Upload, Plus, Trash2, Presentation, Save, Maximize2 } from 'lucide-react';

export type DidacticLesson = { id: string; title: string; description: string; diagrams: Diagram[] };
const LESSON_KEY = 'chess-naranco-lessons-v1';
const DIAGRAM_KEY = 'chess-naranco-diagrams-v1';
const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
const colors: Record<SquareMark,string> = {G:'#219653',R:'#e34c4c',Y:'#e9ad24',B:'#347de0'};
const square = (s: string) => /^[a-h][1-8]$/.test(s);
const empty = ():DidacticLesson => ({id:makeId(),title:'Nueva lección',description:'',diagrams:[]});
function validateDiagram(data: unknown): Diagram {
  if (!data || typeof data !== 'object') throw Error('Diagrama incorrecto');
  const d = data as Partial<Diagram>;
  if (typeof d.title !== 'string' || typeof d.fen !== 'string') throw Error('Diagrama sin título o tablero');
  const rows=d.fen.split(' ')[0].split('/');
  if(rows.length!==8 || rows.some(row=>{let n=0;for(const ch of row){if(/^[1-8]$/.test(ch))n+=Number(ch);else if(/^[prnbqkPRNBQK]$/.test(ch))n++;else return true;}return n!==8;}))throw Error('Tablero no válido');
  const squareColors=Object.fromEntries(Object.entries(d.squareColors || {}).filter(([s,c])=>square(s)&&['G','R','Y','B'].includes(c))) as Record<string,SquareMark>;
  const arrows=(Array.isArray(d.arrows)?d.arrows:[]).filter(a=>a && square(a.from) && square(a.to) && a.from!==a.to && ['G','R','Y','B'].includes(a.color));
  return {id:typeof d.id==='string'&&d.id?d.id:makeId(),title:d.title,description:typeof d.description==='string'?d.description:'',
    fen:rows.join('/'),kind:d.kind==='maze'?'maze':'diagram',active:square(d.active||'')?d.active!:'',
    goal:square(d.goal||'')?d.goal:undefined,goalType:d.goalType==='capture'?'capture':'reach',
    blockedSquares:Array.isArray(d.blockedSquares)?d.blockedSquares.filter(square):[],
    showBlockedSquares:d.showBlockedSquares!==false,
    captureAllowed:Array.isArray(d.captureAllowed)?d.captureAllowed.filter(square):[],
    nonCapturableSquares:Array.isArray(d.nonCapturableSquares)?d.nonCapturableSquares.filter(square):[],
    enforceCheck:d.enforceCheck===true,allowCastling:d.allowCastling===true,allowEnPassant:d.allowEnPassant===true,
    castlingRights:typeof d.castlingRights==='string'?d.castlingRights.replace(/[^KQkq]/g,''):'',
    enPassantSquare:typeof d.enPassantSquare==='string'&&square(d.enPassantSquare)?d.enPassantSquare:'',
    squareColors,arrows};
}
function validateLesson(value:unknown):DidacticLesson {
  if(!value || typeof value!=='object')throw Error('Lección no válida');
  const lesson=value as Partial<DidacticLesson>;
  if(typeof lesson.title!=='string'||!Array.isArray(lesson.diagrams))throw Error('Lección sin título o posiciones');
  return {id:typeof lesson.id==='string'&&lesson.id?lesson.id:makeId(),title:lesson.title,
    description:typeof lesson.description==='string'?lesson.description:'',
    diagrams:lesson.diagrams.map(validateDiagram)};
}
const center=(sq:string)=>({x:('abcdefgh'.indexOf(sq[0])+.5)*100,y:(8.5-Number(sq[1]))*100});
function LessonArrows({arrows}:{arrows:DiagramArrow[]}) {
  return <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true">
    <defs>{Object.entries(colors).map(([c,col])=><marker key={c} id={'lesson-tip-'+c} markerWidth="2.3" markerHeight="2.3" viewBox="0 0 24 24" refX="18" refY="12" orient="auto" markerUnits="strokeWidth"><path d="M2 2 L22 12 L2 22 z" fill={col}/></marker>)}</defs>
    {arrows.map((a,i)=>{const p=center(a.from),q=center(a.to),dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);return <line key={i} x1={p.x+dx/d*20} y1={p.y+dy/d*20} x2={q.x-dx/d*16} y2={q.y-dy/d*16} stroke={colors[a.color]} strokeWidth="11" strokeLinecap="round" strokeOpacity=".82" markerEnd={'url(#lesson-tip-'+a.color+')'}/>})}
  </svg>;
}
function LessonBoard({diagram,showBlocks=true}:{diagram:Diagram;showBlocks?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(520);
  useEffect(()=>{const el=ref.current;if(!el)return;const resize=()=>setWidth(Math.floor(el.clientWidth));resize();const obs=new ResizeObserver(resize);obs.observe(el);return()=>obs.disconnect();},[]);
  const board=useMemo(()=>{const result:Record<string,string>={};diagram.fen.split('/').forEach((row,i)=>{let f=0;for(const p of row){if(/^[1-8]$/.test(p))f+=Number(p);else{result['abcdefgh'[f]+(8-i)]=p;f++;}}});return result;},[diagram.fen]);
  const styles=useMemo(()=>{const data:Record<string,React.CSSProperties>={};for(const [sq,c] of Object.entries(diagram.squareColors)){data[sq]={backgroundColor:colors[c]+'99'};}
    if(diagram.active)data[diagram.active]={...data[diagram.active],backgroundColor:'#bed868'};
    if(diagram.goal)data[diagram.goal]={...data[diagram.goal],boxShadow:'inset 0 0 0 4px #f59e0b'};
    diagram.captureAllowed.forEach(s=>data[s]={...data[s],boxShadow:'inset 0 0 0 4px #38bdf8'});
    diagram.nonCapturableSquares.forEach(s=>data[s]={...data[s],boxShadow:'inset 0 0 0 4px #a78bfa'});return data;},[diagram]);
  return <div ref={ref} className="relative mx-auto w-full max-w-[600px] overflow-hidden rounded-xl border-[6px] border-[#473122]">
    <Chessboard position={diagram.fen+' w - - 0 1'} boardWidth={width} boardOrientation="white" arePiecesDraggable={false}
      customSquareStyles={styles} customDarkSquareStyle={{backgroundColor:'#bc8c64'}} customLightSquareStyle={{backgroundColor:'#f1ddb0'}}/>
    <LessonArrows arrows={diagram.arrows}/>
    {showBlocks&&diagram.showBlockedSquares!==false&&<BlockedSquaresOverlay squares={diagram.blockedSquares} occupied={board}/>}
  </div>;
}
export default function LessonStudio({onExit,onTry,initialLesson}:{onExit:()=>void;onTry:(d:Diagram,lesson:DidacticLesson)=>void;initialLesson?:DidacticLesson|null}) {
  const [lessons,setLessons]=useState<DidacticLesson[]>(()=>{
    try{const raw=JSON.parse(localStorage.getItem(LESSON_KEY)||'[]');return Array.isArray(raw)?raw.map(validateLesson):[];}catch{return [];}
  });
  const [draft,setDraft]=useState<DidacticLesson>(()=>initialLesson||empty());
  const [available,setAvailable]=useState<Diagram[]>(()=>{
    try{const raw=JSON.parse(localStorage.getItem(DIAGRAM_KEY)||'[]');return Array.isArray(raw)?raw.map(validateDiagram):[];}catch{return [];}
  });
  const [index,setIndex]=useState(0);
  const [present,setPresent]=useState(false);
  const [reveal,setReveal]=useState(false);
  const [message,setMessage]=useState('Añade diagramas guardados a una lección y ordénalos.');
  const input=useRef<HTMLInputElement>(null);
  const selected=draft.diagrams[index];
  const persist=(items:DidacticLesson[])=>{try{localStorage.setItem(LESSON_KEY,JSON.stringify(items));setLessons(items);return true;}catch{setMessage('No se pudo guardar. Exporta la lección en JSON.');return false;}};
  const edit=(d:DidacticLesson)=>{setDraft(d);setIndex(0);setPresent(false);setReveal(false);};
  const save=()=>{if(!draft.title.trim()){setMessage('Escribe un título para la lección.');return;}if(!draft.diagrams.length){setMessage('Añade al menos un diagrama.');return;}
    const updated=[...lessons.filter(l=>l.id!==draft.id),draft];if(persist(updated))setMessage('Lección guardada en este navegador.');};
  const add=(d:Diagram)=>{setDraft(old=>({...old,diagrams:[...old.diagrams,{...d,id:makeId()}]}));setIndex(draft.diagrams.length);setMessage('Diagrama añadido. Los cambios quedan en borrador hasta guardar la lección.');};
  const remove=(i:number)=>{setDraft(old=>({...old,diagrams:old.diagrams.filter((_,j)=>j!==i)}));setIndex(Math.max(0,Math.min(index,draft.diagrams.length-2)));};
  const reorder=(i:number,direction:number)=>{const j=i+direction;if(j<0||j>=draft.diagrams.length)return;const diagrams=[...draft.diagrams];[diagrams[i],diagrams[j]]=[diagrams[j],diagrams[i]];setDraft(old=>({...old,diagrams}));setIndex(j);};
  const download=()=>{const json=JSON.stringify({format:'chess-naranco-lesson',version:1,lesson:draft},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='chess-naranco-leccion.json';a.click();URL.revokeObjectURL(url);};
  const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;
    try{const raw=JSON.parse(await file.text());if(raw.format&&raw.format!=='chess-naranco-lesson')throw Error('El archivo no es una lección');
      edit(validateLesson(raw.lesson||raw));setMessage('Lección importada. Pulsa Guardar para conservarla en este navegador.');}
    catch{setMessage('No se pudo importar la lección. Selecciona un JSON válido de Chess-Naranco.');}
    e.target.value='';
  };
  useEffect(()=>{if(!present)return;const handler=(e:KeyboardEvent)=>{
    if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
    if(e.key==='Escape'){setPresent(false);return;}
    if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();setIndex(i=>Math.min(draft.diagrams.length-1,i+1));setReveal(false);}
    if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1));setReveal(false);}
  };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[present,draft.diagrams.length]);
  const nav=(next:number)=>{setIndex(next);setReveal(false);};
  if(present)return <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 p-4">
      <div><p className="text-xs tracking-widest text-orange-400">MODO CLASE · LECCIÓN DIDÁCTICA</p><h1 className="text-xl font-bold">{draft.title}</h1></div>
      <div className="flex gap-2"><button onClick={()=>{if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"><Maximize2 size={16} className="inline"/> Pantalla completa</button>
      <button onClick={()=>setPresent(false)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Volver al editor</button></div>
    </header>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <p className="text-sm text-zinc-400">{draft.description}</p>
      {selected?<div className="grid items-start gap-6 md:grid-cols-[minmax(0,600px)_minmax(260px,1fr)]">
        <LessonBoard diagram={selected} showBlocks={!reveal}/>
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-emerald-400">Posición {index+1} de {draft.diagrams.length}</p>
          <h2 className="text-2xl font-semibold">{selected.title}</h2>
          <p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{selected.description}</p>
          <button onClick={()=>setReveal(v=>!v)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">{reveal?'Mostrar marcas':'Ocultar marcas'} de bloqueo</button>
          {selected.active&&<button onClick={()=>onTry(selected,draft)} className="block rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold">Probar reto interactivo</button>}
        </section>
      </div>:null}
      <div className="flex items-center justify-center gap-4">
        <button disabled={index===0} onClick={()=>nav(index-1)} className="rounded-lg border border-zinc-700 px-4 py-2 disabled:opacity-40"><ArrowLeft size={17} className="inline"/> Anterior</button>
        <span className="text-sm">{index+1} / {draft.diagrams.length}</span>
        <button disabled={index===draft.diagrams.length-1} onClick={()=>nav(index+1)} className="rounded-lg border border-zinc-700 px-4 py-2 disabled:opacity-40">Siguiente <ArrowRight size={17} className="inline"/></button>
      </div>
    </main>
  </div>;
  return <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <header className="border-b border-zinc-800 bg-zinc-900/60"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div><p className="text-xs font-semibold tracking-widest text-emerald-400">CHESS-NARANCO</p><h1 className="text-xl font-bold">Lecciones y Modo Clase</h1></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onExit} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Inicio</button>
        <button onClick={()=>{edit(empty());setMessage('Nueva lección.');}} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"><Plus size={16} className="inline"/> Nueva</button>
        <button onClick={()=>input.current?.click()} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"><Upload size={16} className="inline"/> Importar</button>
        <button onClick={download} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"><Download size={16} className="inline"/> Exportar</button>
        <button onClick={save} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold"><Save size={16} className="inline"/> Guardar</button>
      </div></div></header>
    <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={upload}/>
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[260px_minmax(320px,1fr)_290px]">
      <aside className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">Mis lecciones ({lessons.length})</h2>
        {lessons.map(l=><div key={l.id} className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
          <button className="min-w-0 flex-1 text-left text-sm" onClick={()=>{edit(l);setMessage('Lección recuperada.')}}><span className="block truncate font-medium">{l.title}</span><span className="text-xs text-zinc-500">{l.diagrams.length} posiciones</span></button>
          <button title="Duplicar lección" onClick={()=>{edit({...l,id:makeId(),title:l.title+' (copia)'});setMessage('Copia sin guardar.');}}><Copy size={15}/></button>
          <button title="Eliminar lección" onClick={()=>{if(window.confirm('¿Eliminar esta lección guardada?'))persist(lessons.filter(x=>x.id!==l.id));}}><Trash2 size={15}/></button>
        </div>)}
        <div className="border-t border-zinc-700 pt-3"><h2 className="mb-2 font-semibold">Diagramas guardados ({available.length})</h2>
          <button onClick={()=>{try{const arr=JSON.parse(localStorage.getItem(DIAGRAM_KEY)||'[]');setAvailable(Array.isArray(arr)?arr.map(validateDiagram):[]);setMessage('Lista de diagramas actualizada.');}catch{setMessage('No se pudieron cargar los diagramas.');}}} className="mb-2 rounded-lg border border-zinc-700 px-2 py-1 text-xs">Actualizar lista</button>
          <div className="max-h-80 space-y-2 overflow-y-auto">{available.map(d=><button key={d.id} onClick={()=>add(d)} title="Añadir a la lección" className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 p-2 text-left text-xs hover:border-emerald-500"><Plus size={14}/><span className="truncate">{d.title}</span></button>)}</div>
          {!available.length&&<p className="text-xs text-zinc-500">Guarda primero diagramas en el Editor visual.</p>}
        </div>
      </aside>
      <section className="min-w-0 space-y-4"><div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <label className="block text-xs text-zinc-400">Título de la lección<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-base text-white"/></label>
        <label className="block text-xs text-zinc-400">Presentación<textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} rows={2} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-white"/></label>
      </div>
      {selected?<><LessonBoard diagram={selected}/><div className="rounded-lg bg-zinc-900 p-3"><h2 className="font-semibold">{selected.title}</h2><p className="whitespace-pre-wrap text-sm text-zinc-400">{selected.description}</p></div></>:<div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">Selecciona diagramas guardados de la columna izquierda.</div>}
      <p role="status" className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">{message}</p></section>
      <aside className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">Orden de la lección</h2><p className="text-xs text-zinc-400">Selecciona una posición para verla; usa las flechas para cambiar su orden.</p>
        {draft.diagrams.map((d,i)=><div key={d.id+'-'+i} className={'flex items-center gap-1 rounded-lg border p-2 '+(i===index?'border-emerald-500 bg-emerald-900/20':'border-zinc-700 bg-zinc-950')}>
          <button onClick={()=>setIndex(i)} className="min-w-0 flex-1 truncate text-left text-xs">{i+1}. {d.title}</button>
          <button disabled={i===0} title="Subir" onClick={()=>reorder(i,-1)} className="disabled:opacity-30"><ChevronUp size={16}/></button>
          <button disabled={i===draft.diagrams.length-1} title="Bajar" onClick={()=>reorder(i,1)} className="disabled:opacity-30"><ChevronDown size={16}/></button>
          <button title="Duplicar posición" onClick={()=>{setDraft(old=>({...old,diagrams:[...old.diagrams.slice(0,i+1),{...d,id:makeId()},...old.diagrams.slice(i+1)]}));setIndex(i+1);}}><Copy size={15}/></button>
          <button title="Quitar de la lección" onClick={()=>remove(i)}><Trash2 size={15}/></button>
        </div>)}
        <button disabled={!draft.diagrams.length} onClick={()=>{setIndex(0);setReveal(false);setPresent(true);}} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-3 text-sm font-semibold disabled:opacity-40"><Presentation size={17}/> Iniciar Modo Clase</button>
        <p className="text-xs text-zinc-500">Los diagramas originales no se modifican al añadirlos o reordenarlos aquí. Guarda la lección al terminar.</p>
      </aside>
    </main>
  </div>;
}
