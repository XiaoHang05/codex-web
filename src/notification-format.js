const truncate = (value, limit) => Array.from(String(value || '')).slice(0, limit).join('');
export function excerpt(value, limit = 300) {
  return truncate(String(value || '').replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;]*m/g, '').trim(), limit);
}
export function projectName(cwd, fallback = '未指定项目') {
  return String(cwd || '').replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || fallback;
}
export function notification(event) {
  const status = {completed:'已完成',approval:'需要确认',question:'需要确认',failed:'执行失败'}[event.kind] || '状态更新';
  const agent = 'Codex';
  const singleLine=value=>String(value||'').replace(/[\r\n\t]+/g,' ').trim();
  const title=truncate(`${agent} · ${truncate(singleLine(event.projectName || projectName(event.cwd)),60)} · ${status}`,100);
  const threadName=truncate(singleLine(event.threadName)||'未命名会话',70);
  const heading=`${title} · ${threadName}`;
  return {...event,title,content:heading+'\n'+excerpt(event.summary || event.content || '打开会话查看详情',Math.max(0,300-heading.length-1))};
}
export function approvalSummary(data = {}, method = '', item = {}) {
  const command = data.command || item.command;
  const parts = [];
  if (command) parts.push('执行命令：' + (Array.isArray(command) ? command.join(' ') : command));
  const changes = item.changes || data.changes || data.fileChanges;
  if (changes) parts.push('修改文件：' + (Array.isArray(changes) ? changes.map(c=>c.path || c.filePath || c).join('、') : Object.keys(changes).join('、')));
  if (data.file_path || data.filePath || data.path) parts.push('操作文件：' + (data.file_path || data.filePath || data.path));
  if (data.grantRoot) parts.push('申请访问：' + data.grantRoot);
  if (data.permissions) parts.push('申请权限：' + JSON.stringify(data.permissions));
  for (const q of data.questions || []) parts.push(q.question || q.header || q.title || '等待你的回答');
  if (data.reason || data.message) parts.push(data.reason || data.message);
  if (!parts.length) parts.push(data.toolName ? '审批工具：' + data.toolName : method.includes('requestUserInput') ? 'Agent 正在等待你的回答' : 'Agent 正在等待你确认操作');
  return excerpt(parts.join('\n'));
}
