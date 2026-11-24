// Optional chess constraints for didactic exercises. This is deliberately independent
// of chess.js: instructional diagrams may contain no kings or allow repeated turns.
export type BoardMap = Record<string,string>;
export type SpecialRules = {
  enforceCheck?: boolean;
  allowCastling?: boolean;
  allowEnPassant?: boolean;
  castlingRights?: string;
  enPassantSquare?: string;
};
export type MoveResult = {ok:boolean; explanation:string; next?:BoardMap; castlingRights?:string; enPassantSquare?:string};
const letters='abcdefgh';
const valid=(sq:string)=>/^[a-h][1-8]$/.test(sq);
const xy=(sq:string)=>[letters.indexOf(sq[0]),Number(sq[1])-1] as const;
const square=(x:number,y:number)=>letters[x]+String(y+1);
const white=(p:string)=>p===p.toUpperCase();
const inside=(x:number,y:number)=>x>=0&&x<8&&y>=0&&y<8;
const same=(a:string,b:string)=>white(a)===white(b);
const failure=(explanation:string):MoveResult=>({ok:false,explanation});

function clearLine(b:BoardMap,from:string,to:string):boolean{
  const [fx,fy]=xy(from),[tx,ty]=xy(to);
  const dx=tx-fx,dy=ty-fy,sx=Math.sign(dx),sy=Math.sign(dy);
  const n=Math.max(Math.abs(dx),Math.abs(dy));
  if(n<1 || !(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)))return false;
  for(let i=1;i<n;i++)if(b[square(fx+i*sx,fy+i*sy)])return false;
  return true;
}
export function attacked(b:BoardMap,target:string,byWhite:boolean):boolean{
  if(!valid(target))return false;
  const [tx,ty]=xy(target);
  return Object.entries(b).some(([src,p])=>{
    if(!valid(src)||white(p)!==byWhite)return false;
    const [x,y]=xy(src),dx=tx-x,dy=ty-y,ax=Math.abs(dx),ay=Math.abs(dy);
    switch(p.toLowerCase()){
      case 'p':return ax===1&&dy===(byWhite?1:-1);
      case 'n':return (ax===1&&ay===2)||(ax===2&&ay===1);
      case 'k':return Math.max(ax,ay)===1;
      case 'b':return ax===ay&&ax>0&&clearLine(b,src,target);
      case 'r':return ((dx===0&&dy!==0)||(dy===0&&dx!==0))&&clearLine(b,src,target);
      case 'q':return (dx===0||dy===0||ax===ay)&&!(dx===0&&dy===0)&&clearLine(b,src,target);
      default:return false;
    }
  });
}
const kingSquare=(b:BoardMap,isWhite:boolean)=>Object.keys(b).find(s=>b[s]===(isWhite?'K':'k'));
const allSquares=(from:string,to:string)=>{
  const [fx,fy]=xy(from),[tx,ty]=xy(to),dx=tx-fx,dy=ty-fy,n=Math.max(Math.abs(dx),Math.abs(dy));
  if(!n || !(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)))return [to];
  return Array.from({length:n},(_,i)=>square(fx+Math.sign(dx)*(i+1),fy+Math.sign(dy)*(i+1)));
};
function blockedPath(b:BoardMap,from:string,to:string,blocked:string[]){
  const p=b[from];if(!p)return false;
  if(p.toLowerCase()==='n')return blocked.includes(to);
  return allSquares(from,to).some(s=>blocked.includes(s));
}
export function validateDidacticMove(
  board:BoardMap,from:string,to:string,
  opts:SpecialRules & {blockedSquares?:string[];nonCapturableSquares?:string[];kind?:'diagram'|'maze';goal?:string;captureAllowed?:string[]}
):MoveResult{
  const piece=board[from];if(!piece||!valid(from)||!valid(to))return failure('Selecciona una pieza y una casilla válida.');
  if(from===to)return failure('Selecciona una casilla de destino diferente.');
  const target=board[to],byWhite=white(piece),kind=piece.toLowerCase();
  if(target&&same(piece,target))return failure('No puedes ocupar una casilla con una pieza de tu color.');
  if(target&&(opts.nonCapturableSquares||[]).includes(to))return failure('Esa pieza está protegida y no se puede capturar.');
  if(opts.enforceCheck && target?.toLowerCase()==='k')return failure('El rey no se captura. El objetivo es dar jaque mate.');
  if(target && opts.kind==='maze' && to!==opts.goal && !(opts.captureAllowed||[]).includes(to))return failure('Esa pieza es un obstáculo del laberinto y no puedes capturarla.');
  const [fx,fy]=xy(from),[tx,ty]=xy(to),dx=tx-fx,dy=ty-fy,ax=Math.abs(dx),ay=Math.abs(dy);
  const forward=byWhite?1:-1;
  const isCastle=kind==='k'&&dy===0&&ax===2;
  const isEp=kind==='p'&&!target&&ax===1&&dy===forward&&opts.allowEnPassant&&to===opts.enPassantSquare;
  const blocks=opts.blockedSquares||[];
  if(blockedPath(board,from,to,blocks))return failure('Hay una casilla bloqueada en el destino o en el recorrido.');
  let rookFrom='',rookTo='',enPassantCaptured='';
  if(isCastle){
    if(!opts.allowCastling)return failure('El enroque no está habilitado en este ejercicio.');
    const rank=byWhite?'1':'8',home='e'+rank,short=dx===2;
    const right=byWhite?(short?'K':'Q'):(short?'k':'q');
    rookFrom=(short?'h':'a')+rank;rookTo=(short?'f':'d')+rank;
    const kingPass=(short?'f':'d')+rank;
    const kingFinish=(short?'g':'c')+rank;
    const corridor=short?['f'+rank,'g'+rank]:['d'+rank,'c'+rank,'b'+rank];
    if(from!==home || to!==kingFinish || !(opts.castlingRights||'').includes(right) || board[rookFrom] !== (byWhite?'R':'r'))
      return failure('El enroque requiere rey y torre en sus casillas iniciales y que ninguno haya movido.');
    if(corridor.some(s=>board[s]||blocks.includes(s)))return failure('No se puede enrocar: hay una casilla ocupada o bloqueada en el recorrido.');
    if(attacked(board,home,!byWhite)||attacked(board,kingPass,!byWhite)||attacked(board,kingFinish,!byWhite))
      return failure('No se puede enrocar estando en jaque, pasando por jaque o terminando en jaque.');
  }else{
    let shape=false;
    switch(kind){
      case 'k':shape=Math.max(ax,ay)===1;break;
      case 'q':shape=(dx===0||dy===0||ax===ay)&&!!(ax||ay);break;
      case 'r':shape=(dx===0||dy===0)&&!!(ax||ay);break;
      case 'b':shape=ax===ay&&ax>0;break;
      case 'n':shape=(ax===1&&ay===2)||(ax===2&&ay===1);break;
      case 'p':
        if(isEp){
          enPassantCaptured=square(tx,fy);
          shape=board[enPassantCaptured]===(byWhite?'p':'P') && !blocks.includes(enPassantCaptured) && !(opts.nonCapturableSquares||[]).includes(enPassantCaptured);
          if(!shape)return failure('No hay un peón rival capturable al paso o está protegido.');
        }else if(target){
          shape=ax===1&&dy===forward;
        }else{
          shape=dx===0&&(dy===forward || (fy===(byWhite?1:6)&&dy===2*forward));
        }
        break;
    }
    if(!shape)return failure(kind==='p'?'El peón solo avanza hacia delante y captura en diagonal. La captura al paso necesita una oportunidad válida.':'Ese movimiento no corresponde a la pieza seleccionada.');
    if(kind!=='n' && !clearLine(board,from,to))return failure('Hay una pieza en el camino.');
  }
  const next={...board};delete next[from];
  if(enPassantCaptured)delete next[enPassantCaptured];
  if(isCastle){next[rookTo]=next[rookFrom];delete next[rookFrom];}
  next[to]=piece;
  if(opts.enforceCheck){
    const king=kingSquare(next,byWhite);
    if(!king)return failure('Para respetar el jaque debe existir un rey del color de la protagonista.');
    if(attacked(next,king,!byWhite))return failure('Movimiento ilegal: tu rey quedaría en jaque.');
  }
  let rights=opts.castlingRights||'';
  const remove=(chars:string)=>{for(const char of chars)rights=rights.replace(char,'');};
  if(kind==='k')remove(byWhite?'KQ':'kq');
  if(from==='a1'||to==='a1')remove('Q');
  if(from==='h1'||to==='h1')remove('K');
  if(from==='a8'||to==='a8')remove('q');
  if(from==='h8'||to==='h8')remove('k');
  const enPassantSquare=opts.allowEnPassant && kind==='p'&&ax===0&&ay===2 ? square(fx,fy+forward) : '';
  return {ok:true,explanation:'',next,castlingRights:rights,enPassantSquare};
}
export function availableCastlingRights(board:BoardMap):string{
  return ([['K','e1','K','h1','R'],['Q','e1','K','a1','R'],['k','e8','k','h8','r'],['q','e8','k','a8','r']] as const)
    .filter(([,king,p,rook,r])=>board[king]===p&&board[rook]===r).map(([right])=>right).join('');
}
export function possibleEpTargets(board:BoardMap,from:string):string[]{
  const p=board[from];if(!p||p.toLowerCase()!=='p')return [];
  const [x,y]=xy(from),direction=white(p)?1:-1,targetRank=y+direction;
  return [-1,1].map(dx=>[x+dx,targetRank] as const)
    .filter(([cx,cy])=>inside(cx,cy)&&!board[square(cx,cy)]&&board[square(cx,y)]===(white(p)?'p':'P'))
    .map(([cx,cy])=>square(cx,cy));
}
