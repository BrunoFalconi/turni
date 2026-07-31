(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['backup']='3.5';
document.getElementById('exportBackup').onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`turni-backup-${ymd(new Date())}.json`;a.click();URL.revokeObjectURL(a.href);
};
document.getElementById('importBackup').onclick=()=>document.getElementById('backupInput').click();
document.getElementById('backupInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{state=normalizeState(JSON.parse(await f.text()));saveState();render();alert('Backup ripristinato.')}catch(err){alert('Backup non valido.')}
});
