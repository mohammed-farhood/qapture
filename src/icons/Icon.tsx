/**
 * Icon.tsx — inline SVG icon component for qapture.
 *
 * Replaces lucide-react in the package bundle so qapture has zero external
 * icon dependencies. Path data sourced from:
 *
 *   Lucide v0.294.0 (ISC License)
 *   https://github.com/lucide-icons/lucide
 *   Copyright (c) 2022 Lucide Contributors
 *
 * Only the 24 icons used by qapture components are included.
 */

import React, { type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Icon name union
// ---------------------------------------------------------------------------

export type IconName =
  | 'Check'
  | 'X'
  | 'Loader2'
  | 'MousePointerClick'
  | 'Square'
  | 'ImagePlus'
  | 'CheckCircle2'
  | 'Crosshair'
  | 'Trash2'
  | 'MapPin'
  | 'FileText'
  | 'Pencil'
  | 'Download'
  | 'Trash'
  | 'StickyNote'
  | 'KeyRound'
  | 'Map'
  | 'ClipboardList'
  | 'Copy'
  | 'CircleUser'
  | 'Circle'
  | 'Plus'
  | 'MapPinned'
  | 'ChevronDown'
  // — v0.3 "Graphite" —
  | 'Bug'
  | 'AlertTriangle'
  | 'RotateCcw'
  | 'ChevronLeft'
  | 'ChevronRight'
  | 'Play'
  // — v0.4 "Ledger" —
  | 'Search'
  | 'Folder'
  | 'FolderCheck'
  | 'Settings'
  | 'HardDrive'
  | 'Camera'
  | 'Minimize2'
  | 'Maximize2'
  | 'Send';

// ---------------------------------------------------------------------------
// SVG element descriptors (mirrors Lucide's internal format)
// ---------------------------------------------------------------------------

type SvgAttrValue = string | number;
type SvgAttrs = Record<string, SvgAttrValue>;
type SvgDescriptor = [tag: string, attrs: SvgAttrs];

const ICONS: Record<IconName, SvgDescriptor[]> = {
  Check: [
    ['path', { d: 'M20 6 9 17l-5-5' }],
  ],

  Bug: [
    ['path', { d: 'm8 2 1.88 1.88' }],
    ['path', { d: 'M14.12 3.88 16 2' }],
    ['path', { d: 'M9 7.13v-1a3.003 3.003 0 1 1 6 0v1' }],
    ['path', { d: 'M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6' }],
    ['path', { d: 'M12 20v-9' }],
    ['path', { d: 'M6.53 9C4.6 8.8 3 7.1 3 5' }],
    ['path', { d: 'M6 13H2' }],
    ['path', { d: 'M3 21c0-2.1 1.7-3.9 3.8-4' }],
    ['path', { d: 'M20.97 5c0 2.1-1.6 3.8-3.5 4' }],
    ['path', { d: 'M22 13h-4' }],
    ['path', { d: 'M17.2 17c2.1.1 3.8 1.9 3.8 4' }],
  ],

  AlertTriangle: [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],

  RotateCcw: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
  ],

  ChevronLeft: [
    ['path', { d: 'm15 18-6-6 6-6' }],
  ],

  ChevronRight: [
    ['path', { d: 'm9 18 6-6-6-6' }],
  ],

  Play: [
    ['polygon', { points: '6 3 20 12 6 21 6 3' }],
  ],

  X: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],

  Loader2: [
    ['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }],
  ],

  MousePointerClick: [
    ['path', { d: 'm9 9 5 12 1.8-5.2L21 14Z' }],
    ['path', { d: 'M7.2 2.2 8 5.1' }],
    ['path', { d: 'm5.1 8-2.9-.8' }],
    ['path', { d: 'M14 4.1 12 6' }],
    ['path', { d: 'm6 12-1.9 2' }],
  ],

  Square: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
  ],

  ImagePlus: [
    ['path', { d: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7' }],
    ['line', { x1: '16', x2: '22', y1: '5', y2: '5' }],
    ['line', { x1: '19', x2: '19', y1: '2', y2: '8' }],
    ['circle', { cx: '9', cy: '9', r: '2' }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  ],

  CheckCircle2: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],

  Crosshair: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '22', x2: '18', y1: '12', y2: '12' }],
    ['line', { x1: '6',  x2: '2',  y1: '12', y2: '12' }],
    ['line', { x1: '12', x2: '12', y1: '6',  y2: '2'  }],
    ['line', { x1: '12', x2: '12', y1: '22', y2: '18' }],
  ],

  Trash2: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
    ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }],
  ],

  MapPin: [
    ['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }],
    ['circle', { cx: '12', cy: '10', r: '3' }],
  ],

  FileText: [
    ['path', { d: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
    ['line', { x1: '16', x2: '8', y1: '13', y2: '13' }],
    ['line', { x1: '16', x2: '8', y1: '17', y2: '17' }],
    ['line', { x1: '10', x2: '8', y1: '9',  y2: '9'  }],
  ],

  Pencil: [
    ['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],

  Download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }],
  ],

  Trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  ],

  StickyNote: [
    ['path', { d: 'M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z' }],
    ['path', { d: 'M15 3v6h6' }],
  ],

  KeyRound: [
    ['path', { d: 'M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z' }],
    ['circle', { cx: '16.5', cy: '7.5', r: '.5' }],
  ],

  Map: [
    ['polygon', { points: '3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21' }],
    ['line', { x1: '9',  x2: '9',  y1: '3',  y2: '18' }],
    ['line', { x1: '15', x2: '15', y1: '6',  y2: '21' }],
  ],

  ClipboardList: [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M12 11h4' }],
    ['path', { d: 'M12 16h4' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 16h.01' }],
  ],

  Copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],

  CircleUser: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['circle', { cx: '12', cy: '10', r: '3'  }],
    ['path', { d: 'M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662' }],
  ],

  Circle: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
  ],

  Plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],

  MapPinned: [
    ['path', { d: 'M18 8c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 0 1 12 0' }],
    ['circle', { cx: '12', cy: '8', r: '2' }],
    ['path', { d: 'M8.835 14H5a1 1 0 0 0-.9.7l-2 6c-.1.1-.1.2-.1.3 0 .6.4 1 1 1h18c.6 0 1-.4 1-1 0-.1 0-.2-.1-.3l-2-6a1 1 0 0 0-.9-.7h-3.835' }],
  ],

  ChevronDown: [
    ['path', { d: 'm6 9 6 6 6-6' }],
  ],

  // — v0.4 "Ledger" —

  Search: [
    ['circle', { cx: '11', cy: '11', r: '8' }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],

  Folder: [
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],

  FolderCheck: [
    ['path', { d: 'M20 12V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L7.6 3.9A2 2 0 0 0 5.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h7' }],
    ['path', { d: 'm16 19 2 2 4-4' }],
  ],

  Settings: [
    ['path', { d: 'M20 7h-9' }],
    ['path', { d: 'M14 17H5' }],
    ['circle', { cx: '17', cy: '17', r: '3' }],
    ['circle', { cx: '7',  cy: '7',  r: '3' }],
  ],

  HardDrive: [
    ['line', { x1: '22', x2: '2', y1: '12', y2: '12' }],
    ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }],
    ['line', { x1: '6',  x2: '6.01',  y1: '16', y2: '16' }],
    ['line', { x1: '10', x2: '10.01', y1: '16', y2: '16' }],
  ],

  Camera: [
    ['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }],
    ['circle', { cx: '12', cy: '13', r: '3' }],
  ],

  Minimize2: [
    ['polyline', { points: '4 14 10 14 10 20' }],
    ['polyline', { points: '20 10 14 10 14 4' }],
    ['line', { x1: '14', x2: '21', y1: '10', y2: '3' }],
    ['line', { x1: '3',  x2: '10', y1: '21', y2: '14' }],
  ],

  Maximize2: [
    ['polyline', { points: '15 3 21 3 21 9' }],
    ['polyline', { points: '9 21 3 21 3 15' }],
    ['line', { x1: '21', x2: '14', y1: '3',  y2: '10' }],
    ['line', { x1: '3',  x2: '10', y1: '21', y2: '14' }],
  ],

  Send: [
    ['path', { d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z' }],
    ['path', { d: 'm21.854 2.147-10.94 10.939' }],
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
};

/**
 * Renders an inline SVG icon from the bundled Lucide path set.
 * Use the `.qa-animate-spin` class on `<Icon name="Loader2">` for spinners.
 */
export function Icon({
  name,
  size = 24,
  className,
  style,
  strokeWidth = 2,
}: IconProps): React.ReactElement {
  const descriptors = ICONS[name];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {descriptors.map(([tag, rawAttrs], idx) =>
        renderSvgElement(tag, rawAttrs, idx),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Internal helper — render a single SVG child element
// ---------------------------------------------------------------------------

function renderSvgElement(
  tag: string,
  attrs: SvgAttrs,
  key: number,
): React.ReactElement {
  // Use React.createElement with a liberal cast — we control the tag names
  // and attribute values, so this is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.createElement(tag as any, { key, ...attrs });
}

export default Icon;
