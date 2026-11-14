/* EIT file-based audio controls. This wraps uploaded audio files, not a live stream. */
(function(){
  const fmt=(n)=>{if(!Number.isFinite(n)||n<0)return'--:--';n=Math.floor(n);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`};
  const safeStore={get(k,f){try{return localStorage.getItem(k)??f}catch{return f}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}}};
  function mount(audio,opts={}){
    if(!audio||audio.dataset.eitPlayerMounted==='1')return audio?.__eitPlayerRoot||null;
    const host=opts.mount||audio.parentElement;if(!host)return null;
    const root=document.createElement('section');root.className='eit-audio-player';root.setAttribute('role','region');root.setAttribute('aria-label',opts.label||'Audio player');
    const id=`eitap-${Math.random().toString(36).slice(2,9)}`;
    root.innerHTML=`
      <div class="ap-top"><div class="ap-heading"><div class="ap-title">${opts.label||'AUDIO BÀI THI'}</div><div class="ap-subtitle">Phát từ file audio đã tải lên · không phải livestream</div></div><span class="ap-filetag">FILE AUDIO</span></div>
      <div class="ap-main">
        <button type="button" class="ap-play" data-ap="play" aria-label="Phát audio">▶ Phát</button>
        <button type="button" class="ap-skip" data-ap="back" title="Tua lùi 10 giây" aria-label="Tua lùi 10 giây">↶ −10s</button>
        <div class="ap-seek-wrap">
          <span class="ap-time" data-ap="current">0:00</span>
          <input data-ap="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Thanh tua audio" disabled>
          <span class="ap-time" data-ap="duration">--:--</span>
        </div>
        <button type="button" class="ap-skip" data-ap="forward" title="Tua tới 10 giây" aria-label="Tua tới 10 giây">+10s ↷</button>
      </div>
      <div class="ap-settings">
        <div class="ap-setting"><label for="${id}-rate">Tốc độ</label><select id="${id}-rate" data-ap="rate" aria-label="Tốc độ phát"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select></div>
        <button type="button" data-ap="mute" aria-label="Tắt hoặc bật âm thanh">🔊 Âm thanh</button>
        <div class="ap-setting"><label for="${id}-volume">Âm lượng</label><input class="ap-volume" id="${id}-volume" data-ap="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Âm lượng"></div>
        <span class="ap-status" data-ap="status" aria-live="polite">Sẵn sàng phát</span>
      </div>`;
    audio.classList.add('ap-native');audio.removeAttribute('controls');audio.preload='metadata';audio.setAttribute('playsinline','');audio.dataset.eitPlayerMounted='1';
    if(opts.mount){host.appendChild(root);root.appendChild(audio)}else{host.insertBefore(root,audio);root.appendChild(audio)}
    const listeningBar=root.closest('.listening-audio');if(listeningBar)listeningBar.classList.add('has-custom-audio');
    const el=(name)=>root.querySelector(`[data-ap="${name}"]`),play=el('play'),seek=el('seek'),rate=el('rate'),volume=el('volume'),mute=el('mute'),status=el('status');
    const prefKey='eitAudioPlayerSettings';let prefs={};try{prefs=JSON.parse(safeStore.get(prefKey,'{}'))||{}}catch{prefs={}}
    const savePrefs=()=>safeStore.set(prefKey,JSON.stringify({rate:audio.playbackRate,volume:audio.volume,muted:audio.muted}));
    const chosenRate=String(prefs.rate||1);if([...rate.options].some(o=>o.value===chosenRate))rate.value=chosenRate;audio.playbackRate=Number(rate.value)||1;
    audio.volume=Number.isFinite(Number(prefs.volume))?Math.min(1,Math.max(0,Number(prefs.volume))):1;volume.value=String(audio.volume);audio.muted=!!prefs.muted;
    let seeking=false;
    function setStatus(t,error=false){status.textContent=t;status.classList.toggle('error',error)}
    function seekTo(delta){const d=audio.duration;if(!Number.isFinite(d)||d<=0){setStatus('Đang tải thời lượng audio; vui lòng thử lại sau.',true);return}try{audio.currentTime=Math.max(0,Math.min(d,audio.currentTime+delta));setStatus(delta<0?'Đã tua lùi 10 giây':'Đã tua tới 10 giây');update()}catch(e){setStatus('File audio chưa hỗ trợ tua ở thời điểm này.',true)}}
    function update(){const d=audio.duration,c=audio.currentTime,ok=Number.isFinite(d)&&d>0;const val=ok?Math.round(Math.max(0,Math.min(1,c/d))*1000):0;if(!seeking)seek.value=String(val);seek.disabled=!ok;el('current').textContent=fmt(c);el('duration').textContent=fmt(d);play.textContent=audio.paused?'▶ Phát':'❚❚ Tạm dừng';play.setAttribute('aria-label',audio.paused?'Phát audio':'Tạm dừng audio');mute.textContent=audio.muted||audio.volume===0?'🔇 Bật âm thanh':'🔊 Âm thanh';}
    async function toggle(){if(audio.paused){try{if(audio.error||audio.networkState===HTMLMediaElement.NETWORK_NO_SOURCE)audio.load();await audio.play();setStatus('Đang phát file audio')}catch(e){const code=audio.error?.code;const reason=({1:'quá trình tải bị hủy',2:'lỗi mạng hoặc URL không truy cập được',3:'trình duyệt không giải mã được file',4:'URL không tồn tại hoặc định dạng không hỗ trợ'})[code]||'chưa tải được dữ liệu audio';setStatus(`Không phát được: ${reason}. Hãy mở URL audio trong Admin để kiểm tra.`,true)}}else{audio.pause();setStatus('Đã tạm dừng')}}
    play.addEventListener('click',toggle);el('back').addEventListener('click',()=>seekTo(-10));el('forward').addEventListener('click',()=>seekTo(10));
    seek.addEventListener('pointerdown',()=>seeking=true);['pointerup','pointercancel','mouseup','touchend','keyup'].forEach(evt=>seek.addEventListener(evt,()=>{seeking=false;update()}));seek.addEventListener('input',()=>{const d=audio.duration;if(Number.isFinite(d)&&d>0){const target=d*(Number(seek.value)/1000);el('current').textContent=fmt(target);try{audio.currentTime=target}catch(e){setStatus('Không thể tua tới vị trí này; hãy kiểm tra file audio.',true)}}});seek.addEventListener('change',()=>{seeking=false;update()});
    rate.addEventListener('change',()=>{audio.playbackRate=Number(rate.value)||1;savePrefs();setStatus(`Tốc độ phát ${rate.value}×`)});volume.addEventListener('input',()=>{audio.volume=Number(volume.value);if(audio.volume>0)audio.muted=false;savePrefs();update()});mute.addEventListener('click',()=>{audio.muted=!audio.muted;savePrefs();update()});
    audio.addEventListener('loadedmetadata',()=>{update();setStatus('File audio đã sẵn sàng')});audio.addEventListener('durationchange',update);audio.addEventListener('timeupdate',update);audio.addEventListener('seeking',update);audio.addEventListener('seeked',update);audio.addEventListener('play',update);audio.addEventListener('pause',update);audio.addEventListener('ended',()=>{update();setStatus('Đã phát hết audio')});audio.addEventListener('waiting',()=>setStatus('Đang tải dữ liệu audio…'));audio.addEventListener('error',()=>{const code=audio.error?.code;const reason=({1:'quá trình tải bị hủy',2:'lỗi mạng',3:'định dạng/giải mã không được hỗ trợ',4:'URL hoặc định dạng file không được hỗ trợ'})[code]||'URL, quyền truy cập hoặc định dạng file không hợp lệ';setStatus(`Không tải được audio: ${reason}. Hãy mở URL audio để kiểm tra.`,true)});
    audio.__eitPlayerRoot=root;update();if(audio.currentSrc||audio.src){setStatus('Đang tải file audio…');try{audio.load()}catch(e){}}return root;
  }
  window.mountEITAudioPlayer=mount;
  window.mountAllEITAudioPlayers=(root=document)=>{root.querySelectorAll('audio[data-eit-custom-player],audio.eit-custom-audio').forEach(a=>mount(a,{label:a.dataset.playerLabel||undefined}));};
})();
