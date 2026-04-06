
(function(){
  function qsa(sel,root){root=root||document;return Array.from(root.querySelectorAll(sel));}
  function byId(id){return document.getElementById(id);}
  function fmtDate(v){if(!v)return'';var d=new Date(v);return isNaN(d)?'':d.toLocaleString('ko-KR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  function setStatus(el,msg,type){if(!el)return;el.textContent=msg||'';el.className='status'+(type?' '+type:'');el.classList.toggle('hidden',!msg);}
  function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function formatBodyHtml(s){return escapeHtml(String(s==null?'':s).trim()).replace(/\n{3,}/g,'<br><br>').replace(/\n/g,'<br>');}
  function localName(email){return (email||'').split('@')[0]||email||'';}
  function isAllowedAdmin(email){
    var allowed=(window.ADMIN_EMAILS||[]).map(function(v){return String(v||'').trim().toLowerCase();}).filter(Boolean);
    return !!email && allowed.indexOf(String(email).trim().toLowerCase())!==-1;
  }

  var BG_KEYS=[
    {key:'home',label:'Home'},
    {key:'publication',label:'Publication'},
    {key:'members',label:'Lab Member'},
    {key:'boards',label:'Boards'},
    {key:'gallery',label:'Gallery'}
  ];
  function getCategoryOptions(s){return s==='board'?['Notice','Seminar','Recruitment']:['General','Lab Life','Event','Poster'];}

  var navToggle=byId('nav-toggle'),mainNav=byId('main-nav');
  if(navToggle&&mainNav)navToggle.addEventListener('click',function(){mainNav.classList.toggle('open');});
  qsa('.has-submenu > a').forEach(function(link){
    link.addEventListener('click',function(e){
      if(window.innerWidth<=920){
        var p=link.parentElement;
        if(p&&!p.classList.contains('open')){
          e.preventDefault();
          qsa('.has-submenu.open').forEach(function(el){if(el!==p)el.classList.remove('open');});
          p.classList.add('open');
        }
      }
    });
  });

  var SUPA_URL=window.SUPABASE_URL||'',SUPA_KEY=window.SUPABASE_ANON_KEY||'';
  var hasConfig=!!(SUPA_URL&&SUPA_KEY&&!SUPA_URL.includes('YOUR_SUPABASE'));
  var sb=(window.supabase&&hasConfig)?window.supabase.createClient(SUPA_URL,SUPA_KEY):null;
  var _session=null;

  async function signIn(email,pw){
    var r=await fetch(SUPA_URL+'/auth/v1/token?grant_type=password',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY},
      body:JSON.stringify({email:email,password:pw})
    });
    var d=await r.json();
    if(!r.ok)return{error:{message:d.error_description||d.message||d.error||'로그인 실패'}};

    var userEmail=(d.user&&d.user.email)||email;
    if(!isAllowedAdmin(userEmail)){
      return {error:{message:'허용된 관리자 계정만 로그인할 수 있습니다.'}};
    }

    _session=d;
    if(sb)await sb.auth.setSession({access_token:d.access_token,refresh_token:d.refresh_token}).catch(function(){});
    return{data:d,error:null};
  }
  async function getSession(){
    if(_session&&_session.access_token){
      var em=(_session.user&&_session.user.email)||'';
      if(isAllowedAdmin(em)) return _session;
      _session=null;
    }
    if(!sb)return null;
    try{
      var r=await sb.auth.getSession();
      if(r.data&&r.data.session){
        var s=r.data.session,em=(s.user&&s.user.email)||'';
        if(isAllowedAdmin(em)){_session=s;return _session;}
        await sb.auth.signOut().catch(function(){});
      }
    }catch(e){}
    return null;
  }
  async function signOut(){_session=null;if(sb)await sb.auth.signOut().catch(function(){});}

  async function uploadFile(path,file){
    if(!sb)throw new Error('Supabase 미연결');
    var up=await sb.storage.from('lab-media').upload(path,file,{upsert:false});
    if(up.error)throw up.error;
    return sb.storage.from('lab-media').getPublicUrl(path).data.publicUrl;
  }
  async function getStorageImages(){
    if(!sb)return[];
    var r=await sb.storage.from('lab-media').list('posts',{limit:100,sortBy:{column:'created_at',order:'desc'}});
    if(r.error)return[];
    return(r.data||[]).filter(function(i){return i.name&&!i.name.endsWith('/');}).map(function(i){
      var p='posts/'+i.name;
      return{path:p,publicUrl:sb.storage.from('lab-media').getPublicUrl(p).data.publicUrl,name:i.name};
    });
  }
  async function loadBgMap(){
    if(!sb)return{};
    try{
      var r=await sb.from('site_backgrounds').select('page_key,image_url,image_path');
      if(r.error)return{};
      var m={};(r.data||[]).forEach(function(row){m[row.page_key]=row;});
      return m;
    }catch(e){return{};}
  }

  function inferMediaKind(post){
    var src=(post.image_url||post.image_path||'').toLowerCase();
    if(!src)return 'none';
    if(/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/.test(src)) return 'video';
    if(/\.(heic|heif)(\?|#|$)/.test(src)) return 'heic';
    if(/\.(zip|rar|7z|pdf|doc|docx|xls|xlsx|ppt|pptx)(\?|#|$)/.test(src)) return 'file';
    return 'image';
  }
  function renderMedia(post){
    var url=post.image_url||'';
    if(!url) return '';
    var kind=inferMediaKind(post);
    if(kind==='video'){
      return '<div class="post-media-box"><video class="post-video" controls preload="metadata"><source src="'+escapeHtml(url)+'"></video></div>';
    }
    if(kind==='heic'){
      return '<div class="post-media-box heic-box"><div class="heic-note">HEIC / HEIF 파일</div><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener" class="button">파일 열기</a></div>';
    }
    if(kind==='file'){
      return '<div class="post-media-box file-box"><div class="file-note">첨부 파일</div><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener" class="button">파일 열기</a></div>';
    }
    return '<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener" class="post-media-box post-img-link"><img src="'+escapeHtml(url)+'" class="post-img" loading="lazy" alt="'+escapeHtml(post.title||"media")+'"></a>';
  }
  function renderPostCard(post, canEdit, canDelete){
    var media=renderMedia(post);
    var hasMedia=!!media;
    var buttons='';
    if(canEdit){buttons += '<button class="button muted-button" data-edit="'+post.id+'">수정</button>';}
    if(canDelete){buttons += '<button class="button muted-button" data-delete="'+post.id+'">삭제</button>';}
    var actionHtml = buttons ? '<div class="post-action-row">'+buttons+'</div>' : '';
    return '<article class="panel post-card'+(hasMedia?' has-media':'')+'>'+
      '<div class="post-label-row"><span class="badge">'+(post.section==='gallery'?'Gallery':'Board')+'</span><span class="mini-tag">'+escapeHtml(post.category||'')+'</span></div>'+
      '<div class="post-layout">'+
        '<div class="post-content"><h3 class="post-title">'+escapeHtml(post.title||'')+'</h3><div class="post-meta"><span class="post-author">'+escapeHtml(post.author_name||'')+'</span><span class="post-date">'+fmtDate(post.created_at)+'</span></div><div class="post-body">'+formatBodyHtml(post.body)+'</div>'+actionHtml+'</div>'+
        (hasMedia?'<div class="post-side-media">'+media+'</div>':'')+
      '</div></article>';
  }

  function renderPosts(c,posts,empty){
    if(!c)return;
    if(!posts.length){c.innerHTML='<article class="panel post-card"><p>'+escapeHtml(empty)+'</p></article>';return;}
    c.innerHTML=posts.map(function(p){return renderPostCard(p,false,false);}).join('');
  }
  async function renderPublicPosts(){
    var c=byId('public-post-list'),st=byId('public-post-status');if(!c)return;
    if(!sb){setStatus(st,'');return;}
    var r=await sb.from('posts').select('id,title,body,image_url,image_path,created_at,author_name,section,category').order('created_at',{ascending:false});
    if(r.error){setStatus(st,r.error.message,'error');return;}
    setStatus(st,'');
    renderPosts(c,(r.data||[]).slice(0,6),'아직 업로드된 글이 없습니다.');
    c.classList.add('post-strip','latest-strip');
    enableDragScroll(c);
  }
  async function renderSectionPosts(){
    var containers=qsa('[data-section]');if(!containers.length)return;
    var st=byId('section-post-status');
    if(!sb){setStatus(st,'');return;}
    for(var i=0;i<containers.length;i++){
      var c=containers[i],sec=c.dataset.section,cat=c.dataset.category||'';
      var q=sb.from('posts').select('id,title,body,image_url,image_path,created_at,author_name,section,category').eq('section',sec).order('created_at',{ascending:false});
      if(cat)q=q.eq('category',cat);
      var r=await q;
      if(r.error){setStatus(st,r.error.message,'error');return;}
      renderPosts(c,r.data||[],cat?cat+' 글이 없습니다.':(sec==='gallery'?'갤러리':'게시판')+' 글이 없습니다.');
      if(sec==='gallery'){
        c.classList.remove('post-strip');
        c.classList.add('gallery-grid');
      }
    }
    setStatus(st,'');
  }

  async function handleLogin(){
    var form=byId('login-form'),st=byId('login-status');if(!form)return;
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      if(!hasConfig){setStatus(st,'config.js에 Supabase 정보를 넣어야 합니다.','error');return;}
      var email=byId('login-email').value.trim(),pw=byId('login-password').value;
      if(!email||!pw){setStatus(st,'이메일과 비밀번호를 입력하세요.','error');return;}
      setStatus(st,'로그인 중...');
      var r=await signIn(email,pw);
      if(r.error){
        var msg=r.error.message||'로그인 실패';
        if(msg.includes('Invalid login'))msg='이메일 또는 비밀번호가 올바르지 않습니다.';
        if(msg.includes('Email not confirmed'))msg='이메일 인증이 필요합니다. Supabase에서 이메일 인증 설정을 확인하세요.';
        setStatus(st,msg,'error');return;
      }
      window.location.href='dashboard.html';
    });
  }

  async function updateAuthUI(){
    var links=qsa('.auth-link');if(!links.length)return;
    var session=await getSession();
    if(session){
      links.forEach(function(link){
        link.textContent='Logout';
        link.setAttribute('href','#');
        link.onclick=async function(e){e.preventDefault();await signOut();window.location.href='index.html';};
      });
      injectAdminNav();
    }else{
      links.forEach(function(link){
        link.textContent='Login';
        link.setAttribute('href','login.html');
        link.onclick=null;
      });
      var ex=byId('admin-nav-item');if(ex)ex.remove();
    }
  }
  function injectAdminNav(){
    if(byId('admin-nav-item'))return;
    var nav=byId('main-nav');if(!nav)return;
    var item=document.createElement('div');
    item.className='nav-item has-submenu';item.id='admin-nav-item';
    item.innerHTML='<a href="dashboard.html" style="background:#1686d920;color:#0e5fa8">관리</a><div class="submenu"><a href="dashboard.html">게시물 업로드</a><a href="dashboard.html?tab=members">멤버 관리</a><a href="dashboard.html?tab=backgrounds">배경 이미지</a></div>';
    var authLink=nav.querySelector('.auth-link');
    if(authLink)nav.insertBefore(item,authLink);else nav.appendChild(item);
    item.querySelector('a').addEventListener('click',function(e){if(window.innerWidth<=920){e.preventDefault();item.classList.toggle('open');}});
  }

  async function applyBg(){
    var key=document.body&&document.body.dataset&&document.body.dataset.bgKey;
    var target=document.querySelector('[data-banner-target]');
    if(!key||!target)return;
    try{
      var cached=localStorage.getItem('bg_cache_'+key);
      if(cached) target.style.backgroundImage='url("'+cached+'")';
    }catch(_e){}
    if(!sb)return;
    try{
      var r=await sb.from('site_backgrounds').select('image_url').eq('page_key',key).maybeSingle();
      if(!r.error&&r.data&&r.data.image_url){
        target.style.backgroundImage='url("'+r.data.image_url+'")';
        try{localStorage.setItem('bg_cache_'+key,r.data.image_url);}catch(_e){}
      }
    }catch(e){}
  }

  function initDashboardTabs(){
    var tabs=qsa('.dash-tab'),panels=qsa('.dash-panel');if(!tabs.length)return;
    var loaded={};
    function switchTab(name){
      tabs.forEach(function(t){t.classList.toggle('active',t.dataset.tab===name);});
      panels.forEach(function(p){p.classList.toggle('active',p.dataset.panel===name);});
      if(!loaded[name]){
        loaded[name]=true;
        if(name==='members')renderInlineMembers();
      }
    }
    tabs.forEach(function(t){t.addEventListener('click',function(){switchTab(t.dataset.tab);});});
    var urlTab=new URLSearchParams(window.location.search).get('tab');
    if(urlTab && qsa('.dash-tab[data-tab="'+urlTab+'"]').length) switchTab(urlTab);
  }

  async function handleDashboard(){
    var wrapper=byId('dashboard-root');if(!wrapper)return;
    var authSt=byId('dashboard-status'),bgSt=byId('background-status');
    if(!sb){setStatus(authSt,'config.js에 Supabase 정보를 넣어야 합니다.','error');return;}
    var session=await getSession();
    if(!session){window.location.href='login.html';return;}
    var user=session.user||session;
    var secSel=byId('post-section'),catSel=byId('post-category'),form=byId('upload-form'),list=byId('dashboard-post-list'),fileInput=byId('post-image');
    var editId=byId('post-edit-id'), submitBtn=byId('post-submit-btn'), cancelBtn=byId('post-cancel-edit'), editHelp=byId('post-edit-help');
    var currentEditingPost=null;
    if(fileInput) fileInput.setAttribute('accept','image/*,video/*,.heic,.heif');
    function refillCat(){
      if(!secSel||!catSel)return;
      var cur=catSel.value,opts=getCategoryOptions(secSel.value);
      catSel.innerHTML=opts.map(function(v){return'<option value="'+v+'">'+v+'</option>';}).join('');
      if(opts.indexOf(cur)!==-1)catSel.value=cur;
    }
    function resetPostForm(){
      if(form)form.reset();
      if(editId)editId.value='';
      currentEditingPost=null;
      if(editHelp)editHelp.style.display='none';
      if(cancelBtn)cancelBtn.style.display='none';
      if(submitBtn)submitBtn.textContent='업로드';
      refillCat();
    }
    function enterEditMode(post){
      currentEditingPost=post||null;
      if(editId)editId.value=post.id||'';
      if(secSel)secSel.value=post.section||'board';
      refillCat();
      if(catSel)catSel.value=post.category||catSel.value;
      byId('post-title').value=post.title||'';
      byId('post-body').value=post.body||'';
      if(fileInput)fileInput.value='';
      if(editHelp)editHelp.style.display='block';
      if(cancelBtn)cancelBtn.style.display='inline-flex';
      if(submitBtn)submitBtn.textContent='수정 저장';
      window.scrollTo({top:0,behavior:'smooth'});
    }
    if(secSel)secSel.addEventListener('change',refillCat);
    if(cancelBtn)cancelBtn.addEventListener('click',function(){resetPostForm();setStatus(authSt,'수정 모드를 취소했습니다.','success');});
    refillCat();
    async function loadPosts(){
      var r=await sb.from('posts').select('id,title,body,image_url,image_path,created_at,author_name,user_id,section,category').order('created_at',{ascending:false});
      if(r.error){setStatus(authSt,r.error.message,'error');return;}
      var uid=user.id||user.sub;
      var posts=r.data||[];
      list.innerHTML=posts.length?posts.map(function(p){return renderPostCard(p,true,String(p.user_id)===String(uid));}).join(''):'<article class="panel post-card"><p>아직 업로드된 글이 없습니다.</p></article>';
      qsa('[data-delete]',list).forEach(function(btn){btn.addEventListener('click',async function(){if(!confirm('삭제할까요?'))return;var del=await sb.from('posts').delete().eq('id',btn.dataset.delete).eq('user_id',uid);if(del.error){setStatus(authSt,del.error.message,'error');return;}if(editId&&editId.value===btn.dataset.delete)resetPostForm();setStatus(authSt,'게시물을 삭제했습니다.','success');await loadPosts();});});
      qsa('[data-edit]',list).forEach(function(btn){btn.addEventListener('click',function(){var post=posts.find(function(p){return String(p.id)===String(btn.dataset.edit);});if(post)enterEditMode(post);});});
    }
    await loadPosts();
    if(form)form.addEventListener('submit',async function(e){
      e.preventDefault();
      var title=byId('post-title').value.trim(),body=byId('post-body').value.trim(),sec=byId('post-section').value,cat=byId('post-category').value,file=fileInput&&fileInput.files[0],currentEditId=editId&&editId.value;
      if(!title||!body){setStatus(authSt,'제목과 내용을 입력하세요.','error');return;}
      setStatus(authSt,currentEditId?'수정 중...':'업로드 중...');
      try{
        var uid=user.id||user.sub;
        var payload={author_name:(currentEditingPost&&currentEditingPost.author_name)||(localName(user.email)||user.email||'admin'),title:title,body:body,section:sec,category:cat};
        if(currentEditingPost&&currentEditingPost.image_url){payload.image_url=currentEditingPost.image_url;}
        if(currentEditingPost&&currentEditingPost.image_path){payload.image_path=currentEditingPost.image_path;}
        if(file){var ext=(file.name.split('.').pop()||'bin').toLowerCase();var path='posts/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;payload.image_url=await uploadFile(path,file);payload.image_path=path;}
        var res;
        if(currentEditId){res=await sb.from('posts').update(payload).eq('id',currentEditId);}else{payload.user_id=uid;res=await sb.from('posts').insert(payload);}
        if(res.error)throw res.error;
        resetPostForm();
        setStatus(authSt,currentEditId?'게시물을 수정했습니다.':'업로드 완료!','success');
        await loadPosts();
      }catch(err){setStatus(authSt,err.message||String(err),'error');}
    });
    var bgMgr=byId('background-manager');
    if(bgMgr){
      try{
        var res=await Promise.all([getStorageImages(),loadBgMap()]);
        var images=res[0],bgMap=res[1];
        bgMgr.innerHTML=BG_KEYS.map(function(item){
          var cur=bgMap[item.key]?bgMap[item.key].image_path:'';
          var opts=['<option value="">기본 배경 유지</option>'].concat(images.map(function(img){return'<option value="'+escapeHtml(img.path)+'"'+(img.path===cur?' selected':'')+'>'+escapeHtml(img.name)+'</option>';}));
          return'<div class="background-row panel"><label for="bg-'+item.key+'">'+item.label+'</label><select class="input background-select" id="bg-'+item.key+'" data-bg-key="'+item.key+'">'+opts.join('')+'</select></div>';
        }).join('');
        qsa('.background-select',bgMgr).forEach(function(sel){sel.addEventListener('change',async function(){var key=sel.dataset.bgKey,path=sel.value;try{var uid=user.id||user.sub;if(!path){await sb.from('site_backgrounds').delete().eq('page_key',key);try{localStorage.removeItem('bg_cache_'+key);}catch(_e){}} else {var img=images.find(function(i){return i.path===path;});await sb.from('site_backgrounds').upsert({page_key:key,image_path:path,image_url:img?img.publicUrl:'',updated_by:uid},{onConflict:'page_key'});try{if(img&&img.publicUrl)localStorage.setItem('bg_cache_'+key,img.publicUrl);}catch(_e){}}setStatus(bgSt,'저장되었습니다.','success');}catch(err){setStatus(bgSt,err.message,'error');}});});
      }catch(err){setStatus(bgSt,err.message,'error');}
    }
  }

  function renderInlineMembers(){
    var root=byId('inline-members-root');if(!root)return;
    if(!sb){root.innerHTML='<p style="color:var(--muted)">Supabase 연결이 필요합니다.</p>';return;}
    root.innerHTML='<p style="color:var(--muted)">불러오는 중...</p>';
    var MEMBER_LAB='경북대학교 숙주 바이러스 면역동력학 연구실';
    var MEMBER_ROLES=['석사과정생','박사과정생','박사 후 과정생','학부연구생'];
    var ALUMNI_ROLES=['MS course','PhD course'];
    var CURRENT_YEAR=(new Date()).getFullYear();
    var YEAR_OPTIONS=[]; for(var y=CURRENT_YEAR+1;y>=2000;y--){YEAR_OPTIONS.push(String(y));}
    async function uploadPhoto(file){var ext=(file.name.split('.').pop()||'jpg').toLowerCase();var path='members/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;return await uploadFile(path,file);}
    function optionHtml(items,selected,placeholder){var html=placeholder?'<option value="">'+placeholder+'</option>':'';return html+items.map(function(v){return '<option value="'+escapeHtml(v)+'"'+(String(selected||'')===String(v)?' selected':'')+'>'+escapeHtml(v)+'</option>';}).join('');}
    function cardHtml(m,forcedType){m=m||{};var kind=forcedType||m.member_type||'member';var isAlumni=kind==='alumni';var isNew=!m.id;return '<div class="admin-member-card panel" data-id="'+(m.id||'')+'" data-member-kind="'+kind+'"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="flex-shrink:0"><div class="admin-photo-preview" style="width:80px;height:80px;border-radius:14px;overflow:hidden;background:#edf4fb;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:900;color:#6f8398">'+(m.photo_url?'<img src="'+escapeHtml(m.photo_url)+'" style="width:100%;height:100%;object-fit:cover" alt="">':(m.name?escapeHtml(m.name[0]):'?'))+'</div><input type="file" accept="image/*" class="file-input admin-photo-input" style="margin-top:6px;font-size:.8rem;width:80px"></div><div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:240px"><div style="grid-column:1/-1"><label class="admin-label">이름 *</label><input type="text" class="input admin-name" value="'+escapeHtml(m.name||'')+'" placeholder="홍길동"></div><div><label class="admin-label">구분</label><input type="text" class="input" value="'+(isAlumni?'졸업생':'현재 멤버')+'" readonly></div><div><label class="admin-label">역할</label><select class="input admin-role">'+optionHtml(isAlumni?ALUMNI_ROLES:MEMBER_ROLES,m.role||(isAlumni?ALUMNI_ROLES[0]:MEMBER_ROLES[0]))+'</select></div><div><label class="admin-label">'+(isAlumni?'현재 소속(졸업생)':'현재 소속')+'</label><input type="text" class="input admin-position" value="'+escapeHtml(isAlumni?(m.current_position||''):MEMBER_LAB)+'" '+(isAlumni?'':'readonly')+'></div>'+(isAlumni?'<div><label class="admin-label">졸업 연도</label><select class="input admin-grad-year">'+optionHtml(YEAR_OPTIONS,m.graduation_year,'선택')+'</select></div>':'<div><label class="admin-label">순서</label><input type="number" class="input admin-order" value="'+(m.display_order||0)+'" style="width:100px"></div>')+(isAlumni?'<div><label class="admin-label">순서</label><input type="number" class="input admin-order" value="'+(m.display_order||0)+'" style="width:100px"></div>':'')+'<div style="grid-column:1/-1"><label class="admin-label">소개</label><textarea class="textarea admin-bio" style="min-height:64px">'+escapeHtml(m.bio||'')+'</textarea></div></div></div><div style="display:flex;gap:10px;margin-top:12px;align-items:center"><button class="button primary admin-save-btn" type="button">'+(isNew?'추가':'저장')+'</button>'+(isNew?'':'<button class="button admin-del-btn" style="border-color:#f0c4be;color:#a44236" type="button">삭제</button>')+'<span class="admin-card-status" style="font-size:.88rem;color:var(--muted)"></span></div></div>';}
    async function renderMgmt(){var r=await sb.from('lab_members').select('*').order('member_type').order('display_order');if(r.error){root.innerHTML='<div class="panel card"><p style="color:#a44236">오류: '+escapeHtml(r.error.message)+'</p><p style="color:var(--muted);margin-top:8px">lab_members 테이블을 확인하세요.</p></div>';return;}var all=r.data||[],members=all.filter(function(m){return m.member_type!=='alumni';}),alumni=all.filter(function(m){return m.member_type==='alumni';});root.innerHTML='<div class="section-header" style="margin-bottom:12px"><h2>현재 구성원</h2></div><div id="imgt-member-list" style="display:grid;gap:12px">'+members.map(function(m){return cardHtml(m,'member');}).join('')+'</div><button class="button primary" id="imgt-add-member" style="margin-top:12px">+ 멤버 추가</button><div id="imgt-new-member" style="margin-top:10px"></div><hr class="soft" style="margin:24px 0"><div class="section-header" style="margin-bottom:12px"><h2>졸업생 (Alumni)</h2></div><div id="imgt-alumni-list" style="display:grid;gap:12px">'+alumni.map(function(m){return cardHtml(m,'alumni');}).join('')+'</div><button class="button primary" id="imgt-add-alumni" style="margin-top:12px">+ 졸업생 추가</button><div id="imgt-new-alumni" style="margin-top:10px"></div>';bind(root);byId('imgt-add-member')&&byId('imgt-add-member').addEventListener('click',function(){var s=byId('imgt-new-member');s.innerHTML=cardHtml({member_type:'member',role:MEMBER_ROLES[0],current_position:MEMBER_LAB},'member');bind(s);});byId('imgt-add-alumni')&&byId('imgt-add-alumni').addEventListener('click',function(){var s=byId('imgt-new-alumni');s.innerHTML=cardHtml({member_type:'alumni',role:ALUMNI_ROLES[0]},'alumni');bind(s);});}
    function bind(scope){qsa('.admin-member-card',scope).forEach(function(card){var st=card.querySelector('.admin-card-status');card.querySelector('.admin-save-btn')&&card.querySelector('.admin-save-btn').addEventListener('click',async function(){var id=card.dataset.id,name=card.querySelector('.admin-name').value.trim(),kind=card.dataset.memberKind==='alumni'?'alumni':'member';if(!name){st.textContent='이름을 입력하세요.';st.style.color='#a44236';return;}st.textContent='저장 중...';st.style.color='var(--muted)';var photo_url=null,pf=card.querySelector('.admin-photo-input').files[0];if(pf){try{photo_url=await uploadPhoto(pf);}catch(e){st.textContent=e.message;st.style.color='#a44236';return;}}var payload={name:name,member_type:kind,role:card.querySelector('.admin-role').value,current_position:kind==='alumni'?(card.querySelector('.admin-position').value.trim()||null):MEMBER_LAB,graduation_year:kind==='alumni'?((card.querySelector('.admin-grad-year')&&card.querySelector('.admin-grad-year').value)||null):null,bio:card.querySelector('.admin-bio').value.trim()||null,display_order:parseInt(card.querySelector('.admin-order').value)||0};if(photo_url)payload.photo_url=photo_url;var res=id?await sb.from('lab_members').update(payload).eq('id',id):await sb.from('lab_members').insert(payload);if(res.error){if(String(res.error.message||'').toLowerCase().indexOf('graduation_year')!==-1){st.textContent='graduation_year 컬럼이 필요합니다. zip 안의 SQL을 실행하세요.';st.style.color='#a44236';}else{st.textContent=res.error.message;st.style.color='#a44236';}}else{st.textContent='저장됨 ✓';st.style.color='#2f7a3f';await renderMgmt();}});card.querySelector('.admin-del-btn')&&card.querySelector('.admin-del-btn').addEventListener('click',async function(){if(!confirm('삭제할까요?'))return;await sb.from('lab_members').delete().eq('id',card.dataset.id);await renderMgmt();});var pi=card.querySelector('.admin-photo-input');if(pi)pi.addEventListener('change',function(e){var file=e.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(ev){card.querySelector('.admin-photo-preview').innerHTML='<img src="'+ev.target.result+'" style="width:100%;height:100%;object-fit:cover" alt="">';};reader.readAsDataURL(file);});});}
    renderMgmt();
  }

  function memberCardHtml(m){
    var photoHtml=m.photo_url?'<div class="member-photo-wrap"><img src="'+escapeHtml(m.photo_url)+'" class="member-photo-img" alt="'+escapeHtml(m.name)+'"></div>':'<div class="member-photo-wrap member-photo-initial">'+escapeHtml((m.name||'?')[0])+'</div>';
    var title=escapeHtml(m.name||'')+(m.role?' <span class="member-role-inline">('+escapeHtml(m.role)+')</span>':'');
    var yearChip=(m.member_type==='alumni'&&m.graduation_year)?'<p class="member-grad-year">졸업 '+escapeHtml(String(m.graduation_year))+'</p>':'';
    return '<article class="panel member-card">'+photoHtml+'<div class="member-info"><h3>'+title+'</h3>'+(m.current_position?'<p class="member-position">'+escapeHtml(m.current_position)+'</p>':'')+yearChip+(m.bio?'<p class="member-bio">'+escapeHtml(m.bio)+'</p>':'')+'</div></article>';
  }
  async function renderLabMembers(){
    var grid=byId('lab-member-grid');if(!grid)return;
    if(!sb){grid.innerHTML='';return;}
    var r=await sb.from('lab_members').select('*').eq('member_type','member').order('display_order',{ascending:true});
    if(r.error){grid.innerHTML='<p style="color:var(--muted)">'+escapeHtml(r.error.message)+'</p>';return;}
    if(!r.data.length){grid.innerHTML='<p style="color:var(--muted)">등록된 멤버가 없습니다.</p>';return;}
    grid.innerHTML=r.data.map(memberCardHtml).join('');
  }
  async function renderAlumni(){
    var grid=byId('alumni-grid');if(!grid)return;
    if(!sb){grid.innerHTML='';return;}
    var r=await sb.from('lab_members').select('*').eq('member_type','alumni').order('display_order',{ascending:true});
    if(r.error){grid.innerHTML='<p style="color:var(--muted)">'+escapeHtml(r.error.message)+'</p>';return;}
    if(!r.data.length){grid.innerHTML='<p style="color:var(--muted)">등록된 졸업생이 없습니다.</p>';return;}
    grid.innerHTML=r.data.map(memberCardHtml).join('');
  }

  async function renderPublicationDB(){
    var list=byId('publication-db-list'); if(!list) return;
    var search=byId('publication-search'), yearSel=byId('publication-year'), roleSel=byId('publication-role'), sortSel=byId('publication-sort'), count=byId('publication-count');
    try{
      var papers=Array.isArray(window.PUBLICATION_DB)?window.PUBLICATION_DB:null;
      if(!papers){
        var res=await fetch('publication_db.json');
        papers=await res.json();
      }
      var years=[];
      var roles=[];
      papers.forEach(function(p){
        if(years.indexOf(String(p.year))===-1) years.push(String(p.year));
        if(roles.indexOf(String(p.author_role))===-1) roles.push(String(p.author_role));
      });
      years.sort(function(a,b){return Number(b)-Number(a);});
      roles.sort();
      if(yearSel) yearSel.innerHTML='<option value="">전체 연도</option>'+years.map(function(y){return '<option value="'+escapeHtml(y)+'">'+escapeHtml(y)+'</option>';}).join('');
      if(roleSel) roleSel.innerHTML='<option value="">전체 역할</option>'+roles.map(function(v){return '<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>';}).join('');

      function doiHref(v){
        v=String(v||'').trim();
        if(!v) return '';
        if(/^https?:\/\//i.test(v)){
          return v.replace('https://DOI: ','https://doi.org/').replace('http://DOI: ','http://doi.org/');
        }
        return 'https://doi.org/'+v.replace(/^doi:\s*/i,'');
      }
      function render(){
        var term=(search&&search.value||'').trim().toLowerCase();
        var year=(yearSel&&yearSel.value)||'';
        var role=(roleSel&&roleSel.value)||'';
        var sort=(sortSel&&sortSel.value)||'desc';
        var filtered=papers.filter(function(p){
          var hay=[p.title,p.journal,p.summary,p.author_role,String(p.year)].join(' ').toLowerCase();
          return (!term||hay.indexOf(term)!==-1) && (!year||String(p.year)===year) && (!role||p.author_role===role);
        }).sort(function(a,b){
          return sort==='asc' ? a.year-b.year || a.no-b.no : b.year-a.year || a.no-b.no;
        });
        if(count) count.textContent='총 '+filtered.length+'편';
        list.innerHTML=filtered.length ? filtered.map(function(p){
          var href=doiHref(p.doi);
          return '<article class="panel pub-card"><div class="pub-top"><span class="badge">'+escapeHtml(String(p.year))+'</span><span class="mini-tag">'+escapeHtml(p.author_role)+'</span></div><h3>'+escapeHtml(p.title)+'</h3><div class="pub-meta">'+escapeHtml(p.journal)+'</div><p>'+escapeHtml(p.summary)+'</p>'+(href?'<div class="pub-actions"><a class="button" target="_blank" rel="noopener" href="'+escapeHtml(href)+'">DOI / 원문 보기</a></div>':'')+'</article>';
        }).join('') : '<article class="panel post-card"><p>조건에 맞는 논문이 없습니다.</p></article>';
      }
      [search,yearSel,roleSel,sortSel].forEach(function(el){if(el)el.addEventListener('input',render); if(el)el.addEventListener('change',render);});
      render();
    }catch(e){
      list.innerHTML='<article class="panel post-card"><p>논문 DB를 불러오지 못했습니다.</p></article>';
    }
  }

  document.addEventListener('DOMContentLoaded',async function(){
    initDashboardTabs();
    await handleLogin();
    await updateAuthUI();
    await handleDashboard();
    await renderPublicPosts();
    await renderSectionPosts();
    await renderLabMembers();
    await renderAlumni();
    await renderPublicationDB();
    await applyBg();
  });
})();
