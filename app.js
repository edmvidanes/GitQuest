(function () {
  'use strict';
  const E = window.GitQuestEngine;
  const R = window.GitQuestRecaps;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'gitquest-adventure-v1';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let storageAvailable = true, saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { storageAvailable = false; }
  const validSaved = saved && saved.version === 1 && Number.isInteger(saved.level) && E.levels[saved.level] && saved.repo && Array.isArray(saved.repo.commits) && saved.repo.files && saved.repo.index && saved.repo.head && saved.repo.events && saved.repo.branches && saved.repo.stash && saved.repo.remotes && saved.repo.tags && saved.repo.remoteBranches && saved.repo.meta;
  let game = validSaved ? saved : { version:1, level:0, repo:E.createLevel(0), rewards:{}, hints:{}, transcript:[], history:[], motion:!window.matchMedia('(prefers-reduced-motion: reduce)').matches, view:'workspace' };
  game.rewards = game.rewards && typeof game.rewards === 'object' ? game.rewards : {};
  game.hints = game.hints && typeof game.hints === 'object' ? game.hints : {};
  game.transcript = Array.isArray(game.transcript) ? game.transcript.slice(-80) : [];
  game.history = Array.isArray(game.history) ? game.history.slice(-80) : [];
  game.commandJournal = game.commandJournal && typeof game.commandJournal==='object' ? game.commandJournal : {};
  game.recapsSeen = game.recapsSeen && typeof game.recapsSeen==='object' ? game.recapsSeen : {};
  for(let i=0;i<E.chapters.length;i++) game.commandJournal[i]=Array.isArray(game.commandJournal[i]) ? game.commandJournal[i].filter(line=>typeof line==='string').slice(-120) : [];
  game.commandJournal[chapterIndex()]=[...new Set([...game.commandJournal[chapterIndex()],...game.transcript.filter(entry=>entry.type==='command'&&R.commandKey(entry.text)).map(entry=>entry.text)])].slice(-120);
  if (!['workspace','history','remote'].includes(game.view)) game.view='workspace';
  let activeChapter=chapterIndex(), historyPosition=game.history.length, commandDraft='', lastCompleted=false, editorOriginal=null, toastTimer, particleTimer, recapQueued=false, recapChapter=null;
  function chapterIndex() { return E.chapters.findIndex(c=>game.level>=c.start&&game.level<=c.end); }
  function xp() { return Object.values(game.rewards).reduce((sum,n)=>sum+(Number(n)||0),0); }
  function completedCount() { return Object.keys(game.rewards).filter(k=>E.levels[k]).length; }
  function unlocked(index) { return index===0 || Object.prototype.hasOwnProperty.call(game.rewards,index-1); }
  function persist() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(game)); } catch { if(storageAvailable){storageAvailable=false;toast('Device storage is unavailable. Keep this page open to preserve this session.');} } }
  function toast(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
  function append(text,type='output') { game.transcript.push({text,type});game.transcript=game.transcript.slice(-80);renderTerminal(); }
  function renderTerminal() {
    const output=$('terminal-output'); output.replaceChildren();
    for (const entry of game.transcript) { const line=document.createElement('div');line.className='terminal-line '+entry.type;if(entry.type==='command'){const p=document.createElement('span');p.className='prompt-dollar';p.textContent='$';line.append(p,document.createTextNode(entry.text));}else if(entry.text.includes('diff --git')){entry.text.split('\n').forEach((text,i)=>{const span=document.createElement('span');span.className=text.startsWith('+')&&!text.startsWith('+++')?'diff-added':text.startsWith('-')&&!text.startsWith('---')?'diff-removed':text.startsWith('diff --git')||text.startsWith('+++')||text.startsWith('---')?'diff-heading':'';span.textContent=text+(i<entry.text.split('\n').length-1?'\n':'');line.append(span);});}else line.textContent=entry.text;output.append(line); }
    output.scrollTop=output.scrollHeight;
  }
  function welcome() { const l=E.levels[game.level];append(`GitQuest · mission ${String(game.level+1).padStart(2,'0')}\n${l.title}\n\nThis is your safe, offline Git lab.\nType a command below. Type help for a field guide.`,'intro'); }
  function renderNavigation() {
    $('sidebar-count').textContent=`${completedCount()} / 18`;
    $('chapter-name').textContent=E.chapters[chapterIndex()].name.toUpperCase();
    $('xp-count').textContent=xp();$('progress-label').textContent=`${completedCount()} of 18 levels`;$('journey-progress').style.width=completedCount()/18*100+'%';
    $('chapter-nav').innerHTML=E.chapters.map((chapter,ci)=>`<div class="chapter-block"><button class="chapter-button ${activeChapter===ci?'active':''}" data-chapter="${ci}" aria-expanded="${activeChapter===ci}"><span class="chapter-number">${ci+1}</span>${chapter.name}<span class="chapter-arrow">${activeChapter===ci?'⌄':'›'}</span></button>${activeChapter===ci ? `<div class="chapter-lessons">${E.levels.slice(chapter.start,chapter.end+1).map((level,offset)=>{const index=chapter.start+offset,done=Object.prototype.hasOwnProperty.call(game.rewards,index),locked=!unlocked(index);return `<button class="lesson-link ${index===game.level?'selected':''} ${done?'done':''} ${locked?'locked':''}" data-level="${index}" ${locked?'aria-disabled="true"':''} ${index===game.level?'aria-current="step"':''}><span class="lesson-state">${done?'✓':locked?'·':''}</span>${level.short}<span class="lesson-no">${String(index+1).padStart(2,'0')}</span></button>`;}).join('')}</div>`:''}</div>`).join('');
    $('badges').innerHTML=E.chapters.map(c=>{const earned=Object.prototype.hasOwnProperty.call(game.rewards,c.end);return `<span class="badge ${earned?'earned':''}" role="img" aria-label="${c.badge}: ${earned?'earned':'locked'}" title="${c.badge}${earned?' · earned':' · complete '+c.name}">${c.icon}</span>`;}).join('');
  }
  function renderQuest() {
    const level=E.levels[game.level],statuses=E.objectiveStatus(game.level,game.repo),complete=statuses.every(o=>o.done);
    $('level-pill').textContent=`LEVEL ${String(game.level+1).padStart(2,'0')}`;$('quest-title').textContent=level.title;$('quest-description').textContent=level.description;
    $('difficulty').textContent=game.level<5?'Beginner':game.level<15?'Intermediate':game.level===17?'Capstone':'Intermediate';
    $('objectives').innerHTML=statuses.map(o=>`<li class="${o.done?'done':''}"><span class="objective-check" aria-hidden="true">${o.done?'✓':''}</span><span><span class="sr-only">${o.done?'Complete: ':'Incomplete: '}</span>${o.text}</span></li>`).join('');
    const used=Number(game.hints[game.level]||0),reward=Math.max(25,(level.xp||100)-used*25);
    $('reward').innerHTML=`${Object.prototype.hasOwnProperty.call(game.rewards,game.level)?'EARNED '+game.rewards[game.level]:'+'+reward} XP <span>✦</span>`;
    $('hint-content').hidden=!used;$('hint-content').innerHTML=used?level.hints.slice(0,used).map((h,i)=>`<div>${i+1}. ${h}</div>`).join(''):'';
    $('hint-button').disabled=used>=level.hints.length||complete;$('hint-button').innerHTML=`<span>☼</span> ${used>=level.hints.length?'All nudges revealed':used?'One more nudge?':'Need a nudge?'}`;
    $('hint-button').title='Reveal a nudge · reduces this mission’s reward by 25 XP';
    $('completion').hidden=!complete;$('next-button').textContent=game.level===17?'See your achievement ✦':'Next mission →';
    if (complete && !Object.prototype.hasOwnProperty.call(game.rewards,game.level)) {
      game.rewards[game.level]=reward;append(`✓ Mission complete! +${reward} XP\n${game.level===17?'Your final checkpoint is ready.':'Your next checkpoint is unlocked.'}`,'success');
      $('reward').innerHTML=`EARNED ${reward} XP <span>✦</span>`;renderNavigation();persist();
    }
    $('completion-detail').textContent=`${game.rewards[game.level]||reward} XP earned · ${game.level===17?'Adventure complete':'Next level unlocked'}`;
    if(complete&&game.level===E.chapters[chapterIndex()].end) $('next-button').textContent='Review chapter →';
    if(complete&&!lastCompleted){document.querySelector('.quest-card').classList.remove('just-completed');requestAnimationFrame(()=>document.querySelector('.quest-card').classList.add('just-completed'));}
    lastCompleted=complete;
    $('command-input').placeholder=complete?'Explore more, or go to the next mission…':`Try ${level.commands[0]}…`;
    $('command-chips').innerHTML=level.commands.map(c=>`<button type="button" data-command="${escape(c)}">${escape(c)}</button>`).join('');
    maybeShowChapterRecap();
  }
  const icons={folder:'<svg viewBox="0 0 40 36" fill="none" aria-hidden="true"><path d="M4 11V7a2 2 0 0 1 2-2h10l5 5h13a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V11Z" stroke="currentColor" stroke-width="1.4"/><path d="M4 13h32" stroke="currentColor" stroke-width="1.4"/></svg>',stage:'<svg viewBox="0 0 40 36" fill="none" aria-hidden="true"><path d="m20 4 16 8-16 8-16-8L20 4Z" stroke="currentColor" stroke-width="1.4"/><path d="m4 19 16 8 16-8M4 26l16 8 16-8" stroke="currentColor" stroke-width="1.4"/></svg>',repo:'<svg viewBox="0 0 40 36" fill="none" aria-hidden="true"><ellipse cx="20" cy="8" rx="14" ry="5" stroke="currentColor" stroke-width="1.4"/><path d="M6 8v18c0 3 6 5 14 5s14-2 14-5V8M6 17c0 3 6 5 14 5s14-2 14-5" stroke="currentColor" stroke-width="1.4"/></svg>'};
  function stageFiles(files,kind,changes) { const names=Object.keys(files).sort();if(!names.length)return `<div class="empty-stage">${kind==='work'?'No files yet':kind==='index'?'Nothing selected':'No commits yet'}<br>${kind==='repo'?'Your story starts here.':'A little room for ideas.'}</div>`;return names.slice(0,3).map(name=>`<button class="stage-file ${kind==='repo'?'committed':changes.modified.includes(name)?'modified':changes.untracked.includes(name)?'untracked':''}" data-inspect="${escape(name)}" data-area="${kind}" title="Inspect ${escape(name)}"><span class="file-glyph">▤</span><span>${escape(name)}</span></button>`).join('')+(names.length>3?`<span class="more-files">+${names.length-3} more files</span>`:''); }
  function renderWorkspace() {
    const repo=game.repo,c=E.changes(repo),base=E.headFiles(repo);
    const areas=[{id:'work',name:'Working directory',subtitle:'Your current files',icon:'folder',files:repo.files},{id:'index',name:'Staging area',subtitle:'Your next snapshot',icon:'stage',files:repo.index},{id:'repo',name:'Repository',subtitle:'Your saved checkpoint',icon:'repo',files:base}];
    $('pipeline').innerHTML=areas.map((a,i)=>`${i?`<div class="pipeline-arrow" aria-hidden="true">→<code>${i===1?'git add':'git commit'}</code></div>`:''}<div class="stage stage-${a.id}" id="stage-${a.id}"><div class="stage-icon">${icons[a.icon]}</div><h3>${a.name}</h3><span class="stage-subtitle">${a.subtitle}</span><div class="stage-files">${stageFiles(a.files,a.id,c)}</div></div>`).join('');
    $('file-list').innerHTML=Object.keys(repo.files).sort().map(name=>{const state=c.conflicts.includes(name)?'conflict':c.modified.includes(name)?'modified':c.staged.includes(name)?'staged':c.untracked.includes(name)?'untracked':'tracked';return `<button class="file-row" data-edit="${escape(name)}"><span class="file-glyph">▤</span><span>${escape(name)}</span><span class="file-state ${state}">${state==='conflict'?'CONFLICT':state==='modified'?'M':state==='staged'?'STAGED':state==='untracked'?'U':'TRACKED'}</span><span aria-hidden="true">↗</span></button>`;}).join('')||'<div class="empty-stage">No files. Start with a new idea.</div>';
    $('head-label').textContent=repo.head.branch||E.headId(repo)+' (detached)';$('commit-count').textContent=repo.commits.length;
    const count=new Set([...c.staged,...c.modified,...c.untracked,...c.conflicts]).size;
    $('repo-status').innerHTML=`<i class="status-dot"></i> ${!repo.initialized?'No repository yet':c.conflicts.length?`${c.conflicts.length} conflict${c.conflicts.length===1?'':'s'} to resolve`:count?`${count} changed file${count===1?'':'s'}`:'Working tree clean'}`;
  }
  function renderGraph() {
    const repo=game.repo,commits=repo.commits.slice().reverse();
    if(!commits.length){$('commit-graph').innerHTML='<div class="graph-empty"><span>⑂</span>No checkpoints yet.<br>Your first commit will appear here.</div>';return;}
    const rowHeight=100,onMain=E.ancestors(repo,repo.branches.main),rows=new Map(commits.map((c,i)=>[c.id,i]));
    const lane=c=>onMain.has(c.id)?24:64;
    const lines=commits.flatMap((c,i)=>c.parents.filter(p=>rows.has(p)).map(p=>{const parent=commits[rows.get(p)],x=lane(c),px=lane(parent),y=i*rowHeight+50,py=rows.get(p)*rowHeight+50;return `<path d="M${x} ${y} C${x} ${y+30},${px} ${py-30},${px} ${py}" fill="none" stroke="${x===24&&px===24?'#719748':'#567f8e'}" stroke-width="2"/>`;})).join('');
    const circles=commits.map((c,i)=>`<circle cx="${lane(c)}" cy="${i*rowHeight+50}" r="${E.headId(repo)===c.id?8:6}" fill="${onMain.has(c.id)?'#baf267':'#8fb9c8'}" stroke="#182016" stroke-width="3"/>${E.headId(repo)===c.id?`<circle cx="${lane(c)}" cy="${i*rowHeight+50}" r="12" fill="none" stroke="#779b51" stroke-width="1"/>`:''}`).join('');
    const rowsHtml=commits.map(c=>{const branches=Object.entries(repo.branches).filter(([,id])=>id===c.id).map(([name])=>`<span class="commit-ref ${name==='main'?'':'other'}">${escape(name)}${repo.head.branch===name?' ← HEAD':''}</span>`).join('');const remote=Object.entries(repo.remoteBranches).filter(([,id])=>id===c.id).map(([name])=>`<span class="commit-ref other">${escape(name)}</span>`).join('');const tags=Object.entries(repo.tags).filter(([,id])=>id===c.id).map(([name])=>`<span class="commit-ref tag">${escape(name)}</span>`).join('');const count=Object.keys(c.files).length;return `<div class="graph-row ${E.headId(repo)===c.id?'new-commit':''}"><div class="graph-row-content"><p class="commit-message" title="${escape(c.message)}">${escape(c.message)}</p><div class="commit-meta"><span>${c.id}</span>${branches}${remote}${tags}<span>${c.parents.length===2?'2 parents':count+' '+(count===1?'file':'files')}</span></div></div></div>`;}).join('');
    $('commit-graph').innerHTML=`<svg class="graph-svg" style="height:${commits.length*rowHeight}px" viewBox="0 0 90 ${commits.length*rowHeight}" role="img" aria-label="Commit graph with ${commits.length} checkpoints. Lines connect each commit to its parents.">${lines}${circles}</svg>${rowsHtml}`;
  }
  function renderRemote() { const repo=game.repo,remote=repo.remotes.origin,remoteId=remote?.branches.main,local=repo.branches.main,synced=!!local&&local===remoteId;
    $('remote-diagram').innerHTML=`<div class="remote-nodes"><div class="remote-node"><span class="remote-glyph">⌘</span><h4>Your repository</h4><code>main · ${local||'no commits'}</code></div><div class="remote-arrows">${synced?'⇄':'⇢'}</div><div class="remote-node"><span class="remote-glyph">◈</span><h4>Mission control</h4><code>${remote?'origin · '+(remoteId||'empty'):'not connected'}</code></div></div><div class="remote-details">${remote?`<strong>origin</strong> → ${escape(remote.url)}<br>${synced?'✓ main is in sync with mission control.':remoteId?'The repositories have different checkpoints. Fetch to discover remote changes.':'The remote is empty. Push a branch to share your checkpoints.'}<br>Tracking reference: ${repo.remoteBranches['origin/main']||'not fetched yet'}`:'A remote has its own branches and commits.<br>Use git remote add to give it a familiar name.'}</div>`;
  }
  function renderAll() { renderNavigation();renderQuest();renderWorkspace();renderGraph();renderRemote();setView(game.view);renderTerminal();updateMotion(); }
  function setView(view) { game.view=view;for(const name of ['workspace','history','remote']){$('view-'+name).hidden=name!==view;$('tab-'+name).setAttribute('aria-selected',name===view?'true':'false');$('tab-'+name).tabIndex=name===view?0:-1;} }
  const stories={
    init:['A folder becomes a repository.','Git created a .git directory for history and metadata. Your files are still untracked until you choose to add them.'],
    edit:['An idea changed in your workspace.','Editing changes your working file. The staging area and saved commits stay as they were. You decide when to capture this version.'],
    add:['A copy, ready for your next checkpoint.','git add copied your selected file contents into the staging area. Later edits will need to be added again.'],
    commit:['A moment, remembered.','Git saved the entire staging area as a commit and moved your branch label to it. Your working files stay in place.'],
    status:['A quick look around.','Status compares your working files, staging area, and HEAD. It tells you what is edited, selected, or still untracked.'],
    diff:['See exactly what changed.','The − lines show the old contents; + lines show the new contents. git diff compares tracked working files with the staging area.'],
    diffStaged:['Inspect your next checkpoint.','git diff --staged compares the staging area with HEAD. These are the changes that your next commit will include.'],
    log:['Your trail of checkpoints.','Every node is a commit. Lines connect it to its parent checkpoints. The branch label points at the latest commit on that path.'],
    show:['One checkpoint, up close.','git show reveals a commit message and the changes that checkpoint introduced relative to its parent.'],
    branch:['One checkpoint. Another possibility.','A new branch starts as a label on your current commit. Creating a branch does not move HEAD or duplicate your files.'],
    switch:['A different path beneath your feet.','HEAD now follows the selected branch. When branches point at different commits, your working files change to match the selected checkpoint.'],
    merge:['Two paths brought together.','A fast-forward moves a branch label to a descendant. When both branches have new work, a merge creates a commit with two parents.'],
    conflict:['Two edits need your judgment.','The branches changed the same file differently. The markers show both versions. Edit a resolution, stage it, and commit to finish the merge.'],
    stash:['Your unfinished idea is parked.','The stash holds your tracked edits and staged contents while your workspace returns to HEAD. Use -u to include untracked files.'],
    stashPop:['Right where you left your idea.','Your parked contents are back in the working directory. Stage and commit them when they are ready. Pop also removes the stash entry.'],
    restore:['The working file goes back.','git restore copies from the staging area by default. It discards edits to that file that you have not staged.'],
    unstage:['Still your idea. Just not selected.','The staging area now matches HEAD for this file. Your working file keeps its edits, so you can stage them again later.'],
    reset:['Move the label. Keep the work.','A soft reset moved HEAD and its branch to an earlier checkpoint. Your staging area and working files kept their contents.'],
    revert:['An undo that leaves a trail.','Revert created a new commit that reverses an earlier change. The original commit is still in the history, which makes this useful for shared work.'],
    remote:['Another repository, given a name.','origin is a nickname for another repository. Here, mission control is simulated on your device; it never connects to the internet.'],
    push:['Your checkpoints made the journey.','Push copies your reachable commits and updates the remote branch. Your own working files are unchanged.'],
    fetch:['New knowledge. The same workspace.','Fetch copied remote commits and moved origin/main. Your local main and your working files stay at their previous checkpoint.'],
    pull:['The remote update arrives at home.','Pull fetched remote commits, then merged them into your current branch. Your working files now include the merged changes.'],
    tag:['A milestone with a permanent name.','A tag points to a specific commit. Unlike a branch, the tag stays on that checkpoint as you continue working.']
  };
  function tellStory(action) { const story=stories[action];if(!story)return;$('story-title').textContent=story[0];$('story-text').textContent=story[1];$('action-story').classList.remove('changed');requestAnimationFrame(()=>$('action-story').classList.add('changed')); }
  function animate(action) {
    const targets={init:['repo'],edit:['work'],add:['index'],commit:['repo'],merge:['work','repo'],conflict:['work'],stash:['work'],stashPop:['work'],restore:['work'],unstage:['index'],reset:['index','repo'],revert:['repo'],pull:['work'],fetch:['repo']};
    (targets[action]||[]).forEach(name=>{const stage=$('stage-'+name);stage.classList.add('animating');});
    if(!game.motion||!['add','commit','unstage','restore','stashPop'].includes(action))return;
    clearTimeout(particleTimer);document.querySelectorAll('.stage-particle').forEach(e=>e.remove());
    const particle=document.createElement('span');particle.className='stage-particle'+(action==='commit'?' to-repo':['restore','unstage','stashPop'].includes(action)?' to-work':'');particle.textContent='≡';particle.setAttribute('aria-hidden','true');$('pipeline').append(particle);particleTimer=setTimeout(()=>particle.remove(),1100);
  }
  function runCommand(raw) {
    const line=raw.trim();if(!line)return;
    game.history.push(line);game.history=game.history.slice(-80);historyPosition=game.history.length;commandDraft='';$('command-input').value='';
    if(line==='clear'){game.transcript=[];renderTerminal();persist();return;}
    append(line,'command');
    if(line==='help'||line==='git help'||line==='?'){append('Supported Git: init, status, add, commit, diff, log, show, branch, switch, checkout, merge, restore, reset, revert, stash, remote, push, fetch, pull, tag, config, rm.\n\nWorkspace helpers: ls, cat <file>, touch <file>, edit <file> "contents", echo "text" > file, rm <file>.\nGame helpers: hint, next, clear, help.\nUse the file editor to make multiline edits.\nClick the field guide for examples and explanations.');showGuide();persist();return;}
    if(line==='hint'){revealHint();persist();return;}
    if(line==='next'){if(E.objectiveStatus(game.level,game.repo).every(o=>o.done))nextLevel();else append('Finish this mission’s objectives to unlock the next checkpoint.','intro');persist();return;}
    const result=E.run(game.repo,line);if(result.output)append(result.output,result.type||'output');
    if(R.commandKey(line)&&(result.type!=='error'||result.action==='conflict')) game.commandJournal[chapterIndex()]=[...new Set([...game.commandJournal[chapterIndex()],line])].slice(-120);
    renderQuest();renderWorkspace();renderGraph();renderRemote();if(result.view)setView(result.view);tellStory(result.action);animate(result.action);persist();
  }
  function revealHint() {
    const l=E.levels[game.level],used=Number(game.hints[game.level]||0);if(used>=l.hints.length){append('All nudges for this mission are already shown.','intro');return;}
    if(E.objectiveStatus(game.level,game.repo).every(o=>o.done))return;
    game.hints[game.level]=used+1;renderQuest();persist();toast('Nudge revealed · this mission’s reward decreases by 25 XP.');
  }
  function goLevel(index) { if(!unlocked(index)){toast('Complete the preceding mission to unlock this checkpoint.');return;}
    if(index===game.level)return;
    game.level=index;game.repo=E.createLevel(index);game.transcript=[];game.view=chapterIndex()===3?'remote':chapterIndex()===1?'history':'workspace';activeChapter=chapterIndex();lastCompleted=false;welcome();renderAll();tellStory(index===0?'init':chapterIndex()===1?'branch':chapterIndex()===3?'remote':'status');persist();$('command-input').focus({preventScroll:true});
  }
  function nextLevel() { if(game.level===E.chapters[chapterIndex()].end&&R.chapterComplete(E.chapters[chapterIndex()],game.rewards)){showChapterRecap(chapterIndex());return;}if(game.level===17){showFinish();return;}goLevel(game.level+1); }
  function renderMap() { $('level-map').innerHTML=E.chapters.map(c=>`<section class="map-chapter"><h3><span class="chapter-number">${E.chapters.indexOf(c)+1}</span>${c.name}</h3><p>${c.description}</p>${E.levels.slice(c.start,c.end+1).map((l,o)=>{const i=c.start+o,locked=!unlocked(i),done=Object.prototype.hasOwnProperty.call(game.rewards,i);return `<button class="map-level ${locked?'locked':''}" data-level="${i}" ${locked?'aria-disabled="true"':''}><span class="map-number">${String(i+1).padStart(2,'0')}</span>${l.short}<span class="map-state">${done?'✓':locked?'locked':i===game.level?'current':'→'}</span></button>`;}).join('')}${R.chapterComplete(c,game.rewards)?`<button class="recap-review-button" data-recap="${E.chapters.indexOf(c)}">Review ${c.name} ↗</button>`:''}</section>`).join(''); }
  function maybeShowChapterRecap() {
    const index=chapterIndex();
    if(recapQueued||!R.pendingRecap(index,E.chapters,game.rewards,game.recapsSeen)) return;
    recapQueued=true;
    requestAnimationFrame(()=>{
      recapQueued=false;
      if(chapterIndex()!==index||document.querySelector('dialog[open]')||!R.pendingRecap(index,E.chapters,game.rewards,game.recapsSeen)) return;
      showChapterRecap(index);
    });
  }
  function showChapterRecap(index) {
    const chapter=E.chapters[index],recap=R.chapters[index];
    if(!R.chapterComplete(chapter,game.rewards)) return;
    recapChapter=index;
    $('recap-kicker').textContent=`CHAPTER ${index+1} COMPLETE · ${chapter.end-chapter.start+1} MISSIONS`;
    $('recap-title').textContent=recap.title;
    $('recap-summary').textContent=recap.summary;
    $('recap-takeaways').innerHTML=recap.takeaways.map(text=>`<li><span aria-hidden="true">✓</span>${escape(text)}</li>`).join('');
    $('recap-commands').innerHTML=R.commandRecap(index,game.commandJournal[index]).map(command=>`<article class="recap-command"><div><code>${escape(command.label)}</code><a href="${command.url}" target="_blank" rel="noopener noreferrer" aria-label="Official documentation for ${escape(command.label)} (opens in a new tab)">Git manual ↗</a></div><p>${escape(command.description)}</p>${command.examples.length?`<details><summary>Your commands (${command.examples.length})</summary>${command.examples.map(line=>`<code class="recap-example">${escape(line)}</code>`).join('')}</details>`:''}</article>`).join('');
    $('recap-resources').innerHTML=recap.resources.map(resource=>`<a href="${resource.url}" target="_blank" rel="noopener noreferrer">${escape(resource.label)} <span aria-hidden="true">↗</span></a>`).join('');
    const earned=Array.from({length:chapter.end-chapter.start+1},(_,offset)=>Number(game.rewards[chapter.start+offset])||0).reduce((sum,n)=>sum+n,0);
    $('recap-earned').textContent=`${earned} XP earned · ${chapter.badge} badge`;
    $('recap-continue').textContent=game.level===chapter.end ? index===E.chapters.length-1 ? 'See your achievement ✦' : `Next chapter: ${E.chapters[index+1].name} →` : 'Back to your mission →';
    game.recapsSeen[index]=true;persist();
    $('chapter-recap-dialog').showModal();
    $('chapter-recap-dialog').scrollTop=0;
  }
  const guideGroups=[
    ['Your first checkpoints',[
      ['git init','Create a repository in this folder.'],['git status','See your branch, staged changes, edits, and untracked files.'],['git add README.md','Copy the current contents of one file into the staging area.'],['git add .','Stage all changes under the current folder, including deletions.'],['git commit -m "A useful message"','Save the whole staging area as a checkpoint.'],['git diff / git diff --staged','Compare working → staged, or staged → HEAD.'],['git log --oneline / git show HEAD','Read the checkpoint trail or inspect one commit.']]],
    ['Give your ideas room',[
      ['git branch field-notes','Create a branch at HEAD; stay on your current branch.'],['git switch field-notes','Switch to an existing branch.'],['git switch -c field-notes','Create a branch and switch to it. git checkout -b also works.'],['git merge field-notes','Bring the named branch into your current branch.'],['git merge --abort','Return to the checkpoint before an unfinished merge.']]],
    ['Recover with confidence',[
      ['git stash / git stash pop','Park tracked changes, then restore them. Add -u to include untracked files.'],['git restore README.md','Discard working edits by copying the staged version.'],['git restore --staged README.md','Unstage the file; keep your working edits.'],['git reset --soft HEAD~1','Move back one parent; keep the work staged. Useful for unpublished local commits.'],['git reset HEAD~1','Move back and unstage; keep working edits.'],['git reset --hard HEAD~1','Move back and discard tracked working edits. Use carefully.'],['git revert HEAD','Create an inverse commit and preserve history.']]],
    ['Connect the checkpoints',[
      ['git remote add origin ../mission-control.git','Give another repository a name. Remotes in this game are entirely simulated.'],['git push -u origin main','Copy local commits to the remote and update its main branch.'],['git fetch origin','Copy remote commits and update origin/main. Keep your local branch and files.'],['git pull origin main','Fetch, then merge the remote branch into your current branch.'],['git tag v1.0','Add a fixed label to the current commit.']]],
    ['Your practice terminal',[
      ['edit notes.txt "A new idea."','Create or replace a file. In double quotes, \\n creates a line break.'],['echo "A new idea." > notes.txt','Write text to a file, ending in a newline.'],['ls / cat README.md','List files or read their contents.'],['touch notes.txt / rm notes.txt','Create an empty file or delete a working file.'],['hint / next / clear / help','Get a nudge, continue, clear the terminal, or open this guide.'],['↑ / ↓ / Tab','Recall commands or complete a command prefix.']]]
  ];
  function showGuide(howTo=false) {
    $('guide-content').innerHTML=`<div class="guide-intro">${howTo?'<strong>One mission. A few commands. An “aha” moment.</strong><br>Read the objectives, type commands in the terminal, and follow the live visualization. Click a file to edit it. Complete both objectives to unlock your next mission. Hints cost 25 of that mission’s XP. Progress saves automatically on this device.<br><br>':'<strong>Working directory → Staging area → Repository</strong><br>Edit your files. Select a snapshot with git add. Remember it with git commit.<br><br>'}This is an offline simulation of common Git commands. File names, commits, branches, and remotes exist only in this game. Each mission starts with its own prepared repository. Completed missions can be replayed; XP is awarded once.</div>${guideGroups.map(([title,commands])=>`<section class="guide-section"><h3>${title}</h3><table class="guide-table"><tbody>${commands.map(([command,description])=>`<tr><td><code>${escape(command)}</code></td><td>${escape(description)}</td></tr>`).join('')}</tbody></table></section>`).join('')}<section class="guide-section"><h3>A few honest practice boundaries</h3><p>Diffs display full-file before and after lines. Three-way merges automatically combine changes in different files; edits to the same file need your resolution. Switching to a different checkpoint requires a clean workspace. Stash restoration requires a clean workspace. This keeps the labs predictable. A real Git installation can handle more cases, flags, hooks, and merge strategies.</p><p class="warning">restore and reset --hard discard edits. Local resets can rewrite branch history; use revert when undoing changes other people already use.</p><p>Save the whole GitQuest folder and open index.html to play offline. The same file location and browser keep your saved adventure. Progress is device-local and is not uploaded.</p></section>`;
    $('guide-content').insertAdjacentHTML('beforeend','<section class="guide-section"><h3>Take the adventure with you</h3><p>GitQuest-Offline.html is the self-contained edition. Copy that one file to another computer and open it in a modern browser. Your progress stays local to each browser and file location.</p></section><section class="guide-section"><h3>A fresh start</h3><p>Ready to replay the whole adventure? Start over from level 1 with fresh XP and badges.</p><button class="secondary-button" id="new-adventure-button">Start a new adventure ↺</button></section>');
    $('new-adventure-button').addEventListener('click',()=>{$('guide-dialog').close();$('new-adventure-dialog').showModal();});
    $('guide-dialog').showModal();
  }
  function openEditor(name,area='work') {
    const tree=area==='repo'?E.headFiles(game.repo):area==='index'?game.repo.index:game.repo.files;
    editorOriginal=name||null;$('editor-title').textContent=area==='work'?(name?'Edit '+name:'A new idea'):(area==='index'?'Staged snapshot: ':'Saved checkpoint: ')+name;
    $('editor-filename').value=name||'';$('editor-filename').readOnly=!!name;$('editor-content').value=name?(tree[name]||''):'';
    const readonly=area!=='work';$('editor-content').readOnly=readonly;$('editor-form').dataset.readonly=String(readonly);$('editor-form').querySelector('button[type="submit"]').hidden=readonly;$('delete-file-button').hidden=!name||readonly;$('editor-error').textContent='';
    document.querySelector('.editor-note').textContent=readonly?'This is a snapshot. Edit the file in the working directory to create a new version.':'Saving changes your working directory. Use git add and git commit to save a checkpoint.';
    $('editor-dialog').showModal();if(!name)$('editor-filename').focus();else $('editor-content').focus();
  }
  function updateMotion() { document.body.classList.toggle('no-motion',!game.motion);document.body.classList.toggle('motion-enabled',!!game.motion);$('motion-button').setAttribute('aria-pressed',String(game.motion));document.querySelector('#motion-button .toggle').classList.toggle('on',!!game.motion); }
  function showFinish() { $('finish-stats').innerHTML=`<div><strong>${xp()}</strong><span>XP EARNED</span></div><div><strong>${completedCount()}</strong><span>MISSIONS COMPLETE</span></div><div><strong>4</strong><span>BADGES EARNED</span></div>`;$('finish-dialog').showModal(); }
  $('terminal-form').addEventListener('submit',event=>{event.preventDefault();runCommand($('command-input').value);});
  $('command-chips').addEventListener('click',event=>{const target=event.target.closest('[data-command]');if(target){$('command-input').value=target.dataset.command;$('command-input').focus();}});
  $('chapter-nav').addEventListener('click',event=>{const chapter=event.target.closest('[data-chapter]'),level=event.target.closest('[data-level]');if(chapter){activeChapter=Number(chapter.dataset.chapter);renderNavigation();}else if(level)goLevel(Number(level.dataset.level));});
  $('map-button').addEventListener('click',()=>{renderMap();$('map-dialog').showModal();});
  $('level-map').addEventListener('click',event=>{const recap=event.target.closest('[data-recap]');if(recap){$('map-dialog').close();showChapterRecap(Number(recap.dataset.recap));return;}const target=event.target.closest('[data-level]');if(!target)return;const i=Number(target.dataset.level);if(!unlocked(i)){toast('This checkpoint unlocks after the previous mission.');return;}$('map-dialog').close();goLevel(i);});
  document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',maybeShowChapterRecap));
  $('recap-continue').addEventListener('click',()=>{const chapter=E.chapters[recapChapter];$('chapter-recap-dialog').close();if(game.level!==chapter.end)return;if(game.level===E.levels.length-1)showFinish();else goLevel(game.level+1);});
  $('guide-button').addEventListener('click',()=>showGuide());$('help-button').addEventListener('click',()=>showGuide(true));$('pipeline-info').addEventListener('click',()=>showGuide());
  $('motion-button').addEventListener('click',()=>{game.motion=!game.motion;updateMotion();persist();});
  $('hint-button').addEventListener('click',revealHint);$('next-button').addEventListener('click',nextLevel);
  $('reset-button').addEventListener('click',()=>$('confirm-dialog').showModal());
  $('confirm-reset').addEventListener('click',()=>{$('confirm-dialog').close();game.repo=E.createLevel(game.level);game.transcript=[];lastCompleted=false;welcome();renderAll();$('story-title').textContent='A fresh attempt. A little more experience.';$('story-text').textContent='Your mission is reset. Previous achievements are still saved. Try a different path this time.';persist();$('command-input').focus();});
  $('confirm-new-adventure').addEventListener('click',()=>{$('new-adventure-dialog').close();game={version:1,level:0,repo:E.createLevel(0),rewards:{},hints:{},transcript:[],history:[],commandJournal:{0:[],1:[],2:[],3:[]},recapsSeen:{},motion:game.motion,view:'workspace'};activeChapter=0;historyPosition=0;lastCompleted=false;welcome();renderAll();$('story-title').textContent='A blank page. A fresh start.';$('story-text').textContent='Initialize a repository to start keeping track of your ideas.';persist();$('command-input').focus({preventScroll:true});});
  document.querySelector('.visual-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-view]');if(tab){setView(tab.dataset.view);persist();}});
  document.querySelector('.visual-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const views=['workspace','history','remote'];let i=views.indexOf(game.view);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;setView(views[i]);$('tab-'+views[i]).focus();persist();});
  $('file-list').addEventListener('click',event=>{const target=event.target.closest('[data-edit]');if(target)openEditor(target.dataset.edit);});
  $('pipeline').addEventListener('click',event=>{const target=event.target.closest('[data-inspect]');if(target)openEditor(target.dataset.inspect,target.dataset.area);});
  $('new-file-button').addEventListener('click',()=>openEditor());
  $('editor-form').addEventListener('submit',event=>{event.preventDefault();if($('editor-form').dataset.readonly==='true')return;const name=$('editor-filename').value.trim();if(!E.validPath(name)){$('editor-error').textContent='Use a relative file name such as notes.txt or docs/ideas.md. .git is reserved.';return;}if(!editorOriginal&&Object.prototype.hasOwnProperty.call(game.repo.files,name)){$('editor-error').textContent='That file already exists. Open it from the workspace to edit it.';return;}if($('editor-content').value.length>100000){$('editor-error').textContent='Keep practice files under 100,000 characters.';return;}game.repo.files[name]=$('editor-content').value;game.repo.events.edit=(game.repo.events.edit||0)+1;append(`Saved ${name} from the file editor. Working contents changed.`);$('editor-dialog').close();renderQuest();renderWorkspace();renderGraph();renderRemote();tellStory('edit');animate('edit');persist();$('command-input').focus({preventScroll:true});});
  $('delete-file-button').addEventListener('click',()=>{if(!editorOriginal)return;runCommand('rm '+editorOriginal);$('editor-dialog').close();$('command-input').focus({preventScroll:true});});
  const completionCommands=['git init','git status','git add .','git add README.md','git commit -m "','git diff','git diff --staged','git log --oneline','git log --oneline --graph','git show HEAD','git branch','git switch main','git switch field-notes','git switch -c ','git merge field-notes','git merge launch','git merge --abort','git restore README.md','git restore --staged README.md','git reset --soft HEAD~1','git revert HEAD','git stash','git stash pop','git stash list','git remote -v','git remote add origin ../mission-control.git','git push -u origin main','git fetch origin','git pull origin main','git tag v1.0','help','hint','next','clear','ls'];
  $('command-input').addEventListener('keydown',event=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();if(historyPosition===game.history.length)commandDraft=event.target.value;historyPosition=Math.max(0,Math.min(game.history.length,historyPosition+(event.key==='ArrowUp'?-1:1)));event.target.value=historyPosition===game.history.length?commandDraft:game.history[historyPosition];event.target.setSelectionRange(event.target.value.length,event.target.value.length);}
    if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();const prefix=event.target.value;const all=[...new Set([...E.levels[game.level].commands,...completionCommands,...Object.keys(game.repo.files).map(p=>'git add '+p)])],matches=all.filter(c=>c.startsWith(prefix));if(matches.length===1)event.target.value=matches[0];else if(matches.length>1){let common=matches[0];for(const match of matches)while(!match.startsWith(common))common=common.slice(0,-1);if(common.length>prefix.length)event.target.value=common;else toast(matches.slice(0,5).join(' · '));}}
    if(event.key==='l'&&(event.ctrlKey||event.metaKey)){event.preventDefault();game.transcript=[];renderTerminal();persist();}
  });
  document.addEventListener('keydown',event=>{if(event.key==='?'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();showGuide();}});
  $('export-button').addEventListener('click',()=>{const report={game:'GitQuest',completed:completedCount(),xp:xp(),badges:E.chapters.filter(c=>Object.prototype.hasOwnProperty.call(game.rewards,c.end)).map(c=>c.badge),missions:E.levels.map((l,i)=>({level:i+1,title:l.short,completed:Object.prototype.hasOwnProperty.call(game.rewards,i),xp:game.rewards[i]||0})),savedAt:new Date().toISOString()};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gitquest-achievements.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  if(!game.transcript.length)welcome();renderAll();persist();
  if(!storageAvailable)toast('Storage is unavailable in this browser. Your adventure will last while this page stays open.');
  if(validSaved){$('story-title').textContent='Welcome back to your adventure.';$('story-text').textContent='Your repository and progress are restored. Pick up your mission where you left it.';}
})();
