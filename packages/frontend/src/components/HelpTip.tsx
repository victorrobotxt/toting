import Tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { useEffect, useRef } from 'react';

export default function HelpTip({ content }: { content: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) Tippy(ref.current, { content });
  }, [content]);
  return (
    <span ref={ref} style={{cursor:'pointer',border:'1px solid',borderRadius:'50%',padding:'0 4px',marginLeft:'4px'}} aria-label="help">?</span>
  );
}
