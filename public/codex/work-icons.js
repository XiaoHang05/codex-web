// Fine outlined icons for work history; paths are static, never message HTML.
const paths={
 commandExecution:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 8 3 3-3 3m6 1h4"/>',
 fileChange:'<path d="m14.5 4.5 5 5M4 20l1.5-6L16 3.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L10 18.5 4 20Z"/>',
 imageView:'<rect x="6" y="3" width="15" height="15" rx="3"/><path d="m6 12 4-4 4 4 3-3 4 4M3 8l-1 11a3 3 0 0 0 3 3l11-1"/><circle cx="16.5" cy="7" r="1"/>',
 webSearch:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M3 10h14M10 3c-4 4-4 10 0 14 4-4 4-10 0-14Z"/>',
 mcpToolCall:'<path d="m8 15-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m4 1 2-2a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0m-5-1 10-10"/>',
 collabAgentToolCall:'<circle cx="8" cy="7" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 5 5v1"/>',
 reasoning:'<path d="M9 17h6m-6 3h6M8 14c-5-4-2-12 4-12s9 8 4 12l-1 3H9l-1-3Z"/>',
 contextCompaction:'<path d="M4 3h16M4 21h16m-8-15v12m-4-8 4-4 4 4m-8 4 4 4 4-4"/>',
 plan:'<path d="m3 6 2 2 3-4m3 2h10M3 13l2 2 3-4m3 2h10M3 20l2 2 3-4m3 2h10"/>'
};
export function workIcon(type){const icon=document.createElement('span');icon.className='work-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" focusable="false">'+(paths[type]||paths.mcpToolCall)+'</svg>';return icon;}
