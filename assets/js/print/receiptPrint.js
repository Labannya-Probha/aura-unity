// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RECEIPT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
var sigState = { drawing:false, dataUrl:null };

function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || canvas._sigInit) return;
  canvas._sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle='#0F1F3D'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
  function getPos(e) {
    const r = canvas.getBoundingClientRect(), src = e.touches?e.touches[0]:e;
    return { x:(src.clientX-r.left)*(canvas.width/r.width), y:(src.clientY-r.top)*(canvas.height/r.height) };
  }
  function start(e){e.preventDefault();sigState.drawing=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function draw(e){e.preventDefault();if(!sigState.drawing)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();}
  function stop(){sigState.drawing=false;sigState.dataUrl=canvas.toDataURL();}
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',draw);
  canvas.addEventListener('mouseup',stop); canvas.addEventListener('mouseleave',stop);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',draw,{passive:false});
  canvas.addEventListener('touchend',stop);
}

function clearSignature() {
  const c=document.getElementById('sigCanvas'); if(!c)return;
  c.getContext('2d').clearRect(0,0,c.width,c.height); sigState.dataUrl=null;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
}

function applySignature() {
  if (!sigState.dataUrl) return;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=`<img src="${sigState.dataUrl}" style="height:30px;max-width:90px;object-fit:contain">`;
  });
}

function genReceiptPreview() {
  const draft = getReceiptDraft();
  const frame = document.getElementById('receiptFrame');
  if (!frame) return;
  const url = `${window.location.origin}/money-receipt.html?receipt_no=${encodeURIComponent(draft.rno)}&payer=${encodeURIComponent(draft.name)}&amount=${draft.amount}&mode=${encodeURIComponent(draft.mode)}&head=${encodeURIComponent(draft.head)}&description=${encodeURIComponent(draft.desc)}&lang=${S.lang}&autoprint=1`;
  frame.src = url;
}

function printReceipt() {
  const draft = getReceiptDraft();
  const url = `${window.location.origin}/money-receipt.html?receipt_no=${encodeURIComponent(draft.rno)}&payer=${encodeURIComponent(draft.name)}&amount=${draft.amount}&mode=${encodeURIComponent(draft.mode)}&head=${encodeURIComponent(draft.head)}&description=${encodeURIComponent(draft.desc)}&lang=${S.lang}&autoprint=1`;
  window.open(url, '_blank');
}

async function printCollectionReceipt(receiptNo) {
  window.open(`${window.location.origin}/money-receipt.html?receipt_no=${encodeURIComponent(receiptNo)}&lang=${S.lang}&autoprint=1`, '_blank');
}


