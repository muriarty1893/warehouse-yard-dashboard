import { House, Map as MapIcon, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { useView } from '../../state/view';
import { Card, IconButton } from '../kit';

/** Camera buttons at the right edge of the yard view (zoom, rotate, home, top-down). */
export function CameraStrip() {
  const send = useView((s) => s.send);
  return (
    <Card className="flex flex-col items-center gap-0.5 p-1">
      <IconButton title="Zoom in (Z)" onClick={() => send({ kind: 'zoom', factor: 0.7 })}>
        <Plus size={17} />
      </IconButton>
      <IconButton title="Zoom out (X)" onClick={() => send({ kind: 'zoom', factor: 1.4 })}>
        <Minus size={17} />
      </IconButton>
      <div className="my-0.5 h-px w-6 bg-line" />
      <IconButton title="Rotate left (Q)" onClick={() => send({ kind: 'rotate', angle: Math.PI / 6 })}>
        <RotateCcw size={16} />
      </IconButton>
      <IconButton title="Rotate right (E)" onClick={() => send({ kind: 'rotate', angle: -Math.PI / 6 })}>
        <RotateCw size={16} />
      </IconButton>
      <IconButton title="Home view (H)" onClick={() => send({ kind: 'home' })}>
        <House size={16} />
      </IconButton>
      <IconButton title="Top-down view (T)" onClick={() => send({ kind: 'top' })}>
        <MapIcon size={16} />
      </IconButton>
    </Card>
  );
}
