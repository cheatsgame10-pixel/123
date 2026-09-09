let _factionCheckSubTab = 'pgf';

function loadFactionChecks(){
  const root = document.getElementById('factionChecksRoot');
  if (!root) return;
  if (!canManageDuties()){
    root.innerHTML = emptyState('Раздел проверки фракций доступен помощникам кураторов, кураторам и администратору сайта.');
    return;
  }
  renderFactionChecks();
}

function renderFactionChecks(){
  const root = document.getElementById('factionChecksRoot');
  if (!root) return;
  root.innerHTML = _factionCheckSubTab === 'nicknames'
    ? renderNicknameCheckView()
    : renderPgfCheckView();
  if (_factionCheckSubTab === 'nicknames') initNicknameCheck();
  else initPgfCheck();
}

/* ==========================================================
   3.22 ПГФ — логика перенесена из admin.html (проверка ПГС)
   ========================================================== */

const FC_VALID_ARTICLES = [
  "6.1","6.2","6.3","6.4","6.5","6.6","6.7","7.1","7.2","7.3",
  "8.1","8.2","9.1","9.2","10.1","10.2","10.3","10.4","10.5","10.6","10.7","10.8",
  "11.1","11.2","11.3","11.4","11.5","11.6","11.7","11.8",
  "12.1","12.2","12.3","12.4","12.5","12.6","12.7","12.8","12.8.1","12.9","12.10","12.11","12.12","12.13","12.14","12.15","12.16","12.17","12.18",
  "13.1","13.2","13.3","13.4","13.5","14.1","14.2","14.3","14.4","14.5",
  "15.1","15.1.1","15.2","15.3","15.4","15.5","15.5.1","15.5.2","15.6","15.7",
  "16.1","16.2","16.3","16.4","16.5","16.6","16.7","16.8","16.9","16.10","16.11","16.12","16.13","16.14","16.15","16.16",
  "17.1","17.2","17.3","17.4","17.5","17.6","17.7","18.1","18.2","18.3","18.4","18.5","18.6","18.7","19.1","19.2","19.3","19.4",
  "21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40",
  "41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63"
];

function fcCheckArticle(textPart){
  if (!textPart) return false;
  let clean = textPart.replace(/\[\d+\]/g,'').replace(/\(\d+\s*(?:мин\.?|М|м)\)/g,'');
  let norm = clean.replace(/[,/\\\-]/g,'.').replace(/(\d)([a-zа-я]+)/gi,'$1 $2');
  const matches = norm.match(/\b\d{1,2}(?:\.\d{1,2}){0,2}\b/g) || [];
  const numbers = norm.match(/\b\d{1,2}\b/g) || [];
  for (const m of matches){
    if (FC_VALID_ARTICLES.includes(m)) return true;
    const base = parseInt(m.split('.')[0],10);
    if ((base >= 6 && base <= 19) || (base >= 21 && base <= 63)) return true;
  }
  for (const num of numbers){
    const base = parseInt(num,10);
    if ((base >= 6 && base <= 19) || (base >= 21 && base <= 63)) return true;
  }
  return false;
}

function fcCheckTrash(text){
  if (!text) return false;
  let r = text.toLowerCase();
  const allowedWords = [
    'lspd','lssd','fib','saspa','gov','usss','army','sang','may','pris','ems','wn',
    'жетон','бейдж','id','by','инициатор','дело','кейс','агент','офицер','сотрудник','шериф','детектив','прокурор',
    'ук','ак','дк','коап','куап','уак','ст','ч','пункт','статья','са','ад','доларов','долларов',
    'орм','orm','суд','иск','ордер','as','fc','фз','пк','уп'
  ];
  allowedWords.forEach(w => { r = r.replace(new RegExp(w,'gi'),''); });
  r = r.replace(/[\d\s.,/\\*\-=$()#_!|\[\]+]/g,'');
  if (r.length >= 2) return true;
  const noSpaces = text.replace(/[\s.,\-]/g,'');
  return /^(123+|111+|0+|12345+|1337|000+)$/.test(noSpaces);
}

function renderPgfCheckView(){
  return `
    <div class="fc-check-page">
      <div class="toolbar fc-check-toolbar">
        <div>
          <div class="section-kicker">Проверка фракций</div>
          <h2 class="fc-check-title">Проверка 3.22 ПГФ</h2>
          <div class="muted small">Проверка арестов, штрафов и уровней розыска по логам.</div>
        </div>
      </div>
      <div class="fc-pgs-input">
        <textarea id="fcPgfInput" class="input fc-check-textarea" placeholder="Вставьте логи арестов, штрафов или розыска..."></textarea>
        <button class="btn btn-primary" id="fcPgfAnalyze">Проверить логи</button>
      </div>
      <div class="fc-pgs-grid">
        <div class="fc-table-card">
          <div class="fc-card-head"><span>Все записи</span><span class="muted small" id="fcPgfAllCount">0</span></div>
          <div class="table-scroll-shell">
            <table class="data-table fc-check-table">
              <thead><tr><th>ID</th><th>Сотрудник</th><th>Причина / комментарий</th></tr></thead>
              <tbody id="fcPgfAll"></tbody>
            </table>
          </div>
        </div>
        <div class="fc-table-card">
          <div class="fc-card-head"><span class="fc-danger-text">Нарушители</span><span class="muted small" id="fcPgfViolatorCount">0</span></div>
          <div class="fc-card-actions">
            <button class="btn btn-sm btn-ghost" id="fcPgfCopyCommands">Копировать команды</button>
            <button class="btn btn-sm btn-ghost" id="fcPgfCopyRows">Копировать строки</button>
          </div>
          <div class="table-scroll-shell">
            <table class="data-table fc-check-table">
              <thead><tr><th class="fc-check-cell">✓</th><th>ID</th><th>Сотрудник</th><th>Причина / комментарий</th></tr></thead>
              <tbody id="fcPgfViolators"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function initPgfCheck(){
  document.getElementById('fcPgfAnalyze')?.addEventListener('click', analyzePgfCheck);
  document.getElementById('fcPgfCopyCommands')?.addEventListener('click', copyPgfCommands);
  document.getElementById('fcPgfCopyRows')?.addEventListener('click', copyPgfRows);
}

function analyzePgfCheck(){
  let rawText = document.getElementById('fcPgfInput')?.value || '';
  rawText = rawText.replace(/(\d{2}\.\d{2}\.\d{4},\s*\d{2}:\d{2}:\d{2})(?!\n|$)/g,'$1\n');
  const lines = rawText.split(/\r?\n/);
  const all = document.getElementById('fcPgfAll');
  const vio = document.getElementById('fcPgfViolators');
  if (!all || !vio) return;
  all.innerHTML = ''; vio.innerHTML = '';
  let countAll = 0, countVio = 0;

  lines.forEach(line => {
    if (!line || line.replace(/\t/g,'').trim()==='' || line.startsWith('Ид\t')) return;
    line = line.trim();

    let officerName='', officerId='', type='', commentText='', textCol='';
    if (line.includes('\t')){
      const cols = line.split('\t');
      if (cols.length < 4) return;
      const matchChar = cols[1].match(/([A-Za-z_0-9]+)\s*\[(\d+)\]/);
      if (matchChar){ officerName=matchChar[1]; officerId=matchChar[2]; }
      textCol=cols[3];
      if (textCol.includes('Заключает')){
        type='Арест';
        if (textCol.includes('с комментарием:')) commentText=textCol.split('с комментарием:')[1].trim();
      } else if (textCol.includes('Выписывает штраф')){
        type='Штраф';
        const matchFine=textCol.match(/\(([^)]+)\)$/);
        if (matchFine) commentText=matchFine[1].trim();
      } else if (textCol.includes('Повышает уровень розыска')){
        type='Розыск+';
        const matchWanted=textCol.match(/с причиной "(.*?)"/);
        if (matchWanted) commentText=matchWanted[1].trim();
      } else if (textCol.includes('Понижает уровень розыска')){
        type='Розыск-';
        const matchWanted=textCol.match(/с причиной "(.*?)"/);
        if (matchWanted) commentText=matchWanted[1].trim();
      }
    }
    if (!type || !officerId) return;
    countAll++;

    let badge = type==='Арест' ? '<span class="badge badge-blue">АРЕСТ</span>'
      : type==='Штраф' ? '<span class="badge badge-green">ШТРАФ</span>'
      : type==='Розыск+' ? '<span class="badge badge-red">РОЗЫСК +</span>'
      : '<span class="badge badge-amber">РОЗЫСК -</span>';

    let displayReason='';
    if (type==='Арест'){
      let visualArt=textCol.includes('с комментарием:') ? textCol.split('с комментарием:')[0] : textCol;
      visualArt=visualArt.replace(/^.*?под стражу в .*?(?:статье|статьи|статью|пуко статье|по)\s*/i,'').replace(/\(\d+\s*(?:мин\.?|М|м)\)/g,'').trim();
      displayReason=`Статья: ${escapeHtml(visualArt || 'нет')} <span class="muted">| Коммент: ${escapeHtml(commentText || 'пусто')}</span>`;
    } else displayReason=escapeHtml(commentText || 'пусто');

    const trAll=document.createElement('tr');
    trAll.innerHTML=`<td class="fc-id"><span class="copy-id">${escapeHtml('['+officerId+']')}</span></td><td>${escapeHtml(officerName)}</td><td>${badge} ${displayReason}</td>`;
    trAll.querySelector('.copy-id')?.addEventListener('click',e=>{ e.stopPropagation(); navigator.clipboard.writeText(officerId).catch(()=>{}); });
    all.appendChild(trAll);

    let errors=[];
    const rComment=commentText.trim();
    if(type==='Арест'){
      let articlePart=textCol.includes('с комментарием:') ? textCol.split('с комментарием:')[0] : textCol;
      articlePart=articlePart.replace(/^.*?под стражу в .*?(?:статье|статьи|статью|пуко статье|по)\s*/i,'').replace(/\(\d+\s*(?:мин\.?|М|м)\)/g,'').trim();
      if(!fcCheckArticle(articlePart) && !['суд','иск','as-','ордер','ук','коап'].some(w=>articlePart.toLowerCase().includes(w))) errors.push('СТАТЬЯ');
      if(fcCheckTrash(rComment)) errors.push('КОММЕНТАРИЙ');
    } else if(type==='Розыск-'){
      if(!['ошибка','ошибочно','ошибочный','амнистия','откат','снят','оправдан'].some(w=>rComment.toLowerCase().includes(w))) errors.push('ПРИЧИНА СНЯТИЯ');
    } else {
      if(!rComment || rComment==='-' || rComment==='.') errors.push('ПУСТАЯ ПРИЧИНА');
      else {
        if(!fcCheckArticle(rComment) && !['орм','orm','суд','иск','as-','ордер','ук','коап','куап','fc'].some(w=>rComment.toLowerCase().includes(w))) errors.push('СТАТЬЯ');
        if(fcCheckTrash(rComment)) errors.push('ТЕКСТ');
      }
    }

    if(errors.length){
      countVio++;
      const tr=document.createElement('tr');
      tr.className='fc-violation';
      tr.innerHTML=`<td class="fc-check-cell"><input type="checkbox" class="fc-check-input" data-officer-id="${escapeHtml(officerId)}"></td>
        <td class="fc-id">${escapeHtml('['+officerId+']')}</td><td>${escapeHtml(officerName)}</td>
        <td>${badge} ${displayReason}<div class="fc-error">ОШИБКА: ${escapeHtml(errors.join(' + '))}</div></td>`;
      tr.dataset.rawLine=line;
      tr.querySelector('input')?.addEventListener('click',e=>e.stopPropagation());
      tr.addEventListener('click',e=>{
        if(e.target.tagName==='INPUT') return;
        const cb=tr.querySelector('input'); if(cb){ cb.checked=!cb.checked; tr.classList.toggle('is-checked',cb.checked); }
      });
      tr.querySelector('input')?.addEventListener('change',e=>tr.classList.toggle('is-checked',e.target.checked));
      vio.appendChild(tr);
    }
  });
  document.getElementById('fcPgfAllCount').textContent=countAll;
  document.getElementById('fcPgfViolatorCount').textContent=countVio;
}

function getPgfSelected(){
  return [...document.querySelectorAll('#fcPgfViolators .fc-check-input:checked')];
}
function copyPgfCommands(){
  const selected=getPgfSelected();
  if(!selected.length){ toast('Сначала выделите нарушителей', 'error'); return; }
  const text=selected.map(cb=>`offprison ${cb.dataset.officerId} 10 3.22 Правил государственных фракций (ранее) // by Severov`).join('\n');
  navigator.clipboard.writeText(text).then(()=>toast(`Скопировано команд: ${selected.length}`)).catch(()=>toast('Не удалось скопировать','error'));
}
function copyPgfRows(){
  const selected=getPgfSelected();
  if(!selected.length){ toast('Сначала выделите нарушителей', 'error'); return; }
  const text=selected.map(cb=>cb.closest('tr')?.dataset.rawLine || '').join('\n');
  navigator.clipboard.writeText(text).then(()=>toast(`Скопировано строк: ${selected.length}`)).catch(()=>toast('Не удалось скопировать','error'));
}

/* ==========================================================
   Проверка ников
   ========================================================== */

function renderNicknameCheckView(){
  return `
    <div class="fc-check-page">
      <div class="toolbar fc-check-toolbar">
        <div>
          <div class="section-kicker">Проверка фракций</div>
          <h2 class="fc-check-title">Проверка ников</h2>
          <div class="muted small">Сравнение ников из Discord и списка с сайта. Формат сайта очищается автоматически.</div>
        </div>
      </div>
      <div class="fc-roster-inputs">
        <div class="field">
          <label>Discord</label>
          <textarea id="fcDiscordNicks" class="input fc-check-textarea fc-roster-area" placeholder="&lt;@133285397694&gt; Blood_Toxic&#10;&lt;@123456789&gt; Example_Name"></textarea>
        </div>
        <div class="field">
          <label>Ники с сайта</label>
          <textarea id="fcSiteNicks" class="input fc-check-textarea fc-roster-area" placeholder="| 🔴 Gora_Tennant [6431] [(ч)](...) [(н)](...) | 22 |&#10;| 🟢 Example_Name [1234] ... | 15 |"></textarea>
        </div>
      </div>
      <button class="btn btn-primary fc-wide-btn" id="fcNickAnalyze">Сравнить списки</button>
      <div class="fc-roster-results">
        <div class="card fc-result-card">
          <div class="fc-card-head fc-result-red"><span>Есть в Discord, нет на сайте</span><span id="fcNickDsCount">0</span></div>
          <div class="fc-card-actions"><button class="btn btn-sm btn-ghost" id="fcNickCopyTags">Копировать теги</button></div>
          <div class="fc-result-list" id="fcNickDsList"></div>
        </div>
        <div class="card fc-result-card">
          <div class="fc-card-head fc-result-orange"><span>Есть на сайте, нет в Discord</span><span id="fcNickSiteCount">0</span></div>
          <div class="fc-result-list" id="fcNickSiteList"></div>
        </div>
        <div class="card fc-result-card">
          <div class="fc-card-head fc-result-green"><span>Совпадения</span><span id="fcNickOkCount">0</span></div>
          <div class="fc-result-list" id="fcNickOkList"></div>
        </div>
      </div>
    </div>`;
}

function initNicknameCheck(){
  document.getElementById('fcNickAnalyze')?.addEventListener('click', checkFactionNicknames);
  document.getElementById('fcNickCopyTags')?.addEventListener('click', copyFactionNickTags);
}

let _factionNickTags=[];

function parseDiscordNicknameLine(line){
  const raw=String(line||'').trim();
  if(!raw) return null;
  const tag=(raw.match(/<@!?\d+>/)||[''])[0];
  let withoutTag=raw.replace(/<@!?\d+>/,'').trim();
  const tokens=withoutTag.split(/\s+/).filter(Boolean);
  const nick=tokens[tokens.length-1]?.replace(/^[|:,]+|[|:,]+$/g,'') || '';
  if(!nick || nick.length<2) return null;
  return {name:nick,tag:tag || '—'};
}

function parseSiteNicknameLine(line){
  const raw=String(line||'').trim();
  if(!raw) return null;
  // Основной формат: | 🔴 Nick_Name [6431] [(ч)](url) [(н)](url) | ...
  let m=raw.match(/^\|\s*.*?([A-Za-z0-9_]+)\s*\[\d+\]\s*(?:\[[^\]]*\]\([^)]*\)\s*)*\|/);
  if(!m){
    m=raw.match(/([A-Za-z0-9_]+)\s*\[\d+\]/);
  }
  if(!m) return null;
  return m[1].replace(/\\_/g,'_').trim();
}

function checkFactionNicknames(){
  const dsLines=(document.getElementById('fcDiscordNicks')?.value||'').split(/\r?\n/);
  const siteLines=(document.getElementById('fcSiteNicks')?.value||'').split(/\r?\n/);

  const dsMap=new Map();
  dsLines.forEach(line=>{
    const item=parseDiscordNicknameLine(line);
    if(item) dsMap.set(item.name.toLowerCase(),item);
  });
  const siteNames=new Map();
  siteLines.forEach(line=>{
    const nick=parseSiteNicknameLine(line);
    if(nick) siteNames.set(nick.toLowerCase(),nick);
  });

  const onlyDs=[],onlySite=[],match=[];
  dsMap.forEach((v,k)=>siteNames.has(k)?match.push(v.name):onlyDs.push(v));
  siteNames.forEach((v,k)=>{ if(!dsMap.has(k)) onlySite.push(v); });

  _factionNickTags=onlyDs;
  renderFactionNickList('fcNickDsList',onlyDs,true);
  renderFactionNickList('fcNickSiteList',onlySite.sort(),false);
  renderFactionNickList('fcNickOkList',match.sort(),false);
  document.getElementById('fcNickDsCount').textContent=onlyDs.length;
  document.getElementById('fcNickSiteCount').textContent=onlySite.length;
  document.getElementById('fcNickOkCount').textContent=match.length;
}

function renderFactionNickList(id,items,isDs){
  const el=document.getElementById(id);
  if(!el) return;
  el.innerHTML='';
  items.forEach(item=>{
    const row=document.createElement('div');
    row.className='fc-roster-row';
    row.innerHTML=isDs
      ? `<span>${escapeHtml(item.name)}</span><span class="fc-tag">${escapeHtml(item.tag)}</span>`
      : `<span>${escapeHtml(item)}</span>`;
    el.appendChild(row);
  });
}

function copyFactionNickTags(){
  if(!_factionNickTags.length){ toast('Список Discord пуст', 'error'); return; }
  navigator.clipboard.writeText(_factionNickTags.map(x=>x.tag).join('\n'))
    .then(()=>toast(`Скопировано тегов: ${_factionNickTags.length}`))
    .catch(()=>toast('Не удалось скопировать','error'));
}
