import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import BlockedSquaresOverlay from './BlockedSquaresOverlay';
import { ArrowLeft, Save, Download, Upload, RotateCcw, Play, Trash2, Copy, Plus, Undo2 } from 'lucide-react';

export type SquareMark = 'G' | 'R' | 'Y' | 'B';
export type DiagramArrow = { from: string; to: string; color: SquareMark };
export type Diagram = {
  id: string; title: string; description: string; fen: string;
  active: string; goal?: string; goalType: 'reach' | 'capture';
  kind: 'diagram' | 'maze'; blockedSquares: string[]; showBlockedSquares: boolean;
  captureAllowed: string[]; nonCapturableSquares: string[]; squareColors: Record<string, SquareMark>;
  arrows: DiagramArrow[];
};
type Board = Record<string, string>;
type Tool = 'place' | 'move' | 'erase' | 'color' | 'arrow' | 'active' | 'goal' | 'block' | 'protect';
const files = 'abcdefgh';
const squares = Array.from({ length: 64 }, (_, i) => files[i % 8] + (8 - Math.floor(i / 8)));
const codes = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
const glyphs: Record<string, string> = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
const colors: Record<SquareMark,string> = { G:'#219653',R:'#e34c4c',Y:'#e9ad24',B:'#347de0' };
const storageKey = 'chess-naranco-diagrams-v1';
const initial: Diagram = { id:'', title:'Nuevo diagrama', description:'', fen:'8/8/8/8/8/8/8/8', active:'', goal:undefined, goalType:'reach', kind:'diagram', blockedSquares:[], showBlockedSquares:true, captureAllowed:[], nonCapturableSquares:[], squareColors:{}, arrows:[] };
const makeId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
export function fenToBoard(fen: string): Board {
  const board: Board = {}; const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) throw new Error('El tablero debe tener ocho filas.');
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) column += Number(char);
      else if (codes.includes(char)) { if (column > 7) throw new Error('FEN inválido'); board[files[column] + (8 - rowIndex)] = char; column++; }
      else throw new Error('FEN inválido');
    }
    if (column !== 8) throw new Error('FEN inválido');
  });
  return board;
}
export function boardToPlacement(board: Board): string {
  return Array.from({ length: 8 }, (_, i) => {
    let line = ''; let empty = 0;
    for (const file of files) {
      const piece = board[file + (8 - i)];
      if (!piece) empty++;
      else { if (empty) line += String(empty); empty = 0; line += piece; }
    }
    return line + (empty ? String(empty) : '');
  }).join('/');
}
const validateSquare = (value: unknown): value is string => typeof value === 'string' && /^[a-h][1-8]$/.test(value);
const validateDiagram = (value: unknown): Diagram => {
  if (!value || typeof value !== 'object') throw new Error('Formato de diagrama inválido');
  const raw = value as Partial<Diagram>;
  if (typeof raw.title !== 'string' || typeof raw.fen !== 'string') throw new Error('Faltan título o posición');
  const board = fenToBoard(raw.fen);
  const allowedColors = ['G','R','Y','B'];
  const marks = Object.fromEntries(Object.entries(raw.squareColors || {}).filter(([sq, c]) => validateSquare(sq) && allowedColors.includes(c))) as Record<string,SquareMark>;
  const arrows = (Array.isArray(raw.arrows) ? raw.arrows : []).filter(a => a && validateSquare(a.from) && validateSquare(a.to) && a.from !== a.to && allowedColors.includes(a.color));
  const active = validateSquare(raw.active) && board[raw.active] ? raw.active : '';
  const goal = validateSquare(raw.goal) ? raw.goal : undefined;
  return { id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(), title:raw.title,
    description:typeof raw.description === 'string' ? raw.description : '', fen:boardToPlacement(board),
    active, goal, goalType:raw.goalType === 'capture' ? 'capture' : 'reach',
    kind:raw.kind === 'maze' ? 'maze' : 'diagram',
    showBlockedSquares:raw.showBlockedSquares !== false,
    blockedSquares:Array.isArray(raw.blockedSquares) ? raw.blockedSquares.filter(validateSquare) : [],
    captureAllowed:Array.isArray(raw.captureAllowed) ? raw.captureAllowed.filter(validateSquare) : [],
    nonCapturableSquares:Array.isArray(raw.nonCapturableSquares) ? raw.nonCapturableSquares.filter(validateSquare) : [],
    squareColors:marks, arrows };
};
const center = (sq: string) => ({ x:(files.indexOf(sq[0]) + .5)*100, y:(8.5-Number(sq[1]))*100 });
function ArrowOverlay({ arrows }: { arrows: DiagramArrow[] }) {
  return <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true">
    <defs>{Object.entries(colors).map(([c, color]) => <marker key={c} id={'editor-tip-' + c} markerWidth="2.5" markerHeight="2.5" refX="18" refY="12" viewBox="0 0 24 24" orient="auto" markerUnits="strokeWidth"><path d="M 2 2 L 22 12 L 2 22 z" fill={color}/></marker>)}</defs>
    {arrows.map((a, i) => { const p=center(a.from),q=center(a.to),dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
      return <line key={i} x1={p.x+dx/d*20} y1={p.y+dy/d*20} x2={q.x-dx/d*16} y2={q.y-dy/d*16} stroke={colors[a.color]} strokeOpacity=".85" strokeWidth="11" strokeLinecap="round" markerEnd={'url(#editor-tip-' + a.color + ')'}/>; })}
  </svg>;
}
export default function DiagramEditor({ onExit, onPlay, initialDiagram }: { onExit: () => void; onPlay: (diagram: Diagram) => void; initialDiagram?: Diagram | null }) {
  const [diagram,setDiagram] = useState<Diagram>(() => initialDiagram ? validateDiagram(initialDiagram) : ({ ...initial, id:makeId() }));
  const [tool,setTool] = useState<Tool>('place');
  const [piece,setPiece] = useState('R');
  const [color,setColor] = useState<SquareMark>('G');
  const [source,setSource] = useState<string | null>(null);
  const [saved,setSaved] = useState<Diagram[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(v) ? v.map(validateDiagram) : []; } catch { return []; }
  });
  const [undo,setUndo] = useState<Diagram[]>([]);
  const [message,setMessage] = useState('Selecciona una herramienta y pulsa el tablero.');
  const fileRef=useRef<HTMLInputElement>(null);
  const boardRef=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(560);
  useEffect(() => { const el=boardRef.current; if (!el) return;
    const update=()=>setWidth(Math.max(1,Math.floor(el.clientWidth)));
    update(); const observer=new ResizeObserver(update);observer.observe(el);return ()=>observer.disconnect();
  },[]);
  const board=useMemo(()=>fenToBoard(diagram.fen),[diagram.fen]);
  const update=(next: Diagram)=>{setUndo(old=>[...old.slice(-29),diagram]);setDiagram(next);};
  const changeBoard=(next: Board)=>update({...diagram,fen:boardToPlacement(next)});
  const clickSquare=(square: string)=>{
    if (tool==='place'){
      const next={...board};
      const removing=next[square]===piece;
      if(removing) delete next[square]; else next[square]=piece;
      update({...diagram,fen:boardToPlacement(next),
        active:removing && diagram.active===square?'':diagram.active,
        captureAllowed:removing?diagram.captureAllowed.filter(s=>s!==square):diagram.captureAllowed,
        nonCapturableSquares:removing?diagram.nonCapturableSquares.filter(s=>s!==square):diagram.nonCapturableSquares});
      setSource(null);return;
    }
    if (tool==='erase'){const next={...board};delete next[square];update({...diagram,fen:boardToPlacement(next),active:diagram.active===square?'':diagram.active,goal:diagram.goal===square?undefined:diagram.goal,blockedSquares:diagram.blockedSquares.filter(s=>s!==square),captureAllowed:diagram.captureAllowed.filter(s=>s!==square),nonCapturableSquares:diagram.nonCapturableSquares.filter(s=>s!==square)});return;}
    if (tool==='move'){
      if (!source){if(board[square])setSource(square);return;}
      if(source===square){setSource(null);return;}
      const next={...board};next[square]=next[source];delete next[source];
      const transfer=(items:string[])=>[...items.filter(s=>s!==source&&s!==square),...(items.includes(source)?[square]:[])];
      update({...diagram,fen:boardToPlacement(next),active:diagram.active===source?square:diagram.active,
        nonCapturableSquares:transfer(diagram.nonCapturableSquares),
        captureAllowed:transfer(diagram.captureAllowed)});
      setSource(null);return;
    }
    if (tool==='color'){const marks={...diagram.squareColors};if(marks[square]===color)delete marks[square];else marks[square]=color;update({...diagram,squareColors:marks});return;}
    if (tool==='arrow'){if(!source){setSource(square);return;}if(source!==square){const matches=diagram.arrows.some(a=>a.from===source&&a.to===square&&a.color===color);update({...diagram,arrows:matches?diagram.arrows.filter(a=>!(a.from===source&&a.to===square&&a.color===color)):[...diagram.arrows,{from:source,to:square,color}]});}setSource(null);return;}
    if (tool==='active'){if(board[square])update({...diagram,active:square});else setMessage('Selecciona una casilla que contenga una pieza.');return;}
    if (tool==='goal'){update({...diagram,goal:square});return;}
    if (tool==='protect'){
      if(!board[square]){setMessage('Coloca primero una pieza para marcarla como no capturable.');return;}
      if(diagram.active===square){setMessage('La protagonista no necesita marcarse como no capturable.');return;}
      const selected=diagram.nonCapturableSquares.includes(square);
      update({...diagram,nonCapturableSquares:selected?diagram.nonCapturableSquares.filter(s=>s!==square):[...diagram.nonCapturableSquares,square],
        captureAllowed:diagram.captureAllowed.filter(s=>s!==square)});
      setMessage(selected?'Protección retirada.':'Pieza no capturable: cualquier intento de capturarla será rechazado.');
      return;
    }
    if (tool==='block'){
      const selected=diagram.blockedSquares.includes(square);
      update({...diagram,blockedSquares:selected?diagram.blockedSquares.filter(s=>s!==square):[...diagram.blockedSquares,square]});
      setMessage(selected?'Casilla desbloqueada.':'Casilla bloqueada. No se podrá ocupar ni atravesar.');
      return;
    }
  };
  const highlights=useMemo(()=>{
    const s:Record<string,React.CSSProperties>={};
    Object.entries(diagram.squareColors).forEach(([sq,c])=>{s[sq]={backgroundColor:colors[c]+'99'};});
    diagram.captureAllowed.forEach(sq=>{s[sq]={...s[sq],boxShadow:'inset 0 0 0 4px #38bdf8'};});
    diagram.nonCapturableSquares.forEach(sq=>{s[sq]={...s[sq],boxShadow:'inset 0 0 0 5px #a78bfa'};});
    if(diagram.goal)s[diagram.goal]={...s[diagram.goal],boxShadow:'inset 0 0 0 5px #f59e0b'};
    if(diagram.active)s[diagram.active]={...s[diagram.active],backgroundColor:'#bed868'};
    if(source)s[source]={...s[source],boxShadow:'inset 0 0 0 5px white'};
    return s;
  },[diagram,source]);
  const persist=(items:Diagram[])=>{try{localStorage.setItem(storageKey,JSON.stringify(items));setSaved(items);return true;}catch{setMessage('No se pudo guardar en este navegador. Exporta una copia JSON.');return false;}};
  const save=()=>{const normalized=validateDiagram(diagram); const next=[...saved.filter(d=>d.id!==normalized.id),normalized];if(persist(next))setMessage('Diagrama guardado en este navegador.');};
  const fresh=()=>{setDiagram({...initial,id:makeId()});setUndo([]);setSource(null);setMessage('Nuevo diagrama vacío.');};
  const exportJson=()=>{const blob=new Blob([JSON.stringify({format:'chess-naranco-diagram',version:1,diagram},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='chess-naranco-diagrama.json';a.click();URL.revokeObjectURL(url);};
  const importJson=async(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;
    try{const data=JSON.parse(await file.text());setDiagram(validateDiagram(data.diagram||data));setUndo([]);setSource(null);setMessage('Diagrama importado. Guárdalo para conservarlo en este navegador.');}
    catch{setMessage('No se pudo importar: comprueba que el archivo es un diagrama JSON válido.');}
    event.target.value='';
  };
  const play=()=>{if(!diagram.active||!board[diagram.active]){setMessage('Elige primero la pieza protagonista.');return;}
    if(diagram.kind==='maze'&&!diagram.goal){setMessage('Elige primero la casilla objetivo.');return;}
    if (diagram.kind === 'maze' && diagram.goalType === 'capture' && diagram.goal && !board[diagram.goal]) { setMessage('Para un objetivo de captura, coloca una pieza en la casilla de destino.'); return; }
    onPlay({...diagram});
  };
  const help: Record<Tool,string> = {
    place:'Colocar: pulsa una casilla para poner la pieza elegida. Si ya tiene esa misma pieza, se elimina.',
    move:'Mover: pulsa una pieza y después su destino, sin aplicar reglas de ajedrez.',
    erase:'Borrar: elimina la pieza de una casilla.',
    color:'Colorear: elige verde, rojo, amarillo o azul y pulsa la casilla; repite para quitarlo.',
    arrow:'Flecha: pulsa origen y destino. Repite la misma flecha y color para quitarla.',
    active:'Protagonista: señala la pieza que podrá mover el alumno durante el ejercicio.',
    goal:'Objetivo: señala la casilla que hay que alcanzar o la pieza que hay que capturar.',
    block:'Bloquear: marca en rojo una casilla prohibida, aunque esté vacía. La protagonista no podrá entrar en ella. Repite para desbloquear.',
    protect:'Pieza no capturable: selecciona una pieza para protegerla de cualquier captura. Se marca en violeta. Vuelve a pulsarla para quitar la protección.'
  };
  const tools: Array<[Tool,string]>=[['place','Colocar'],['move','Mover'],['erase','Borrar'],['color','Colorear'],['arrow','Flecha'],['active','Protagonista'],['goal','Objetivo'],['block','Bloquear'],['protect','Pieza no capturable']];
  return <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <header className="border-b border-zinc-800 bg-zinc-900/60"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Chess-Naranco · Autoría didáctica</p><h1 className="text-xl font-bold">Editor visual de diagramas</h1></div>
      <div className="flex flex-wrap gap-2"><button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={onExit}><ArrowLeft size={16} className="inline"/> Inicio</button>
      <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={fresh}><Plus size={16} className="inline"/> Nuevo</button>
      <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={()=>fileRef.current?.click()}><Upload size={16} className="inline"/> Importar</button>
      <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={exportJson}><Download size={16} className="inline"/> Exportar JSON</button>
      <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold" onClick={save}><Save size={16} className="inline"/> Guardar</button></div></div></header>
    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importJson}/>
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[220px_minmax(320px,1fr)_300px]">
      <aside className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">Herramientas</h2><div className="grid grid-cols-2 gap-2">{tools.map(([id,label])=><button key={id} type="button" onClick={()=>{setTool(id);setSource(null);}} className={'rounded-lg border px-2 py-2 text-xs '+(tool===id?'border-emerald-500 bg-emerald-500/20 text-emerald-200':'border-zinc-700 bg-zinc-950 text-zinc-300')}>{label}</button>)}</div>
        <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300" aria-live="polite">{help[tool]}</p>
        <h3 className="text-sm font-semibold">Blancas</h3><div className="grid grid-cols-6 gap-1">{codes.slice(0,6).map(p=><button key={p} onClick={()=>{setTool('place');setPiece(p);setSource(null);}} title={p} className={'rounded border text-2xl '+(tool==='place'&&piece===p?'border-emerald-400 bg-emerald-900':'border-zinc-700 bg-zinc-800')}>{glyphs[p]}</button>)}</div>
        <h3 className="text-sm font-semibold">Negras</h3><div className="grid grid-cols-6 gap-1">{codes.slice(6).map(p=><button key={p} onClick={()=>{setTool('place');setPiece(p);setSource(null);}} title={p} className={'rounded border text-2xl '+(tool==='place'&&piece===p?'border-emerald-400 bg-emerald-900':'border-zinc-700 bg-zinc-800')}>{glyphs[p]}</button>)}</div>
        <h3 className="text-sm font-semibold">Color</h3><div className="flex gap-2">{(Object.keys(colors) as SquareMark[]).map(c=><button key={c} aria-label={'Color '+c} onClick={()=>{setColor(c);setTool('color');setSource(null);}} className={'h-8 w-8 rounded-full border-2 '+(color===c?'border-white':'border-transparent')} style={{backgroundColor:colors[c]}}/>)}</div>
        <div className="space-y-2 border-t border-zinc-700 pt-3"><button className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm" disabled={!undo.length} onClick={()=>{const last=undo[undo.length-1];if(last){setDiagram(last);setUndo(old=>old.slice(0,-1));setSource(null);}}}><Undo2 size={16}/> Deshacer</button>
        <button className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={()=>update({...diagram,fen:initial.fen,active:'',goal:undefined,blockedSquares:[],captureAllowed:[]})}><Trash2 size={16}/> Vaciar piezas</button>
        <button className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={()=>update({...diagram,squareColors:{},arrows:[]})}><RotateCcw size={16}/> Quitar anotaciones</button></div>
      </aside>
      <section className="min-w-0 space-y-3"><div ref={boardRef} className="relative mx-auto w-full max-w-[600px] rounded-xl border-[6px] border-[#473122] shadow-2xl">
        <Chessboard position={diagram.fen+' w - - 0 1'} boardOrientation="white" boardWidth={width} arePiecesDraggable={false} onSquareClick={clickSquare}
          customDarkSquareStyle={{backgroundColor:'#bc8c64'}} customLightSquareStyle={{backgroundColor:'#f1ddb0'}} customSquareStyles={highlights}/>
        <ArrowOverlay arrows={diagram.arrows}/>
        <BlockedSquaresOverlay squares={diagram.blockedSquares} occupied={board}/></div>
        <p role="status" className="min-h-10 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">{message} {source?'Origen: '+source+'. Selecciona destino.':''}</p>
        <p className="text-center text-xs text-zinc-500">Verde: protagonista · Naranja: objetivo · X roja: casilla bloqueada · Violeta: pieza no capturable. Una flecha se quita volviéndola a dibujar con el mismo color.</p>
      </section>
      <aside className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">Preparar el ejercicio</h2>
        <label className="block text-xs text-zinc-400">Título<input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100" value={diagram.title} onChange={e=>setDiagram(old=>({...old,title:e.target.value}))}/></label>
        <label className="block text-xs text-zinc-400">Instrucciones<textarea rows={4} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100" value={diagram.description} onChange={e=>setDiagram(old=>({...old,description:e.target.value}))}/></label>
        <label className="block text-xs text-zinc-400">Tipo<select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100" value={diagram.kind} onChange={e=>setDiagram(old=>({...old,kind:e.target.value as Diagram['kind']}))}><option value="diagram">Diagrama de movimientos</option><option value="maze">Reto / laberinto</option></select></label>
        <label className="block text-xs text-zinc-400">Objetivo<select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100" value={diagram.goalType} onChange={e=>setDiagram(old=>({...old,goalType:e.target.value as Diagram['goalType']}))}><option value="reach">Alcanzar casilla</option><option value="capture">Capturar pieza</option></select></label>
        <details className="group rounded-xl border border-zinc-700 bg-zinc-950">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-zinc-100">
            <span>⚙ Configuración del ejercicio</span>
            <span aria-hidden="true" className="text-zinc-400 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-4 border-t border-zinc-700 px-3 py-4">
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-400">Presentación</h3>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-200">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-500" checked={diagram.showBlockedSquares} onChange={e=>setDiagram(old=>({...old,showBlockedSquares:e.target.checked}))}/>
                <span><strong>Mostrar casillas bloqueadas al alumnado</strong>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">Las X siempre se ven en el editor. En la prueba, ocultarlas no desactiva el bloqueo.</span></span>
              </label>
            </section>
            <section className="space-y-2 border-t border-zinc-800 pt-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-400">Reglas del rey</h3>
              <label className="flex items-start gap-2 text-xs text-zinc-500"><input type="checkbox" disabled className="mt-0.5"/> Respetar el jaque (pendiente de implementar)</label>
              <label className="flex items-start gap-2 text-xs text-zinc-500"><input type="checkbox" disabled className="mt-0.5"/> Permitir el enroque (pendiente de implementar)</label>
            </section>
            <section className="space-y-2 border-t border-zinc-800 pt-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-400">Reglas de los peones</h3>
              <label className="flex items-start gap-2 text-xs text-zinc-500"><input type="checkbox" disabled className="mt-0.5"/> Permitir la captura al paso (pendiente de implementar)</label>
              <p className="text-xs leading-relaxed text-zinc-500">Las reglas especiales se habilitarán cuando se haya probado su validación. Los diagramas sin reyes siguen permitidos.</p>
            </section>
          </div>
        </details>
        <div className="rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300"><p>Protagonista: <strong>{diagram.active||'sin asignar'}</strong></p><p>Destino: <strong>{diagram.goal||'sin asignar'}</strong></p><p>Casillas bloqueadas: {diagram.blockedSquares.length} · Piezas no capturables: {diagram.nonCapturableSquares.length}</p></div>
        <button onClick={play} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-3 text-sm font-bold hover:bg-orange-700"><Play size={17}/> Probar ejercicio</button>
        <div className="border-t border-zinc-700 pt-3"><h3 className="mb-2 text-sm font-semibold">Mis diagramas ({saved.length})</h3>
        <div className="max-h-56 space-y-2 overflow-y-auto">{saved.map(d=><div key={d.id} className="flex items-center gap-2 rounded-lg bg-zinc-950 p-2"><button title="Abrir diagrama" className="min-w-0 flex-1 truncate text-left text-xs" onClick={()=>{setDiagram(d);setUndo([]);setSource(null);setMessage('Diagrama recuperado.')}}>{d.title}</button>
          <button title="Duplicar diagrama" onClick={()=>{setDiagram({...d,id:makeId(),title:d.title+' (copia)'});setUndo([]);setMessage('Copia sin guardar.')}}><Copy size={14}/></button>
          <button title="Eliminar diagrama guardado" onClick={()=>{if(window.confirm('¿Eliminar este diagrama guardado?'))persist(saved.filter(x=>x.id!==d.id));}}><Trash2 size={14}/></button></div>)}</div></div>
      </aside>
    </main>
  </div>;
}
