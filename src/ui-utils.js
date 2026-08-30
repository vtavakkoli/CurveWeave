function text(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function commandSearchText(command) {
  return text([
    command.label,
    command.group,
    command.keywords,
    command.shortcut
  ].filter(Boolean).join(' '));
}

export function scoreCommand(query, command) {
  const q = text(query);
  if (!q) return Number(command.priority || 0);
  const label = text(command.label);
  const haystack = commandSearchText(command);
  if (!haystack) return -1;
  if (label === q) return 10000 + Number(command.priority || 0);
  if (label.startsWith(q)) return 7000 - label.length + q.length + Number(command.priority || 0);
  const labelWords = label.split(' ');
  if (labelWords.some(word => word.startsWith(q))) return 5500 + Number(command.priority || 0);
  const direct = haystack.indexOf(q);
  if (direct >= 0) return 4000 - direct + Number(command.priority || 0);
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.every(token => haystack.includes(token))) {
    return 2500 + tokens.reduce((score, token) => score + (label.includes(token) ? 25 : 5), 0) + Number(command.priority || 0);
  }
  return -1;
}

export function searchCommands(commands, query, limit = 40) {
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(query, command) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map(item => item.command);
}

export function groupCommands(commands) {
  const groups = new Map();
  commands.forEach(command => {
    const group = command.group || 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
  });
  return groups;
}
