import React from 'react';

// A visual authoring marker, independent from the didactic movement rules.
// Empty squares receive a centered cross; occupied squares receive a corner badge
// so that pieces remain readable.
export default function BlockedSquaresOverlay({
  squares, occupied
}: {
  squares: string[];
  occupied: Record<string, string>;
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true">
      {squares.map(square => {
        if (!/^[a-h][1-8]$/.test(square)) return null;
        const x = ('abcdefgh'.indexOf(square[0]) + 0.5) * 100;
        const y = (8.5 - Number(square[1])) * 100;
        const hasPiece = Boolean(occupied[square]);
        const cx = hasPiece ? x + 27 : x;
        const cy = hasPiece ? y - 27 : y;
        const r = hasPiece ? 16 : 28;
        return (
          <g key={square}>
            <circle cx={cx} cy={cy} r={r} fill="#9f2525" fillOpacity={hasPiece ? 0.95 : 0.82}
              stroke="#fff3e6" strokeWidth={hasPiece ? 3 : 4} />
            <path d={`M ${cx-r*0.38} ${cy-r*0.38} L ${cx+r*0.38} ${cy+r*0.38} M ${cx+r*0.38} ${cy-r*0.38} L ${cx-r*0.38} ${cy+r*0.38}`}
              fill="none" stroke="#ffffff" strokeWidth={hasPiece ? 4.5 : 7} strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
