(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const fail = message => { throw new Error(message); };
  const validPath = name => typeof name === 'string' && /^[\w.-]+(?:\/[\w.-]+)*$/.test(name) && !name.split('/').some(p => p === '..' || p === '.' || p.toLowerCase() === '.git') && !['__proto__','constructor','prototype'].includes(name);
  const validBranch = name => /^[a-zA-Z0-9][\w./-]*$/.test(name || '') && !name.includes('..') && !name.includes('//') && !name.endsWith('/') && !name.endsWith('.') && !name.endsWith('.lock') && !['HEAD','__proto__','constructor','prototype'].includes(name);
  const headId = repo => repo.head.branch ? repo.branches[repo.head.branch] : repo.head.detached;
  const headCommit = repo => repo.commits.find(c => c.id === headId(repo));
  const headFiles = repo => headCommit(repo)?.files || {};
  const paths = (...trees) => [...new Set(trees.flatMap(t => Object.keys(t || {})))].sort();
  function fresh(files, initialized = true) {
    return { initialized, files: clone(files || {}), index: {}, commits: [], branches: { main: null }, head: { branch: 'main', detached: null }, conflicts: [], mergeParents: null, stash: [], remotes: {}, remoteBranches: {}, tags: {}, events: {}, seq: 0, meta: {}, config: { 'user.name': 'Explorer', 'user.email': 'explorer@gitquest.local' } };
  }
  function event(repo, name) { repo.events[name] = (repo.events[name] || 0) + 1; }
  function moveHead(repo, id) { if (repo.head.branch) repo.branches[repo.head.branch] = id; else repo.head.detached = id; }
  function commit(repo, message, parents) {
    const n = ++repo.seq;
    let hash = 2166136261;
    for (const char of JSON.stringify([n,message,parents || headId(repo),repo.index])) { hash ^= char.charCodeAt(0); hash = Math.imul(hash,16777619); }
    const id = (hash >>> 0).toString(16).padStart(8,'0').slice(0,7);
    const item = { id, message, parents: parents || (headId(repo) ? [headId(repo)] : []), files: clone(repo.index), author: repo.config['user.name'] };
    repo.commits.push(item); moveHead(repo, id); repo.mergeParents = null; repo.conflicts = [];
    return item;
  }
  function seed(repo, message, files, parents) { if (files) repo.files = clone(files); repo.index = clone(repo.files); return commit(repo, message, parents); }
  function baseRepo() { const repo = fresh({ 'README.md': '# Field Notes\nVersion one.\n' }); seed(repo, 'Start field notes'); return repo; }
  function changes(repo) {
    const base = headFiles(repo);
    return { staged: paths(base, repo.index).filter(p => base[p] !== repo.index[p]), modified: paths(repo.files, repo.index).filter(p => repo.files[p] !== repo.index[p] && (own(repo.index,p) || own(base,p))), untracked: Object.keys(repo.files).filter(p => !own(repo.index,p) && !own(base,p)), conflicts: repo.conflicts.slice() };
  }
  function clean(repo) { const c = changes(repo); return !c.staged.length && !c.modified.length && !c.untracked.length && !c.conflicts.length; }
  function ref(repo, value) {
    if (!value) fail('Provide a commit or branch, such as HEAD or HEAD~1.');
    const match = value.match(/^(.*?)(?:~(\d+)|\^(\d*))?$/);
    const key = match[1];
    let id = key === 'HEAD' ? headId(repo) : own(repo.branches,key) ? repo.branches[key] : own(repo.remoteBranches,key) ? repo.remoteBranches[key] : own(repo.tags,key) ? repo.tags[key] : null;
    if (!id) { const found = repo.commits.filter(c => c.id.startsWith(key)); if (found.length === 1) id = found[0].id; }
    if (!id) fail(`Unknown revision '${value}'. Use git log --oneline to see commits.`);
    if (match[2] !== undefined) for (let n = 0; n < Number(match[2]); n++) { id = repo.commits.find(c => c.id === id)?.parents[0]; if (!id) fail(`Revision '${value}' goes before the first commit.`); }
    if (match[3] !== undefined) { const parent = Number(match[3] || 1); if (parent) { id = repo.commits.find(c => c.id === id)?.parents[parent - 1]; if (!id) fail(`Revision '${value}' has no such parent.`); } }
    return id;
  }
  function ancestors(repo, id) { const seen = new Set(); function walk(current) { if (!current || seen.has(current)) return; seen.add(current); repo.commits.find(c => c.id === current)?.parents.forEach(walk); } walk(id); return seen; }
  function requireClean(repo) { if (!clean(repo)) fail('Your working directory has changes. Commit or stash them before switching or merging.'); }
  function switchTo(repo, name, create) {
    const previousId = headId(repo), previousFiles = clone(repo.files), previousIndex = clone(repo.index);
    if (create) { if (!validBranch(name)) fail('Use a simple branch name, such as field-notes.'); if (own(repo.branches,name)) fail(`Branch '${name}' already exists.`); repo.branches[name] = headId(repo); event(repo,'branch'); }
    if (own(repo.branches,name)) {
      if (repo.branches[name] !== headId(repo)) requireClean(repo);
      repo.head = { branch: name, detached: null };
    } else { if (create) fail('Unable to create branch.'); const id = ref(repo,name); requireClean(repo); repo.head = { branch: null, detached: id }; }
    if (headId(repo) === previousId) { repo.files = previousFiles; repo.index = previousIndex; }
    else { repo.files = clone(headFiles(repo)); repo.index = clone(repo.files); }
    event(repo,'switch');
    return { output: repo.head.branch ? `Switched to ${create ? 'a new ' : ''}branch '${name}'.` : `HEAD is now at ${headId(repo)} (detached).`, action: 'switch', view: 'history' };
  }
  function merge(repo, name) {
    requireClean(repo);
    const target = ref(repo,name), ours = headId(repo);
    if (ancestors(repo,ours).has(target)) return { output: 'Already up to date.', action: 'inspect', view: 'history' };
    if (!ours || ancestors(repo,target).has(ours)) {
      moveHead(repo,target); repo.files = clone(headFiles(repo)); repo.index = clone(repo.files); event(repo,'merge');
      return { output: `Updating ${ours || '(empty)'}..${target}\nFast-forward\nYour branch now includes the changes from ${name}.`, action: 'merge', view: 'history' };
    }
    const theirs = repo.commits.find(c => c.id === target).files;
    const theirsAncestors = ancestors(repo,target);
    const baseId = repo.commits.slice().reverse().find(c => ancestors(repo,ours).has(c.id) && theirsAncestors.has(c.id))?.id;
    if (!baseId) fail('These branches have unrelated histories.');
    const base = repo.commits.find(c => c.id === baseId).files;
    const oursTree = headFiles(repo), merged = clone(oursTree);
    repo.mergeParents = [ours,target]; repo.conflicts = [];
    for (const p of paths(base,oursTree,theirs)) {
      if (oursTree[p] === theirs[p] || theirs[p] === base[p]) continue;
      if (oursTree[p] === base[p]) { if (own(theirs,p)) merged[p] = theirs[p]; else delete merged[p]; }
      else { repo.conflicts.push(p); merged[p] = `<<<<<<< HEAD\n${oursTree[p] || ''}${(oursTree[p] || '').endsWith('\n') ? '' : '\n'}=======\n${theirs[p] || ''}${(theirs[p] || '').endsWith('\n') ? '' : '\n'}>>>>>>> ${name}\n`; }
    }
    repo.files = clone(merged); repo.index = clone(merged); repo.conflicts.forEach(p => { if (own(oursTree,p)) repo.index[p] = oursTree[p]; else delete repo.index[p]; }); event(repo,'merge');
    if (repo.conflicts.length) { event(repo,'conflict'); return { output: `CONFLICT (content): Merge conflict in ${repo.conflicts.join(', ')}\nAutomatic merge paused. Edit the file, remove conflict markers, then git add and git commit.`, type: 'error', action: 'conflict', view: 'workspace' }; }
    const item = commit(repo,`Merge branch '${name}'`,[ours,target]);
    return { output: `Merge made by a three-way merge.\n[${repo.head.branch} ${item.id}] ${item.message}`, action: 'merge', view: 'history' };
  }
  function tokenize(line) {
    const tokens = []; let token = '', quote = null, started = false;
    for (let i=0;i<line.length;i++) {
      const c=line[i];
      if (c==='\\' && quote === '"' && i+1<line.length && ['n','t','"','\\'].includes(line[i+1])) { const next=line[++i]; token += next==='n' ? '\n' : next==='t' ? '\t' : next; started=true; }
      else if (quote) { if (c===quote) quote=null; else token+=c; started=true; }
      else if (c==='"' || c==="'") { quote=c; started=true; }
      else if (/\s/.test(c)) { if (started) { tokens.push(token); token=''; started=false; } }
      else { token+=c; started=true; }
    }
    if (quote) fail('Close the quotation mark before running this command.');
    if (started) tokens.push(token); return tokens;
  }
  function diffText(before, after, selected) {
    const changed = paths(before,after).filter(p => before[p] !== after[p] && (!selected || selected.includes(p)));
    if (!changed.length) return 'No differences.';
    return changed.map(p => `diff --git a/${p} b/${p}\n--- ${own(before,p) ? 'a/'+p : '/dev/null'}\n+++ ${own(after,p) ? 'b/'+p : '/dev/null'}\n${(before[p] || '').split('\n').filter((v,i,a) => i<a.length-1 || v).map(l => '-'+l).join('\n')}\n${(after[p] || '').split('\n').filter((v,i,a) => i<a.length-1 || v).map(l => '+'+l).join('\n')}`).join('\n\n');
  }
  function restore(repo,args,checkout) {
    const staged=args.includes('--staged'); const sourceIndex=args.indexOf('--source');
    let source = staged ? headFiles(repo) : repo.index;
    if (sourceIndex>=0) source=repo.commits.find(c => c.id===ref(repo,args[sourceIndex+1])).files;
    const selected=args.filter((a,i) => !a.startsWith('-') && !(sourceIndex>=0 && i===sourceIndex+1));
    if (!selected.length) fail(`Provide a file, for example git ${checkout ? 'checkout --' : 'restore'} README.md.`);
    const target=staged ? repo.index : repo.files;
    for (const p of selected.includes('.') ? paths(target,source) : selected) {
      if (!own(source,p) && !own(target,p)) fail(`Path '${p}' does not exist.`);
      if (own(source,p)) target[p]=source[p]; else delete target[p];
    }
    event(repo,staged ? 'unstage' : 'restore');
    return { output: staged ? 'Changes removed from the staging area. Your edited files are still in the working directory.' : 'Working directory restored from the staging area.', action: staged ? 'unstage' : 'restore', view: 'workspace' };
  }
  function execute(repo,line) {
    const t=tokenize(line); if (!t.length) return { output: '' };
    if (['ls','dir'].includes(t[0])) return { output: Object.keys(repo.files).sort().join('\n') || '(empty directory)', action:'inspect' };
    if (t[0]==='cat') { if (!own(repo.files,t[1])) fail(`File '${t[1] || ''}' does not exist.`); return { output:repo.files[t[1]] }; }
    if (t[0]==='touch' || t[0]==='edit' || t[0]==='echo') {
      let name, content;
      if (t[0]==='echo') { const at=t.indexOf('>'); if (at<0 || at!==t.length-2) fail('Use echo "your text" > notes.txt, or open a file in the visual workspace.'); name=t[at+1]; content=t.slice(1,at).join(' ')+'\n'; }
      else { name=t[1]; content=t[0]==='touch' ? (repo.files[name] || '') : t.slice(2).join(' '); if (t[0]==='edit' && t.length<3) fail('Use edit README.md "new contents", or select a file to open the editor.'); }
      if (!validPath(name)) fail('Use a relative file name, such as notes.txt or docs/ideas.md. The .git folder is reserved.');
      repo.files[name]=content; event(repo,'edit'); return { output:`Saved ${name} in your working directory.`, action:'edit', view:'workspace' };
    }
    if (t[0]==='rm') { if (!own(repo.files,t[1])) fail('That file does not exist.'); delete repo.files[t[1]]; event(repo,'edit'); return { output:`Removed ${t[1]} from your working directory.`, action:'edit', view:'workspace' }; }
    if (t[0]!=='git') fail(`'${t[0]}' is not part of this practice terminal. Type help to see available commands.`);
    const command=t[1],args=t.slice(2);
    if (command==='init') { const was=repo.initialized; repo.initialized=true; event(repo,'init'); return { output:`${was ? 'Reinitialized existing' : 'Initialized empty'} Git repository in ~/first-repo/.git/\nThe .git directory stores your repository history.`, action:'init', view:'workspace' }; }
    if (command==='--version' || command==='version') return { output:'GitQuest practice engine 1.0 (offline simulation)' };
    if (!repo.initialized) fail('Not a Git repository yet. Run git init to create one.');
    if (command==='status') {
      const c=changes(repo); event(repo,'status');
      let out=`${repo.head.branch ? 'On branch '+repo.head.branch : 'HEAD detached at '+headId(repo)}\n`;
      if (!repo.commits.length) out+='\nNo commits yet.\n';
      if (c.conflicts.length) out+='\nUnmerged paths:\n'+c.conflicts.map(p=>'  both modified: '+p).join('\n')+'\n';
      if (c.staged.length) out+='\nChanges to be committed:\n'+c.staged.filter(p=>!c.conflicts.includes(p)).map(p=>`  ${!own(headFiles(repo),p) ? 'new file' : !own(repo.index,p) ? 'deleted' : 'modified'}: ${p}`).join('\n')+'\n';
      if (c.modified.length) out+='\nChanges not staged for commit:\n'+c.modified.filter(p=>!c.conflicts.includes(p)).map(p=>`  ${own(repo.files,p) ? 'modified' : 'deleted'}: ${p}`).join('\n')+'\n';
      if (c.untracked.length) out+='\nUntracked files:\n'+c.untracked.map(p=>'  '+p).join('\n')+'\n';
      if (clean(repo)) out+='\nnothing to commit, working tree clean';
      return { output:out.trim(), action:'status', view:'workspace' };
    }
    if (command==='add') {
      if (!args.length) fail('Choose what to stage: git add README.md, or git add . for all files.');
      const selected=args.includes('.') || args.includes('-A') || args.includes('--all') ? paths(repo.files,repo.index) : args;
      for (const p of selected) { if (!own(repo.files,p) && !own(repo.index,p)) fail(`Path '${p}' did not match any files.`); if (own(repo.files,p)) repo.index[p]=repo.files[p]; else delete repo.index[p]; repo.conflicts=repo.conflicts.filter(f=>f!==p); }
      event(repo,'add'); return { output:`Staged ${selected.length} ${selected.length===1 ? 'file' : 'files'}. The staging area is a snapshot of your selection.`, action:'add', view:'workspace' };
    }
    if (command==='commit') {
      const at=args.indexOf('-m')>=0 ? args.indexOf('-m') : args.indexOf('--message');
      if (at<0 || !args[at+1]?.trim()) fail('Add a meaningful message: git commit -m "Start field notes".');
      if (repo.conflicts.length) fail('Resolve and stage the conflicted files before committing.');
      if (args.includes('-a') || args.includes('--all')) { for (const p of paths(repo.index,headFiles(repo))) { if (own(repo.files,p)) repo.index[p]=repo.files[p]; else delete repo.index[p]; } }
      if (equal(repo.index,headFiles(repo)) && !repo.mergeParents) fail('Nothing staged to commit. Use git add to choose your changes first.');
      const item=commit(repo,args[at+1],repo.mergeParents || undefined); event(repo,'commit');
      return { output:`[${repo.head.branch || 'detached HEAD'} ${item.id}] ${item.message}\n${Object.keys(item.files).length} tracked ${Object.keys(item.files).length===1 ? 'file' : 'files'} in this checkpoint.`, type:'success', action:'commit', view:'history' };
    }
    if (command==='diff') { const staged=args.includes('--staged') || args.includes('--cached'); event(repo,staged ? 'diffStaged' : 'diff'); return { output:diffText(staged ? headFiles(repo) : repo.index,staged ? repo.index : Object.fromEntries(Object.entries(repo.files).filter(([p])=>own(repo.index,p))),args.filter(a=>!a.startsWith('-'))), action:staged ? 'diffStaged' : 'diff', view:'workspace' }; }
    if (command==='log') { event(repo,'log'); const reachable=ancestors(repo,headId(repo)); return { output:repo.commits.slice().reverse().filter(c=>reachable.has(c.id)).map(c=>args.includes('--oneline') ? `${args.includes('--graph') ? '* ' : ''}${c.id} ${c.message}` : `commit ${c.id}${headId(repo)===c.id ? ' (HEAD → '+(repo.head.branch || 'detached')+')' : ''}\nAuthor: ${c.author}\n\n    ${c.message}`).join('\n\n') || 'No commits yet. Create your first checkpoint with git commit.', action:'log', view:'history' }; }
    if (command==='show') { const id=ref(repo,args.find(a=>!a.startsWith('-')) || 'HEAD'),item=repo.commits.find(c=>c.id===id),base=repo.commits.find(c=>c.id===item.parents[0])?.files || {}; event(repo,'show'); return { output:`commit ${id}\n${item.message}\n\n${diffText(base,item.files)}`, action:'show', view:'history' }; }
    if (command==='branch') { if (!args.length || args[0]==='-a') return { output:Object.entries(repo.branches).map(([b])=>`${b===repo.head.branch ? '*' : ' '} ${b}`).concat(args[0]==='-a' ? Object.keys(repo.remoteBranches).map(b=>'  remotes/'+b) : []).join('\n'), action:'inspect', view:'history' }; if (args[0].startsWith('-')) fail('This lab supports git branch <name> and git branch -a.'); const name=args[0]; if (!validBranch(name)) fail('Use a simple branch name, such as field-notes.'); if (own(repo.branches,name)) fail(`Branch '${name}' already exists.`); if (!headId(repo)) fail('Make a first commit before creating another branch.'); repo.branches[name]=args[1] ? ref(repo,args[1]) : headId(repo); event(repo,'branch'); return { output:`Created branch '${name}' at ${repo.branches[name]}. You are still on ${repo.head.branch}.`, action:'branch', view:'history' }; }
    if (command==='switch' || command==='checkout') { if (command==='checkout' && args.includes('--')) return restore(repo,args.slice(args.indexOf('--')+1),true); if (!args.length) fail('Choose a branch: git switch field-notes.'); return switchTo(repo,args.includes('-c') || args.includes('-b') ? args[1] : args[0],args.includes('-c') || args.includes('-b')); }
    if (command==='merge') { if (args[0]==='--abort') { if (!repo.mergeParents) fail('There is no merge to abort.'); repo.files=clone(headFiles(repo));repo.index=clone(repo.files);repo.conflicts=[];repo.mergeParents=null; return { output:'Merge aborted. Your branch is back at its previous checkpoint.',action:'restore',view:'workspace' }; } if (!args[0] || args[0].startsWith('-')) fail('Choose a branch to merge: git merge field-notes.'); return merge(repo,args[0]); }
    if (command==='restore') return restore(repo,args,false);
    if (command==='reset') {
      const mode=args.includes('--hard') ? 'hard' : args.includes('--soft') ? 'soft' : 'mixed';
      const targets=args.filter(a=>!a.startsWith('-'));
      if (targets.some(p=>own(repo.index,p) || own(repo.files,p))) return restore(repo,['--staged',...targets],false);
      const untrackedBeforeReset=Object.fromEntries(changes(repo).untracked.map(p=>[p,repo.files[p]]));
      const id=ref(repo,targets[0] || 'HEAD'); moveHead(repo,id);
      if (mode!=='soft') repo.index=clone(headFiles(repo));
      if (mode==='hard') { repo.files={...untrackedBeforeReset,...clone(repo.index)};repo.conflicts=[];repo.mergeParents=null; }
      event(repo,'reset'+mode); return { output:`HEAD is now at ${id}\n${mode==='soft' ? 'The commit was undone. Its changes are still staged.' : mode==='hard' ? 'Tracked working files and staging area match this commit.' : 'Changes remain in the working directory, unstaged.'}`,action:mode==='soft' ? 'reset' : 'restore',view:mode==='soft' ? 'history' : 'workspace' };
    }
    if (command==='revert') {
      requireClean(repo); const id=ref(repo,args[0] || 'HEAD'),item=repo.commits.find(c=>c.id===id);
      if (item.parents.length>1) fail('This practice lab reverts single-parent commits. Merge reverts require selecting a mainline parent.');
      const previous=repo.commits.find(c=>c.id===item.parents[0])?.files || {},tree=clone(headFiles(repo));
      for (const p of paths(previous,item.files).filter(p=>previous[p]!==item.files[p])) { if (tree[p]!==item.files[p]) fail(`Reverting ${id} would conflict in ${p}. Try the recovery mission's latest commit.`); if (own(previous,p)) tree[p]=previous[p]; else delete tree[p]; }
      repo.files=clone(tree); repo.index=clone(tree);const reverted=commit(repo,`Revert "${item.message}"`);event(repo,'revert');
      return { output:`[${repo.head.branch} ${reverted.id}] ${reverted.message}\nA new commit reverses the old change. History is preserved.`,action:'revert',view:'history' };
    }
    if (command==='stash') {
      const sub=args[0] || 'push';
      if (sub==='list') return { output:repo.stash.map((s,i)=>`stash@{${i}}: ${s.message}`).join('\n') || 'No stashed changes.' };
      if (sub==='push' || sub==='save') { if (clean(repo)) return {output:'No local changes to save.'}; if (repo.conflicts.length) fail('Resolve the merge conflict before stashing.'); const include=args.includes('-u') || args.includes('--include-untracked');const c=changes(repo);if (!c.staged.length && !c.modified.length && !include) return {output:'No tracked changes to save. Use git stash -u to include untracked files.'}; const at=args.indexOf('-m'),savedFiles=Object.fromEntries(Object.entries(repo.files).filter(([p])=>include || own(repo.index,p) || own(headFiles(repo),p))); repo.stash.unshift({files:clone(savedFiles),index:clone(repo.index),message:at>=0 ? args[at+1] : `WIP on ${repo.head.branch}`,untracked:include});const keep=include ? {} : Object.fromEntries(c.untracked.map(p=>[p,repo.files[p]])); repo.index=clone(headFiles(repo));repo.files={...clone(repo.index),...keep};event(repo,'stash');return {output:'Saved working directory and index to stash@{0}. Your changes are parked safely.',action:'stash',view:'workspace'}; }
      if (sub==='pop' || sub==='apply') { if (!repo.stash.length) fail('There is no stash to restore.');requireClean(repo);const s=repo.stash[0];repo.files={...repo.files,...clone(s.files)};for(const p of Object.keys(s.index))if(!own(s.files,p))delete repo.files[p];if(args.includes('--index'))repo.index=clone(s.index);if(sub==='pop')repo.stash.shift();event(repo,'stashPop');return {output:`Restored stashed changes to the working directory.${sub==='pop' ? '\nDropped stash@{0}.' : ''}`,action:'stashPop',view:'workspace'}; }
      if (sub==='-u' || sub==='--include-untracked') return execute(repo,'git stash push -u');
      fail('Use git stash, git stash list, or git stash pop.');
    }
    if (command==='remote') { if (!args.length || args[0]==='-v') return {output:Object.entries(repo.remotes).map(([name,r])=>`${name}\t${r.url}${args[0]==='-v' ? ' (fetch / push)' : ''}`).join('\n') || 'No remotes yet.',view:'remote',action:'inspect'};if(args[0]!=='add' || !validBranch(args[1]) || !args[2])fail('Use git remote add origin ../mission-control.git.');if(own(repo.remotes,args[1]))fail(`Remote '${args[1]}' already exists.`);repo.remotes[args[1]]={url:args[2],branches:{},commits:[]};event(repo,'remote');return {output:`Added local practice remote '${args[1]}'.\nThis address is simulated; no network connection is made.`,action:'remote',view:'remote'}; }
    if (command==='fetch' || command==='push' || command==='pull') {
      const positional=args.filter(a=>!a.startsWith('-')),name=positional[0] || 'origin',remote=repo.remotes[name];if(!remote)fail(`Remote '${name}' is not configured. Add it with git remote add.`);
      if(command==='push'){const branch=positional[1] || repo.head.branch;if(!own(repo.branches,branch) || !repo.branches[branch])fail('Choose a local branch with at least one commit.');const target=remote.branches[branch];if(target && !ancestors(repo,repo.branches[branch]).has(target))fail('Push rejected: the remote has changes you do not have. Fetch and merge (or pull) first.');const reachable=ancestors(repo,repo.branches[branch]);remote.commits=repo.commits.filter(c=>reachable.has(c.id)).map(clone);remote.branches[branch]=repo.branches[branch];repo.remoteBranches[name+'/'+branch]=repo.branches[branch];event(repo,'push');return {output:`To ${remote.url}\n  ${branch} → ${branch}\nYour local commits are now at mission control.`,action:'push',view:'remote'};}
      for(const item of remote.commits)if(!repo.commits.some(c=>c.id===item.id)){repo.commits.push(clone(item));repo.seq=Math.max(repo.seq,repo.commits.length);}
      for(const [branch,id] of Object.entries(remote.branches))repo.remoteBranches[name+'/'+branch]=id;
      event(repo,'fetch');
      if(command==='fetch')return {output:`From ${remote.url}\n${Object.keys(remote.branches).map(b=>'  '+b+' → '+name+'/'+b).join('\n')}\nRemote-tracking references updated. Your working files have not changed.`,action:'fetch',view:'remote'};
      const branch=positional[1] || repo.head.branch;const result=merge(repo,name+'/'+branch);event(repo,'pull');return {...result,output:`Fetched ${name}.\n${result.output}`,action:'pull',view:'remote'};
    }
    if(command==='tag'){if(!args.length)return{output:Object.keys(repo.tags).join('\n') || 'No tags yet.',view:'history'};if(!validBranch(args[0]))fail('Use git tag v1.0 to label a checkpoint.');if(own(repo.tags,args[0]))fail('That tag already exists.');repo.tags[args[0]]=ref(repo,args[1] || 'HEAD');event(repo,'tag');return{output:`Tagged ${repo.tags[args[0]]} as ${args[0]}. Tags stay at this checkpoint.`,action:'tag',view:'history'};}
    if(command==='config'){if(!['user.name','user.email'].includes(args[0]))fail('This lab supports git config user.name and user.email.');if(args.length===1)return{output:repo.config[args[0]]};repo.config[args[0]]=args[1];return{output:`Set ${args[0]} to ${args[1]}.`};}
    if(command==='rm'){const p=args.find(a=>!a.startsWith('-'));if(!own(repo.index,p))fail('git rm removes tracked files. Use rm for an untracked file.');delete repo.index[p];if(!args.includes('--cached'))delete repo.files[p];return{output:`rm '${p}'`,action:'add',view:'workspace'};}
    fail(`git ${command || ''} is not supported in this practice engine. Type help for the supported Git commands.`);
  }
  function run(repo,line) { const backup=clone(repo);try{return execute(repo,line);}catch(error){for(const key of Object.keys(repo))delete repo[key];Object.assign(repo,backup);return{output:error.message,type:'error',action:'error'};} }
  const chapters=[
    {name:'Foundations',label:'Build your first checkpoints.',description:'Meet the working directory, staging area, and repository.',icon:'◈',start:0,end:4,badge:'First steps'},
    {name:'Parallel worlds',label:'Give your ideas room to grow.',description:'Create branches, bring work together, and resolve conflicts.',icon:'⑂',start:5,end:9,badge:'Branch explorer'},
    {name:'Time travel',label:'A wrong turn is just a lesson.',description:'Park changes and safely recover from everyday mistakes.',icon:'↺',start:10,end:14,badge:'Time traveler'},
    {name:'Mission control',label:'Share your work. Make your mark.',description:'Meet remotes and put every skill together in a final lab.',icon:'✦',start:15,end:17,badge:'Git navigator'}
  ];
  const ev=(r,key)=>!!r.events[key];
  const objective=(text,test)=>({text,test});
  const levels=[
    {title:'Start a new story.',short:'Your first repository',description:'Every adventure needs a place to begin. Turn this ordinary folder into a Git repository, then take a look around.',commands:['git init','git status','help'],hints:['Run <code>git init</code> to create the hidden .git directory.','Run <code>git status</code> to see what Git knows about your files.'],setup:()=>fresh({'README.md':'# Field Notes\nA place for small ideas.\n'},false),objectives:[objective('Initialize your first Git repository.',r=>r.initialized),objective('Inspect your repository with <code>git status</code>.',r=>ev(r,'status'))]},
    {title:'Choose what comes along.',short:'The staging area',description:'Two files, one decision. Stage README.md for your next checkpoint. Leave notes.txt out for now.',commands:['git add README.md','git status','git diff --staged'],hints:['<code>git add README.md</code> copies that file into the staging area.','Use <code>git status</code>. Only README.md should be under “Changes to be committed”.'],setup:()=>fresh({'README.md':'# Field Notes\nA place for small ideas.\n','notes.txt':'Just a rough idea.\n'}),objectives:[objective('Stage <code>README.md</code> only.',r=>own(r.index,'README.md')&&!own(r.index,'notes.txt')),objective('Check your selection with <code>git status</code>.',r=>ev(r,'status'))]},
    {title:'Make it a checkpoint.',short:'Your first commit',description:'Your file is staged and ready. Save your first snapshot with a message that explains what you changed.',commands:['git commit -m "Start field notes"','git status'],hints:['Use <code>git commit -m "Start field notes"</code>. Quotes keep the message together.'],setup:()=>{const r=fresh({'README.md':'# Field Notes\nA place for small ideas.\n'});r.index=clone(r.files);return r;},objectives:[objective('Create a commit with a meaningful message.',r=>ev(r,'commit')&&r.commits.length>0),objective('Leave your working tree clean.',r=>r.commits.length>0&&clean(r))]},
    {title:'Spot the difference.',short:'Read your changes',description:'A new line has appeared in README.md. Inspect the difference, then stage and commit this new version.',commands:['git diff','git add README.md','git commit -m "Add the mission"'],hints:['<code>git diff</code> compares your working file with the staged version. + means added, − means removed.','Run <code>git add README.md</code>, then <code>git commit -m "Add the mission"</code>.'],setup:()=>{const r=baseRepo();r.files['README.md']+='Mission: learn Git.\n';return r;},objectives:[objective('Inspect the change with <code>git diff</code>.',r=>ev(r,'diff')),objective('Commit the new line in README.md.',r=>ev(r,'commit')&&headFiles(r)['README.md']?.includes('Mission: learn Git.')&&clean(r))]},
    {title:'Read the trail behind you.',short:'Explore your history',description:'Every checkpoint tells a story. Read your short commit history, then open the latest commit to see its changes.',commands:['git log --oneline','git show HEAD'],hints:['Use <code>git log --oneline</code> for a compact trail of commits.','Use <code>git show HEAD</code>. HEAD refers to your current checkpoint.'],setup:()=>{const r=baseRepo();r.files['README.md']+='Mission: learn Git.\n';seed(r,'Add the mission');return r;},objectives:[objective('Explore your history with <code>git log</code>.',r=>ev(r,'log')),objective('Inspect a checkpoint with <code>git show</code>.',r=>ev(r,'show'))]},
    {title:'Give an idea its own path.',short:'Create a branch',description:'Branches let you experiment from a shared starting point. Create field-notes without leaving main.',commands:['git branch field-notes','git branch'],hints:['<code>git branch field-notes</code> adds a new label at your current commit. It does not switch branches.'],setup:baseRepo,objectives:[objective('Create a branch named <code>field-notes</code>.',r=>own(r.branches,'field-notes')),objective('Keep HEAD on <code>main</code>.',r=>own(r.branches,'field-notes')&&r.head.branch==='main')]},
    {title:'Explore a parallel world.',short:'Switch & experiment',description:'Switch to field-notes. Create idea.txt with an idea of your own, then commit it on that branch.',commands:['git switch field-notes','edit idea.txt "A little idea."','git add idea.txt'],hints:['Run <code>git switch field-notes</code>. Select “New file” in the workspace to create idea.txt.','Stage idea.txt, then commit it with <code>git commit -m "Save an idea"</code>.'],setup:()=>{const r=baseRepo();r.branches['field-notes']=headId(r);r.meta.base=headId(r);return r;},objectives:[objective('Switch to <code>field-notes</code>.',r=>r.head.branch==='field-notes'),objective('Commit a nonempty <code>idea.txt</code> on that branch.',r=>r.head.branch==='field-notes'&&!!headFiles(r)['idea.txt']?.trim()&&r.branches.main===r.meta.base&&headId(r)!==r.meta.base)]},
    {title:'Bring your idea home.',short:'Fast-forward merge',description:'The field-notes branch has a new idea. Main has not moved. Merge field-notes into main and watch the label catch up.',commands:['git merge field-notes','git log --oneline --graph'],hints:['You are already on main. Run <code>git merge field-notes</code>. A fast-forward moves main to the newer commit.'],setup:()=>{const r=baseRepo(),base=headId(r);r.head.branch='field-notes';r.branches['field-notes']=base;r.files['idea.txt']='A little idea.\n';seed(r,'Save an idea');r.head.branch='main';r.files=clone(headFiles(r));r.index=clone(r.files);return r;},objectives:[objective('Merge <code>field-notes</code> into main.',r=>ev(r,'merge')&&r.head.branch==='main'&&headId(r)===r.branches['field-notes']),objective('Bring idea.txt into the main working directory.',r=>!!r.files['idea.txt'])]},
    {title:'Two paths. One story.',short:'Three-way merge',description:'Main and field-notes have both moved forward, in different files. Merge them and create a checkpoint with two parents.',commands:['git merge field-notes','git log --oneline --graph'],hints:['Run <code>git merge field-notes</code>. Git uses the shared ancestor to combine these independent changes.'],setup:()=>diverged(false),objectives:[objective('Create a merge commit with two parents.',r=>ev(r,'merge')&&headCommit(r)?.parents.length===2),objective('Keep both the updated README and idea.txt.',r=>r.files['README.md']?.includes('Welcome, explorer.')&&!!r.files['idea.txt']&&clean(r))]},
    {title:'Find the common ground.',short:'Resolve a conflict',description:'Both branches edited the same file. Merge field-notes, then resolve README.md to say “Space for every idea.” Remove the conflict markers, stage, and commit.',commands:['git merge field-notes','git status','git add README.md'],hints:['First run <code>git merge field-notes</code>. Select README.md to open its conflict markers in the editor.','Replace the contents with <code># Field Notes\nSpace for every idea.</code>, then save, add, and commit.'],setup:()=>diverged(true),objectives:[objective('Encounter the merge conflict.',r=>ev(r,'conflict')),objective('Commit the resolution with “Space for every idea.”',r=>headCommit(r)?.parents.length===2&&r.files['README.md']?.includes('Space for every idea.')&&!/<<<<<<<|=======|>>>>>>>/.test(r.files['README.md'])&&clean(r))]},
    {title:'Park it. Come back fresh.',short:'Stash your work',description:'You have unfinished edits. Stash them to get a clean workspace, then bring them back when you are ready.',commands:['git stash','git stash list','git stash pop'],hints:['<code>git stash</code> parks tracked changes and returns your files to HEAD.','<code>git stash pop</code> brings your edits back and removes the stash entry.'],setup:()=>{const r=baseRepo();r.files['README.md']+='A thought for later.\n';return r;},objectives:[objective('Park your unfinished changes with <code>git stash</code>.',r=>ev(r,'stash')),objective('Restore your changes with <code>git stash pop</code>.',r=>ev(r,'stashPop')&&r.files['README.md']?.includes('A thought for later.')&&r.stash.length===0)]},
    {title:'Undo a little wrong turn.',short:'Restore a file',description:'README.md has an accidental edit. Inspect it, then discard that edit by restoring the version in the staging area.',commands:['git diff','git restore README.md'],hints:['<code>git restore README.md</code> replaces the working file with its staged version. Unsaved edits to that file are discarded.'],setup:()=>{const r=baseRepo();r.files['README.md']='Oops. This was an accidental edit.\n';return r;},objectives:[objective('Inspect the accidental edit with <code>git diff</code>.',r=>ev(r,'diff')),objective('Restore README.md to the saved version.',r=>ev(r,'restore')&&equal(r.files,headFiles(r)))]},
    {title:'Keep the idea. Unpick it.',short:'Unstage changes',description:'You staged a rough draft too soon. Remove README.md from your next commit without losing its edited contents.',commands:['git status','git restore --staged README.md','git diff'],hints:['Use <code>git restore --staged README.md</code>. This copies HEAD into the staging area while keeping your working file.'],setup:()=>{const r=baseRepo();r.files['README.md']+='A rough draft, not ready yet.\n';r.index=clone(r.files);return r;},objectives:[objective('Unstage README.md.',r=>ev(r,'unstage')&&equal(r.index,headFiles(r))),objective('Keep the rough draft in your working file.',r=>r.files['README.md']?.includes('A rough draft, not ready yet.'))]},
    {title:'Rewind without losing work.',short:'Soft reset',description:'Your last local commit came a little too soon. Move back one checkpoint while keeping its changes staged, ready to improve.',commands:['git log --oneline','git reset --soft HEAD~1','git status'],hints:['Use <code>git reset --soft HEAD~1</code>. ~1 means the first parent, one commit back.','A soft reset moves the branch label. The staging area and your working files stay as they were.'],setup:()=>{const r=baseRepo();r.meta.base=headId(r);r.files['README.md']+='An unfinished chapter.\n';seed(r,'Draft a chapter');return r;},objectives:[objective('Soft-reset to the previous commit.',r=>ev(r,'resetsoft')&&headId(r)===r.meta.base),objective('Keep the undone change staged.',r=>changes(r).staged.includes('README.md')&&r.index['README.md']?.includes('An unfinished chapter.'))]},
    {title:'Make history. Keep history.',short:'Revert a commit',description:'A committed change needs to be undone safely. Revert the latest commit to create a new checkpoint that reverses it.',commands:['git log --oneline','git revert HEAD','git show HEAD'],hints:['Run <code>git revert HEAD</code>. Revert makes a new commit; it does not erase the old one.'],setup:()=>{const r=baseRepo();r.meta.original=clone(r.files);r.files['README.md']='A change we need to undo.\n';seed(r,'Replace the introduction');r.meta.count=r.commits.length;return r;},objectives:[objective('Create a new commit with <code>git revert</code>.',r=>ev(r,'revert')&&r.commits.length>r.meta.count),objective('Restore the original contents while preserving history.',r=>ev(r,'revert')&&equal(r.files,r.meta.original)&&clean(r))]},
    {title:'Hello, mission control.',short:'Connect & push',description:'A remote is another copy of your repository. Connect origin to ../mission-control.git and push main to that local practice remote.',commands:['git remote add origin ../mission-control.git','git push -u origin main','git remote -v'],hints:['Run <code>git remote add origin ../mission-control.git</code>. This game simulates the remote locally.','Run <code>git push -u origin main</code> to share your main branch.'],setup:baseRepo,objectives:[objective('Add the <code>origin</code> remote at ../mission-control.git.',r=>r.remotes.origin?.url==='../mission-control.git'),objective('Push main to origin.',r=>ev(r,'push')&&r.remotes.origin?.branches.main===r.branches.main)]},
    {title:'Bring the outside in.',short:'Fetch & pull',description:'Mission control has a new checkpoint. Fetch it first without changing your files. Then pull origin main to bring the update into your workspace.',commands:['git fetch origin','git pull origin main','git log --oneline'],hints:['Run <code>git fetch origin</code>. origin/main moves, but main and your working files stay where they are.','Run <code>git pull origin main</code>. Pull fetches, then merges the remote branch.'],setup:()=>{const r=baseRepo(),original=headId(r);r.meta.original=original;const other=clone(r);other.files['README.md']+='Hello from mission control.\n';const next=seed(other,'Send a note from mission control');r.remotes.origin={url:'../mission-control.git',branches:{main:next.id},commits:clone(other.commits)};r.remoteBranches['origin/main']=original;r.meta.target=next.id;return r;},objectives:[objective('Fetch the update before pulling it.',r=>ev(r,'fetchOnly')),objective('Pull the remote checkpoint into main.',r=>ev(r,'pull')&&headId(r)===r.meta.target&&r.files['README.md']?.includes('Hello from mission control.'))]},
    {title:'Your final launch.',short:'The final checkpoint',description:'Create and switch to launch. Add launch.txt with “Git mission complete.” and commit it. Return to main, merge launch, then tag the result v1.0.',commands:['git switch -c launch','edit launch.txt "Git mission complete."','git tag v1.0'],hints:['Create your branch with <code>git switch -c launch</code>. Make launch.txt in the file editor, then add and commit it.','Return with <code>git switch main</code> and run <code>git merge launch</code>. Label your finished checkpoint with <code>git tag v1.0</code>.'],xp:300,setup:baseRepo,objectives:[objective('Commit launch.txt on a branch named <code>launch</code>.',r=>!!r.branches.launch&&r.commits.some(c=>c.id===r.branches.launch&&c.files['launch.txt']?.includes('Git mission complete.'))),objective('Merge launch back into main.',r=>ev(r,'merge')&&r.head.branch==='main'&&headFiles(r)['launch.txt']?.includes('Git mission complete.')),objective('Tag the finished checkpoint <code>v1.0</code>.',r=>!!r.tags['v1.0']&&r.tags['v1.0']===r.branches.main)]}
  ];
  function diverged(conflict) { const r=baseRepo(),base=headId(r);r.head.branch='field-notes';r.branches['field-notes']=base;if(conflict)r.files['README.md']='# Field Notes\nAn idea from field-notes.\n';else r.files['idea.txt']='An idea from a parallel world.\n';seed(r,conflict ? 'Write a branch introduction' : 'Save a branch idea');r.head.branch='main';r.files=clone(headFiles(r));r.files['README.md']=conflict ? '# Field Notes\nAn idea from main.\n' : '# Field Notes\nVersion one.\nWelcome, explorer.\n';seed(r,'Update the main introduction');return r; }
  function createLevel(index) { if(!Number.isInteger(index)||!levels[index])fail('That level does not exist.');const repo=levels[index].setup();repo.events={};return repo; }
  function objectiveStatus(index,repo) { return levels[index].objectives.map(o=>({text:o.text,done:!!o.test(repo)})); }
  const wrappedRun=(repo,line)=>{const beforePull=!ev(repo,'pull');const result=run(repo,line);if(beforePull&&/^git\s+fetch(?:\s|$)/.test(line.trim())&&result.type!=='error')event(repo,'fetchOnly');return result;};
  const API={clone,equal,validPath,headId,headCommit,headFiles,changes,clean,ancestors,ref,run:wrappedRun,createLevel,objectiveStatus,chapters,levels,tokenize};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.GitQuestEngine=API;
})(typeof globalThis!=='undefined' ? globalThis : this);
