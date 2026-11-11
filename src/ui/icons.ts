/** Small hand-drawn stroke icon set (24x24). */
const P: Record<string, string> = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  journey: '<path d="M4 18c3-6 6 2 9-4s4-6 7-8"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="6" r="1.6"/>',
  hangar: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  logbook: '<path d="M6 3h11a1 1 0 0 1 1 1v16H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M5 18a2 2 0 0 1 2-2h11M9 7h6M9 10.5h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.7M12 17h.01"/>',
  story: '<path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z"/><path d="M12 6v13.5"/>',
  exit: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h9"/>',
  shuffle: '<path d="M3 7h3.5c4 0 5 10 9 10H21M17.5 14l3.5 3-3.5 3M3 17h3.5c1.4 0 2.4-1.2 3.2-2.7M21 7h-5.5c-1.4 0-2.4 1.2-3.2 2.7M17.5 4l3.5 3-3.5 3"/>',
  dash: '<path d="M4 8h9M2 12h11M4 16h9M15 6l6 6-6 6"/>',
  pulse: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  flare: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  missions: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  shard: '<path d="M12 2.5 18 9l-6 12.5L6 9z"/><path d="M6 9h12M12 2.5 9.5 9 12 21.5 14.5 9z"/>',
};

export function icon(name: keyof typeof P | string, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
