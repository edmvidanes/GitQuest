(function (root) {
  'use strict';
  const manual = command => 'https://git-scm.com/docs/git-' + command;
  const book = chapter => 'https://git-scm.com/book/en/v2/' + chapter;
  const commands = {
    init: { label:'git init', description:'Creates the .git directory that stores a repository’s history and metadata. Your existing working files are left in place.', url:manual('init') },
    status: { label:'git status', description:'Shows your current branch and which files are untracked, modified, staged, or conflicted. It does not change your files.', url:manual('status') },
    add: { label:'git add', description:'Copies selected file contents into the staging area for the next commit. If you edit a file again, add it again to select the newer version.', url:manual('add') },
    commit: { label:'git commit', description:'Saves the complete staged snapshot as a commit and moves your branch to it. The -m option supplies a message explaining the change.', url:manual('commit') },
    diff: { label:'git diff', description:'Compares tracked working files with the staging area. With --staged or --cached, it compares the staging area with HEAD, showing what your next commit will change.', url:manual('diff') },
    log: { label:'git log', description:'Shows the commit history reachable from the current checkpoint. --oneline gives a compact list, and --graph draws connections between commits.', url:manual('log') },
    show: { label:'git show', description:'Inspects a specific commit and the changes it introduced. HEAD refers to your current checkpoint.', url:manual('show') },
    branch: { label:'git branch', description:'Lists branches or creates a new branch label at a commit. Creating a branch does not switch to it or copy your working files.', url:manual('branch') },
    switch: { label:'git switch', description:'Moves HEAD to another branch and updates your working files for that checkpoint. Use -c to create a branch and switch to it in one step.', url:manual('switch') },
    checkout: { label:'git checkout', description:'Can switch branches, create and switch with -b, or restore a working file with -- followed by its path. switch and restore separate these jobs into clearer commands.', url:manual('checkout') },
    merge: { label:'git merge', description:'Brings another branch into your current branch. A fast-forward moves the branch label; diverged histories can produce a two-parent commit. Resolve conflicting files, stage them, then commit.', url:manual('merge') },
    stash: { label:'git stash', description:'Parks unfinished tracked changes and staged contents so you can work from a clean checkpoint. pop restores them and removes the stash entry; -u also includes untracked files.', url:manual('stash') },
    restore: { label:'git restore', description:'By default, copies the staged version into a working file, discarding its unstaged edits. With --staged, it instead unstages the file while preserving your working edits.', url:manual('restore') },
    reset: { label:'git reset', description:'Moves HEAD and its branch to a chosen commit. --soft keeps changes staged; the default mixed mode keeps working edits but unstages them; --hard discards tracked working edits too.', url:manual('reset') },
    revert: { label:'git revert', description:'Makes a new commit that reverses an earlier commit. The original history remains, making this useful for undoing changes that others already share.', url:manual('revert') },
    remote: { label:'git remote', description:'Manages names for other repositories. remote add origin <address> creates the nickname origin; remote -v lists the configured addresses.', url:manual('remote') },
    push: { label:'git push', description:'Sends local commits to another repository and updates its branch. A push can be rejected if the remote has work you have not integrated. -u sets an upstream tracking relationship in real Git.', url:manual('push') },
    fetch: { label:'git fetch', description:'Downloads remote commits and updates remote-tracking references such as origin/main. It does not move your local main branch or change your working files.', url:manual('fetch') },
    pull: { label:'git pull', description:'Fetches remote work and then integrates it into your current branch. In these labs, integration uses merge; real Git can also be configured to rebase.', url:manual('pull') },
    tag: { label:'git tag', description:'Gives a specific commit a lasting name, such as v1.0. A tag stays at that checkpoint while a branch moves forward with new commits.', url:manual('tag') },
    rm: { label:'git rm', description:'Removes a tracked file and stages its deletion. With --cached, it removes the file from tracking while keeping the working copy.', url:manual('rm') },
    config: { label:'git config', description:'Reads or sets Git configuration, such as the name and email recorded on commits.', url:manual('config') }
  };
  const chapters = [
    {
      title:'Foundations complete.',
      summary:'You can turn a folder into a repository, select changes, save checkpoints, and read the story behind them.',
      takeaways:[
        'Your working directory, staging area, and repository are three distinct places.',
        'Staging selects a snapshot. Committing remembers that snapshot with a message.',
        'Status, diff, log, and show help you understand your work before and after saving it.'
      ],
      commandKeys:['init','status','add','commit','diff','log','show'],
      resources:[
        {label:'Pro Git: Recording changes',url:book('Git-Basics-Recording-Changes-to-the-Repository')},
        {label:'Pro Git: Viewing commit history',url:book('Git-Basics-Viewing-the-Commit-History')}
      ]
    },
    {
      title:'Parallel worlds complete.',
      summary:'You can give experiments their own branch, bring ideas together, and resolve competing edits.',
      takeaways:[
        'A branch is a movable label on a commit. HEAD tells you which path you are following.',
        'A fast-forward moves a label; a merge of diverged work can create a commit with two parents.',
        'A conflict needs your judgment: edit the resolution, remove markers, stage the file, and commit.'
      ],
      commandKeys:['branch','switch','merge','add','commit'],
      resources:[
        {label:'Pro Git: Branches in a nutshell',url:book('Git-Branching-Branches-in-a-Nutshell')},
        {label:'Pro Git: Branching and merging',url:book('Git-Branching-Basic-Branching-and-Merging')}
      ]
    },
    {
      title:'Time travel complete.',
      summary:'You can park unfinished work and choose an undo operation that preserves the changes or history you still need.',
      takeaways:[
        'Stash temporarily parks work; restoring the stash brings those edits back.',
        'Unstaging preserves your working edits. Restoring a working file can discard them.',
        'A soft reset moves your branch while keeping work staged. Revert creates an inverse commit and preserves history.'
      ],
      commandKeys:['stash','restore','reset','revert'],
      resources:[
        {label:'Pro Git: Undoing things',url:book('Git-Basics-Undoing-Things')},
        {label:'Pro Git: Stashing and cleaning',url:book('Git-Tools-Stashing-and-Cleaning')}
      ]
    },
    {
      title:'Mission control complete.',
      summary:'You can share checkpoints, bring remote updates home, and mark a finished milestone. Your Git adventure has come full circle.',
      takeaways:[
        'A remote is another repository. origin is a nickname, and origin/main records your last fetched view of its branch.',
        'Fetch updates your knowledge; pull also integrates that work; push shares your local commits.',
        'You combined branching, staging, committing, and merging in the launch lab, then marked the result with a fixed tag.'
      ],
      commandKeys:['remote','push','fetch','pull','tag','switch','add','commit','merge'],
      resources:[
        {label:'Pro Git: Working with remotes',url:book('Git-Basics-Working-with-Remotes')},
        {label:'Pro Git: Tagging',url:book('Git-Basics-Tagging')}
      ]
    }
  ];
  function commandKey(line) {
    const key = String(line).trim().match(/^git\s+([a-z]+)(?:\s|$)/)?.[1];
    return key && Object.prototype.hasOwnProperty.call(commands,key) ? key : null;
  }
  function commandRecap(chapterIndex,journal=[]) {
    const keys = [...new Set([...chapters[chapterIndex].commandKeys,...journal.map(commandKey).filter(Boolean)])];
    return keys.map(key=>({key,...commands[key],examples:[...new Set(journal.filter(line=>commandKey(line)===key))].slice(0,3)}));
  }
  function chapterComplete(chapter,rewards) {
    for(let i=chapter.start;i<=chapter.end;i++) if(!Object.prototype.hasOwnProperty.call(rewards,i)) return false;
    return true;
  }
  function pendingRecap(chapterIndex,engineChapters,rewards,seen) {
    return chapterComplete(engineChapters[chapterIndex],rewards) && !seen[chapterIndex];
  }
  const API = {chapters,commands,commandKey,commandRecap,chapterComplete,pendingRecap};
  if(typeof module!=='undefined'&&module.exports) module.exports=API;
  else root.GitQuestRecaps=API;
})(typeof globalThis!=='undefined'?globalThis:this);
