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

function buildReceiptUrl(receiptNo = null) {
  const draft = getReceiptDraft();

  const params = new URLSearchParams({
    receipt_no: receiptNo || draft.rno || '',
    payer: draft.name || '',
    amount: String(draft.amount || 0),
    mode: draft.mode || '',
    head: draft.head || '',
    description: draft.desc || '',
    lang: S.lang || 'en',
    autoprint: '0'
  });

  if (S.tenantId) {
    params.set('tenant_id', S.tenantId);
  }

  if (S.tenantSlug) {
    params.set('tenant_slug', S.tenantSlug);
  }

  return `${window.location.origin}/money-receipt.html?${params.toString()}`;
}

function printReceiptFromIframe(url) {
  let iframe = document.getElementById('receiptPrintFrame');

  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'receiptPrintFrame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    document.body.appendChild(iframe);
  }

  iframe.onload = function () {
    setTimeout(function () {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (error) {
        console.error('Receipt print failed:', error);
      }
    }, 700);
  };

  iframe.src = url;
}

function genReceiptPreview() {
  const frame = document.getElementById('receiptFrame');

  if (!frame) return;

  frame.src = buildReceiptUrl();
}

function printReceipt() {
  printReceiptFromIframe(buildReceiptUrl());
}

async function printCollectionReceipt(receiptNo) {
  printReceiptFromIframe(buildReceiptUrl(receiptNo));
}


